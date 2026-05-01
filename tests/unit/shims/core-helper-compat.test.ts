/**
 * Unit coverage for core-coupled helper compatibility wrappers.
 */
import assert from "node:assert/strict";
import path from "node:path";
import { createRequire } from "node:module";
import { injectShimResolution } from "../../../server/helper-runtime.ts";

const nodeRequire = createRequire(import.meta.url);
const moduleSandboxGlobal = globalThis as typeof globalThis & {
	root_path?: string;
	config?: Record<string, unknown>;
	__MODULE_SANDBOX_LOGGER__?: {
		recordHelperLog: (method: string, args: unknown[]) => void;
	};
};

/**
 * Restores a process environment variable to its previous state.
 */
function restoreEnv(name: string, value: string | undefined): void {
	if (value === undefined) {
		delete process.env[name];
		return;
	}

	process.env[name] = value;
}

/**
 * Deletes a cached module when it has been resolved.
 */
function clearCachedModule(moduleId: string): void {
	try {
		delete nodeRequire.cache[nodeRequire.resolve(moduleId)];
	} catch (_error) {}
}

/**
 * Deletes cached bare and path-based helper compat modules.
 */
function clearCachedCompatModules(): void {
	clearCachedModule("logger");
	clearCachedModule("node_helper");

	if (typeof moduleSandboxGlobal.root_path === "string") {
		clearCachedModule(
			path.join(moduleSandboxGlobal.root_path, "js", "logger.js")
		);
		clearCachedModule(
			path.join(moduleSandboxGlobal.root_path, "js", "node_helper.js")
		);
	}
}

test("logger compat re-exports the synced core logger with helper log capture intact", () => {
	const previousNodePath = process.env.NODE_PATH;
	const previousMmTestMode = process.env.mmTestMode;
	const previousLoggerHook = moduleSandboxGlobal.__MODULE_SANDBOX_LOGGER__;
	const recordedLogs: Array<{ method: string; args: unknown[] }> = [];

	moduleSandboxGlobal.__MODULE_SANDBOX_LOGGER__ = {
		/**
		 * Records helper logs.
		 */
		recordHelperLog(method: string, args: unknown[]) {
			recordedLogs.push({
				method,
				args
			});
		}
	};
	process.env.mmTestMode = "true";

	try {
		process.env.NODE_PATH = "C:\\existing-shims";
		injectShimResolution();
		clearCachedCompatModules();

		const LOG_METHODS = [
			"debug",
			"log",
			"info",
			"warn",
			"error",
			"group",
			"groupCollapsed",
			"groupEnd",
			"time",
			"timeEnd",
			"timeStamp"
		] as const;
		const Log = nodeRequire("logger") as Record<string, unknown> & {
			debug: ((...args: unknown[]) => void) & {
				__moduleSandboxWrappedMethod?: boolean;
			};
			setLogLevel: (levels: string[]) => void;
		};
		const pathLogger = nodeRequire(
			path.join(moduleSandboxGlobal.root_path!, "js", "logger.js")
		);

		// All expected log methods must exist
		for (const method of LOG_METHODS) {
			assert.equal(typeof Log[method], "function", `Log.${method} is not a function`);
		}
		assert.equal(typeof Log.setLogLevel, "function");
		assert.equal(Log, pathLogger);

		// Wrapped methods must be flagged
		Log.setLogLevel(["DEBUG", "INFO", "LOG", "WARN", "ERROR"]);
		assert.equal(
			Log.debug.__moduleSandboxWrappedMethod,
			true,
			"debug not flagged as __moduleSandboxWrappedMethod"
		);

		Log.setLogLevel(["DEBUG", "INFO", "LOG", "WARN", "ERROR"]);
		Log.debug("sandbox debug message", {
			ok: true
		});

		assert.deepEqual(recordedLogs.at(-1), {
			method: "debug",
			args: ["sandbox debug message", { ok: true }]
		});
	} finally {
		clearCachedCompatModules();
		moduleSandboxGlobal.__MODULE_SANDBOX_LOGGER__ = previousLoggerHook;
		restoreEnv("NODE_PATH", previousNodePath);
		restoreEnv("mmTestMode", previousMmTestMode);
	}
});

