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
// Pool of warm servers not currently assigned to any session.
// Avoids cold-start cost for subsequent sessions on the same worker.
//
// Each entry carries a TTL timer. Servers are unref'd so they do not block
// the parent process from exiting once all tests are done. If a session
// grabs the server before the TTL, the timer is cancelled and the child is
// re-ref'd so the parent stays alive while the server is in use.
const POOL_TTL_MS = 12_000;

type PooledRuntime = {
	runtime: SandboxSessionRuntime;
	timer: ReturnType<typeof setTimeout>;
};

const workerRuntimePool = new Map<string, PooledRuntime[]>();

/**
 * Return the warm-server pool for one suite, creating it on first access.
 *
 * @param {string} suiteName
 * @returns {PooledRuntime[]}
 */
function getWorkerPool(suiteName: string): PooledRuntime[] {
	let pool = workerRuntimePool.get(suiteName);
	if (!pool) {
		pool = [];
		workerRuntimePool.set(suiteName, pool);
	}
	return pool;
}

/**
 * Expire one pooled runtime after its TTL: kill the server and remove its directory.
 * Called automatically when no session claims the server within POOL_TTL_MS.
 *
 * @param {string} suiteName
 * @param {PooledRuntime} entry
 * @returns {void}
 */
function expirePoolEntry(suiteName: string, entry: PooledRuntime): void {
	const pool = workerRuntimePool.get(suiteName);
	if (pool) {
		const idx = pool.indexOf(entry);
		if (idx !== -1) {
			pool.splice(idx, 1);
		}
	}
	void terminateChildProcess(entry.runtime.child, { timeoutMs: 5_000 }).then(() => {
		fs.rmSync(entry.runtime.runtimeRoot, {
			recursive: true,
			force: true
		});
	});
}

/**
 * Synchronously send SIGKILL to every server currently in the warm pool.
 * Called from process signal handlers to prevent orphaned child processes
 * when the parent exits abnormally (SIGINT, SIGTERM, or uncaught exception).
 *
 * @returns {void}
 */
function killAllPooledServers(): void {
	for (const entries of workerRuntimePool.values()) {
		for (const entry of entries) {
			clearTimeout(entry.timer);
			entry.runtime.child?.kill("SIGKILL");
		}
	}
	workerRuntimePool.clear();
}

// Guard against duplicate registration when both browser projects import this
// module into the same process (e.g. vitest.config.ts evaluating both suites).
if (!(process as any).__poolCleanupRegistered) {
	(process as any).__poolCleanupRegistered = true;
	process.on("exit", killAllPooledServers);
	process.on("SIGINT", () => {
		killAllPooledServers();
		process.exit(130);
	});
	process.on("SIGTERM", () => {
		killAllPooledServers();
		process.exit(143);
	});
}

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
	needsHelperReset?: boolean;
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
 * Assign a fresh loopback port to one runtime after an EADDRINUSE conflict.
 *
 * @param {SandboxSessionRuntime} runtime
 * @returns {Promise<void>}
 */
