/**
 * File watching and reload-event emission for shell and stage changes.
 */

import chokidar from "chokidar";
import * as fs from "node:fs";
import * as path from "node:path";
import { configRoot, harnessRoot, repoRoot } from "./paths.ts";

/**
 * Determines whether sandbox persisted config file.
 */
function isSandboxPersistedConfigFile(filePath: string): boolean {
	const baseName = path.basename(filePath).toLowerCase();
	return (
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
	const normalized = filePath.toLowerCase();
	return (
		normalized.endsWith("node_helper.js") ||
		normalized.includes("\\backend\\") ||
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
	const normalized = filePath.toLowerCase();
	const clientRoot = path.join(harnessRoot, "client").toLowerCase();
	return (
		normalized.startsWith(clientRoot) &&
		!normalized.includes(`${path.sep}generated${path.sep}`.toLowerCase()) &&
		!normalized.includes(`${path.sep}styles${path.sep}`.toLowerCase()) &&
		!normalized.includes(`${path.sep}fonts${path.sep}`.toLowerCase()) &&
		(/\.(ts|tsx|scss)$/i.test(filePath) ||
			normalized.endsWith("vite.config.mjs"))
	);
}

/**
 * Determines whether harness node compat source file.
 */
function isHarnessNodeCompatSourceFile(filePath: string): boolean {
	const normalized = filePath.toLowerCase();
	const shimsRoot = path.join(harnessRoot, "shims").toLowerCase();
	return (
		normalized.startsWith(shimsRoot) &&
		!normalized.includes(`${path.sep}generated${path.sep}`.toLowerCase()) &&
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
	const normalized = filePath.toLowerCase();
	const moduleEntryPath = path
		.join(repoRoot, harnessConfig.moduleEntry)
		.toLowerCase();
	const moduleCssPath = path
		.join(repoRoot, `${harnessConfig.moduleName}.css`)
		.toLowerCase();
	const stageTemplatePath = path
		.join(harnessRoot, "server", "templates", "stage-page.eta")
		.toLowerCase();
	const stageViewportPartialPath = path
		.join(
			harnessRoot,
			"server",
			"templates",
			"partials",
			"stage-viewport.eta"
		)
		.toLowerCase();
	const stageOnlyPaths = [
		moduleEntryPath,
		path.join(repoRoot, "node_helper.js").toLowerCase(),
		path.join(repoRoot, "cache-manager.js").toLowerCase(),
		path.join(repoRoot, "competition-provider.js").toLowerCase(),
		path.join(repoRoot, "canonical-view-adapter.js").toLowerCase(),
		moduleCssPath,
		stageTemplatePath,
		stageViewportPartialPath
	];
	const stagePrefixes = [
		path.join(repoRoot, "backend").toLowerCase(),
		path.join(repoRoot, "providers").toLowerCase(),
		path.join(repoRoot, "constants").toLowerCase(),
		path.join(repoRoot, "translations").toLowerCase()
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

	const harnessConfig = getHarnessConfig();
	const moduleConfigPath = getModuleConfigPath();
	const runtimeConfigPath = getRuntimeConfigPath();
	const watchPaths = [
		path.join(repoRoot, "*.js"),
		path.join(repoRoot, "*.css"),
		path.join(repoRoot, harnessConfig.moduleEntry),
		path.join(repoRoot, "providers", "**", "*.js"),
		path.join(repoRoot, "backend", "**", "*.js"),
		path.join(repoRoot, "constants", "**", "*.js"),
		path.join(repoRoot, "translations", "**", "*.json"),
		moduleConfigPath,
		runtimeConfigPath,
		path.join(configRoot, "harness.config.js"),
		path.join(configRoot, "harness.config.ts"),
		path.join(configRoot, "contract.js"),
		path.join(configRoot, "contract.ts"),
		path.join(configRoot, "**", "*.js"),
		path.join(configRoot, "**", "*.ts"),
		path.join(harnessRoot, "client", "**", "*.ts"),
		path.join(harnessRoot, "client", "**", "*.tsx"),
		path.join(harnessRoot, "client", "**", "*.scss"),
		path.join(harnessRoot, "shims", "**", "*.ts"),
		path.join(harnessRoot, "server", "**", "*.js"),
		path.join(harnessRoot, "server", "**", "*.ts"),
		path.join(harnessRoot, "server", "**", "*.eta"),
		path.join(harnessRoot, "vite.config.mjs")
	];

	let pending: NodeJS.Timeout | null = null;
	const watcher = chokidar.watch(watchPaths, {
		ignoreInitial: true,
		usePolling: true,
		interval: 250,
		awaitWriteFinish: {
			stabilityThreshold: 300,
			pollInterval: 100
		}
	});

	watcher.on("all", (eventName: string, filePath: string) => {
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
