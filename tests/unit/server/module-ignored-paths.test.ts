/**
 * Unit coverage for repository-ignored path resolution used by Quality.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll } from "vitest";
import { resolveRepositoryIgnoredPaths } from "../../../server/module-ignored-paths.ts";

let gitModule = "";
let plainModule = "";

/**
 * Writes files relative to a root directory.
 */
function writeFiles(root: string, files: Record<string, string>): void {
	for (const [relativePath, content] of Object.entries(files)) {
		fs.mkdirSync(path.dirname(path.join(root, relativePath)), {
			recursive: true
		});
		fs.writeFileSync(path.join(root, relativePath), content);
	}
}

const MODULE_FILES = {
	".gitignore": "dist/\n*.log\n",
	"MMM-Probe.js": "",
	"dist/bundle.js": "",
	"debug.log": "",
	"nested/.gitignore": "cache/\n",
	"nested/cache/data.js": "",
	"nested/keep.js": ""
};

beforeAll(() => {
	gitModule = fs.mkdtempSync(path.join(os.tmpdir(), "MMM-GitProbe-"));
	writeFiles(gitModule, MODULE_FILES);
	execFileSync("git", ["init", "-q"], { cwd: gitModule });

	plainModule = fs.mkdtempSync(path.join(os.tmpdir(), "MMM-PlainProbe-"));
	writeFiles(plainModule, MODULE_FILES);
});

afterAll(() => {
	fs.rmSync(gitModule, { recursive: true, force: true });
	fs.rmSync(plainModule, { recursive: true, force: true });
});

test("git work trees honour root and nested .gitignore files", () => {
	const ignored = resolveRepositoryIgnoredPaths(gitModule);

	assert.equal(ignored.isIgnored("dist/bundle.js"), true);
	assert.equal(ignored.isIgnored("debug.log"), true);
	assert.equal(ignored.isIgnored("nested/cache/data.js"), true);
	assert.equal(ignored.isIgnored("MMM-Probe.js"), false);
	assert.equal(ignored.isIgnored("nested/keep.js"), false);
	assert.deepEqual([...ignored.eslintIgnores].sort(), [
		"debug.log",
		"dist/**",
		"nested/cache/**"
	]);
});

test("non-git modules fall back to the root .gitignore", () => {
	const ignored = resolveRepositoryIgnoredPaths(plainModule);

	assert.equal(ignored.isIgnored("dist/bundle.js"), true);
	assert.equal(ignored.isIgnored("debug.log"), true);
	assert.equal(ignored.isIgnored("MMM-Probe.js"), false);
	assert.deepEqual([...ignored.eslintIgnores].sort(), [
		"debug.log",
		"dist/**"
	]);
});
