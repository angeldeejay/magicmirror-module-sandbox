/**
 * Browser-backed integration coverage for stable updateDom behavior.
 */
import { afterAll, expect } from "vitest";
import {
	closeSandbox,
	gotoSandbox,
	stageEvaluate
} from "../_helpers/helpers.browser.ts";
import { createJourneyTest } from "../_helpers/journey-coverage.ts";

const journeyTest = createJourneyTest("integration");

afterAll(async () => {
	await closeSandbox();
});

/**
 * Integration coverage for updateDom() stability when DOM output does not change.
 */
journeyTest(
	"integration-update-dom-stability",
	"keeps the same DOM node when updateDom() produces no content changes",
	async () => {
		await gotoSandbox();

		const updateResult = await stageEvaluate(async () => {
			const instance = globalThis.__moduleSandboxModule;
			const wrapper =
				globalThis.document.querySelector("#test-module-root");
			const beforeUpdateCount =
				instance.coreNotificationCounts.moduleDomUpdated;

			// module.js updateDom returns nothing; main.js sends
			// MODULE_DOM_UPDATED once the update is applied (main.js:694-697).
			instance.updateDom({
				options: {
					speed: 40,
					animate: {
						in: "fadeIn",
						out: "fadeOut"
					}
				}
			});
			const timeoutAt = Date.now() + 10_000;
			while (
				instance.coreNotificationCounts.moduleDomUpdated ===
				beforeUpdateCount
			) {
				if (Date.now() > timeoutAt) {
					throw new Error("MODULE_DOM_UPDATED did not arrive within 10 s");
				}
				await new Promise((resolve) => globalThis.setTimeout(resolve, 10));
			}

			return {
				sameNode:
					wrapper ===
					globalThis.document.querySelector("#test-module-root"),
				coreNotificationCounts: instance.coreNotificationCounts,
				beforeUpdateCount
			};
		});

		expect(updateResult.sameNode).toBe(true);
		expect(updateResult.coreNotificationCounts.allModulesStarted).toBe(1);
		expect(updateResult.coreNotificationCounts.moduleDomCreated).toBe(1);
		expect(updateResult.coreNotificationCounts.domObjectsCreated).toBe(1);
		expect(updateResult.coreNotificationCounts.moduleDomUpdated).toBe(
			updateResult.beforeUpdateCount + 1
		);
	}
);
