/**
 * Unit coverage for helper runtime lifecycle wiring.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
	createHelperRuntime,
	injectShimResolution
} from "../../../server/helper-runtime.ts";

const nodeRequire = createRequire(import.meta.url);
const repoRoot = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"..",
	"..",
	".."
);
const helperPath = path.join(repoRoot, "node_helper.js");
const tempHelperDir = path.join(repoRoot, ".runtime-cache");

/**
 * Write a temporary helper file, returning its path.
 * Caller is responsible for deleting it in a finally block.
 */
function writeTempHelper(source: string): string {
	fs.mkdirSync(tempHelperDir, { recursive: true });
	const tempPath = path.join(
		tempHelperDir,
		`__test_helper_${Date.now()}_${Math.random().toString(36).slice(2)}.js`
	);
	fs.writeFileSync(tempPath, source, "utf8");
	return tempPath;
}

/**
 * Remove a temporary helper file and its require-cache entry.
 */
function cleanupTempHelper(tempPath: string): void {
	try {
		delete nodeRequire.cache[nodeRequire.resolve(tempPath)];
	} catch {
		// Not in cache — that's fine.
	}
	fs.rmSync(tempPath, { force: true });
}

test("restartHelper works when used as an unbound callback", async () => {
	const helperRuntime = createHelperRuntime({
		app: {
			locals: {}
		},
		io: {},
		/**
		 * Gets harness config.
		 */
		getHarnessConfig() {
			return {
				moduleName: "MMM-TestModule"
			};
		},
		/**
		 * Gets harness cache dir.
		 */
		getHarnessCacheDir() {
			return ".runtime-cache/default";
		}
	});

	const restart = helperRuntime.restartHelper;
	await assert.doesNotReject(async () => {
		await restart();
	});
});

