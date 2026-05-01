/**
 * File watching and reload-event emission for shell and stage changes.
 */

import chokidar from "chokidar";
import * as fs from "node:fs";
import ignore from "ignore";
import * as path from "pathe";
import { configRoot, harnessRoot, repoRoot } from "./paths.ts";

/**
 * Normalizes a chokidar-delivered file path to forward slashes + lowercase for
 * string comparisons. pathe already produces forward slashes for all built paths;
 * this normalizes the incoming chokidar path to the same form.
 */
function norm(p: string): string {
	return p.replace(/\\/g, "/").toLowerCase();
}

// ── Module .gitignore integration ─────────────────────────────────────────────

type GitignoreMatcher = ReturnType<typeof ignore>;

let moduleGitignoreMatcher: GitignoreMatcher | null = null;

/**
 * Reads and compiles the mounted module's .gitignore file, if present.
 * Stores the result in moduleGitignoreMatcher for use in isIgnoredByModuleGitignore().
 * Safe to call multiple times — replaces the previous matcher on each call.
 */
function loadModuleGitignore(): void {
	const gitignorePath = path.join(repoRoot, ".gitignore");
	if (!fs.existsSync(gitignorePath)) {
		moduleGitignoreMatcher = null;
		return;
	}
	try {
		const content = fs.readFileSync(gitignorePath, "utf-8");
		moduleGitignoreMatcher = ignore().add(content);
	} catch {
		moduleGitignoreMatcher = null;
	}
}

/**
 * Returns true if the given absolute file path is excluded by the mounted
 * module's .gitignore patterns. Files outside repoRoot always return false.
 * config.sandbox.json is always watched regardless of .gitignore.
 */
function isIgnoredByModuleGitignore(filePath: string): boolean {
	if (!moduleGitignoreMatcher) {
		return false;
	}
	const normalized = norm(filePath);
	const normalizedRoot = norm(repoRoot);
	if (!normalized.startsWith(normalizedRoot + "/")) {
		return false;
	}
	const relative = normalized.slice(normalizedRoot.length + 1);
	if (!relative) {
		return false;
	}
	// Always watch config.sandbox.json even if the module gitignores it.
	if (relative === "config.sandbox.json") {
		return false;
	}
	try {
		return moduleGitignoreMatcher.ignores(relative);
	} catch {
		return false;
	}
}

// ── File classification helpers ───────────────────────────────────────────────

/**
 * Determines whether a file path has an extension that should trigger any sandbox action.
 * Filters out irrelevant files (images, lock files, etc.) that land from directory watching.
 */
function isRelevantFile(filePath: string): boolean {
	const normalized = norm(filePath);
	return (
		isSandboxPersistedConfigFile(filePath) ||
		/\.(js|ts|tsx|mjs|cjs|css|scss|json|eta|md)$/i.test(normalized)
	);
}

/**
 * Determines whether sandbox persisted config file.
 */
function isSandboxPersistedConfigFile(filePath: string): boolean {
	const baseName = path.basename(filePath).toLowerCase();
	return (
		baseName === "config.sandbox.json" ||
		baseName === "module.config.json" ||
		baseName === "runtime.config.json" ||
		baseName.startsWith("module.config.") ||
		baseName.startsWith("runtime.config.")
	);
}

/**
 * Determines whether restart backend.
 */
function shouldRestartBackend(filePath: string): boolean {
	const normalized = norm(filePath);
	return (
		normalized.endsWith("node_helper.js") ||
		normalized.includes("/backend/") ||
		normalized.endsWith("cache-manager.js") ||
		isSandboxPersistedConfigFile(filePath) ||
		normalized.endsWith("harness.config.js") ||
		normalized.endsWith("harness.config.ts")
	);
}

/**
 * Determines whether harness client source file.
 */
function isHarnessClientSourceFile(filePath: string): boolean {
	const normalized = norm(filePath);
	const clientRoot = norm(path.join(harnessRoot, "client"));
	return (
		normalized.startsWith(clientRoot) &&
		!normalized.includes("/generated/") &&
		!normalized.includes("/styles/") &&
		!normalized.includes("/fonts/") &&
		(/\.(ts|tsx|scss)$/i.test(filePath) ||
			normalized.endsWith("vite.config.mjs"))
	);
}

/**
 * Determines whether harness node compat source file.
 */
function isHarnessNodeCompatSourceFile(filePath: string): boolean {
	const normalized = norm(filePath);
	const shimsRoot = norm(path.join(harnessRoot, "shims"));
	return (
		normalized.startsWith(shimsRoot) &&
		!normalized.includes("/generated/") &&
		normalized.endsWith(".ts")
	);
}

/**
 * Gets reload scope.
 */
