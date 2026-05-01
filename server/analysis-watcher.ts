/**
 * File watcher that re-runs quality analysis whenever module source files change.
 */

import chokidar from "chokidar";
import * as fs from "node:fs";
import * as path from "pathe";
import { resolveLocalDeps } from "./dep-resolver.ts";
import type { IModuleAnalyzer } from "./module-analysis.ts";
import { setAnalysisResult } from "./module-analysis.ts";

export interface AnalysisWatcherOptions {
	/** Whether the watcher is enabled. Returns null immediately when false. */
	enabled: boolean;
	/** Absolute path to the module root directory. */
	moduleRoot: string;
	/** Display name of the module. */
	moduleName: string;
	/** Relative path (from moduleRoot) to the module entry file. */
	moduleEntry: string;
	/** Whether a node_helper.js is known to exist. */
	hasNodeHelper: boolean;
	/** Socket.IO server instance for live result push. */
	io: import("socket.io").Server;
	/** Analyzer instance that produces ModuleAnalysisResult values. */
	analyzer: IModuleAnalyzer;
}

/**
 * Starts a chokidar watcher that watches all files reachable from the module
 * entry points and re-runs quality analysis on any change, with a 500 ms debounce.
 *
 * Returns the FSWatcher so the caller can close it during shutdown, or null
 * when the watcher is disabled.
 *
 * @param {AnalysisWatcherOptions} options
 * @returns {import("chokidar").FSWatcher | null}
 */
export function startAnalysisWatcher(
	options: AnalysisWatcherOptions
): import("chokidar").FSWatcher | null {
	const {
		enabled,
		moduleRoot,
		moduleName,
		moduleEntry,
		hasNodeHelper,
		analyzer
	} = options;

	if (!enabled) {
		return null;
	}

	// Build initial entry points
	const entryPoints: string[] = [path.join(moduleRoot, moduleEntry)];
	if (hasNodeHelper) {
		const helperPath = path.join(moduleRoot, "node_helper.js");
		if (fs.existsSync(helperPath)) {
			entryPoints.push(helperPath);
		}
	}

	// Resolve initial watch set
	const { resolvedFiles } = resolveLocalDeps({ entryPoints, moduleRoot });
	const watchSet = new Set<string>(resolvedFiles);

	// Ensure entry points are always in the watch set even if unresolvable
	for (const ep of entryPoints) {
		watchSet.add(ep);
	}

	const watcher = chokidar.watch([...watchSet], {
		ignoreInitial: true,
		usePolling: true,
		interval: 250,
		awaitWriteFinish: {
			stabilityThreshold: 300,
			pollInterval: 100
		}
	});

	// TODO (known limitation): 500ms debounce is best-effort.
	// Does NOT guarantee restartHelper completed before analysis runs.
	// Production: wait for explicit "helper-ready" signal.
	let pending: NodeJS.Timeout | null = null;

	/**
	 * Runs the re-resolution + analysis cycle after a debounce period.
	 */
	async function runAnalysis(): Promise<void> {
		// Re-resolve local deps to pick up any new files
		const { resolvedFiles: freshFiles } = resolveLocalDeps({
			entryPoints,
			moduleRoot
		});

		// Add newly discovered files to the watcher
		for (const f of freshFiles) {
			if (!watchSet.has(f)) {
				watchSet.add(f);
				watcher.add(f);
			}
		}

		// Remove files that are no longer reachable from watch set
		for (const f of watchSet) {
			if (!freshFiles.has(f) && !entryPoints.includes(f)) {
				watchSet.delete(f);
				watcher.unwatch(f);
			}
		}

		try {
			const result = await analyzer.analyze(moduleRoot, moduleName);
			setAnalysisResult(result);
		} catch (err) {
			console.error("[module-sandbox] analysis-watcher: analysis error", err);
		}
	}

	watcher.on("all", (_eventName: string, _filePath: string) => {
		if (pending) {
			clearTimeout(pending);
		}
		pending = setTimeout(() => {
			void runAnalysis();
		}, 500);
	});

	return watcher;
}
