/**
 * Browser-backed integration coverage for language autosave and reload flow.
 */
import { afterAll, expect } from "vitest";
import {
	closeSandbox,
	gotoSandbox,
	openSidebarTab,
	pageEvaluate,
	pageValue,
	readModuleConfigEditorText,
	restoreDefaultsAndWait,
	selectSandboxLanguage,
	stageText
} from "../_helpers/helpers.browser.ts";
import { getDefaultRuntimeConfig } from "./helpers.ts";
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
 * Integration coverage for runtime language autosave and reload.
 */
journeyTest(
	"integration-language-autosave",
	"changing the sandbox language selector autosaves and reloads the viewport",
	async () => {
		await gotoSandbox();

		try {
			await expect
				.poll(() => stageText("#test-module-translation"))
				.toBe("Hola Sandbox Developer desde el modulo de prueba.");
			await openSidebarTab("config", "general");

			await selectSandboxLanguage("en");

			await expect
				.poll(() => pageText("#module-config-status"))
				.toContain("Viewport reloaded");
			await expect.poll(() => pageValue("#config-language")).toBe("en");
			await expect
				.poll(() => stageText("#test-module-translation"))
				.toBe("Hello Sandbox Developer from the test module fixture.");
			await expect
				.poll(() => readModuleConfigEditorText())
				.toContain('language: "en"');
		} finally {
			if (getDefaultRuntimeConfig().language !== "en") {
				await restoreDefaultsAndWait();
			}
		}
	}
);
