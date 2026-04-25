/**
 * Browser-backed UI coverage for the About sidebar domain.
 */
import { afterAll, expect } from "vitest";
import {
	closeSandbox,
	gotoSandbox,
	openDomain,
	pageCount,
	pageEvaluate
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
 * UI smoke coverage for the About sidebar domain.
 */
journeyTest(
	"ui-about-domain",
	"about domain exposes product context and reference links",
	async () => {
		await gotoSandbox();
		await openDomain("about");

		await expect
			.poll(() => pageText("#domain-about"))
			.toContain("Thin runtime harness for one MagicMirror module.");
		await expect.poll(() => pageCount("#domain-about a")).toBe(6);
		await expect
			.poll(() => pageText("#domain-about"))
			.toContain("magicmirror-module-sandbox");
	}
);
