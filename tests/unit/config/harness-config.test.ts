/**
 * Unit coverage for the harness bootstrap config.
 */
import * as path from "pathe";
import { afterEach, beforeEach, expect, test } from "vitest";
import { createHarnessConfig } from "../../../config/harness.config.ts";
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

test("derives the module identity from the mounted module", () => {
	const config = createHarnessConfig();
	expect(config.moduleName).toBe("MMM-TestModule");
	expect(config.language).toBe("en");
});

test("has no stage mode switch: the real-core stage is the only stage", () => {
	// The retired maintainer flag must not change anything any more.
	process.argv = [originalArgv[0], "server/index.ts", "--real-core-stage"];
	expect(Object.keys(createHarnessConfig())).not.toContain("realCoreStage");
});
