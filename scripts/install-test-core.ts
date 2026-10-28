#!/usr/bin/env tsx

/**
 * Installs one MagicMirror core into mmvm (`~/.mmvm`) for the core-matrix
 * test run, through the sandbox's own version manager: `downloadVersion`
 * plus `buildShimsForVersion`, the same path the sandbox UI uses. It does not
 * change `~/.mmvm/active`; the browser suites pin the core per server.
 *
 * Usage:
 *   tsx scripts/install-test-core.ts 2.38.0
 *   MM_SANDBOX_TEST_CORE_VERSION=2.38.0 tsx scripts/install-test-core.ts
 *   tsx scripts/install-test-core.ts 2.38.0 --rebuild-shims
 *
 * An installed package is kept, so a cached `~/.mmvm/versions/<key>` skips
 * the download. Shims already on disk are kept too, unless
 * `--rebuild-shims` is passed: `areShimsBuilt` only checks that the files
 * exist, not that they match the current shim sources, so CI always
 * rebuilds them.
 */

import process from "node:process";
import { fileURLToPath } from "node:url";
import * as path from "pathe";
import {
	areShimsBuilt,
	buildShimsForVersion,
	downloadVersion,
	getInstalledMmVersion,
	isVersionInstalled,
	sanitizeVersion
} from "../server/mm-version-manager.ts";

const harnessRoot = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	".."
);

/**
 * Install the requested core and its shims when they are missing.
 *
 * @param {string} version - mmvm version spec (e.g. "2.38.0" or "develop")
 * @param {boolean} rebuildShims - rebuild the shims even when they exist
 * @returns {Promise<void>}
 */
async function installTestCore(
	version: string,
	rebuildShims: boolean
): Promise<void> {
	const key = sanitizeVersion(version);

	if (isVersionInstalled(key)) {
		console.log(
			`[install-test-core] ${version}: package already installed`
		);
	} else {
		console.log(`[install-test-core] ${version}: downloading`);
		const downloaded = downloadVersion(version);
		if (!downloaded.ok) {
			throw new Error(`download failed: ${downloaded.error}`);
		}
	}

	if (!rebuildShims && areShimsBuilt(key)) {
		console.log(`[install-test-core] ${version}: shims already built`);
	} else {
		console.log(
			`[install-test-core] ${version}: ${rebuildShims ? "rebuilding" : "building"} shims`
		);
		const built = await buildShimsForVersion(key, harnessRoot);
		if (!built.ok) {
			throw new Error(`shim build failed: ${built.error}`);
		}
	}

	console.log(
		`[install-test-core] ${version}: ready (MagicMirror ${getInstalledMmVersion(key) ?? "unknown"})`
	);
}

const args = process.argv.slice(2);
const rebuildShims = args.includes("--rebuild-shims");
const requested =
	args.find((arg) => !arg.startsWith("--"))?.trim() ||
	process.env.MM_SANDBOX_TEST_CORE_VERSION?.trim();
if (!requested) {
	console.error(
		"[install-test-core] Pass a version, or set MM_SANDBOX_TEST_CORE_VERSION."
	);
	process.exit(1);
}

installTestCore(requested, rebuildShims).catch((error: unknown) => {
	console.error(
		`[install-test-core] ${requested}: ${error instanceof Error ? error.message : String(error)}`
	);
	process.exit(1);
});
