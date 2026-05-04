/**
 * Browser-backed UI coverage for the Config sidebar domain.
 */
import { afterAll, expect } from "vitest";
import {
	closeSandbox,
	gotoSandbox,
	openDomain,
	openSidebarTab,
	pageCount,
	pageClick,
	pageEvaluate,
	pageFill,
	pageUncheck,
	pageValue,
	pageVisible,
	readModuleConfigEditorText,
	writeModuleConfig,
	writeModuleConfigRaw
} from "../_helpers/helpers.browser.ts";
import { createJourneyTest } from "../_helpers/journey-coverage.ts";

const journeyTest = createJourneyTest("ui");

afterAll(async () => {
	await closeSandbox();
});

/**
 * UI smoke coverage for the Config sidebar domain.
 */
journeyTest(
	"ui-config-sidebar",
	"config domain exposes a valid mounted-module editor",
	async () => {
		await gotoSandbox();
		await openDomain("config");
		await openSidebarTab("config", "general");

		const runtimeLanguage = await pageValue("#config-language");

		await expect.poll(() => pageVisible("#config-language")).toBe(true);
		await expect
			.poll(() => pageValue("#config-language"))
			.toBe(runtimeLanguage);
		await expect.poll(() => pageVisible("#config-position")).toBe(true);
		await expect.poll(() => pageVisible("#config-header")).toBe(true);
		await expect
			.poll(() => pageVisible("#config-header-enabled"))
			.toBe(true);
		await expect.poll(() => pageVisible("#config-classes")).toBe(true);
		await expect.poll(() => pageVisible("#config-animate-in")).toBe(true);
		await expect.poll(() => pageVisible("#config-animate-out")).toBe(true);
		await expect
			.poll(() => pageVisible("#config-hidden-on-startup"))
			.toBe(true);
		await expect.poll(() => pageVisible("#config-disabled")).toBe(true);

		await openSidebarTab("config", "module");

		await expect
			.poll(() =>
				pageEvaluate(() => {
					return (
						globalThis.document.getElementById(
							"module-config-validity"
						)?.textContent ?? ""
					);
				})
			)
			.toBe("Valid");
		await expect
			.poll(() =>
				pageEvaluate(
					() =>
						globalThis.document.querySelectorAll(
							"module-config-editor"
						).length
				)
			)
			.toBe(1);
		await expect
			.poll(() =>
				pageEvaluate(() => {
					return (
						globalThis.document.getElementById("module-config-copy")
							?.textContent ?? ""
					);
				})
			)
			.toContain("Config valid");
		await expect
			.poll(() => pageCount("#module-config-refresh-styles"))
			.toBe(1);
		await expect.poll(() => pageCount("#module-config-format")).toBe(1);
		await expect.poll(() => pageCount("#module-config-reset")).toBe(1);
		await expect.poll(() => pageCount("#module-config-save")).toBe(1);
		await expect
			.poll(() => pageVisible("#module-config-format"))
			.toBe(true);
		await expect
			.poll(() =>
				pageEvaluate(() => {
					const rows = Array.from(
						globalThis.document.querySelectorAll(
							"#domain-config .sandbox-button-row"
						)
					);
					return rows.map((row) =>
						Array.from(row.querySelectorAll("button")).map(
							(button) => button.id
						)
					);
				})
			)
			.toEqual([
				["module-config-format"],
				["module-config-reset", "module-config-refresh-styles"],
				["module-config-save"]
			]);
		await expect
			.poll(() =>
				pageEvaluate(() => {
					return (
						globalThis.document.getElementById(
							"module-config-dirty-state"
						)?.textContent ?? ""
					);
				})
			)
			.toBe("Saved");
		await expect
			.poll(() => readModuleConfigEditorText())
			.toContain(`language: "${runtimeLanguage}"`);
		await expect
			.poll(() => readModuleConfigEditorText())
			.toContain('position: "middle_center"');
		await expect
			.poll(() => readModuleConfigEditorText())
			.toContain('animateIn: "pulse"');
		await expect
			.poll(() => readModuleConfigEditorText())
			.toContain('animateOut: "bounceOutRight"');
		await expect
			.poll(() => readModuleConfigEditorText())
			.not.toContain("locale:");
		await expect
			.poll(() => readModuleConfigEditorText())
			.not.toContain("header:");
		await expect
			.poll(() => readModuleConfigEditorText())
			.not.toContain("classes:");
		await expect
			.poll(() => readModuleConfigEditorText())
			.not.toContain("hiddenOnStartup:");
		await expect
			.poll(() => readModuleConfigEditorText())
			.not.toContain("disabled:");

		await openSidebarTab("config", "general");
		await expect
			.poll(() => pageVisible("#module-config-format"))
			.toBe(false);
		await pageFill("#config-classes", "ui-config-draft");
		await expect
			.poll(() =>
				pageEvaluate(() => {
					return (
						globalThis.document.getElementById(
							"module-config-dirty-state"
						)?.textContent ?? ""
					);
				})
			)
			.toBe("Edited");
		await pageClick("#module-config-reset");
		await expect.poll(() => pageValue("#config-classes")).toBe("");
		await expect
			.poll(() =>
				pageEvaluate(() => {
					return (
						globalThis.document.getElementById(
							"module-config-dirty-state"
						)?.textContent ?? ""
					);
				})
			)
			.toBe("Saved");
	}
);

