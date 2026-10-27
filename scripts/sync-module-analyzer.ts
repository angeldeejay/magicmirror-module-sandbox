#!/usr/bin/env tsx

/**
 * Downloads vendored files from MagicMirrorOrg/MagicMirror-3rd-Party-Modules
 * into server/vendor/check-modules/ with a VENDORED header, and verifies that
 * the upstream pieces the sandbox ports by hand have not drifted.
 *
 * Run via: npm run build:02-sync-analyzer
 */

import * as fs from "node:fs";
import * as path from "pathe";
import { fileURLToPath } from "node:url";
import { ensureDirectory, fromOS } from "./shared.ts";

const UPSTREAM_ROOT =
	"https://raw.githubusercontent.com/MagicMirrorOrg/MagicMirror-3rd-Party-Modules/main";

type VendoredFile = {
	/** Path inside the upstream repository. */
	source: string;
	/** File name under server/vendor/check-modules/. */
	fileName: string;
	/** Mechanical rewrite applied after download (documented in the header). */
	transform?: (source: string) => string;
	transformNote?: string;
};

const VENDORED_FILES: VendoredFile[] = [
	"dependency-usage.ts",
	"http-import-check.ts",
	"javascript-check.ts",
	"missing-dependency-rule.ts",
	"module-analyzer.ts",
	"rule-registry.ts",
	"workflow-version-policy.ts",
	"workflow-yaml-check.ts"
].map((fileName) => ({
	source: `scripts/check-modules/${fileName}`,
	fileName
}));

// The official ESLint pass configuration lives at the upstream repo root and
// imports the plugin from scripts/check-modules/. Vendored next to the plugin,
// only that import path changes.
VENDORED_FILES.push({
	source: "eslint.testconfig.js",
	fileName: "eslint-testconfig.ts",
	transform: (source) =>
		source.replace(
			'from "./scripts/check-modules/javascript-check.ts"',
			'from "./javascript-check.ts"'
		),
	transformNote:
		'import path "./scripts/check-modules/javascript-check.ts" rewritten to "./javascript-check.ts"'
});

const VENDORED_FILE_NAMES = VENDORED_FILES.map((file) => file.fileName);

/**
 * Upstream code the sandbox ports instead of vendoring (the surrounding worker
 * pulls in git, sharp and the pipeline cache). The sync fails when upstream
 * changes, so server/official-eslint-check.ts gets reviewed against it.
 */
