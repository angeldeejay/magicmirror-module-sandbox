/**
 * Unit coverage for the port of the official module-check ESLint pass.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll } from "vitest";
import {
	OFFICIAL_CHECK_GROUP_DEFAULTS,
	runOfficialEslintCheck
} from "../../../server/official-eslint-check.ts";

let moduleDir = "";

beforeAll(() => {
	moduleDir = fs.mkdtempSync(path.join(os.tmpdir(), "MMM-EslintProbe-"));
	fs.mkdirSync(path.join(moduleDir, ".github", "workflows"), {
		recursive: true
	});
	fs.writeFileSync(
		path.join(moduleDir, "node_helper.js"),
		[
			'const NodeHelper = require("node_helper");',
			'const request = require("request");',
			'const http = require("http");',
			"module.exports = NodeHelper.create({",
			"\tstart() {",
			"\t\tconst buffer = new Buffer(10);",
			"\t\tconst year = new Date().getYear();",
			"\t\tconst xhr = new XMLHttpRequest();",
			"\t\treturn [request, http, buffer, year, xhr];",
			"\t}",
			"});",
			""
		].join("\n")
	);
	fs.writeFileSync(
		path.join(moduleDir, ".github", "workflows", "ci.yml"),
		[
			"name: ci",
			"on: push",
			"jobs:",
			"  test:",
			"    runs-on: ubuntu-latest",
			"    steps:",
			"      - uses: actions/checkout@v3",
			""
		].join("\n")
	);
	fs.writeFileSync(
		path.join(moduleDir, "package.json"),
		JSON.stringify({ name: "mmm-eslint-probe", version: "1.0.0" })
	);
	// A repository-owned config must never be executed by the official pass.
	fs.writeFileSync(
		path.join(moduleDir, "eslint.config.js"),
		'throw new Error("repository ESLint config executed");\n'
	);
});

afterAll(() => {
	fs.rmSync(moduleDir, { recursive: true, force: true });
});

test("official check-group defaults keep general ESLint enabled", () => {
	assert.deepEqual(OFFICIAL_CHECK_GROUP_DEFAULTS, {
		deep: true,
		eslint: true
	});
});

test("runOfficialEslintCheck reports every built-in MagicMirror rule without executing repository config", async () => {
	const issues = await runOfficialEslintCheck(moduleDir);
	const joined = issues.join("\n");

	assert.match(joined, /Deprecated: In `node_helper\.js:2:\d+`: request:/);
	assert.match(joined, /In `node_helper\.js:3:\d+`: http: .*node:http/);
	assert.match(
		joined,
		/Deprecated: In `node_helper\.js:6:\d+`: 'new Buffer\(\)'/
	);
	assert.match(joined, /In `node_helper\.js:7:\d+`: Date\.getYear\(\)/);
	assert.match(joined, /In `node_helper\.js:8:\d+`: .*fetch/);
	assert.match(
		joined,
		/In `\.github[\\/]workflows[\\/]ci\.yml:7:\d+`: .*actions\/checkout@v/
	);
	assert.doesNotMatch(joined, /repository ESLint config executed/);
});

test("runOfficialEslintCheck groups general findings under ESLint issues and drops them when general checks are off", async () => {
	const withGeneral = await runOfficialEslintCheck(moduleDir, true);
	const withoutGeneral = await runOfficialEslintCheck(moduleDir, false);

	assert.equal(
		withGeneral.some((issue) => issue.startsWith("ESLint issues:\n")),
		true
	);
	assert.equal(
		withoutGeneral.some((issue) => issue.startsWith("ESLint issues:")),
		false
	);
	// Built-in MagicMirror rules run regardless of the general toggle.
	assert.equal(
		withoutGeneral.filter((issue) => issue.includes("node_helper.js"))
			.length,
		withGeneral.filter(
			(issue) =>
				!issue.startsWith("ESLint issues:") &&
				issue.includes("node_helper.js")
		).length
	);
});
