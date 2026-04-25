/**
 * Browser-backed UI coverage for initial sandbox shell bootstrap.
 */
import { afterAll, expect } from "vitest";
import {
	closeSandbox,
	gotoSandbox,
	pageAttribute,
	pageEvaluate,
	stageEvaluate
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
 * UI smoke coverage for the initial sandbox bootstrap flow.
 */
journeyTest(
	"ui-bootstrap",
	"boots the sandbox host and mounts the real module",
	async () => {
		await gotoSandbox();

		await expect
			.poll(() => pageText(".harness-product-name"))
			.toBe("MagicMirror Module Sandbox");
		await expect
			.poll(() => pageText(".harness-mounted-module code"))
			.not.toBe("");
		await expect
			.poll(() => pageAttribute("#domain-runtime", "data-active"))
			.toBe("true");
		await expect.poll(() => pageText("#lifecycle-started")).toBe("Yes");
		await expect.poll(() => pageText("#lifecycle-dom-ready")).toBe("Yes");
		await expect
			.poll(() =>
				pageEvaluate((selectorValue) => {
					return Boolean(
						globalThis.document.querySelector(selectorValue)
					);
				}, "#module-stage-frame")
			)
			.toBe(true);
		expect(
			await stageEvaluate(() => Boolean(globalThis.__moduleSandboxModule))
		).toBe(true);
	}
);
