/**
 * Unit coverage for journey metadata expansion and summary aggregation.
 */
import assert from "node:assert/strict";
import {
	buildJourneyCoverageMeta,
	buildJourneyCoverageSummary
} from "../../_helpers/journey-coverage.ts";

/**
 * Expanding one journey should pull its modeled transitions and outcomes into
 * normalized task metadata.
 */
test("buildJourneyCoverageMeta expands journey transitions and outcomes", () => {
	const meta = buildJourneyCoverageMeta("ui", "ui-runtime-controls");

	assert.equal(meta.suite, "ui");
	assert.deepEqual(meta.journeys, ["ui-runtime-controls"]);
	assert.deepEqual(meta.transitions, [
		"domain:runtime-opened",
		"runtime:hide",
		"runtime:show",
		"runtime:suspend",
		"runtime:resume"
	]);
	assert.deepEqual(meta.outcomes, [
		"runtime diagnostics visible",
		"visibility state updates",
		"activity state updates",
		"started state preserved"
	]);
});

/**
 * Cross-suite IDs should fail fast so the catalog remains semantically strict.
 */
test("buildJourneyCoverageMeta rejects journeys from the wrong suite", () => {
	assert.throws(() => {
		buildJourneyCoverageMeta("ui", "integration-module-mount");
	}, /belongs to suite "integration"/);
});

/**
 * Summary aggregation should count only passed tests as covered while keeping
 * the full catalog totals for the suite.
 */
test("buildJourneyCoverageSummary computes suite and overall percentages from passed journeys", () => {
	const summary = buildJourneyCoverageSummary([
		{
			moduleId: "tests/ui/bootstrap.browser.test.ts",
			testName: "boots the sandbox host and mounts the real module",
			status: "passed",
			...buildJourneyCoverageMeta("ui", "ui-bootstrap")
		},
		{
			moduleId: "tests/ui/debug.browser.test.ts",
			testName: "debug domain exposes sandbox log surfaces",
			status: "failed",
			...buildJourneyCoverageMeta("ui", "ui-debug-sidebar")
		}
	]);

	assert(summary);
	assert.equal(summary.suites.length, 1);
	assert.equal(summary.suites[0].suite, "ui");
	assert.equal(summary.suites[0].journeys.covered, 1);
	assert.equal(summary.suites[0].journeys.total, 6);
	assert.equal(
		summary.suites[0].journeys.missed.includes("ui-debug-sidebar"),
		true
	);
	assert.equal(summary.overall.suites[0], "ui");
	assert.equal(summary.overall.journeys.covered, 1);
	assert.equal(summary.overall.journeys.total, 6);
	assert.equal(summary.overall.score > 0, true);
});
