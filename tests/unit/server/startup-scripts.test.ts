/**
 * Unit coverage for mounted-module startup script management.
 */
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import startupScriptsModule from "../../../server/startup-scripts.ts";

const { runStartupScript, runStartupScripts, stopProcessTree } =
	startupScriptsModule;

/**
 * Write a temporary consumer `package.json` fixture for startup tests.
 *
 * @param {string} rootPath
 * @param {object} packageJson
 * @returns {void}
 */
function writeConsumerPackage(rootPath, packageJson) {
	fs.mkdirSync(rootPath, { recursive: true });
	fs.writeFileSync(
		path.join(rootPath, "package.json"),
		`${JSON.stringify(packageJson, null, "\t")}\n`,
		"utf8"
	);
}

test("runStartupScript executes an npm script in the consumer repo", () => {
	const tempRoot = fs.mkdtempSync(
		path.join(os.tmpdir(), "magicmirror-module-sandbox-startup-")
	);
	const calls = [];

	writeConsumerPackage(tempRoot, {
		name: "MMM-Startup",
		scripts: {
			"cache:clean": "echo clean"
		}
	});

	runStartupScript({
		repoRoot: tempRoot,
		scriptName: "cache:clean",
		/**
		 * Internal helper for spawn.
		 */
		spawn(command, args, options) {
			calls.push({
				command,
				args,
				options
			});
			return {
				status: 0
			};
		}
	});

	assert.equal(calls.length, 1);
	assert.deepEqual(calls[0].args, ["run", "cache:clean"]);
	assert.equal(calls[0].options.cwd, tempRoot);
	assert.equal(calls[0].options.stdio, "inherit");
});

test("runStartupScript rejects missing npm scripts", () => {
	const tempRoot = fs.mkdtempSync(
		path.join(os.tmpdir(), "magicmirror-module-sandbox-startup-")
	);

	writeConsumerPackage(tempRoot, {
		name: "MMM-Startup",
		scripts: {}
	});

	assert.throws(() => {
		runStartupScript({
			repoRoot: tempRoot,
			scriptName: "cache:clean"
		});
	}, /references missing npm script/);
});

test("runStartupScript surfaces spawn errors and non-zero exits", () => {
	const tempRoot = fs.mkdtempSync(
		path.join(os.tmpdir(), "magicmirror-module-sandbox-startup-")
	);

	writeConsumerPackage(tempRoot, {
		name: "MMM-Startup",
		scripts: {
			"cache:clean": "echo clean"
		}
	});

	assert.throws(() => {
		runStartupScript({
			repoRoot: tempRoot,
			scriptName: "cache:clean",
			/**
			 * Internal helper for spawn.
			 */
			spawn() {
				return {
					error: new Error("spawn failed")
				};
			}
		});
	}, /spawn failed/);

	assert.throws(() => {
		runStartupScript({
			repoRoot: tempRoot,
			scriptName: "cache:clean",
			/**
			 * Internal helper for spawn.
			 */
			spawn() {
				return {
					status: 2
				};
			}
		});
	}, /Startup npm script failed: cache:clean/);
});

test("runStartupScripts runs all declared startup scripts in order", () => {
	const tempRoot = fs.mkdtempSync(
		path.join(os.tmpdir(), "magicmirror-module-sandbox-startup-")
	);
	const logs = [];
	const calls = [];

	writeConsumerPackage(tempRoot, {
		name: "MMM-Startup",
		scripts: {
			first: "echo first",
			second: "echo second"
		}
	});

	runStartupScripts({
		repoRoot: tempRoot,
		startupScripts: ["first", "second"],
		/**
		 * Internal helper for log.
		 */
		log(message) {
			logs.push(message);
		},
		/**
		 * Internal helper for spawn.
		 */
		spawn(command, args) {
			calls.push({
				command,
				args
			});
			return new EventEmitter();
		}
	});

	assert.deepEqual(logs, [
		"[module-sandbox] running startup script: first",
		"[module-sandbox] running startup script: second"
	]);
	assert.deepEqual(
		calls.map((call) => call.args.join(" ")),
		["run first", "run second"]
	);
});

