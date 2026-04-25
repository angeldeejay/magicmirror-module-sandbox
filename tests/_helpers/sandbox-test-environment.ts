/**
 * Shared browser-suite environment constants and path helpers for sandbox tests.
 */
/**
 * Shared browser-suite environment constants and path helpers for sandbox tests.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
	getBrowserSuiteFixturePaths,
	sourceFixtureRoot
} from "./test-module-fixture.ts";

const helpersDir = dirname(fileURLToPath(import.meta.url));

export const sandboxRoot = join(helpersDir, "..", "..");
export const fixtureModuleRoot = sourceFixtureRoot;
export const sandboxModuleIdentity = {
	name: "MMM-TestModule",
	entry: "MMM-TestModule.js"
};
export const browserSuiteDefinitions = {
	integration: {
		port: 3412
	},
	ui: {
		port: 3413
	}
};

/**
 * Shared environment and path wiring for sandbox-owned test suites.
 *
 * Browser-backed coverage and packaged-install smoke tests all mount the same
 * internal fixture module so they validate the sandbox package in isolation.
 */

/**
 * Build a loopback sandbox base URL for one test-owned port.
 *
 * @param {number} port
 * @returns {string}
 */
export function getSandboxBaseUrl(port) {
	return `http://127.0.0.1:${port}`;
}

/**
 * Produce the environment variables needed to boot the sandbox against one
 * mounted module root and its persisted config files.
 *
 * @param {{
 * 	port: number,
 * 	moduleRoot?: string,
 * }} options
 * @returns {NodeJS.ProcessEnv}
 */
export function createSandboxServerEnv({
	port,
	moduleRoot = fixtureModuleRoot
}) {
	return {
		MM_SANDBOX_MOUNTED_MODULE_ROOT: moduleRoot,
		MM_SANDBOX_PORT: String(port)
	};
}

/**
 * Resolve the isolated runtime contract for one browser-backed suite.
 *
 * @param {"integration"|"ui"} suiteName
 * @returns {{
 * 	suiteName: "integration"|"ui",
 * 	port: number,
 * 	baseUrl: string,
 * 	fixtureRoot: string,
 * 	fixtureStylePath: string
 * }}
 */
export function getBrowserSuiteRuntime(suiteName) {
	const suite = browserSuiteDefinitions[suiteName];
	if (!suite) {
		throw new Error(`Unknown browser suite "${suiteName}".`);
	}

	const fixturePaths = getBrowserSuiteFixturePaths(suiteName);
	return {
		suiteName,
		port: suite.port,
		baseUrl: getSandboxBaseUrl(suite.port),
		fixtureRoot: fixturePaths.root,
		fixtureStylePath: fixturePaths.stylePath
	};
}
