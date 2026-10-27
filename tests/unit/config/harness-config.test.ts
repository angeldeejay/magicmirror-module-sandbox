/**
 * Unit coverage for the maintainer `--real-core-stage` flag in the harness
 * bootstrap config.
 */
import * as path from "pathe";
import { afterEach, beforeEach, expect, test } from "vitest";
import {
	createHarnessConfig,
	REAL_CORE_STAGE_FLAG
} from "../../../config/harness.config.ts";
import { harnessRoot } from "../../../server/paths.ts";

const originalArgv = process.argv;
const originalRoot = process.env.MM_SANDBOX_MOUNTED_MODULE_ROOT;

beforeEach(() => {
	process.env.MM_SANDBOX_MOUNTED_MODULE_ROOT = path.join(
		harnessRoot,
		"tests",
		"_fixtures",
		"MMM-TestModule"
	);
});

afterEach(() => {
	process.argv = originalArgv;
	if (originalRoot === undefined) {
		delete process.env.MM_SANDBOX_MOUNTED_MODULE_ROOT;
	} else {
		process.env.MM_SANDBOX_MOUNTED_MODULE_ROOT = originalRoot;
	}
});

test("realCoreStage is false without the CLI flag", () => {
	process.argv = [originalArgv[0], "server/index.ts", "--watch"];
	expect(createHarnessConfig().realCoreStage).toBe(false);
});

test("realCoreStage is true only with --real-core-stage", () => {
	expect(REAL_CORE_STAGE_FLAG).toBe("--real-core-stage");
	process.argv = [originalArgv[0], "server/index.ts", REAL_CORE_STAGE_FLAG];
	expect(createHarnessConfig().realCoreStage).toBe(true);
});
