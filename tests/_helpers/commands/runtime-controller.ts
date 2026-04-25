/**
 * Runtime controller used by custom browser commands to manage sandbox sessions.
 */
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import process from "node:process";
import { setTimeout } from "node:timers";
import { spawn } from "node:child_process";
import {
	createSandboxServerEnv,
	getBrowserSuiteRuntime,
	getSandboxBaseUrl,
	sandboxRoot,
	sandboxModuleIdentity
} from "../sandbox-test-environment.ts";
import { terminateChildProcess } from "../child-process-cleanup.ts";
import { getSandboxServerInvocation } from "../sandbox-process.ts";
import { sourceFixtureRoot } from "../test-module-fixture.ts";
import { writeFixtureStylesheet } from "../test-module-style-fixture.ts";

const sandboxSessionRuntimes = new Map();
const sessionSuiteRoot = path.join(
	sandboxRoot,
	".runtime-cache",
	"browser-session-suites"
);
const perSessionBrowserSuites = new Set(["integration", "ui"]);

type SandboxSessionRuntime = {
	suiteName: string;
	sessionId: string;
	runtimeRoot: string;
	fixtureRoot: string;
	fixtureStylePath: string;
	port?: number;
	baseUrl?: string;
	child?: import("child_process").ChildProcess | null;
	stdout?: string;
	stderr?: string;
	startPromise?: Promise<void> | null;
};

/**
 * Report whether one suite should boot an isolated sandbox runtime per browser
 * session instead of reusing one suite-scoped sandbox process.
 *
 * @param {string} suiteName
 * @returns {boolean}
 */
function isPerSessionBrowserSuite(suiteName) {
	return perSessionBrowserSuites.has(suiteName);
}

/**
 * Normalize one dynamic value into a filesystem-safe path segment.
 *
 * @param {string} value
 * @returns {string}
 */
function sanitizePathSegment(value) {
	return String(value)
		.replace(/[^a-zA-Z0-9_-]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 48);
}

/**
 * Build the cache key used for session-scoped runtime maps.
 *
 * @param {string} suiteName
 * @param {string} sessionId
 * @returns {string}
 */
function buildSessionMapKey(suiteName, sessionId) {
	return `${suiteName}:${sessionId}`;
}

/**
 * Build the session-owned runtime paths used by one browser worker.
 *
 * @param {string} suiteName
 * @param {string} sessionId
 * @returns {SandboxSessionRuntime}
 */
function createPerSessionFixtureRuntime(
	suiteName,
	sessionId
): SandboxSessionRuntime {
	const safeSuiteName = sanitizePathSegment(suiteName);
	const safeSessionId = sanitizePathSegment(sessionId) || "session";
	const runtimeRoot = path.join(
		sessionSuiteRoot,
		safeSuiteName,
		safeSessionId
	);
	const fixtureRoot = path.join(runtimeRoot, sandboxModuleIdentity.name);
	return {
		suiteName,
		sessionId,
		runtimeRoot,
		fixtureRoot,
		fixtureStylePath: path.join(fixtureRoot, "MMM-TestModule.css")
	};
}

/**
 * Ensure that the mutable fixture copy exists for one session-owned runtime.
 *
 * @param {SandboxSessionRuntime} runtime
 * @returns {void}
 */
function ensurePerSessionFixtureFiles(runtime) {
	if (!fs.existsSync(runtime.fixtureRoot)) {
		fs.mkdirSync(path.dirname(runtime.fixtureRoot), {
			recursive: true
		});
		fs.cpSync(sourceFixtureRoot, runtime.fixtureRoot, {
			recursive: true
		});
	}
}

/**
 * Restore the mutable fixture files for one session-owned runtime.
 *
 * @param {SandboxSessionRuntime} runtime
 * @returns {void}
 */
