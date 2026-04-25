/**
 * Browser-backed integration coverage for stylesheet refresh behavior.
 */
import { afterAll, expect } from "vitest";
import {
	applyFixtureStyleScenario,
	clickAndWaitForStylesRefreshed,
	closeSandbox,
	gotoSandbox,
	openSidebarTab,
	pageText,
	stageEvaluate
} from "../_helpers/helpers.browser.ts";
import { fixtureStyleScenarios } from "../_helpers/test-module-style-scenarios.ts";
import { createJourneyTest } from "../_helpers/journey-coverage.ts";

const journeyTest = createJourneyTest("integration");

afterAll(async () => {
	await closeSandbox();
});

/**
 * Reads stage probe color.
 */
const readStageProbeColor = () => {
	return stageEvaluate(() => {
		const element = globalThis.document.getElementById(
			"test-module-style-probe"
		);
		return element ? globalThis.getComputedStyle(element).color : "";
	});
};

/**
 * Integration coverage for mounted-module stylesheet refresh behavior.
 */
journeyTest(
	"integration-styles-refresh",
	"refresh styles reloads mounted module CSS without reloading the viewport",
	async () => {
		await gotoSandbox();
		const runtimeMarker = await stageEvaluate(() => {
			const instance = globalThis.__moduleSandboxModule;
			if (!instance.__styleRefreshMarker) {
				instance.__styleRefreshMarker = Math.random()
					.toString(36)
					.slice(2);
			}
			return instance.__styleRefreshMarker;
		});

		try {
			await expect
				.poll(() => readStageProbeColor())
				.toBe(fixtureStyleScenarios.default.probeColor);

			await applyFixtureStyleScenario("refreshed");
			await openSidebarTab("config", "module");
			await clickAndWaitForStylesRefreshed(
				"#module-config-refresh-styles"
			);

			await expect
				.poll(() => pageText("#module-config-status"))
				.toContain("styles refreshed");
			await expect
				.poll(() => readStageProbeColor())
				.toBe(fixtureStyleScenarios.refreshed.probeColor);
			expect(
				await stageEvaluate(
					() => globalThis.__moduleSandboxModule.__styleRefreshMarker
				)
			).toBe(runtimeMarker);
		} finally {
			await applyFixtureStyleScenario("default");
			await openSidebarTab("config", "module");
			await clickAndWaitForStylesRefreshed(
				"#module-config-refresh-styles"
			);
			await expect
				.poll(() => readStageProbeColor())
				.toBe(fixtureStyleScenarios.default.probeColor);
		}
	}
);
