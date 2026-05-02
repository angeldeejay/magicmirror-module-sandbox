#!/usr/bin/env -S node --experimental-strip-types

/**
 * Downloads vendored files from MagicMirrorOrg/MagicMirror-3rd-Party-Modules
 * into server/vendor/check-modules/ with a VENDORED header.
 *
 * Run via: npm run sync:module-analyzer
 */

import * as fs from "node:fs";
import * as path from "pathe";
import { fileURLToPath } from "node:url";
import { ensureDirectory, fromOS } from "./shared.ts";

const UPSTREAM_BASE =
	"https://raw.githubusercontent.com/MagicMirrorOrg/MagicMirror-3rd-Party-Modules/main/scripts/check-modules";

const VENDORED_FILES = [
	"dependency-usage.ts",
	"missing-dependency-rule.ts",
	"module-analyzer.ts",
	"rule-registry.ts"
];

const currentFilePath = fromOS(
	typeof __filename === "string" ? __filename : fileURLToPath(import.meta.url)
);
const currentDirPath =
	typeof __dirname === "string"
		? fromOS(__dirname)
		: path.dirname(currentFilePath);
const root = path.resolve(currentDirPath, "..");
const vendorDir = path.join(root, "server", "vendor", "check-modules");

/**
 * Downloads and writes a single vendored file.
 * Under act (ACT env set), skips if the file already exists — container reuse
 * means the file is still present from a previous run and re-fetching is wasteful.
 */
async function syncFile(fileName: string): Promise<void> {
	const dest = path.join(vendorDir, fileName);
	if (process.env.ACT && fs.existsSync(dest)) {
		console.log(`[sync:module-analyzer] Skipped ${fileName} (pre-existing, ACT mode)`);
		return;
	}
	const url = `${UPSTREAM_BASE}/${fileName}`;
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(
			`Failed to fetch ${fileName}: ${response.status} ${response.statusText}`
		);
	}
	const source = await response.text();
	const header = `// VENDORED from MagicMirrorOrg/MagicMirror-3rd-Party-Modules — do not edit directly.\n// Update by running: npm run sync:module-analyzer\n// Source: ${url}\n\n`;
	fs.writeFileSync(
		path.join(vendorDir, fileName),
		`${header}${source}`,
		"utf8"
	);
	console.log(`[sync:module-analyzer] Written ${fileName}`);
}

/**
 * Syncs all vendored check-modules files from upstream.
 */
async function syncAll(): Promise<void> {
	ensureDirectory(vendorDir);
	await Promise.all(VENDORED_FILES.map(syncFile));
	console.log(
		`[sync:module-analyzer] Done — ${VENDORED_FILES.length} files synced`
	);
}

syncAll().catch((err: unknown) => {
	console.error("[sync:module-analyzer] Error:", err);
	process.exitCode = 1;
});