test("node_helper compat re-exports the synced core helper and preserves sandbox socket semantics", () => {
	const previousNodePath = process.env.NODE_PATH;
	const previousSecret = process.env.SECRET_SANDBOX_COMPAT;
	const previousConfig = moduleSandboxGlobal.config;
	const receivedNotifications: Array<{
		notification: string;
		payload: unknown;
	}> = [];
	const namespaceCalls: string[] = [];
	let connectionHandler:
		| ((socket: {
				onAny: (
					callback: (notification: string, payload: unknown) => void
				) => void;
		  }) => void)
		| null = null;
	const emittedNotifications: Array<{
		notification: string;
		payload: unknown;
	}> = [];

	process.env.SECRET_SANDBOX_COMPAT = "revealed-token";
	moduleSandboxGlobal.config = {
		hideConfigSecrets: true
	};

	try {
		process.env.NODE_PATH = "C:\\existing-shims";
		injectShimResolution();
		clearCachedCompatModules();

		const NodeHelper = nodeRequire("node_helper") as {
			create: (definition: Record<string, unknown>) => new () => {
				setName: (name: string) => void;
				setSocketIO: (io: { of: (name: string) => unknown }) => void;
				sendSocketNotification: (
					notification: string,
					payload: unknown
				) => void;
			};
			checkFetchStatus: (response: {
				ok: boolean;
				statusText?: string;
			}) => {
				ok: boolean;
				statusText?: string;
			};
			checkFetchError: (error: {
				code?: string;
				message?: string;
			}) => string;
		};
		const pathNodeHelper = nodeRequire(
			path.join(moduleSandboxGlobal.root_path!, "js", "node_helper.js")
		);
		const HelperModule = NodeHelper.create({
			/**
			 * Captures socket notifications.
			 */
			socketNotificationReceived(notification: string, payload: unknown) {
				receivedNotifications.push({
					notification,
					payload
				});
			}
		});
		const helper = new HelperModule();

		helper.setName("MMM-TestModule");
		helper.setSocketIO({
			/**
			 * Resolves namespaces.
			 */
			of(name: string) {
				namespaceCalls.push(name);
				return {
					/**
					 * Clears connection listeners.
					 */
					removeAllListeners(eventName: string) {
						namespaceCalls.push(`remove:${eventName}`);
					},
					/**
					 * Registers connection listeners.
					 */
					on(eventName: string, handler: typeof connectionHandler) {
						namespaceCalls.push(`on:${eventName}`);
						connectionHandler = handler;
					},
					/**
					 * Emits notifications.
					 */
					emit(notification: string, payload: unknown) {
						emittedNotifications.push({
							notification,
							payload
						});
					}
				};
			}
		});

		connectionHandler?.({
			/**
			 * Registers catch-all socket notifications.
			 */
			onAny(callback) {
				callback("PING", {
					token: "**SECRET_SANDBOX_COMPAT**"
				});
			}
		});
		helper.sendSocketNotification("PONG", {
			ok: true
		});

		assert.equal(NodeHelper, pathNodeHelper);
		assert.equal(
			(NodeHelper as unknown as Record<string, unknown>).__moduleSandboxSocketPatched,
			true,
			"__moduleSandboxSocketPatched flag missing from NodeHelper prototype"
		);
		assert.equal(typeof NodeHelper.checkFetchStatus, "function");
		assert.equal(typeof NodeHelper.checkFetchError, "function");
		assert.deepEqual(namespaceCalls, [
			"/MMM-TestModule",
			"remove:connection",
			"on:connection",
			"/MMM-TestModule"
		]);
		assert.deepEqual(receivedNotifications, [
			{
				notification: "PING",
				payload: {
					token: "revealed-token"
				}
			}
		]);
		assert.deepEqual(emittedNotifications, [
			{
				notification: "PONG",
				payload: {
					ok: true
				}
			}
		]);
		assert.equal(
			NodeHelper.checkFetchStatus({
				ok: true,
				statusText: "ok"
			}).statusText,
			"ok"
		);
		assert.throws(() => {
			NodeHelper.checkFetchStatus({
				ok: false,
				statusText: "Not Found"
			});
		}, /Not Found/);
		assert.equal(
			NodeHelper.checkFetchError({
				code: "EAI_AGAIN"
			}),
			"MODULE_ERROR_NO_CONNECTION"
		);
		assert.equal(
			NodeHelper.checkFetchError({
				message: "HTTP 401 unauthorized"
			}),
			"MODULE_ERROR_UNAUTHORIZED"
		);
	} finally {
		clearCachedCompatModules();
		moduleSandboxGlobal.config = previousConfig;
		restoreEnv("NODE_PATH", previousNodePath);
		restoreEnv("SECRET_SANDBOX_COMPAT", previousSecret);
	}
});
