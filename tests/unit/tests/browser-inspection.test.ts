/**
 * Unit coverage for headed-browser inspection environment parsing and worker selection.
 */

import {
	browserInspectionCursorInitScript,
	getBrowserInspectionOptions,
	getBrowserWorkerConfig
} from "../../_helpers/browser-inspection.ts";

test("browser inspection defaults keep browser suites headless and parallel", () => {
	const options = getBrowserInspectionOptions({});

	expect(options).toEqual({
		headed: false,
		headless: true,
		showCursor: false,
		slowMo: 0
	});
	expect(
		getBrowserWorkerConfig(
			{
				fileParallelism: true,
				maxWorkers: 4,
				minWorkers: 2
			},
			options
		)
	).toEqual({
		fileParallelism: true,
		maxWorkers: 4,
		minWorkers: 2
	});
});

test("browser inspection mode enables headed execution defaults for maintainers", () => {
	const options = getBrowserInspectionOptions({
		MODULE_SANDBOX_BROWSER_INSPECT: "true"
	});

	expect(options).toEqual({
		headed: true,
		headless: false,
		showCursor: true,
		slowMo: 150
	});
	expect(
		getBrowserWorkerConfig(
			{
				fileParallelism: true,
				maxWorkers: 4,
				minWorkers: 2
			},
			options
		)
	).toEqual({
		fileParallelism: false,
		maxWorkers: 1,
		minWorkers: 1
	});
});

test("explicit browser inspection overrides are honored", () => {
	const options = getBrowserInspectionOptions({
		MODULE_SANDBOX_BROWSER_HEADED: "yes",
		MODULE_SANDBOX_BROWSER_CURSOR: "off",
		MODULE_SANDBOX_BROWSER_SLOW_MO: "25"
	});

	expect(options).toEqual({
		headed: true,
		headless: false,
		showCursor: false,
		slowMo: 25
	});
});

test("browser inspection rejects invalid environment values clearly", () => {
	expect(() =>
		getBrowserInspectionOptions({
			MODULE_SANDBOX_BROWSER_CURSOR: "maybe"
		})
	).toThrow(/MODULE_SANDBOX_BROWSER_CURSOR/);
	expect(() =>
		getBrowserInspectionOptions({
			MODULE_SANDBOX_BROWSER_SLOW_MO: "-1"
		})
	).toThrow(/MODULE_SANDBOX_BROWSER_SLOW_MO/);
	expect(browserInspectionCursorInitScript).toContain(
		"__module-sandbox-inspection-cursor"
	);
});
