/**
 * Unit coverage for the port of the official dependency integrations.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll } from "vitest";
import {
	applyOfficialDependencyIntegrations,
	NCU_COOLDOWN,
	OFFICIAL_DEPENDENCY_INTEGRATION_DEFAULTS
} from "../../../server/official-dependency-integrations.ts";

type Call = { packageName: string; binName: string; args: string[] };

let moduleDir = "";
let emptyDir = "";

/**
 * Fake bin runner returning canned output per package.
 */
function createRunner(outputs: Record<string, string | Error>) {
	const calls: Call[] = [];
	const runBin = async (
		packageName: string,
		binName: string,
		args: string[]
	) => {
		calls.push({ packageName, binName, args });
		const output = outputs[packageName];
		if (output instanceof Error) {
			throw output;
		}
		return { stdout: output ?? "", stderr: "" };
	};
	return { calls, runBin };
}

const NCU_OUTPUT = JSON.stringify({ lodash: "^4.18.1", request: "^2.88.2" });
const NDC_OUTPUT =
	"Deprecated: request has been deprecated\n📊 Node Version Summary:\nnoise line";

beforeAll(() => {
	moduleDir = fs.mkdtempSync(path.join(os.tmpdir(), "MMM-DepProbe-"));
	fs.writeFileSync(path.join(moduleDir, "package.json"), "{}");
	emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), "MMM-NoPackage-"));
});

afterAll(() => {
	fs.rmSync(moduleDir, { recursive: true, force: true });
	fs.rmSync(emptyDir, { recursive: true, force: true });
});

test("official defaults enable deep, ncu and npmDeprecatedCheck", () => {
	assert.deepEqual(OFFICIAL_DEPENDENCY_INTEGRATION_DEFAULTS, {
		deep: true,
		ncu: true,
		npmDeprecatedCheck: true
	});
});

test("runs both tools with the official arguments and formats their findings", async () => {
	const { calls, runBin } = createRunner({
		"npm-check-updates": NCU_OUTPUT,
		"npm-deprecated-check": NDC_OUTPUT
	});
	const issues: string[] = [];

	await applyOfficialDependencyIntegrations(
		moduleDir,
		issues,
		undefined,
		runBin
	);

	assert.deepEqual(calls, [
		{
			packageName: "npm-check-updates",
			binName: "npm-check-updates",
			args: ["--jsonUpgraded", "--cooldown", NCU_COOLDOWN]
		},
		{
			packageName: "npm-deprecated-check",
			binName: "ndc",
			args: ["current"]
		}
	]);
	assert.deepEqual(issues, [
		"Information: There are updates for 2 dependencie(s):\n   - lodash -> ^4.18.1\n   - request -> ^2.88.2",
		"Deprecated: request has been deprecated\n📊 Node Version Summary:"
	]);
});

test("respects the official issue budget", async () => {
	const atFour = createRunner({ "npm-check-updates": NCU_OUTPUT });
	await applyOfficialDependencyIntegrations(
		moduleDir,
		["a", "b", "c", "d"],
		undefined,
		atFour.runBin
	);
	assert.equal(atFour.calls.length, 0);

	// With 2 prior issues ncu runs and pushes the count to 3, so ndc is skipped.
	const atTwo = createRunner({ "npm-check-updates": NCU_OUTPUT });
	const issues = ["a", "b"];
	await applyOfficialDependencyIntegrations(
		moduleDir,
		issues,
		undefined,
		atTwo.runBin
	);
	assert.deepEqual(
		atTwo.calls.map((call) => call.packageName),
		["npm-check-updates"]
	);
	assert.equal(issues.length, 3);
});

test("skips without package.json, with deep disabled, or per toggle", async () => {
	const noPackage = createRunner({});
	await applyOfficialDependencyIntegrations(
		emptyDir,
		[],
		undefined,
		noPackage.runBin
	);
	assert.equal(noPackage.calls.length, 0);

	const deepOff = createRunner({});
	await applyOfficialDependencyIntegrations(
		moduleDir,
		[],
		{ deep: false },
		deepOff.runBin
	);
	assert.equal(deepOff.calls.length, 0);

	const ncuOff = createRunner({ "npm-deprecated-check": NDC_OUTPUT });
	await applyOfficialDependencyIntegrations(
		moduleDir,
		[],
		{ ncu: false },
		ncuOff.runBin
	);
	assert.deepEqual(
		ncuOff.calls.map((call) => call.packageName),
		["npm-deprecated-check"]
	);
});

test("tool failures and clean results add no issues", async () => {
	const { runBin } = createRunner({
		"npm-check-updates": new Error("network down"),
		"npm-deprecated-check": "There are no deprecated dependencies."
	});
	const issues: string[] = [];
	await applyOfficialDependencyIntegrations(
		moduleDir,
		issues,
		undefined,
		runBin
	);
	assert.deepEqual(issues, []);
});