test("injectShimResolution prepends the shim directory to NODE_PATH", () => {
	const previousNodePath = process.env.NODE_PATH;

	try {
		process.env.NODE_PATH = "C:\\existing-shims";
		injectShimResolution();
		assert.match(process.env.NODE_PATH, /shims/);
		assert.match(process.env.NODE_PATH, /existing-shims/);
		assert.equal(typeof global.root_path, "string");
		const HTTPFetcher = nodeRequire(
			path.join(global.root_path, "js", "http_fetcher.js")
		);
		const serverFunctions = nodeRequire(
			path.join(global.root_path, "js", "server_functions.js")
		);
		assert.equal(typeof HTTPFetcher, "function");
		assert.equal(typeof serverFunctions.getUserAgent, "function");
		assert.match(serverFunctions.getUserAgent(), /MagicMirror\//);
	} finally {
		if (previousNodePath === undefined) {
			delete process.env.NODE_PATH;
		} else {
			process.env.NODE_PATH = previousNodePath;
		}
	}
});

test("restartHelper can boot a helper that requires #http_fetcher", async () => {
	global.__MODULE_SANDBOX_HTTP_FETCHER_TEST__ = null;
	const tempPath = writeTempHelper(
		`const path = require("node:path");
const NodeHelper = require("node_helper");
const HTTPFetcher = require(path.join(global.root_path, "js", "http_fetcher.js"));
const serverFunctions = require(path.join(global.root_path, "js", "server_functions.js"));

module.exports = NodeHelper.create({
	start() {
		global.__MODULE_SANDBOX_HTTP_FETCHER_TEST__ = {
			httpFetcher: typeof HTTPFetcher,
			userAgent: serverFunctions.getUserAgent()
		};
	}
});\n`
	);

	try {
		injectShimResolution();
		const helperRuntime = createHelperRuntime({
			app: {
				/**
				 * Internal helper for use.
				 */
				use() {}
			},
			io: {
				/**
				 * Internal helper for of.
				 */
				of() {
					return {
						/**
						 * Removes all listeners.
						 */
						removeAllListeners() {},
						/**
						 * Internal helper for on.
						 */
						on() {}
					};
				}
			},
			/**
			 * Gets harness config.
			 */
			getHarnessConfig() {
				return {
					moduleName: "MMM-TestModule"
				};
			},
			/**
			 * Gets harness cache dir.
			 */
			getHarnessCacheDir() {
				return ".runtime-cache/default";
			},
			helperPath: tempPath
		});

		await helperRuntime.restartHelper();

		assert.equal(
			global.__MODULE_SANDBOX_HTTP_FETCHER_TEST__.httpFetcher,
			"function"
		);
		assert.match(
			global.__MODULE_SANDBOX_HTTP_FETCHER_TEST__.userAgent,
			/MagicMirror\//
		);
	} finally {
		delete global.__MODULE_SANDBOX_HTTP_FETCHER_TEST__;
		cleanupTempHelper(tempPath);
	}
});

test("stopHelper does nothing when helper has no stop method", async () => {
	const helperRuntime = createHelperRuntime({
		app: { locals: {} },
		io: {},
		/**
		 * Gets harness config.
		 */
		getHarnessConfig() {
			return { moduleName: "MMM-TestModule" };
		},
		/**
		 * Gets harness cache dir.
		 */
		getHarnessCacheDir() {
			return ".runtime-cache/default";
		}
	});

	// stopHelper when no instance is active — must not throw
	await assert.doesNotReject(async () => {
		await helperRuntime.stopHelper();
	});
});

test("restartHelper boots a helper that has no loaded or start method", async () => {
	const calls: string[] = [];
	global.__MODULE_SANDBOX_MINIMAL_HELPER_CALLS__ = calls;
	const tempPath = writeTempHelper(
		`module.exports = {
	setName() { global.__MODULE_SANDBOX_MINIMAL_HELPER_CALLS__.push("setName"); },
	setPath() { global.__MODULE_SANDBOX_MINIMAL_HELPER_CALLS__.push("setPath"); },
	setExpressApp() { global.__MODULE_SANDBOX_MINIMAL_HELPER_CALLS__.push("setExpressApp"); },
	setSocketIO() { global.__MODULE_SANDBOX_MINIMAL_HELPER_CALLS__.push("setSocketIO"); }
};\n`
	);

	try {
		const helperRuntime = createHelperRuntime({
			app: { use() {} },
			io: {},
			/**
			 * Gets harness config.
			 */
			getHarnessConfig() {
				return { moduleName: "MMM-TestModule" };
			},
			/**
			 * Gets harness cache dir.
			 */
			getHarnessCacheDir() {
				return ".runtime-cache/default";
			},
			helperPath: tempPath
		});

		await assert.doesNotReject(async () => {
			await helperRuntime.restartHelper();
		});

		assert.ok(calls.includes("setName"));
		assert.ok(calls.includes("setSocketIO"));
		assert.ok(!calls.includes("loaded"));
		assert.ok(!calls.includes("start"));
	} finally {
		delete global.__MODULE_SANDBOX_MINIMAL_HELPER_CALLS__;
		cleanupTempHelper(tempPath);
	}
});

test("restartHelper works with a constructor-style (class/function) helper export", async () => {
	const calls: string[] = [];
	global.__MODULE_SANDBOX_CTOR_CALLS__ = calls;
	const tempPath = writeTempHelper(
		`function HelperClass() {}
HelperClass.prototype.setName = function() { global.__MODULE_SANDBOX_CTOR_CALLS__.push("setName"); };
HelperClass.prototype.setPath = function() { global.__MODULE_SANDBOX_CTOR_CALLS__.push("setPath"); };
HelperClass.prototype.setExpressApp = function() { global.__MODULE_SANDBOX_CTOR_CALLS__.push("setExpressApp"); };
HelperClass.prototype.setSocketIO = function() { global.__MODULE_SANDBOX_CTOR_CALLS__.push("setSocketIO"); };
module.exports = HelperClass;\n`
	);

	try {
		const helperRuntime = createHelperRuntime({
			app: { use() {} },
			io: {},
			/**
			 * Gets harness config.
			 */
			getHarnessConfig() {
				return { moduleName: "MMM-TestModule" };
			},
			/**
			 * Gets harness cache dir.
			 */
			getHarnessCacheDir() {
				return ".runtime-cache/default";
			},
			helperPath: tempPath
		});

		await assert.doesNotReject(async () => {
			await helperRuntime.restartHelper();
		});

		assert.ok(calls.includes("setName"));
		assert.ok(calls.includes("setSocketIO"));
	} finally {
		delete global.__MODULE_SANDBOX_CTOR_CALLS__;
		cleanupTempHelper(tempPath);
	}
});

test("restartHelper boots and reuses helper wiring while stopHelper shuts down the active instance", async () => {
	const helperCalls = [];
	global.__MODULE_SANDBOX_HELPER_TEST_CALLS__ = helperCalls;
	const tempPath = writeTempHelper(
		`module.exports = {
	setName(name) {
		global.__MODULE_SANDBOX_HELPER_TEST_CALLS__.push(["setName", name]);
	},
	setPath(modulePath) {
		global.__MODULE_SANDBOX_HELPER_TEST_CALLS__.push(["setPath", modulePath]);
	},
	setExpressApp(app) {
		global.__MODULE_SANDBOX_HELPER_TEST_CALLS__.push(["setExpressApp", typeof app.use]);
	},
	setSocketIO(io) {
		global.__MODULE_SANDBOX_HELPER_TEST_CALLS__.push(["setSocketIO", Boolean(io)]);
	},
	async start() {
		global.__MODULE_SANDBOX_HELPER_TEST_CALLS__.push(["start"]);
	},
	async stop() {
		global.__MODULE_SANDBOX_HELPER_TEST_CALLS__.push(["stop"]);
	}
};\n`
	);

	try {
		const helperRuntime = createHelperRuntime({
			app: {
				/**
				 * Internal helper for use.
				 */
				use() {}
			},
			io: {},
			/**
			 * Gets harness config.
			 */
			getHarnessConfig() {
				return {
					moduleName: "MMM-TestModule"
				};
			},
			/**
			 * Gets harness cache dir.
			 */
			getHarnessCacheDir() {
				return ".runtime-cache/default";
			},
			helperPath: tempPath
		});

		await helperRuntime.restartHelper();
		await helperRuntime.restartHelper();
		await helperRuntime.stopHelper();

		assert.deepEqual(
			helperCalls.filter(([event]) => event === "setExpressApp"),
			[["setExpressApp", "function"]]
		);
		assert.deepEqual(
			helperCalls.filter(([event]) => event === "start"),
			[["start"], ["start"]]
		);
		assert.deepEqual(
			helperCalls.filter(([event]) => event === "stop"),
			[["stop"], ["stop"]]
		);
	} finally {
		delete global.__MODULE_SANDBOX_HELPER_TEST_CALLS__;
		cleanupTempHelper(tempPath);
	}
});
