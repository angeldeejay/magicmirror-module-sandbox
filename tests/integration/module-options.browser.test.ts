/**
 * Browser-backed integration coverage for persisted module option changes.
 */
import { afterAll, expect } from "vitest";
import {
	clickAndWaitForStageReady,
	closeSandbox,
	gotoSandbox,
	openSidebarTab,
	pageCheck,
	pageClick,
	pageDisabled,
	pageFill,
	pageSelect,
	pageText,
	pageUncheck,
	stageEvaluate,
	stageText,
	stageVisible
} from "../_helpers/helpers.browser.ts";
import { getDefaultModuleOptions } from "./helpers.ts";
import { createJourneyTest } from "../_helpers/journey-coverage.ts";

const journeyTest = createJourneyTest("integration");

afterAll(async () => {
	await closeSandbox();
});

const defaultModuleOptions = getDefaultModuleOptions();

/**
 * Drive the General config tab through the same controls a user would edit when
 * changing persisted module-envelope options.
 *
 * Keeping this local to the spec makes the tested control mapping explicit
 * without pushing single-test behavior into a cross-suite helper.
 *
 * @param {{
 * 	position: string,
 * 	header: string|boolean,
 * 	classes: string,
 * 	animateIn: string,
 * 	animateOut: string,
 * 	hiddenOnStartup: boolean,
 * 	disabled: boolean
 * }} options
 * @returns {Promise<void>}
 */
async function applyModuleOptions(options) {
	await pageSelect("#config-position", options.position);
	if (options.header === false) {
		await pageUncheck("#config-header-enabled");
	} else {
		await pageCheck("#config-header-enabled");
		await pageFill("#config-header", String(options.header));
	}
	await pageFill("#config-classes", options.classes);
	await pageSelect("#config-animate-in", options.animateIn);
	await pageSelect("#config-animate-out", options.animateOut);
	if (options.hiddenOnStartup) {
		await pageCheck("#config-hidden-on-startup");
	} else {
		await pageUncheck("#config-hidden-on-startup");
	}
	if (options.disabled) {
		await pageCheck("#config-disabled");
	} else {
		await pageUncheck("#config-disabled");
	}
}

/**
 * Integration coverage for saved module-option behavior.
 */
journeyTest(
	"integration-module-options",
	"applies supported module options and surfaces the disabled stage state",
	async () => {
		await gotoSandbox();

		try {
			await openSidebarTab("config", "general");
			await applyModuleOptions({
				position: "bottom_right",
				header: "Custom integration header",
				classes: "integration-shell highlight",
				animateIn: "fadeInRight",
				animateOut: "fadeOutLeft",
				hiddenOnStartup: true,
				disabled: false
			});
			await clickAndWaitForStageReady("#module-config-save");

			await expect
				.poll(() => pageText("#lifecycle-visibility-status"))
				.toBe("Hidden from the stage");
			const optionDetails = await stageEvaluate(async () => {
				const instance = globalThis.__moduleSandboxModule;
				const shell = globalThis.document.querySelector(
					'[data-module-shell="true"]'
				);
				instance.show(120);
				await new Promise((resolve) =>
					globalThis.requestAnimationFrame(resolve)
				);
				const animateIn = shell ? shell.dataset.animateIn || "" : "";
				const animateInClassName = shell ? shell.className : "";
				const animateInStyle = shell
					? globalThis.getComputedStyle(shell).animationName
					: "";
				await new Promise((resolve) =>
					globalThis.setTimeout(resolve, 140)
				);
				instance.hide(120);
				await new Promise((resolve) =>
					globalThis.requestAnimationFrame(resolve)
				);
				const animateOut = shell ? shell.dataset.animateOut || "" : "";
				const animateOutClassName = shell ? shell.className : "";
				const animateOutStyle = shell
					? globalThis.getComputedStyle(shell).animationName
					: "";
				return {
					position: instance.data.position,
					header: instance.data.header,
					classes: instance.data.classes,
					animateIn: instance.data.animateIn,
					animateOut: instance.data.animateOut,
					hiddenOnStartup: instance.data.hiddenOnStartup,
					wrapperClassName: shell ? shell.className : "",
					wrapperPosition: shell ? shell.dataset.position : "",
					animateMarkers: {
						animateIn,
						animateOut
					},
					animateClasses: {
						animateInClassName,
						animateOutClassName
					},
					animateStyles: {
						animateInStyle,
						animateOutStyle
					}
				};
			});

			expect(optionDetails.position).toBe("bottom_right");
			expect(optionDetails.header).toBe("Custom integration header");
			expect(optionDetails.classes).toBe("integration-shell highlight");
			expect(optionDetails.animateIn).toBe("fadeInRight");
			expect(optionDetails.animateOut).toBe("fadeOutLeft");
			expect(optionDetails.hiddenOnStartup).toBe(true);
			expect(optionDetails.wrapperClassName).toContain(
				"integration-shell"
			);
			expect(optionDetails.wrapperClassName).toContain("highlight");
			expect(optionDetails.wrapperPosition).toBe("bottom_right");
			expect(optionDetails.animateMarkers).toEqual({
				animateIn: "fadeInRight",
				animateOut: "fadeOutLeft"
			});
			expect(optionDetails.animateClasses.animateInClassName).toContain(
				"animate__animated"
			);
			expect(optionDetails.animateClasses.animateInClassName).toContain(
				"animate__fadeInRight"
			);
			expect(optionDetails.animateClasses.animateOutClassName).toContain(
				"animate__animated"
			);
			expect(optionDetails.animateClasses.animateOutClassName).toContain(
				"animate__fadeOutLeft"
			);
			expect(optionDetails.animateStyles.animateInStyle).not.toBe("none");
			expect(optionDetails.animateStyles.animateOutStyle).not.toBe(
				"none"
			);
			await expect
				.poll(() => stageText("#module-header"))
				.toBe("Custom integration header");

			await openSidebarTab("config", "general");
			await applyModuleOptions({
				...defaultModuleOptions,
				header: false,
				disabled: false
			});
			await clickAndWaitForStageReady("#module-config-save");

			await expect.poll(() => pageDisabled("#config-header")).toBe(true);
			await expect.poll(() => stageVisible("#module-header")).toBe(false);

			await openSidebarTab("config", "general");
			await applyModuleOptions({
				...defaultModuleOptions,
				disabled: true
			});
			await pageClick("#module-config-save");

			await expect
				.poll(() => stageText('[data-module-disabled="true"]'))
				.toContain("Module disabled");
			await expect
				.poll(() => pageText("#lifecycle-visibility-status"))
				.toBe("Disabled in saved config");
			await expect
				.poll(() => pageText("#lifecycle-activity-status"))
				.toBe("Startup skipped");
			await expect.poll(() => pageText("#lifecycle-started")).toBe("No");
			await expect
				.poll(() => pageText("#lifecycle-dom-ready"))
				.toBe("No");
		} finally {
			await gotoSandbox();
		}
	}
);