async function reallocatePort(runtime: SandboxSessionRuntime) {
	runtime.port = await allocateLoopbackPort();
	runtime.baseUrl = getSandboxBaseUrl(runtime.port);
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

	// Acquire a warm server from the pool to avoid a cold start.
	// Cancel the TTL timer and re-ref the child + pipe handles so the parent
	// process stays alive while this session is using the server.
	const pool = getWorkerPool(suiteName);
	if (pool.length > 0) {
		const entry = pool.pop()!;
		clearTimeout(entry.timer);
		const { runtime } = entry;
		if (runtime.child) {
			if (runtime.child.stdout) {
				runtime.child.stdout.ref();
				runtime.child.stdout.resume();
			}
			if (runtime.child.stderr) {
				runtime.child.stderr.ref();
				runtime.child.stderr.resume();
			}
			runtime.child.ref();
		}
		resetPerSessionFixtureFiles(runtime);
		runtime.needsHelperReset = true;
		sandboxSessionRuntimes.set(runtimeKey, runtime);
		return runtime;
	}

	// No warm server available — boot a fresh one.
	const runtime = createPerSessionFixtureRuntime(suiteName, sessionId);
	runtime.port = await allocateLoopbackPort();
	runtime.baseUrl = getSandboxBaseUrl(runtime.port);
	runtime.child = null;
	runtime.stdout = "";
	runtime.stderr = "";
	runtime.startPromise = null;
	runtime.needsHelperReset = false;
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
		// Pool-reused server: restart helper so the next session starts with
		// clean helper state (no log entries or open sockets from prior tests).
		if (runtime.needsHelperReset) {
			runtime.needsHelperReset = false;
			try {
				await fetch(`${runtime.baseUrl}/__harness/restart`, {
					method: "POST"
				});
			} catch {
				// Ignore — test will fail naturally if the helper is broken.
			}
		}
		return runtime;
	}

	if (runtime.startPromise) {
		await runtime.startPromise;
		return runtime;
	}

	runtime.startPromise = (async () => {
		const maxSpawnAttempts = 3;
		for (let spawnAttempt = 1; spawnAttempt <= maxSpawnAttempts; spawnAttempt++) {
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
			let earlyExit = false;
			while (Date.now() < timeoutAt) {
				if (runtime.child.exitCode !== null) {
					earlyExit = true;
					break;
				}
				if (await isServerReady(runtime.baseUrl)) {
					return runtime;
				}
				await new Promise((resolve) => setTimeout(resolve, 250));
			}

			if (earlyExit) {
				// TOCTOU: another process grabbed the port between allocateLoopbackPort
				// and our spawn. Reallocate and retry if this looks like EADDRINUSE.
				// Also retry unconditionally on exit code 1 when attempts remain:
				// under Windows + high CPU load, stdio buffers may not flush before the
				// early-exit check runs, so "EADDRINUSE" may not appear in stderr yet.
				const isPortConflict =
					runtime.stderr.includes("EADDRINUSE") ||
					runtime.stdout.includes("EADDRINUSE") ||
					runtime.child.exitCode === 1;
				if (isPortConflict && spawnAttempt < maxSpawnAttempts) {
					await reallocatePort(runtime);
					continue;
				}
				throw new Error(
					`Vitest browser sandbox for "${runtime.suiteName}" session "${runtime.sessionId}" exited early with code ${runtime.child.exitCode}.\nSTDOUT:\n${runtime.stdout}\nSTDERR:\n${runtime.stderr}`
				);
			}

			await terminateChildProcess(runtime.child, {
				timeoutMs: 5_000
			});
			throw new Error(
				`Timed out waiting for Vitest browser sandbox "${runtime.suiteName}" session "${runtime.sessionId}" at ${runtime.baseUrl}.\nSTDOUT:\n${runtime.stdout}\nSTDERR:\n${runtime.stderr}`
			);
		}

		throw new Error(
			`Vitest browser sandbox for "${runtime.suiteName}" session "${runtime.sessionId}" failed to start after ${maxSpawnAttempts} attempts (repeated EADDRINUSE).`
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

	// Return a live server to the pool so the next session on the same worker
	// can skip the cold-start cost.
	//
	// The child's stdout/stderr are "pipe" FDs whose read-end handles in the
	// parent keep the event loop alive (STREAM_END_OF_STREAM / FILEHANDLE in
	// the hanging-process reporter). We must release those refs WITHOUT closing
	// the pipe, because closing the read end sends EPIPE to the child and
	// crashes the server.
	//
	// Strategy:
	//   1. Pause streams + remove data listeners → stop consuming pipe data.
	//   2. Socket.unref() on each stream → parent event loop no longer waits
	//      on these FDs while the server is in the pool. This is the public
	//      net.Socket API; child.stdout/stderr from spawn() are Socket instances.
	//   3. Unref the child handle → parent can exit if no more work arrives.
	//   4. Set an unref'd TTL timer → server is killed after POOL_TTL_MS if
	//      no new session claims it.
	//
	// When a session re-acquires the server the child and handles are ref'd
	// again so the parent stays alive while tests are running.
	if (runtime.child && runtime.child.exitCode === null) {
		if (runtime.child.stdout) {
			runtime.child.stdout.removeAllListeners("data");
			runtime.child.stdout.pause();
			runtime.child.stdout.unref();
		}
		if (runtime.child.stderr) {
			runtime.child.stderr.removeAllListeners("data");
			runtime.child.stderr.pause();
			runtime.child.stderr.unref();
		}
		runtime.child.unref();
		const entry: PooledRuntime = {
			runtime,
			timer: setTimeout(() => expirePoolEntry(suiteName, entry!), POOL_TTL_MS)
		};
		entry.timer.unref();
		getWorkerPool(suiteName).push(entry);
		return;
	}

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
	// Collect and evict all active session runtimes for this suite.
	const activeRuntimes: SandboxSessionRuntime[] = [];
	for (const [key, runtime] of sandboxSessionRuntimes.entries()) {
		if (runtime.suiteName === suiteName) {
			sandboxSessionRuntimes.delete(key);
			activeRuntimes.push(runtime);
		}
	}

	// Drain the warm pool — cancel TTL timers and terminate all pooled servers.
	const poolEntries = (workerRuntimePool.get(suiteName) ?? []).splice(0);
	workerRuntimePool.delete(suiteName);
	const poolRuntimes = poolEntries.map((entry) => {
		clearTimeout(entry.timer);
		return entry.runtime;
	});

	await Promise.all(
		[...activeRuntimes, ...poolRuntimes].map(async (runtime) => {
			await terminateChildProcess(runtime.child, { timeoutMs: 5_000 });
			// Explicitly close stdio handles after the child is confirmed dead.
			// The child's write-end is gone, so no EPIPE risk. This ensures the
			// parent-side pipe handles are freed regardless of their ref state.
			runtime.child?.stdout?.destroy();
			runtime.child?.stderr?.destroy();
			fs.rmSync(runtime.runtimeRoot, { recursive: true, force: true });
		})
	);
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