function getReloadScope(
	filePath: string,
	harnessConfig: { moduleEntry: string; moduleName: string }
): "stage" | "shell" {
	const normalized = norm(filePath);
	const stageOnlyPaths = [
		norm(path.join(repoRoot, harnessConfig.moduleEntry)),
		norm(path.join(repoRoot, "node_helper.js")),
		norm(path.join(repoRoot, "cache-manager.js")),
		norm(path.join(repoRoot, "competition-provider.js")),
		norm(path.join(repoRoot, "canonical-view-adapter.js")),
		norm(path.join(repoRoot, `${harnessConfig.moduleName}.css`)),
		norm(path.join(harnessRoot, "server", "templates", "stage-page.eta")),
		norm(path.join(harnessRoot, "server", "templates", "partials", "stage-viewport.eta"))
	];
	const stagePrefixes = [
		norm(path.join(repoRoot, "backend")),
		norm(path.join(repoRoot, "providers")),
		norm(path.join(repoRoot, "constants")),
		norm(path.join(repoRoot, "translations"))
	];

	if (
		stageOnlyPaths.includes(normalized) ||
		isSandboxPersistedConfigFile(filePath) ||
		stagePrefixes.some((prefix) => normalized.startsWith(prefix))
	) {
		return "stage";
	}

	return "shell";
}

// ── Watcher ───────────────────────────────────────────────────────────────────

/**
 * Starts watcher.
 */
function startWatcher({
	enabled,
	io,
	restartHelper,
	getHarnessConfig,
	getModuleConfigPath,
	getRuntimeConfigPath,
	rebuildClientAssets,
	rebuildNodeCompat
}: {
	enabled: boolean;
	io: import("socket.io").Server;
	restartHelper: () => Promise<void>;
	getHarnessConfig: () => { moduleEntry: string; moduleName: string };
	getModuleConfigPath: () => string;
	getRuntimeConfigPath: () => string;
	rebuildClientAssets?: (filePath: string) => Promise<void>;
	rebuildNodeCompat?: (filePath: string) => Promise<void>;
}): import("chokidar").FSWatcher | null {
	if (!enabled) {
		return null;
	}

	// Load mounted module's .gitignore patterns on startup.
	loadModuleGitignore();

	const harnessConfig = getHarnessConfig();
	const moduleConfigPath = getModuleConfigPath();
	const runtimeConfigPath = getRuntimeConfigPath();

	// Watch directories and specific files directly — no glob patterns.
	// Chokidar v5 does not reliably expand absolute glob patterns on Windows;
	// extension/path filtering is handled in the event handlers instead.
	const watchPaths = [
		repoRoot,
		moduleConfigPath,
		runtimeConfigPath,
		configRoot,
		path.join(harnessRoot, "client"),
		path.join(harnessRoot, "shims"),
		path.join(harnessRoot, "server"),
		path.join(harnessRoot, "vite.config.mjs")
	];

	const moduleGitignorePath = norm(path.join(repoRoot, ".gitignore"));

	let pending: NodeJS.Timeout | null = null;
	const watcher = chokidar.watch(watchPaths, {
		ignoreInitial: true,
		usePolling: true,
		interval: 250,
		ignored: (filePath: string) => {
			const f = filePath.replace(/\\/g, "/");
			return (
				f.includes("/node_modules/") ||
				f.includes("/.git/") ||
				f.includes("/client/generated/") ||
				f.includes("/shims/generated/")
			);
		},
		awaitWriteFinish: {
			stabilityThreshold: 300,
			pollInterval: 100
		}
	});

	watcher.on("all", (eventName: string, filePath: string) => {
		// If the module's .gitignore changed: reload patterns silently, no browser reload.
		if (norm(filePath) === moduleGitignorePath) {
			loadModuleGitignore();
			console.log("[module-sandbox] .gitignore updated — reload patterns");
			return;
		}

		if (!isRelevantFile(filePath)) {
			return;
		}

		// Skip files excluded by the mounted module's .gitignore.
		if (isIgnoredByModuleGitignore(filePath)) {
			return;
		}

		if (pending) {
			clearTimeout(pending);
		}

		pending = setTimeout(async () => {
			const relativePath = path.relative(repoRoot, filePath);
			const currentHarnessConfig = getHarnessConfig();
			const reloadVersion = Date.now().toString(36);
			console.log(
				`[module-sandbox] ${eventName}: ${relativePath || filePath}`
			);

			if (
				rebuildClientAssets &&
				eventName !== "unlink" &&
				fs.existsSync(filePath) &&
				isHarnessClientSourceFile(filePath)
			) {
				await rebuildClientAssets(filePath);
			}
			if (
				rebuildNodeCompat &&
				eventName !== "unlink" &&
				fs.existsSync(filePath) &&
				isHarnessNodeCompatSourceFile(filePath)
			) {
				await rebuildNodeCompat(filePath);
			}

			if (shouldRestartBackend(filePath)) {
				await restartHelper();
			}

			io.emit("harness:reload", {
				event: eventName,
				file: relativePath || filePath,
				scope: getReloadScope(filePath, currentHarnessConfig),
				version: reloadVersion
			});
		}, 150);
	});

	return watcher;
}

export { startWatcher };
