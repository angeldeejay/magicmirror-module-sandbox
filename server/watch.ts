/**
 * File watching and reload-event emission for module and sandbox changes.
 *
 * Two independent watchers with separate responsibilities:
 *   - Module watcher: always-on, observes repoRoot, scope always "stage"
 *   - Sandbox watcher: watch-mode only, observes harness paths, scope always "shell"
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
 * Determines whether the file is a sandbox-persisted config file
 * (module config or runtime config, by any naming variant).
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
 * Determines whether the file is a sandbox config file (persisted config or harness config).
 * Used by the sandbox watcher to decide when to call restartHelper.
 */
function isSandboxConfigFile(filePath: string): boolean {
	const normalized = norm(filePath);
	return (
		isSandboxPersistedConfigFile(filePath) ||
		normalized.endsWith("harness.config.js") ||
		normalized.endsWith("harness.config.ts")
	);
}

/**
 * Returns true for CSS and SCSS files.
 * Module watcher exempts these from restartHelper — purely presentational,
 * no Node.js state implications.
 */
function isStyleFile(filePath: string): boolean {
	return /\.(css|scss)$/i.test(filePath);
}

/**
 * Returns true if the file lives inside the module's translations/ directory.
 * Module watcher exempts these from restartHelper — i18n data loaded by the
 * browser independently, no Node.js state implications.
 */
function isModuleTranslationFile(filePath: string): boolean {
	const normalized = norm(filePath);
	const translationsDir = norm(path.join(repoRoot, "translations"));
	return normalized.startsWith(translationsDir + "/");
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

// ── Chokidar ignored predicates ──────────────────────────────────────────────

/**
 * Predicate for the module watcher's chokidar `ignored` option.
 * Filters out node_modules and .git directories.
 */
function isModuleWatcherIgnored(filePath: string): boolean {
	const f = filePath.replace(/\\/g, "/");
	return f.includes("/node_modules/") || f.includes("/.git/");
}

/**
 * Predicate for the sandbox watcher's chokidar `ignored` option.
 * Filters out node_modules, .git, and harness-generated directories.
 */
function isSandboxWatcherIgnored(filePath: string): boolean {
	const f = filePath.replace(/\\/g, "/");
	return (
		f.includes("/node_modules/") ||
		f.includes("/.git/") ||
		f.includes("/client/generated/") ||
		f.includes("/shims/generated/")
	);
}

// ── Module Watcher ────────────────────────────────────────────────────────────

/**
 * Starts the module watcher (always-on, regardless of --watch flag).
 *
 * Observes repoRoot only. Scope is always "stage".
 * Calls restartHelper() on every change except styles (CSS/SCSS) and
 * translations — node_helper is stateful and must restart to avoid dirty state.
 */
function startModuleWatcher({
	io,
	restartHelper
}: {
	io: import("socket.io").Server;
	restartHelper: () => Promise<void>;
}): import("chokidar").FSWatcher {
	loadModuleGitignore();

	const moduleGitignorePath = norm(path.join(repoRoot, ".gitignore"));
	let pending: NodeJS.Timeout | null = null;

	const watcher = chokidar.watch([repoRoot], {
		ignoreInitial: true,
		usePolling: true,
		interval: 250,
		ignored: isModuleWatcherIgnored,
		awaitWriteFinish: {
			stabilityThreshold: 300,
			pollInterval: 100
		}
	});

	watcher.on("all", (eventName: string, filePath: string) => {
		// .gitignore changed: reload patterns silently, no browser reload.
		if (norm(filePath) === moduleGitignorePath) {
			loadModuleGitignore();
			console.log("[module-sandbox] .gitignore updated — reload patterns");
			return;
		}

		if (!isRelevantFile(filePath)) {
			return;
		}

		if (isIgnoredByModuleGitignore(filePath)) {
			return;
		}

		if (pending) {
			clearTimeout(pending);
		}

		pending = setTimeout(() => {
			void (async () => {
				try {
					const relativePath = path.relative(repoRoot, filePath);
					const reloadVersion = Date.now().toString(36);
					console.log(
						/* v8 ignore next */
						`[module-sandbox] ${eventName}: ${relativePath || filePath}`
					);

					// Restart helper for all changes except styles and translations.
					// node_helper is stateful — dirty state contaminates subsequent frontend loads.
					if (!isStyleFile(filePath) && !isModuleTranslationFile(filePath)) {
						await restartHelper();
					}

					io.emit("harness:reload", {
						event: eventName,
						file: relativePath || filePath,
						scope: "stage",
						version: reloadVersion
					});
				} catch (err) {
					console.error("[module-sandbox] module watcher error", err);
				}
			})();
		}, 150);
	});

	return watcher;
}

// ── Sandbox Watcher ───────────────────────────────────────────────────────────

/**
 * Starts the sandbox watcher (active only when --watch is passed).
 *
 * Observes harness paths only. Scope is always "shell".
 * Triggers rebuilds for client/shim source changes.
 * Calls restartHelper() only on sandbox config file changes.
 */
function startSandboxWatcher({
	enabled,
	io,
	restartHelper,
	getModuleConfigPath,
	getRuntimeConfigPath,
	rebuildClientAssets,
	rebuildNodeCompat
}: {
	enabled: boolean;
	io: import("socket.io").Server;
	restartHelper: () => Promise<void>;
	getModuleConfigPath: () => string;
	getRuntimeConfigPath: () => string;
	rebuildClientAssets?: (filePath: string) => Promise<void>;
	rebuildNodeCompat?: (filePath: string) => Promise<void>;
}): import("chokidar").FSWatcher | null {
	if (!enabled) {
		return null;
	}

	const moduleConfigPath = getModuleConfigPath();
	const runtimeConfigPath = getRuntimeConfigPath();

	const watchPaths = [
		moduleConfigPath,
		runtimeConfigPath,
		configRoot,
		path.join(harnessRoot, "client"),
		path.join(harnessRoot, "shims"),
		path.join(harnessRoot, "server"),
		path.join(harnessRoot, "vite.config.mjs")
	];

	let pending: NodeJS.Timeout | null = null;

	const watcher = chokidar.watch(watchPaths, {
		ignoreInitial: true,
		usePolling: true,
		interval: 250,
		ignored: isSandboxWatcherIgnored,
		awaitWriteFinish: {
			stabilityThreshold: 300,
			pollInterval: 100
		}
	});

	watcher.on("all", (eventName: string, filePath: string) => {
		if (!isRelevantFile(filePath)) {
			return;
		}

		if (pending) {
			clearTimeout(pending);
		}

		pending = setTimeout(() => {
			void (async () => {
				try {
					const relativePath = path.relative(harnessRoot, filePath);
					const reloadVersion = Date.now().toString(36);
					console.log(
						/* v8 ignore next */
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

					if (isSandboxConfigFile(filePath)) {
						await restartHelper();
					}

					io.emit("harness:reload", {
						event: eventName,
						file: relativePath || filePath,
						scope: "shell",
						version: reloadVersion
					});
				} catch (err) {
					console.error("[module-sandbox] sandbox watcher error", err);
				}
			})();
		}, 150);
	});

	return watcher;
}

export {
	isModuleWatcherIgnored,
	isSandboxWatcherIgnored,
	startModuleWatcher,
	startSandboxWatcher
};
