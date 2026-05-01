/**
 * Fastify entrypoint that boots the sandbox host, helper runtime, startup scripts, and watch flow.
 */

import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "pathe";
import { fileURLToPath } from "node:url";
import fastifyMiddie from "@fastify/middie";
import Fastify from "fastify";
import { Server } from "socket.io";
import {
	resolveAnimateCss,
	resolveCronerPath,
	resolveFontAwesomeCss,
	resolveMomentPath,
	resolveMomentTimezonePath,
	resolveWebfontsRoot
} from "./asset-paths.ts";
import { createConfigApi } from "./config.ts";
import { createHelperRuntime, injectShimResolution } from "./helper-runtime.ts";
import { createHtmlPage, createStagePage } from "./html.ts";
import { attachSocketServer, getHelperLogEntries } from "./log-store.ts";
import {
	VendorModuleAnalyzer,
	attachAnalysisSocketServer,
	getLastAnalysisResult,
	setAnalysisResult
} from "./module-analysis.ts";
import { fromOS, resolveRepoRoot } from "./paths.ts";
import { registerRoutes } from "./routes.ts";
import { runStartupScripts } from "./startup-scripts.ts";
import { startAnalysisWatcher } from "./analysis-watcher.ts";
import { startWatcher } from "./watch.ts";

type ShutdownOptions = {
	app: import("fastify").FastifyInstance;
	io: import("socket.io").Server;
	watcher: import("chokidar").FSWatcher | null;
	analysisWatcher: import("chokidar").FSWatcher | null;
	helperRuntime: { stopHelper: () => Promise<void> };
	startupController: { stopAll: () => Promise<void> };
};

const args = process.argv.slice(2);
const watchEnabled = args.includes("--watch");
const currentFilePath = fromOS(
	typeof __filename === "string"
		? __filename
		: fileURLToPath(import.meta.url)
);
const currentDirPath =
	typeof __dirname === "string" ? fromOS(__dirname) : path.dirname(currentFilePath);
const {
	getAvailableLanguages,
	getHarnessConfig,
	getContract,
	getHarnessCacheDir,
	getModuleConfig,
	getModuleConfigPath,
	getRuntimeConfig,
	getRuntimeConfigPath,
	saveModuleConfig,
	saveRuntimeConfig
} = createConfigApi();

/**
 * Runs node compat build.
 */
function runNodeCompatBuild(): void {
	const nodeCompatScriptPath = path.join(
		currentDirPath,
		"..",
		"scripts",
		"build-node-compat.ts"
	);
	if (!fs.existsSync(nodeCompatScriptPath)) {
		return;
	}

	const result = spawnSync(
		process.execPath,
		["--experimental-strip-types", nodeCompatScriptPath],
		{
			cwd: path.join(currentDirPath, ".."),
			stdio: "inherit"
		}
	);
	if (result.status !== 0) {
		throw new Error(
			`Node compatibility shim build failed (exit ${String(result.status)})`
		);
	}
}

/**
 * Determines whether node compat artifacts.
 */
function hasNodeCompatArtifacts(): boolean {
	return [
		"logger.js",
		"node_helper.js",
		path.join("magicmirror-core", "package.json"),
		path.join("magicmirror-core", "js", "http_fetcher.js"),
		path.join("magicmirror-core", "js", "server_functions.js")
	].every((fileName) => {
		return fs.existsSync(
			path.join(currentDirPath, "..", "shims", "generated", fileName)
		);
	});
}

/**
 * Ensures node compat build.
 */
function ensureNodeCompatBuild(): void {
	if (hasNodeCompatArtifacts()) {
		return;
	}

	runNodeCompatBuild();
}

/**
 * Internal helper for rebuild node compat.
 */
async function rebuildNodeCompat(): Promise<void> {
	runNodeCompatBuild();
}

/**
 * Registers shutdown handlers.
 */
function registerShutdownHandlers({
	app,
	io,
	watcher,
	analysisWatcher,
	helperRuntime,
	startupController
}: ShutdownOptions): void {
	let shuttingDown = false;

	/**
	 * Internal helper for shutdown.
	 */
	async function shutdown(exitCode = 0): Promise<void> {
		if (shuttingDown) {
			return;
		}
		shuttingDown = true;

		try {
			if (watcher) {
				await watcher.close();
			}
			if (analysisWatcher) {
				await analysisWatcher.close();
			}
			await helperRuntime.stopHelper();
			await startupController.stopAll();
			await new Promise<void>((resolve, reject) => {
				io.close((error?: Error) => {
					if (error) {
						reject(error);
						return;
					}
					resolve();
				});
			});
			await new Promise<void>((resolve, reject) => {
				app.close((error?: Error) => {
					if (error) {
						reject(error);
						return;
					}
					resolve();
				});
			});
		} catch (error) {
			console.error("[module-sandbox] shutdown error", error);
			process.exitCode = 1;
		} finally {
			process.exit(exitCode);
		}
	}

	process.on("SIGINT", () => {
		void shutdown(0);
	});
	process.on("SIGTERM", () => {
		void shutdown(0);
	});
}

