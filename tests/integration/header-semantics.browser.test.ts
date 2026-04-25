/**
 * Browser-backed integration coverage for MagicMirror header semantics.
 */
/**
 * Browser-backed integration coverage for MagicMirror header semantics.
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
			const headerNode =
				globalThis.document.getElementById("module-header");
			const originalHadHeader = Object.prototype.hasOwnProperty.call(
				instance.data,
				"header"
			);
			const originalHeader = instance.data.header;

			/**
			 * Internal helper for snapshot.
			 */
			const snapshot = () => ({
				text: headerNode ? headerNode.textContent : null,
				display: headerNode
					? globalThis.getComputedStyle(headerNode).display
					: null
			});

			instance.data.header = "";
			await instance.updateDom();
			const emptyString = snapshot();

			instance.data.header = false;
			await instance.updateDom();
			const falseValue = snapshot();

			instance.data.header = "    ";
			await instance.updateDom();
			const whitespace = snapshot();

			delete instance.data.header;
			await instance.updateDom();
			const undefinedValue = snapshot();

			if (originalHadHeader) {
				instance.data.header = originalHeader;
			} else {
				delete instance.data.header;
			}
			await instance.updateDom();

			return {
				emptyString,
				falseValue,
				whitespace,
				undefinedValue
			};
		});

		expect(headerStates.emptyString).toEqual({
			text: "MMM-TestModule",
			display: "block"
		});
		expect(headerStates.falseValue).toEqual({
			text: "",
			display: "none"
		});
		expect(headerStates.whitespace).toEqual({
			text: "    ",
			display: "block"
		});
		expect(headerStates.undefinedValue).toEqual({
			text: "MMM-TestModule",
			display: "block"
		});
	}
);