function resetPerSessionFixtureFiles(runtime) {
	ensurePerSessionFixtureFiles(runtime);
	fs.rmSync(path.join(runtime.fixtureRoot, "module.config.json"), {
		force: true
	});
	fs.rmSync(path.join(runtime.fixtureRoot, "runtime.config.json"), {
		force: true
	});
	writeFixtureStylesheet(runtime.fixtureStylePath);
}

/**
 * Ask the operating system for one free loopback port.
 *
 * @returns {Promise<number>}
 */
function allocateLoopbackPort(): Promise<number> {
	return new Promise((resolve, reject) => {
		const server = net.createServer();
		server.unref();
		server.on("error", reject);
		server.listen(0, "127.0.0.1", () => {
			const address = server.address();
			if (!address || typeof address === "string") {
				server.close(() =>
					reject(new Error("Failed to allocate loopback port."))
				);
				return;
			}
			server.close((error) => {
				if (error) {
					reject(error);
					return;
				}
				resolve(address.port);
			});
		});
	});
}

/**
 * Probe whether one sandbox base URL already responds.
 *
 * @param {string} baseUrl
 * @returns {Promise<boolean>}
 */
async function isServerReady(baseUrl) {
	try {
		const response = await fetch(baseUrl);
		return response.ok;
	} catch {
		return false;
	}
}

/**
 * Create or reuse the session-owned runtime metadata for one browser worker.
 *
 * @param {string} suiteName
 * @param {string} sessionId
 * @returns {Promise<SandboxSessionRuntime>}
 */
async function ensureSandboxSessionRuntime(suiteName, sessionId) {
	const runtimeKey = buildSessionMapKey(suiteName, sessionId);
	const existingRuntime = sandboxSessionRuntimes.get(runtimeKey);
	if (existingRuntime) {
		return existingRuntime;
	}

	const runtime = createPerSessionFixtureRuntime(suiteName, sessionId);
	runtime.port = await allocateLoopbackPort();
	runtime.baseUrl = getSandboxBaseUrl(runtime.port);
	runtime.child = null;
	runtime.stdout = "";
	runtime.stderr = "";
	runtime.startPromise = null;
	resetPerSessionFixtureFiles(runtime);
	sandboxSessionRuntimes.set(runtimeKey, runtime);
	return runtime;
}

/**
 * Boot the dedicated sandbox server for one session-owned runtime when needed.
 *
 * @param {SandboxSessionRuntime} runtime
 * @returns {Promise<SandboxSessionRuntime>}
 */
async function ensureSandboxSessionServer(runtime) {
	if (
		runtime.child &&
		runtime.child.exitCode === null &&
		(await isServerReady(runtime.baseUrl))
	) {
		return runtime;
	}

	if (runtime.startPromise) {
		await runtime.startPromise;
		return runtime;
	}

	runtime.startPromise = (async () => {
		runtime.stdout = "";
		runtime.stderr = "";
		const invocation = getSandboxServerInvocation();
		runtime.child = spawn(invocation.command, invocation.args, {
			cwd: sandboxRoot,
			env: {
				...process.env,
				...createSandboxServerEnv({
					port: runtime.port,
					moduleRoot: runtime.fixtureRoot
				})
			},
			stdio: ["ignore", "pipe", "pipe"],
			windowsHide: true
		});

		runtime.child.stdout.on("data", (chunk) => {
			runtime.stdout = `${runtime.stdout}${chunk.toString()}`.slice(
				-8_000
			);
		});
		runtime.child.stderr.on("data", (chunk) => {
			runtime.stderr = `${runtime.stderr}${chunk.toString()}`.slice(
				-8_000
			);
		});

		const timeoutAt = Date.now() + 120_000;
		while (Date.now() < timeoutAt) {
			if (runtime.child.exitCode !== null) {
				throw new Error(
					`Vitest browser sandbox for "${runtime.suiteName}" session "${runtime.sessionId}" exited early with code ${runtime.child.exitCode}.\nSTDOUT:\n${runtime.stdout}\nSTDERR:\n${runtime.stderr}`
				);
			}
			if (await isServerReady(runtime.baseUrl)) {
				return runtime;
			}
			await new Promise((resolve) => setTimeout(resolve, 250));
		}

		await terminateChildProcess(runtime.child, {
			timeoutMs: 5_000
		});
		throw new Error(
			`Timed out waiting for Vitest browser sandbox "${runtime.suiteName}" session "${runtime.sessionId}" at ${runtime.baseUrl}.\nSTDOUT:\n${runtime.stdout}\nSTDERR:\n${runtime.stderr}`
		);
	})();

	try {
		await runtime.startPromise;
	} finally {
		runtime.startPromise = null;
	}

	return runtime;
}

