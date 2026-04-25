/**
 * Browser-backed UI coverage for runtime control interactions.
 */
import { afterAll, expect } from "vitest";
import {
	closeSandbox,
	gotoSandbox,
	openDomain,
	pageClick,
	pageEvaluate,
	pageUrl
} from "../_helpers/helpers.browser.ts";
import { createJourneyTest } from "../_helpers/journey-coverage.ts";

const journeyTest = createJourneyTest("ui");

afterAll(async () => {
	await closeSandbox();
});

/**
 * Internal helper for page text.
 */
const pageText = (selector) => {
	return pageEvaluate((selectorValue) => {
		return (
			globalThis.document.querySelector(selectorValue)?.textContent ?? ""
		);
	}, selector);
};

/**
 * UI smoke coverage for the Runtime sidebar domain.
 */
journeyTest(
	"ui-runtime-controls",
	"runtime domain toggles visibility and activity without breaking lifecycle state",
	async () => {
		await gotoSandbox();
		await openDomain("runtime");
		const sandboxOrigin = new URL(await pageUrl()).origin;

		await expect
			.poll(() => pageText("#domain-runtime"))
			.toContain("Sandbox URL");
		await expect
			.poll(() => pageText("#domain-runtime"))
			.toContain(sandboxOrigin);
		await expect
			.poll(() => pageText("#domain-runtime"))
			.toContain("Config editing");
		await expect
			.poll(() => pageText("#domain-runtime"))
			.toContain("Watch mode");

		await pageClick("#lifecycle-visibility-action");
		await expect
			.poll(() => pageText("#lifecycle-visibility-status"))
			.toContain("Hidden");

		await pageClick("#lifecycle-visibility-action");
		await expect
			.poll(() => pageText("#lifecycle-visibility-status"))
			.toContain("Visible");

		await pageClick("#lifecycle-activity-action");
		await expect
			.poll(() => pageText("#lifecycle-activity-status"))
			.toContain("Suspended");

		await pageClick("#lifecycle-activity-action");
		await expect
			.poll(() => pageText("#lifecycle-activity-status"))
			.toContain("Running");

		await expect.poll(() => pageText("#lifecycle-started")).toBe("Yes");
	}
);
