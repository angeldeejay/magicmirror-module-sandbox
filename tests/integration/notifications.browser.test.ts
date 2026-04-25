/**
 * Browser-backed integration coverage for notifications and helper traffic.
 */
import { afterAll, expect } from "vitest";
import {
	closeSandbox,
	gotoSandbox,
	openDomain,
	pageClick,
	pageEvaluate,
	pageFill,
	stageClick,
	stageText
} from "../_helpers/helpers.browser.ts";
import { createJourneyTest } from "../_helpers/journey-coverage.ts";

const journeyTest = createJourneyTest("integration");

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
 * Integration coverage for notifications and helper websocket traffic.
 */
journeyTest(
	"integration-notifications-helper",
	"routes notifications and helper websocket traffic through the generated test module",
	async () => {
		await gotoSandbox();
		await openDomain("notifications");

		await pageFill("#notification-name", "INTEGRATION_NOTICE");
		await pageEvaluate(() => {
			const payloadEditor = globalThis.document.getElementById(
				"notification-payload-editor"
			);
			payloadEditor.raw_string = '{"message":"from integration suite"}';
			payloadEditor.dispatchEvent(new Event("input", { bubbles: true }));
			payloadEditor.dispatchEvent(
				new CustomEvent("json-editor:state", { bubbles: true })
			);
		});
		await pageClick("#notification-send");

		await expect
			.poll(() => stageText("#test-module-notice"))
			.toBe("Notice: from integration suite");
		await expect
			.poll(() => pageText("#notification-log"))
			.toContain("INTEGRATION_NOTICE");

		await pageClick(
			'.sandbox-tab[data-domain="notifications"][data-tab="websocket"]'
		);
		await stageClick("#test-module-helper-ping");
		await expect
			.poll(() => stageText("#test-module-helper-reply"))
			.toBe("Helper: fixture ping");
		await expect
			.poll(() => pageText("#websocket-log"))
			.toContain("TEST_MODULE_PING");
		await expect
			.poll(() => pageText("#websocket-log"))
			.toContain("TEST_MODULE_PONG");

		await openDomain("debug");
		await expect
			.poll(() => pageText("#helper-log"))
			.toContain("test module helper received ping");
	}
);
