/**
 * `node_helper.js` lifecycle management and shim resolution for the mounted module runtime.
 */

import * as fs from "node:fs";
import Module, { createRequire } from "node:module";
import * as path from "pathe";
import { configRoot, harnessRoot, repoRoot, shimsRoot } from "./paths.ts";

const nodeModule = Module as typeof Module & {
	_initPaths: () => void;
};
const nodeRequire = createRequire(
	/* v8 ignore next */
	typeof __filename === "string" ? __filename : import.meta.url
);
const compatShimsRoot = path.join(shimsRoot, "generated");
const compatMagicMirrorRoot = path.join(compatShimsRoot, "magicmirror-core");
const compatMagicMirrorPackagePath = path.join(
	compatMagicMirrorRoot,
	"package.json"
);

type SandboxMagicMirrorGlobals = typeof globalThis & {
	root_path?: string;
	version?: string;
	mmTestMode?: string;
	config?: Record<string, unknown>;
};

type HelperRuntimeOptions = {
	app: { use?: Function };
	io: import("socket.io").Server;
	getHarnessConfig: () => { moduleName: string };
	getHarnessCacheDir: () => string;
};
type HelperInstance = {
	loaded?: () => Promise<void> | void;
	stop?: () => Promise<void> | void;
	start?: () => Promise<void> | void;
	setName: (name: string) => void;
	setPath: (modulePath: string) => void;
	setExpressApp: (app: { use?: Function }) => void;
	setSocketIO: (io: import("socket.io").Server) => void;
	expressApp?: { use?: Function };
};
type HelperModuleExport = HelperInstance | (new () => HelperInstance);

/**
 * Injects shim resolution.
 */
function injectShimResolution(): void {
	/* v8 ignore next 4 */
	if (!fs.existsSync(compatShimsRoot)) {
		throw new Error(
			`Sandbox shim compatibility artifacts are missing at ${compatShimsRoot}. Build them before starting the helper runtime.`
		);
	}

	for (const targetPath of [
		compatMagicMirrorPackagePath,
		path.join(compatMagicMirrorRoot, "js", "http_fetcher.js"),
		path.join(compatMagicMirrorRoot, "js", "server_functions.js")
	]) {
		/* v8 ignore next 4 */
		if (!fs.existsSync(targetPath)) {
			throw new Error(
				`Sandbox MagicMirror compatibility artifact is missing at ${targetPath}. Build it before starting the helper runtime.`
			);
		}
	}

	process.env.NODE_PATH = [compatShimsRoot, process.env.NODE_PATH]
		.filter(Boolean)
		.join(path.delimiter);
	nodeModule._initPaths();
	const sandboxGlobals = globalThis as SandboxMagicMirrorGlobals;
	const compatPackage = JSON.parse(
		fs.readFileSync(compatMagicMirrorPackagePath, "utf8")
	) as {
		version?: unknown;
	};
	sandboxGlobals.root_path = compatMagicMirrorRoot;
	sandboxGlobals.version =
		typeof compatPackage.version === "string" ? compatPackage.version : "";
	sandboxGlobals.mmTestMode = process.env.mmTestMode || "false";
	sandboxGlobals.config = {
		hideConfigSecrets: false,
		...(sandboxGlobals.config || {})
	};
}

/**
 * Clears module require cache.
 */
function clearModuleRequireCache(): void {
	Object.keys(nodeRequire.cache).forEach((cacheKey) => {
		// require.cache keys use OS-native separators; normalize to forward slashes
		// so comparisons work consistently across Windows, Linux, and macOS.
		const normalizedKey = cacheKey.replace(/\\/g, "/");
		if (
			normalizedKey.startsWith(repoRoot) &&
			!normalizedKey.includes("/node_modules/") &&
			!normalizedKey.startsWith(harnessRoot)
		) {
			/* v8 ignore next */
			delete nodeRequire.cache[cacheKey];
		}

		/* v8 ignore next 3 */
		if (normalizedKey.startsWith(configRoot)) {
			delete nodeRequire.cache[cacheKey];
		}
	});
}

/**
 * Creates helper runtime.
 */
function createHelperRuntime({
	app,
	io,
	getHarnessConfig,
	getHarnessCacheDir
}: HelperRuntimeOptions) {
	let helperInstance: HelperInstance | null = null;
	let moduleStaticAttached = false;

	/**
	 * Stops helper.
	 */
	const stopHelper = async (): Promise<void> => {
		if (helperInstance && typeof helperInstance.stop === "function") {
			await helperInstance.stop();
		}

		helperInstance = null;
	};

	/**
	 * Restarts helper.
	 */
	const restartHelper = async (): Promise<void> => {
		await stopHelper();

		clearModuleRequireCache();
		process.env.MM_SANDBOX_CACHE_DIR = getHarnessCacheDir();
		const harnessConfig = getHarnessConfig();
		const helperPath = path.join(repoRoot, "node_helper.js");
		if (!fs.existsSync(helperPath)) {
			helperInstance = null;
			return;
		}
		const helperModule = nodeRequire(helperPath) as HelperModuleExport;
		const helper =
			typeof helperModule === "function"
				? new helperModule()
				: helperModule;
		helper.setName(harnessConfig.moduleName);
		helper.setPath(repoRoot);
		if (typeof helper.loaded === "function") {
			await helper.loaded();
		}
		if (!moduleStaticAttached) {
			helper.setExpressApp(app);
			moduleStaticAttached = true;
		} else {
			helper.expressApp = app;
		}
		helper.setSocketIO(io);
		if (typeof helper.start === "function") {
			await helper.start();
		}
		helperInstance = helper;
	};

	return {
		stopHelper,
		restartHelper
	};
}

export { injectShimResolution, createHelperRuntime };