const PORTED_SNAPSHOTS = [
	{
		source: "pipeline/workers/process-module.ts",
		snapshot: "run-eslint-check.txt",
		extract: (source: string): string => {
			const start = source.indexOf(
				"export async function runEslintCheck("
			);
			const callSite = source.match(/^.*await runEslintCheck\(.*$/m);
			if (start === -1 || !callSite) {
				throw new Error(
					"runEslintCheck or its call site is gone from upstream pipeline/workers/process-module.ts"
				);
			}
			const end = source.indexOf("\n}\n", start);
			return `${source.slice(start, end + 2)}\n// call site\n${callSite[0].trim()}\n`;
		}
	},
	{
		source: "scripts/check-modules/check-groups.config.json",
		snapshot: "check-groups.config.json",
		extract: (source: string): string => source
	}
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
const snapshotDir = path.join(root, "scripts", "upstream-snapshots");

/**
 * Fetches one upstream file as text.
 */
async function fetchUpstream(source: string): Promise<{
	url: string;
	text: string;
}> {
	const url = `${UPSTREAM_ROOT}/${source}`;
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(
			`Failed to fetch ${source}: ${response.status} ${response.statusText}`
		);
	}
	return { url, text: (await response.text()).replace(/\r\n/g, "\n") };
}

/**
 * Downloads and writes a single vendored file.
 * Under act (ACT env set), skips if the file already exists — container reuse
 * means the file is still present from a previous run and re-fetching is wasteful.
 */
async function syncFile(file: VendoredFile): Promise<void> {
	const dest = path.join(vendorDir, file.fileName);
	if (process.env.ACT && fs.existsSync(dest)) {
		console.log(
			`[build:02-sync-analyzer] Skipped ${file.fileName} (pre-existing, ACT mode)`
		);
		return;
	}
	const { url, text } = await fetchUpstream(file.source);
	const transformed = file.transform ? file.transform(text) : text;
	if (file.transform && transformed === text) {
		throw new Error(
			`Expected rewrite did not apply to ${file.source}: ${file.transformNote}`
		);
	}
	const transformLine = file.transformNote
		? `// Sandbox rewrite: ${file.transformNote}\n`
		: "";
	const header = `// VENDORED from MagicMirrorOrg/MagicMirror-3rd-Party-Modules — do not edit directly.\n// Update by running: npm run build:02-sync-analyzer\n// Source: ${url}\n${transformLine}\n`;
	fs.writeFileSync(dest, `${header}${transformed}`, "utf8");
	console.log(`[build:02-sync-analyzer] Written ${file.fileName}`);
}

/**
 * Relative ES imports (`from "./x"` or `import("./x")`) in a vendored file.
 */
const RELATIVE_IMPORT_PATTERN =
	/(?:^|\s)from\s+["']\.\/([^"']+)["']|import\(\s*["']\.\/([^"']+)["']\s*\)/g;

/**
 * Fails when a vendored file imports a sibling that is not vendored, so an
 * upstream split surfaces here instead of as a runtime "Cannot find module".
 */
function assertRelativeImportsVendored(): void {
	const missing: string[] = [];
	for (const fileName of VENDORED_FILE_NAMES) {
		const source = fs.readFileSync(path.join(vendorDir, fileName), "utf8");
		for (const match of source.matchAll(RELATIVE_IMPORT_PATTERN)) {
			const imported = match[1] ?? match[2];
			if (!VENDORED_FILE_NAMES.includes(imported)) {
				missing.push(`${fileName} -> ./${imported}`);
			}
		}
	}
	if (missing.length > 0) {
		throw new Error(
			`Vendored analyzer imports files that are not vendored (add them to VENDORED_FILES): ${missing.join(", ")}`
		);
	}
}

/**
 * Fails when upstream code that the sandbox ports by hand differs from the
 * reviewed snapshot under scripts/upstream-snapshots/.
 */
async function assertPortedSnapshotsCurrent(): Promise<void> {
	const drifted: string[] = [];
	for (const entry of PORTED_SNAPSHOTS) {
		const { text } = await fetchUpstream(entry.source);
		const current = entry.extract(text);
		const snapshotPath = path.join(snapshotDir, entry.snapshot);
		const reviewed = fs.existsSync(snapshotPath)
			? fs.readFileSync(snapshotPath, "utf8").replace(/\r\n/g, "\n")
			: null;
		if (reviewed !== current) {
			fs.writeFileSync(`${snapshotPath}.upstream`, current, "utf8");
			drifted.push(entry.source);
		}
	}
	if (drifted.length > 0) {
		throw new Error(
			`Upstream changed code the sandbox ports by hand: ${drifted.join(", ")}. ` +
				"Compare scripts/upstream-snapshots/<file> with <file>.upstream, update server/official-eslint-check.ts to match, then replace the snapshot."
		);
	}
}

/**
 * Syncs all vendored check-modules files from upstream.
 */
async function syncAll(): Promise<void> {
	ensureDirectory(vendorDir);
	await Promise.all(VENDORED_FILES.map(syncFile));
	assertRelativeImportsVendored();
	if (!process.env.ACT) {
		await assertPortedSnapshotsCurrent();
	}
	console.log(
		`[build:02-sync-analyzer] Done — ${VENDORED_FILES.length} files synced`
	);
}

syncAll().catch((err: unknown) => {
	console.error("[build:02-sync-analyzer] Error:", err);
	process.exitCode = 1;
});
