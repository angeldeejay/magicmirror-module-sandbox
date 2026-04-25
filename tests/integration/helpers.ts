/**
 * Shared data helpers for browser-backed sandbox integration coverage.
 */
import {
	cloneJson,
	defaultPersistedModuleConfig,
	defaultPersistedRuntimeConfig
} from "../_helpers/test-module-persistence-defaults.ts";

export const fixtureModuleConfig = cloneJson(defaultPersistedModuleConfig);
export const fixtureRuntimeConfig = cloneJson(defaultPersistedRuntimeConfig);

/**
 * Suite-local helpers for browser-backed sandbox integration tests.
 */

/**
 * Read the default module-envelope options exposed by the integration fixture.
 *
 * @returns {{
 * 	position: string,
 * 	header: string|boolean,
 * 	classes: string,
 * 	animateIn: string,
 * 	animateOut: string,
 * 	hiddenOnStartup: boolean,
 * 	disabled: boolean
 * }}
 */
export function getDefaultModuleOptions() {
	return {
		position: fixtureModuleConfig.position || "middle_center",
		header: Object.prototype.hasOwnProperty.call(
			fixtureModuleConfig,
			"header"
		)
			? fixtureModuleConfig.header
			: "",
		classes: fixtureModuleConfig.classes || "",
		animateIn: fixtureModuleConfig.animateIn || "",
		animateOut: fixtureModuleConfig.animateOut || "",
		hiddenOnStartup: Boolean(fixtureModuleConfig.hiddenOnStartup),
		disabled: Boolean(fixtureModuleConfig.disabled)
	};
}

/**
 * Clone the default nested `config` block for the mounted module fixture.
 *
 * @returns {object}
 */
export function cloneDefaultTestModuleConfig() {
	return cloneJson(fixtureModuleConfig.config || {});
}

/**
 * Clone the default runtime language and locale payload used by the fixture.
 *
 * @returns {{ language: string, locale: string }}
 */
export function getDefaultRuntimeConfig() {
	return cloneJson(fixtureRuntimeConfig);
}

/**
 * Rebuild the full persisted module envelope used by save/reload tests.
 *
 * @returns {object}
 */
export function getDefaultSavedModuleConfig() {
	return {
		...getDefaultModuleOptions(),
		configDeepMerge: Boolean(fixtureModuleConfig.configDeepMerge),
		config: cloneDefaultTestModuleConfig()
	};
}

/**
 * Replace the module config editor contents through its custom element API.
 *
 * @param {object} page
 * @param {object} nextConfig
 * @returns {Promise<void>}
 */
export async function writeModuleConfig(page, nextConfig) {
	await page.evaluate((configValue) => {
		const editor = globalThis.document.getElementById(
			"module-config-editor"
		) as (HTMLElement & { json_value: unknown }) | null;
		if (!editor) {
			throw new Error("Module config editor was not found.");
		}
		editor.json_value = configValue;
		editor.dispatchEvent(new Event("input", { bubbles: true }));
		editor.dispatchEvent(
			new CustomEvent("json-editor:state", { bubbles: true })
		);
	}, nextConfig);
}

/**
 * Read the rendered config wrapper preview text.
 *
 * @param {object} page
 * @returns {Promise<string>}
 */
export async function readModuleConfigEditorText(page) {
	return page.locator("module-config-editor").evaluate((element) => {
		const root = element.shadowRoot;
		return root ? root.textContent : "";
	});
}

/**
 * Change the runtime language selector in the Config sidebar.
 *
 * @param {object} page
 * @param {string} languageCode
 * @returns {Promise<void>}
 */
export async function selectSandboxLanguage(page, languageCode) {
	await page.selectOption("#config-language", languageCode);
}

/**
 * Apply the supported module option controls exposed by the general config tab.
 *
 * @param {object} page
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
export async function applyModuleOptions(page, options) {
	await page.selectOption("#config-position", options.position);
	if (options.header === false) {
		await page.uncheck("#config-header-enabled");
	} else {
		await page.check("#config-header-enabled");
		await page.fill("#config-header", String(options.header));
	}
	await page.fill("#config-classes", options.classes);
	await page.selectOption("#config-animate-in", options.animateIn);
	await page.selectOption("#config-animate-out", options.animateOut);
	if (options.hiddenOnStartup) {
		await page.check("#config-hidden-on-startup");
	} else {
		await page.uncheck("#config-hidden-on-startup");
	}
	if (options.disabled) {
		await page.check("#config-disabled");
	} else {
		await page.uncheck("#config-disabled");
	}
}

/**
 * Save both module and runtime config through the public harness API.
 *
 * @param {object} page
 * @param {object} nextModuleConfig
 * @param {string} languageCode
 * @returns {Promise<void>}
 */
export async function saveSandboxConfigViaApi(
	page,
	nextModuleConfig,
	languageCode
) {
	await page.evaluate(
		async ({ moduleConfig, language }) => {
			const response = await fetch("/__harness/config/save", {
				method: "POST",
				headers: {
					"Content-Type": "application/json"
				},
				body: JSON.stringify({
					moduleConfig,
					runtimeConfig: {
						language
					}
				})
			});
			const result = await response.json();
			if (!response.ok) {
				throw new Error(
					result && result.error
						? result.error
						: "Failed to save config."
				);
			}
		},
		{
			moduleConfig: nextModuleConfig,
			language: languageCode
		}
	);
}