/**
 * Starts server.
 */
async function startServer(): Promise<void> {
	const repoRoot = resolveRepoRoot();
	const harnessConfig = getHarnessConfig();
	const startupController = runStartupScripts({
		repoRoot,
		startupScripts: (harnessConfig.sandbox?.startup as string[]) || []
	});
	ensureNodeCompatBuild();
	injectShimResolution();
	Object.assign(global, {
		config: {
			hideConfigSecrets: false
		}
	});
	process.env.MM_SANDBOX_CACHE_DIR = getHarnessCacheDir();
	const app = Fastify({
		logger: false
	});
	await app.register(fastifyMiddie);
	const io = new Server(app.server, {
		serveClient: true
	});
	attachSocketServer(io);
	const helperRuntime = createHelperRuntime({
		app,
		io,
		getHarnessConfig,
		getHarnessCacheDir
	});
	const clientAssetsScriptPath = path.join(
		currentDirPath,
		"..",
		"scripts",
		"build-client-assets.ts"
	);
	/**
	 * Internal helper for rebuild client assets.
	 */
	const rebuildClientAssets = async (filePath: string): Promise<void> => {
		if (!fs.existsSync(clientAssetsScriptPath)) {
			return;
		}
		const normalized = filePath.toLowerCase();
		const scope = normalized.endsWith(".scss")
			? "styles"
			: normalized.includes("/app/") ||
				  normalized.endsWith("/vite.config.mjs")
				? "shell"
				: "runtime";
		const result = spawnSync(
			process.execPath,
			[
				"--experimental-strip-types",
				clientAssetsScriptPath,
				"--scope",
				scope
			],
			{
				cwd: path.join(currentDirPath, ".."),
				stdio: "inherit"
			}
		);
		if (result.status !== 0) {
			throw new Error(
				`Client asset rebuild failed for scope ${scope} (exit ${String(result.status)})`
			);
		}
	};

	await registerRoutes({
		app,
		getAvailableLanguages,
		getHarnessConfig,
		getModuleConfig,
		getModuleConfigPath,
		getRuntimeConfig,
		getRuntimeConfigPath,
		saveModuleConfig,
		saveRuntimeConfig,
		getContract,
		createHtmlPage,
		createStagePage,
		getHelperLogEntries,
		resolveWebfontsRoot,
		resolveAnimateCss,
		resolveCronerPath,
		resolveMomentPath,
		resolveMomentTimezonePath,
		resolveFontAwesomeCss,
		io,
		restartHelper: helperRuntime.restartHelper,
		watchEnabled,
		getAnalysisResult: getLastAnalysisResult,
		triggerAnalysis: async () => {
			const result = await moduleAnalyzer.analyze(repoRoot, harnessConfig.moduleName);
			setAnalysisResult(result);
		}
	});

	await helperRuntime.restartHelper();

	await app.listen({
		port: harnessConfig.port,
		host: harnessConfig.host
	});
	console.log(
		`[module-sandbox] listening at http://${harnessConfig.host}:${harnessConfig.port}`
	);
	console.log(
		`[module-sandbox] edit module config at ${getModuleConfigPath()}`
	);
	console.log(
		`[module-sandbox] runtime language ${getHarnessConfig().language} (${getHarnessConfig().locale})`
	);
	console.log(
		`[module-sandbox] mounted module ${harnessConfig.moduleName} (${harnessConfig.moduleEntry})`
	);
	console.log(`[module-sandbox] cache dir ${getHarnessCacheDir()}`);
	console.log(
		`[module-sandbox] ${watchEnabled ? "watch mode enabled" : "watch mode disabled"}`
	);

	const watcher = startWatcher({
		enabled: watchEnabled,
		io,
		restartHelper: helperRuntime.restartHelper,
		getHarnessConfig,
		getModuleConfigPath,
		getRuntimeConfigPath,
		rebuildClientAssets,
		rebuildNodeCompat
	});

	attachAnalysisSocketServer(io);
	const moduleAnalyzer = new VendorModuleAnalyzer();
	const analysisWatcher = startAnalysisWatcher({
		enabled: watchEnabled,
		moduleRoot: repoRoot,
		moduleName: harnessConfig.moduleName,
		moduleEntry: harnessConfig.moduleEntry,
		hasNodeHelper: fs.existsSync(path.join(repoRoot, "node_helper.js")),
		io,
		analyzer: moduleAnalyzer
	});

	// Run initial analysis immediately so the quality panel has data on first load.
	moduleAnalyzer.analyze(repoRoot, harnessConfig.moduleName).then(setAnalysisResult).catch((err: unknown) => {
		console.error("[module-sandbox] initial analysis error", err);
	});

	registerShutdownHandlers({
		app,
		io,
		watcher,
		analysisWatcher,
		helperRuntime,
		startupController
	});
}

startServer().catch((error: unknown) => {
	console.error("[module-sandbox] fatal error", error);
	process.exitCode = 1;
});
