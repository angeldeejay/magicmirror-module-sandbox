#!/usr/bin/env node

/**
 * Stable postinstall wrapper that runs the TS source entrypoint in the source repo
 * and the compiled dist entrypoint from installed packages.
 */

const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const packageRoot = path.resolve(__dirname, "..");
const sourceEntrypoint = path.join(packageRoot, "bin", "install-guard.ts");
const distEntrypoint = path.join(
	packageRoot,
	"dist",
	"bin",
	"install-guard.js"
);
const sourceRepoMarker = path.join(packageRoot, "scripts", "build-dist.ts");

const args =
	fs.existsSync(sourceEntrypoint) && fs.existsSync(sourceRepoMarker)
		? ["--experimental-strip-types", sourceEntrypoint]
		: [distEntrypoint];

execFileSync(process.execPath, args, {
	cwd: packageRoot,
	stdio: "inherit"
});
