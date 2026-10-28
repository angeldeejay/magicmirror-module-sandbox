/**
 * Browser-backed integration coverage for MagicMirror header semantics.
 *
 * The stage runs the built-in MagicMirror core, so the header is the one
 * `main.js` renders: `updateModuleContent` writes `getHeader()` with
 * `innerHTML` and shows the header only for a truthy value
 * (main.js:253-258). The version-pinned files under
 * `tests/integration/core-fidelity/pinned/` carry the same contract per core.
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
 * Integration coverage for MagicMirror header semantics.
 */
journeyTest(
	"integration-header-semantics",
	"matches MagicMirror header semantics for false, empty, whitespace, and undefined",
	async () => {
		await gotoSandbox();

		const headerStates = await stageEvaluate(async () => {
			const instance = globalThis.__moduleSandboxModule;
			const headerNode = globalThis.document.querySelector(
				`#${instance.identifier} .module-header`
			);
			const originalHadHeader = Object.prototype.hasOwnProperty.call(
				instance.data,
				"header"
			);
			const originalHeader = instance.data.header;

			/**
			 * Applies one header value and waits for the core to report the
			 * update (MODULE_DOM_UPDATED, main.js:694-697).
			 */
			const render = async (apply: () => void) => {
				const before = instance.coreNotificationCounts.moduleDomUpdated;
				apply();
				instance.updateDom();
				const timeoutAt = Date.now() + 10_000;
				while (instance.coreNotificationCounts.moduleDomUpdated === before) {
					if (Date.now() > timeoutAt) {
						throw new Error("MODULE_DOM_UPDATED did not arrive within 10 s");
					}
					await new Promise((resolve) => globalThis.setTimeout(resolve, 10));
				}
				return {
					text: headerNode ? headerNode.textContent : null,
					display: headerNode
						? globalThis.getComputedStyle(headerNode).display
						: null
				};
			};

			const emptyString = await render(() => {
				instance.data.header = "";
			});
			const falseValue = await render(() => {
				instance.data.header = false;
			});
			const whitespace = await render(() => {
				instance.data.header = "    ";
			});
			const undefinedValue = await render(() => {
				delete instance.data.header;
			});

			await render(() => {
				if (originalHadHeader) {
					instance.data.header = originalHeader;
				} else {
					delete instance.data.header;
				}
			});

			return {
				emptyString,
				falseValue,
				whitespace,
				undefinedValue
			};
		});

		// A falsy header hides it; innerHTML stringifies false and undefined.
		expect(headerStates.emptyString).toEqual({
			text: "",
			display: "none"
		});
		expect(headerStates.falseValue).toEqual({
			text: "false",
			display: "none"
		});
		expect(headerStates.whitespace).toEqual({
			text: "    ",
			display: "block"
		});
		expect(headerStates.undefinedValue).toEqual({
			text: "undefined",
			display: "none"
		});
	}
);