test("runStartupScripts exposes a stopAll controller for spawned processes", async () => {
	const tempRoot = fs.mkdtempSync(
		path.join(os.tmpdir(), "magicmirror-module-sandbox-startup-")
	);
	const logs = [];
	const stopped = [];
	let nextPid = 100;

	writeConsumerPackage(tempRoot, {
		name: "MMM-Startup",
		scripts: {
			first: "node server.js",
			second: "node worker.js"
		}
	});

	const controller = runStartupScripts({
		repoRoot: tempRoot,
		startupScripts: ["first", "second"],
		/**
		 * Internal helper for log.
		 */
		log(message) {
			logs.push(message);
		},
		/**
		 * Internal helper for spawn.
		 */
		spawn() {
			const child = new EventEmitter();
			child.pid = nextPid;
			nextPid += 1;
			return child;
		},
		/**
		 * Internal helper for kill process tree.
		 */
		killProcessTree(pid) {
			stopped.push(pid);
			return Promise.resolve();
		}
	});

	await controller.stopAll();
	assert.deepEqual(logs, [
		"[module-sandbox] running startup script: first",
		"[module-sandbox] running startup script: second"
	]);
	assert.deepEqual(stopped, [100, 101]);
});

test("runStartupScripts does not add sandbox failure logs for non-zero exits", async () => {
	const tempRoot = fs.mkdtempSync(
		path.join(os.tmpdir(), "magicmirror-module-sandbox-startup-")
	);
	const logs = [];

	writeConsumerPackage(tempRoot, {
		name: "MMM-Startup",
		scripts: {
			first: "node fail.js"
		}
	});

	const child = new EventEmitter();
	child.pid = 123;

	runStartupScripts({
		repoRoot: tempRoot,
		startupScripts: ["first"],
		/**
		 * Internal helper for spawn.
		 */
		spawn() {
			return child;
		},
		/**
		 * Internal helper for log.
		 */
		log(message) {
			logs.push(message);
		},
		/**
		 * Internal helper for kill process tree.
		 */
		killProcessTree() {
			return Promise.resolve();
		}
	});

	child.emit("exit", 5, null);
	await new Promise((resolve) => setImmediate(resolve));
	assert.deepEqual(logs, ["[module-sandbox] running startup script: first"]);
});

test("runStartupScripts logs clean completion for zero exits", async () => {
	const tempRoot = fs.mkdtempSync(
		path.join(os.tmpdir(), "magicmirror-module-sandbox-startup-")
	);
	const logs = [];

	writeConsumerPackage(tempRoot, {
		name: "MMM-Startup",
		scripts: {
			first: "node ok.js"
		}
	});

	const child = new EventEmitter();
	child.pid = 123;

	runStartupScripts({
		repoRoot: tempRoot,
		startupScripts: ["first"],
		/**
		 * Internal helper for spawn.
		 */
		spawn() {
			return child;
		},
		/**
		 * Internal helper for log.
		 */
		log(message) {
			logs.push(message);
		},
		/**
		 * Internal helper for kill process tree.
		 */
		killProcessTree() {
			return Promise.resolve();
		}
	});

	child.emit("exit", 0, null);
	await new Promise((resolve) => setImmediate(resolve));
	assert.match(logs[1], /startup script exited \(first\): 0/);
});

test("runStartupScripts rejects missing declared startup scripts", () => {
	const tempRoot = fs.mkdtempSync(
		path.join(os.tmpdir(), "magicmirror-module-sandbox-startup-")
	);

	writeConsumerPackage(tempRoot, {
		name: "MMM-Startup",
		scripts: {}
	});

	assert.throws(() => {
		runStartupScripts({
			repoRoot: tempRoot,
			startupScripts: ["missing-script"]
		});
	}, /references missing npm script/);
});