/**
 * Tear down one session-owned sandbox runtime and its temporary workspace.
 *
 * @param {string} suiteName
 * @param {string} sessionId
 * @returns {Promise<void>}
 */
async function cleanupSandboxSessionRuntime(suiteName, sessionId) {
	const runtimeKey = buildSessionMapKey(suiteName, sessionId);
	const runtime = sandboxSessionRuntimes.get(runtimeKey);
	if (!runtime) {
		return;
	}

	sandboxSessionRuntimes.delete(runtimeKey);
	await terminateChildProcess(runtime.child, {
		timeoutMs: 5_000
	});
	fs.rmSync(runtime.runtimeRoot, {
		recursive: true,
		force: true
	});
}

/**
 * Tear down every session-owned runtime for one suite.
 *
 * @param {string} suiteName
 * @returns {Promise<void>}
 */
async function cleanupAllSandboxSessionRuntimes(suiteName) {
	const runtimes = Array.from(sandboxSessionRuntimes.values()).filter(
		(runtime) => {
			return runtime.suiteName === suiteName;
		}
	);

	for (const runtime of runtimes) {
		await cleanupSandboxSessionRuntime(
			runtime.suiteName,
			runtime.sessionId
		);
	}
}

/**
 * Build the suite-scoped runtime controller consumed by browser command modules.
 *
 * @param {"integration"|"ui"} suiteName
 * @returns {{
 * 	usesPerSessionRuntime: boolean,
 * 	resolveContextKey: (sessionId: string) => string,
 * 	getRuntimeForContext: (context: { sessionId: string }) => Promise<any>,
 * 	getLiveRuntimeForContext: (context: { sessionId: string }) => Promise<any>,
 * 	cleanupRuntimeForSession: (sessionId: string) => Promise<void>
 * }}
 */
export function createSandboxRuntimeController(suiteName) {
	const usesPerSessionRuntime = isPerSessionBrowserSuite(suiteName);
	const suiteRuntime = usesPerSessionRuntime
		? null
		: getBrowserSuiteRuntime(suiteName);

	return {
		usesPerSessionRuntime,
		/**
		 * Resolves context key.
		 */
		resolveContextKey(sessionId) {
			return buildSessionMapKey(suiteName, sessionId);
		},
		/**
		 * Gets runtime for context.
		 */
		async getRuntimeForContext(context) {
			if (!usesPerSessionRuntime) {
				return suiteRuntime;
			}

			return ensureSandboxSessionRuntime(suiteName, context.sessionId);
		},
		/**
		 * Gets live runtime for context.
		 */
		async getLiveRuntimeForContext(context) {
			const runtime = await this.getRuntimeForContext(context);
			if (!usesPerSessionRuntime) {
				return runtime;
			}

			await ensureSandboxSessionServer(runtime);
			return runtime;
		},
		/**
		 * Cleans up runtime for session.
		 */
		async cleanupRuntimeForSession(sessionId) {
			if (usesPerSessionRuntime) {
				await cleanupSandboxSessionRuntime(suiteName, sessionId);
			}
		}
	};
}

export { cleanupAllSandboxSessionRuntimes, isPerSessionBrowserSuite };
