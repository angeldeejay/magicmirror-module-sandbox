/**
 * Browser-backed UI coverage for the Notifications sidebar domain.
 */
import { afterAll, expect } from "vitest";
import {
	closeSandbox,
	gotoSandbox,
	openDomain,
	pageClick,
	pageEvaluate,
	pageFill
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
 * UI smoke coverage for the Notifications sidebar domain.
 */
journeyTest(
	"ui-notifications-sidebar",
	"notifications domain can emit a frontend notification and log it",
	async () => {
		await gotoSandbox();
		await openDomain("notifications");

		await pageFill("#notification-name", "SANDBOX_SMOKE");
		await pageClick("#notification-send");

		await expect
			.poll(() => pageText("#notification-status"))
			.toContain("Notification emitted");
		await expect
			.poll(() => pageText("#notification-log"))
			.toContain("SANDBOX_SMOKE");
	}
);
