/**
 * Browser-backed integration coverage for module reload and helper continuity.
 */
import { afterAll, expect } from "vitest";
import {
	clickAndWaitForStageReady,
	closeSandbox,
	gotoSandbox,
	openDomain,
	openSidebarTab,
	pageClick,
	pageValue,
	readModuleConfigEditorText,
	restoreDefaultsAndWait,
	selectSandboxLanguage,
	stageClick,
	stageText,
	writeModuleConfig
} from "../_helpers/helpers.browser.ts";
import { createJourneyTest } from "../_helpers/journey-coverage.ts";

const journeyTest = createJourneyTest("integration");

afterAll(async () => {
	await closeSandbox();
});

/**
 * Browser-backed integration coverage for config-driven module reload behavior.
 */
journeyTest(
	"integration-module-reload",
	"reloads the generated test module from Config and preserves lifecycle hook behavior",
	async () => {
		await gotoSandbox();

		try {
			await openDomain("runtime");

			await pageClick("#lifecycle-activity-action");
			await expect
				.poll(() => stageText("#test-module-lifecycle"))
				.toBe("Suspend: 1 / Resume: 0");

			await pageClick("#lifecycle-activity-action");
			await expect
				.poll(() => stageText("#test-module-lifecycle"))
				.toBe("Suspend: 1 / Resume: 1");

			await openSidebarTab("config", "general");
			await selectSandboxLanguage("en");
			await openSidebarTab("config", "module");
			await expect
				.poll(() => readModuleConfigEditorText())
				.toContain('language: "en"');
			await expect
				.poll(() => readModuleConfigEditorText())
				.not.toContain("locale:");
			await writeModuleConfig({
				operatorName: "Reloaded Developer",
				pingMessage: "reload ping",
				badgeLabel: "Reloaded badge"
			});

			await clickAndWaitForStageReady("#module-config-save");

			await expect
				.poll(() => stageText("#test-module-translation"))
				.toBe("Hello Reloaded Developer from the test module fixture.");
			await expect.poll(() => pageValue("#config-language")).toBe("en");
			await expect
				.poll(() => stageText("#module-header"))
				.toBe("MMM-TestModule");
			await expect
				.poll(() => stageText("#test-module-style-probe"))
				.toBe("Reloaded badge");
			await expect
				.poll(() => stageText("#test-module-lifecycle"))
				.toBe("Suspend: 0 / Resume: 0");

			await openDomain("notifications");
			await pageClick(
				'.sandbox-tab[data-domain="notifications"][data-tab="websocket"]'
			);
			await stageClick("#test-module-helper-ping");
			await expect
				.poll(() => stageText("#test-module-helper-reply"))
				.toBe("Helper: reload ping");
		} finally {
			await restoreDefaultsAndWait();
		}
	}
);
