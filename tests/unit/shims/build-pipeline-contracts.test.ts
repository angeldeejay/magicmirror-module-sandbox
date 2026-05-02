/**
 * Contract tests for the build pipeline and shim artifacts (Correction 3).
 *
 * These tests are the detection mechanism for MM core breaking changes.
 * No hash locks, no source text sentinels — a failing test names the broken contract.
 *
 * The build pipeline smoke test verifies key artifacts from the build that
 * vitest-global-setup.ts already ran. If globalSetup threw, the entire suite
 * would have aborted — artifact-presence tests here are the named contract check.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sandboxRoot = path.resolve(__dirname, "../../..");
const shimsGenerated = path.join(sandboxRoot, "shims", "generated");
const nodeRequire = createRequire(import.meta.url);

// ── Build pipeline smoke: artifact presence ───────────────────────────────────
// vitest-global-setup.ts calls buildNodeCompat() before the suite.
// If that call throws, the entire Vitest run aborts — these tests never run.
// Their purpose: named failure for each artifact that MM core changes might break.

const EXPECTED_COMPAT_FILES = [
	"js/logger.js",
	"js/node_helper.js",
	"js/class.js",
	"js/http_fetcher.js",
	"js/server_functions.js",
	"package.json"
];

for (const relPath of EXPECTED_COMPAT_FILES) {
	test(`build pipeline: shims/generated/magicmirror-core/${relPath} exists after build`, () => {
		const fullPath = path.join(shimsGenerated, "magicmirror-core", relPath);
		assert.equal(
			fs.existsSync(fullPath),
			true,
			`Artifact missing: ${fullPath} — MM core structure may have changed`
		);
	});
}

// ── Express bundle contracts ──────────────────────────────────────────────────

const EXPECTED_EXPRESS_BUNDLE = path.join(
	shimsGenerated,
	"node_modules",
	"express",
	"index.js"
);

test("express bundle: shims/generated/node_modules/express/index.js exists after build", () => {
	assert.equal(
		fs.existsSync(EXPECTED_EXPRESS_BUNDLE),
		true,
		`Express bundle not found at ${EXPECTED_EXPRESS_BUNDLE}`
	);
});

test("express bundle: is a function (express factory)", () => {
	const express = nodeRequire(EXPECTED_EXPRESS_BUNDLE) as unknown;
	assert.equal(typeof express, "function");
});

test("express bundle: express() creates an app with use() and get()", () => {
	const express = nodeRequire(EXPECTED_EXPRESS_BUNDLE) as (
		...args: unknown[]
	) => { use: unknown; get: unknown };
	const app = express();
	assert.equal(typeof app.use, "function");
	assert.equal(typeof app.get, "function");
});

test("express bundle: express.static() exists and returns a middleware function", () => {
	const express = nodeRequire(EXPECTED_EXPRESS_BUNDLE) as {
		static: (...args: unknown[]) => unknown;
	};
	assert.equal(typeof express.static, "function");
	const mw = express.static(".");
	assert.equal(typeof mw, "function");
});

test("express bundle: resolves from shims/generated/node_modules when required from magicmirror-core context", () => {
	// Simulates node_helper.js (at shims/generated/magicmirror-core/js/) requiring 'express'.
	// Node walks up: .../js/ → .../magicmirror-core/ → .../generated/ → finds node_modules/express here.
	const magicMirrorCoreRoot = path.join(shimsGenerated, "magicmirror-core");
	const resolvedPath = nodeRequire
		.resolve("express", { paths: [magicMirrorCoreRoot] })
		.split("\\")
		.join("/");
	assert.equal(
		resolvedPath.includes("/shims/generated/"),
		true,
		`express resolved from unexpected path: ${resolvedPath}`
	);
});

// ── Undici bundle contracts ───────────────────────────────────────────────────

const EXPECTED_UNDICI_BUNDLE = path.join(
	shimsGenerated,
	"node_modules",
	"undici",
	"index.js"
);

test("undici bundle: shims/generated/node_modules/undici/index.js exists after build", () => {
	assert.equal(
		fs.existsSync(EXPECTED_UNDICI_BUNDLE),
		true,
		`Undici bundle not found at ${EXPECTED_UNDICI_BUNDLE}`
	);
});

test("undici bundle: exports fetch and request functions", () => {
	const undici = nodeRequire(EXPECTED_UNDICI_BUNDLE) as Record<
		string,
		unknown
	>;
	assert.equal(
		typeof undici.fetch,
		"function",
		"undici.fetch is not a function"
	);
	assert.equal(
		typeof undici.request,
		"function",
		"undici.request is not a function"
	);
});

test("undici bundle: resolves from shims/generated/node_modules when required from magicmirror-core context", () => {
	// Simulates server_functions.js (at shims/generated/magicmirror-core/js/) requiring 'undici'.
	// Node walks up: .../js/ → .../magicmirror-core/ → .../generated/ → finds node_modules/undici here.
	const magicMirrorCoreRoot = path.join(shimsGenerated, "magicmirror-core");
	const resolvedPath = nodeRequire
		.resolve("undici", { paths: [magicMirrorCoreRoot] })
		.split("\\")
		.join("/");
	assert.equal(
		resolvedPath.includes("/shims/generated/"),
		true,
		`undici resolved from unexpected path: ${resolvedPath}`
	);
});