test("runStartupScripts logs child process errors and signal exits", async () => {
	const tempRoot = fs.mkdtempSync(
		path.join(os.tmpdir(), "magicmirror-module-sandbox-startup-")
	);
	const logs = [];
	const child = new EventEmitter();
	child.pid = 999;

	writeConsumerPackage(tempRoot, {
		name: "MMM-Startup",
		scripts: {
			first: "node run.js"
		}
	});

	runStartupScripts({
		repoRoot: tempRoot,
		startupScripts: ["first"],
		/**
		 * Internal helper for log.
		 */
		log(message) {
			logs.push(message);
		},
		/**
		 * Internal helper for spawn.
		 */
		spawn() {
			return child;
		}
	});

	child.emit("error", new Error("boom"));
	child.emit("exit", null, "SIGTERM");
	await new Promise((resolve) => setImmediate(resolve));

	assert.match(logs[1], /startup script error \(first\): boom/);
	assert.match(logs[2], /startup script stopped \(first\): SIGTERM/);
});

test("stopProcessTree resolves cleanly when pid is missing", async () => {
	await assert.doesNotReject(async () => {
		await stopProcessTree(undefined);
	});
});

test("stopProcessTree uses SIGKILL immediately on non-Windows platforms", async () => {
	const originalPlatform = process.platform;
	const originalKill = process.kill;
	const calls = [];

	Object.defineProperty(process, "platform", {
		configurable: true,
		value: "linux"
	});
	/**
	 * Internal helper for kill.
	 */
	process.kill = (pid, signal) => {
		calls.push({ pid, signal });
	};

	try {
		await stopProcessTree(321);
		assert.deepEqual(calls, [{ pid: -321, signal: "SIGKILL" }]);
	} finally {
		Object.defineProperty(process, "platform", {
			configurable: true,
			value: originalPlatform
		});
		process.kill = originalKill;
	}
});

test("stopProcessTree resolves tolerated Windows taskkill exits and errors", async () => {
	await assert.doesNotReject(async () => {
		await stopProcessTree(321, {
			platform: "win32",
			/**
			 * Internal helper for spawn process.
			 */
			spawnProcess() {
				const child = new EventEmitter();
				setImmediate(() => child.emit("exit", 1));
				return child;
			}
		});
	});

	await assert.doesNotReject(async () => {
		await stopProcessTree(321, {
			platform: "win32",
			/**
			 * Internal helper for spawn process.
			 */
			spawnProcess() {
				const child = new EventEmitter();
				setImmediate(() => child.emit("error", { code: "ENOENT" }));
				return child;
			}
		});
	});
});

test("stopProcessTree rejects unexpected Windows taskkill failures", async () => {
	await assert.rejects(async () => {
		await stopProcessTree(321, {
			platform: "win32",
			/**
			 * Internal helper for spawn process.
			 */
			spawnProcess() {
				const child = new EventEmitter();
				setImmediate(() => child.emit("exit", 5));
				return child;
			}
		});
	}, /taskkill failed for pid 321/);

	await assert.rejects(async () => {
		await stopProcessTree(321, {
			platform: "win32",
			/**
			 * Internal helper for spawn process.
			 */
			spawnProcess() {
				const child = new EventEmitter();
				setImmediate(() =>
					child.emit("error", new Error("taskkill missing"))
				);
				return child;
			}
		});
	}, /taskkill missing/);
});

test("stopProcessTree rejects unexpected non-Windows kill errors", async () => {
	await assert.rejects(async () => {
		await stopProcessTree(456, {
			platform: "linux",
			/**
			 * Internal helper for process kill.
			 */
			processKill() {
				const error = new Error("kill failed");
				error.code = "EACCES";
				throw error;
			}
		});
	}, /kill failed/);
});
