/**
 * Shared Vitest browser bootstrap for sandbox-backed browser suites.
 */
/**
 * Shared Vitest browser bootstrap for sandbox-backed browser suites.
 */
import fetch from "node-fetch";
import { spawn } from "node:child_process";
import process from "node:process";
import { setTimeout } from "node:timers";
import { terminateChildProcess } from "../_helpers/child-process-cleanup.ts";
import { cleanupAllSandboxPagesForSuite } from "../_helpers/commands/create-browser-commands.ts";
import {
	cleanupAllSandboxSessionRuntimes,
	isPerSessionBrowserSuite
} from "../_helpers/commands/runtime-controller.ts";
import { getSandboxServerInvocation } from "../_helpers/sandbox-process.ts";
import {
	createSandboxServerEnv,
	getBrowserSuiteRuntime,
	sandboxRoot
} from "../_helpers/sandbox-test-environment.ts";
import { ensureBrowserSuiteFixtureFiles } from "../_helpers/test-module-fixture.ts";

/**
 * Shared browser-suite bootstrap for Vitest browser mode.
 *
 * Each browser-backed suite gets its own isolated sandbox server contract:
 * dedicated port plus a dedicated mutable fixture workspace. That keeps the
 * setup reusable today while removing the hardcoded shared state that would
 * block future suite parallelism.
 */

/**
 * Pause between readiness probes while the sandbox server starts.
 *
 * @param {number} delay
 * @returns {Promise<void>}
 */
async function sleep(delay) {
	await new Promise((resolve) => setTimeout(resolve, delay));
}

/**
 * Check whether a dedicated browser-suite sandbox server already responds.
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
 * Start the dedicated sandbox server for one browser-backed suite if needed.
 *
 * @param {"integration"|"ui"} suiteName
 * @returns {Promise<void|(() => Promise<void>)>}
 */
export async function setupBrowserSuite(suiteName) {
	ensureBrowserSuiteFixtureFiles(suiteName);

	if (isPerSessionBrowserSuite(suiteName)) {
		return async () => {
			await cleanupAllSandboxPagesForSuite(suiteName);
			await cleanupAllSandboxSessionRuntimes(suiteName);
		};
	}

	const suiteRuntime = getBrowserSuiteRuntime(suiteName);

	if (await isServerReady(suiteRuntime.baseUrl)) {
		return;
	}

	let stdout = "";
	let stderr = "";
	const invocation = getSandboxServerInvocation();
	const child = spawn(invocation.command, invocation.args, {
		cwd: sandboxRoot,
		env: {
			...process.env,
			...createSandboxServerEnv({
				port: suiteRuntime.port,
				moduleRoot: suiteRuntime.fixtureRoot
			})
		},
		stdio: ["ignore", "pipe", "pipe"]
	});

	child.stdout.on("data", (chunk) => {
		stdout += chunk.toString();
		if (stdout.length > 8_000) {
			stdout = stdout.slice(-8_000);
		}
	});
	child.stderr.on("data", (chunk) => {
		stderr += chunk.toString();
		if (stderr.length > 8_000) {
			stderr = stderr.slice(-8_000);
		}
	});

	const timeoutAt = Date.now() + 120_000;
	while (Date.now() < timeoutAt) {
		if (child.exitCode !== null) {
			throw new Error(
				`Vitest browser sandbox for "${suiteName}" exited early with code ${child.exitCode}.\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`
			);
		}
		if (await isServerReady(suiteRuntime.baseUrl)) {
			return async () => {
				await terminateChildProcess(child, {
					timeoutMs: 5_000
				});
			};
		}
		await sleep(250);
	}

	await terminateChildProcess(child, {
		timeoutMs: 5_000
	});
	throw new Error(
		`Timed out waiting for Vitest browser sandbox "${suiteName}" at ${suiteRuntime.baseUrl}.\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`
	);
}