/**
 * Validation states: header-false boolean rendering, invalid config, module-tab revert.
 */
journeyTest(
	"ui-config-editor-validation",
	"config editor renders header:false as boolean, rejects invalid config, and reverts module tab",
	async () => {
		await gotoSandbox();
		await openDomain("config");

		// header: false renders as boolean in the preview wrapper.
		await openSidebarTab("config", "general");
		await pageUncheck("#config-header-enabled");
		await openSidebarTab("config", "module");
		await expect
			.poll(() => readModuleConfigEditorText())
			.toMatch(/header:\s*false(?!["\s]*")/);
		await expect
			.poll(() => readModuleConfigEditorText())
			.not.toContain('header: "false"');

		// Invalid config disables save and shows Invalid state.
		await writeModuleConfigRaw("{broken json {{");
		await expect
			.poll(() =>
				pageEvaluate(() => {
					return (
						globalThis.document.getElementById("module-config-validity")
							?.textContent ?? ""
					);
				})
			)
			.toBe("Invalid");
		await expect
			.poll(() =>
				pageEvaluate(() => {
					const btn = globalThis.document.getElementById(
						"module-config-save"
					) as HTMLButtonElement | null;
					return btn ? btn.disabled : false;
				})
			)
			.toBe(true);

		// Module tab revert restores JSON content and clears dirty state.
		await writeModuleConfig({ revertTest: true });
		await expect
			.poll(() =>
				pageEvaluate(() => {
					return (
						globalThis.document.getElementById(
							"module-config-dirty-state"
						)?.textContent ?? ""
					);
				})
			)
			.toBe("Edited");
		await pageClick("#module-config-reset");
		await expect
			.poll(() =>
				pageEvaluate(() => {
					return (
						globalThis.document.getElementById(
							"module-config-dirty-state"
						)?.textContent ?? ""
					);
				})
			)
			.toBe("Saved");
		await expect
			.poll(() =>
				pageEvaluate(() => {
					const editor = globalThis.document.getElementById(
						"module-config-editor"
					) as (HTMLElement & { raw_string: string }) | null;
					return editor ? editor.raw_string : "NOT_FOUND";
				})
			)
			.not.toContain("revertTest");
	}
);

/**
 * JS comment support: comments keep validity but are stripped on explicit format.
 */
journeyTest(
	"ui-config-comment-support",
	"config editor accepts JS comments and strips them on format",
	async () => {
		await gotoSandbox();
		await openDomain("config");
		await openSidebarTab("config", "module");

		// Comment input stays valid and is visible in editor text.
		await writeModuleConfigRaw("// my api key\napiKey: \"abc\"");
		await expect
			.poll(() =>
				pageEvaluate(() => {
					return (
						globalThis.document.getElementById("module-config-validity")
							?.textContent ?? ""
					);
				})
			)
			.toBe("Valid");
		await expect
			.poll(() => readModuleConfigEditorText())
			.toContain("// my api key");

		// Format button reformats with js-beautify — comments are stripped (JSON-backed storage).
		await pageClick("#module-config-format");
		await expect
			.poll(() => readModuleConfigEditorText())
			.not.toContain("// my api key");
		await expect
			.poll(() =>
				pageEvaluate(() => {
					return (
						globalThis.document.getElementById("module-config-validity")
							?.textContent ?? ""
					);
				})
			)
			.toBe("Valid");
	}
);
