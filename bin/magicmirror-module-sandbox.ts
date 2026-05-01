#!/usr/bin/env -S node --experimental-strip-types

/**
 * CLI bootstrap that resolves preview mode and launches the maintained or packaged server entrypoint.
 */

import * as fs from "node:fs";
import { createRequire } from "node:module";
import * as path from "pathe";
import { pathToFileURL, fileURLToPath } from "node:url";
import { applyMaintainerPreviewEnv } from "./preview.ts";

const fromOS = (p: string) => p.replace(/\\/g, "/");

const currentFilePath = fromOS(
	typeof __filename === "string"
		? __filename
		: fileURLToPath(import.meta.url)
);
const currentDirPath =
	typeof __dirname === "string" ? fromOS(__dirname) : path.dirname(currentFilePath);
const packageRoot =
	path.basename(currentDirPath) === "bin" &&
	path.basename(path.dirname(currentDirPath)) === "dist"
		? path.resolve(currentDirPath, "..", "..")
		: path.resolve(currentDirPath, "..");
const nodeRequire = createRequire(
	typeof __filename === "string" ? __filename : import.meta.url
);

const sourceEntrypointCandidates = [
	path.join(packageRoot, "server", "index.ts"),
	path.join(packageRoot, "server", "index.js")
];
const distEntrypoint = path.join(packageRoot, "dist", "server", "index.cjs");
const args = process.argv.slice(2);

if (args.includes("--preview")) {
	const previewConfig = applyMaintainerPreviewEnv();
	console.log(
		`[module-sandbox] preview mode enabled with ${previewConfig.moduleName} from ${previewConfig.previewRoot}`
	);
}

/**
 * Internal helper for main.
 */
async function main(): Promise<void> {
	const sourceEntrypoint =
		sourceEntrypointCandidates.find((candidate) =>
			fs.existsSync(candidate)
		) || distEntrypoint;
	if (sourceEntrypoint.endsWith(".ts")) {
		await import(pathToFileURL(sourceEntrypoint).href);
		return;
	}

	nodeRequire(sourceEntrypoint);
}

main().catch((error: unknown) => {
	console.error("[module-sandbox] fatal bootstrap error", error);
	process.exitCode = 1;
});
