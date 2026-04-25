/**
 * Browser-backed UI coverage for the Debug sidebar domain.
 */
import { afterAll, expect } from "vitest";
import {
	closeSandbox,
	gotoSandbox,
	openDomain,
	pageClick,
	pageEvaluate,
	pageVisible
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
 * UI smoke coverage for the Debug sidebar domain.
 */
journeyTest(
	"ui-debug-sidebar",
	"debug domain exposes sandbox log surfaces",
	async () => {
		await gotoSandbox();
		await openDomain("debug");

		await expect
			.poll(() => pageText("#domain-debug"))
			.toContain("Console log");
		await expect
			.poll(() => pageText("#domain-debug"))
			.toContain("Helper log");
		await expect.poll(() => pageVisible("#helper-log")).toBe(true);

		await pageClick(
			'.sandbox-tab[data-domain="debug"][data-tab="console-log"]'
		);

		await expect.poll(() => pageVisible("#console-log")).toBe(true);
	}
);
