/**
 * Browser-backed integration coverage for initial mounted-module boot flow.
 *
 * The stage runs the built-in MagicMirror core (2.36.0), so the module is
 * read back through what that core created: the instance `MM.getModules()`
 * returns, its wrapper (`main.js` `createDomObjects`) and the core's own
 * `config` global, which 2.35-2.36 declare with a top-level `let`
 * (`config/basepath.js`), reachable only as a free identifier.
 */
import { afterAll, expect } from "vitest";
import {
	closeSandbox,
	gotoSandbox,
	openSidebarTab,
	pageEvaluate,
	readModuleConfigEditorText,
	stageAttribute,
	stageClick,
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

const defaultModuleOptions = {
	position: getDefaultModuleOptions().position,
	animateIn: getDefaultModuleOptions().animateIn,
	animateOut: getDefaultModuleOptions().animateOut
};

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
 * Integration coverage for initial module mount/runtime contract behavior.
 */
journeyTest(
	"integration-module-mount",
	"mounts the generated test module with local scripts, styles, and translations",
	async () => {
		await gotoSandbox();
		await openSidebarTab("config", "module");

		const moduleRuntimeDetails = await stageEvaluate(() => {
			const instance = globalThis.__moduleSandboxModule;
			const wrapper = globalThis.document.getElementById(
				instance.identifier
			);
			const coreConfig = globalThis.eval("config");
			return {
				mmVersion: globalThis.mmVersion,
				wrapperId: wrapper ? wrapper.id : null,
				wrapperClassName: wrapper ? wrapper.className : "",
				superWrapperClassName:
					globalThis.document.querySelector("#test-module-root")
						?.parentElement?.className ?? "",
				superAdapterSnapshot: instance.superAdapterSnapshot,
				regionClassName: wrapper?.closest(".region")?.className ?? null,
				isCoreModule:
					globalThis.eval("MM").getModules()[0] === instance,
				language: coreConfig.language,
				locale: coreConfig.locale,
				hasSocketApi:
					typeof instance.socket === "function" &&
					typeof instance.socket().sendNotification === "function" &&
					typeof instance.socket().setNotificationCallback ===
						"function",
				// module.js setData/setConfig; configDeepMerge is a module-level
				// helper of module.js, not an instance method.
				hasConfigHelpers:
					typeof instance.setData === "function" &&
					typeof instance.setConfig === "function",
				nestedConfig: instance.config.nested,
				positions: globalThis.eval("MM").getAvailableModulePositions,
				translatorChecks: {
					headerTitle: instance.translate("HEADER_TITLE"),
					greeting: instance.translate("GREETING", {
						operator: instance.config.operatorName
					}),
					missingKey: instance.translate("MISSING_KEY"),
					missingWithDefault: instance.translate(
						"MISSING_WITH_DEFAULT",
						"Default fallback"
					),
					missingWithVariablesAndDefault: instance.translate(
						"MISSING_WITH_VARIABLES_AND_DEFAULT",
						{ operator: "Fixture User" },
						"Fallback for {operator}"
					)
				}
			};
		});
		const configWrapperText = await readModuleConfigEditorText();

		await expect
			.poll(() => pageText(".harness-mounted-module code"))
			.toBe("MMM-TestModule");
		await expect.poll(() => stageVisible("#test-module-root")).toBe(true);
		await expect
			.poll(() => stageVisible("#test-module-super-adapter"))
			.toBe(true);
		await expect
			.poll(() => stageText("#test-module-translation"))
			.toBe("Hola Sandbox Developer desde el modulo de prueba.");
		await expect
			.poll(() => stageText("#test-module-super-adapter"))
			.toBe("Super adapter active");
		await expect
			.poll(() => stageText("#test-module-dynamic-slot"))
			.toBe("Injected from getDom");
		await expect
			.poll(() => stageText("#test-module-script-status"))
			.toBe("Script: test-script-ready");
		// The saved header is "": the core hides an empty header
		// (main.js:253-258) instead of showing the module name.
		await expect.poll(() => stageText(".module-header")).toBe("");
		await expect.poll(() => stageVisible(".module-header")).toBe(false);
		await expect
			.poll(() => stageText("#test-module-lifecycle"))
			.toBe("Suspend: 0 / Resume: 0");
		await expect
			.poll(() => stageText("#test-module-config-merge"))
			.toBe('Nested: {"defaultFlag":true,"overrideFlag":"from config"}');
		await expect
			.poll(() => readStageProbeColor())
			.toBe("rgb(48, 170, 122)");
		await expect
			.poll(() =>
				stageAttribute(
					"#test-module-helper-ping",
					"data-bound-in-get-dom"
				)
			)
			.toBe("true");
		await stageClick("#test-module-helper-ping");
		await expect
			.poll(() => stageText("#test-module-helper-reply"))
			.toBe("Helper: fixture ping");

		expect(moduleRuntimeDetails.mmVersion).toBe("2.36.0");
		expect(moduleRuntimeDetails.language).toBe("es");
		expect(moduleRuntimeDetails.locale).toBe("es");
		// loader.js names instances module_<index>_<name>.
		expect(moduleRuntimeDetails.wrapperId).toBe("module_0_MMM-TestModule");
		expect(moduleRuntimeDetails.isCoreModule).toBe(true);
		expect(moduleRuntimeDetails.wrapperClassName).toContain("module");
		expect(moduleRuntimeDetails.wrapperClassName).toContain(
			"MMM-TestModule"
		);
		expect(moduleRuntimeDetails.superWrapperClassName).toContain(
			"test-module-super-wrapper"
		);
		expect(
			moduleRuntimeDetails.superAdapterSnapshot.immediateChildElementCount
		).toBeGreaterThan(0);
		expect(
			moduleRuntimeDetails.superAdapterSnapshot.immediateTextContent
		).toContain("Hola Sandbox Developer desde el modulo de prueba.");
		expect(moduleRuntimeDetails.superAdapterSnapshot.isThenable).toBe(
			false
		);
		expect(moduleRuntimeDetails.superAdapterSnapshot.hasImmediateRoot).toBe(
			true
		);
		expect(
			moduleRuntimeDetails.superAdapterSnapshot.hasImmediateDynamicSlot
		).toBe(true);
		expect(
			moduleRuntimeDetails.superAdapterSnapshot.hasImmediateHelperButton
		).toBe(true);
		// main.js selectWrapper: middle_center is the "middle center" region.
		expect(defaultModuleOptions.position).toBe("middle_center");
		expect(moduleRuntimeDetails.regionClassName).toBe(
			"region middle center"
		);
		expect(moduleRuntimeDetails.hasSocketApi).toBe(true);
		expect(moduleRuntimeDetails.hasConfigHelpers).toBe(true);
		expect(moduleRuntimeDetails.nestedConfig).toEqual({
			defaultFlag: true,
			overrideFlag: "from config"
		});
		expect(moduleRuntimeDetails.positions).toEqual(
			expect.arrayContaining([
				"top_left",
				"middle_center",
				"bottom_bar",
				"fullscreen_above",
				"fullscreen_below"
			])
		);
		expect(configWrapperText).toContain('language: "es"');
		expect(configWrapperText).toContain(
			`position: "${defaultModuleOptions.position}"`
		);
		expect(configWrapperText).toContain(
			`animateIn: "${defaultModuleOptions.animateIn}"`
		);
		expect(configWrapperText).toContain(
			`animateOut: "${defaultModuleOptions.animateOut}"`
		);
		expect(configWrapperText).not.toContain("locale:");
		expect(configWrapperText).not.toContain("header:");
		expect(configWrapperText).not.toContain("classes:");
		expect(configWrapperText).not.toContain("hiddenOnStartup:");
		expect(configWrapperText).not.toContain("disabled:");
		expect(moduleRuntimeDetails.translatorChecks).toEqual({
			headerTitle: "Test module fixture",
			greeting: "Hola Sandbox Developer desde el modulo de prueba.",
			missingKey: "MISSING_KEY",
			missingWithDefault: "MISSING_WITH_DEFAULT",
			missingWithVariablesAndDefault: "MISSING_WITH_VARIABLES_AND_DEFAULT"
		});
	}
);
