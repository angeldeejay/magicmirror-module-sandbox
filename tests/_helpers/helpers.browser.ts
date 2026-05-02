/**
 * Thin facade over custom sandbox browser commands for browser-backed suites.
 */
import { commands } from "vitest/browser";

/**
 * Thin, test-friendly facade over the custom Vitest browser commands used by
 * the sandbox browser-backed suites.
 *
 * Specs should prefer these helpers over calling `commands.*` directly so the
 * suite vocabulary stays stable even if the underlying command wiring changes.
 */

/**
 * Close the auxiliary sandbox page bound to the current Vitest browser session.
 *
 * @returns {Promise<void>}
 */
export async function closeSandbox() {
	await commands.sandboxClose();
}

/**
 * Reset fixture files and open the sandbox shell until the stage runtime is ready.
 *
 * @returns {Promise<void>}
 */
export async function gotoSandbox() {
	await commands.sandboxGoto();
}

/**
 * Reset fixture state and reload only the stage iframe without re-navigating the shell.
 * Faster than gotoSandbox — use for subsequent resets within the same test file.
 * Falls back to gotoSandbox automatically if the shell is not yet loaded.
 *
 * @returns {Promise<void>}
 */
export async function resetSandbox() {
	await commands.sandboxReset();
}

/**
 * Activate one of the top-level sidebar domains.
 *
 * @param {string} domain
 * @returns {Promise<void>}
 */
export async function openDomain(domain) {
	await commands.sandboxOpenDomain(domain);
}

/**
 * Activate one tab inside a sidebar domain.
 *
 * @param {string} domain
 * @param {string} tab
 * @returns {Promise<void>}
 */
export async function openSidebarTab(domain, tab) {
	await commands.sandboxOpenSidebarTab(domain, tab);
}

/**
 * Click an element in the sandbox shell document.
 *
 * @param {string} selector
 * @returns {Promise<void>}
 */
export async function pageClick(selector) {
	await commands.sandboxPageClick(selector);
}

/**
 * Fill an input-like element in the sandbox shell document.
 *
 * @param {string} selector
 * @param {string} value
 * @returns {Promise<void>}
 */
export async function pageFill(selector, value) {
	await commands.sandboxPageFill(selector, value);
}

/**
 * Select an option in a shell-side `<select>`.
 *
 * @param {string} selector
 * @param {string} value
 * @returns {Promise<void>}
 */
export async function pageSelect(selector, value) {
	await commands.sandboxPageSelect(selector, value);
}

/**
 * Check a shell-side checkbox or radio control.
 *
 * @param {string} selector
 * @returns {Promise<void>}
 */
export async function pageCheck(selector) {
	await commands.sandboxPageCheck(selector);
}

/**
 * Uncheck a shell-side checkbox.
 *
 * @param {string} selector
 * @returns {Promise<void>}
 */
export async function pageUncheck(selector) {
	await commands.sandboxPageUncheck(selector);
}

/**
 * Read one attribute from an element in the shell document.
 *
 * @param {string} selector
 * @param {string} attributeName
 * @returns {Promise<string|null>}
 */
export function pageAttribute(selector, attributeName) {
	return commands.sandboxPageAttribute(selector, attributeName);
}

/**
 * Count shell-document matches for a selector.
 *
 * @param {string} selector
 * @returns {Promise<number>}
 */
export function pageCount(selector) {
	return commands.sandboxPageCount(selector);
}

/**
 * Report whether a shell-side control is disabled.
 *
 * @param {string} selector
 * @returns {Promise<boolean>}
 */
export function pageDisabled(selector) {
	return commands.sandboxPageDisabled(selector);
}

/**
 * Evaluate serializable code against the sandbox shell document.
 *
 * The callback is stringified and executed inside the browser context so specs
 * can query state that would be awkward to expose through dedicated helpers.
 *
 * @template TArg, TResult
 * @param {(arg: TArg) => TResult|Promise<TResult>} callback
 * @param {TArg} [arg]
 * @returns {Promise<TResult>}
 */
export function pageEvaluate<TArg = undefined, TResult = unknown>(
	callback: (arg: TArg) => TResult | Promise<TResult>,
	arg?: TArg
): Promise<TResult> {
	return commands.sandboxPageEvaluate(callback.toString(), arg);
}

/**
 * Convenience reader for text content in the shell document.
 *
 * @param {string} selector
 * @returns {Promise<string>}
 */
export function pageText(selector) {
	return pageEvaluate((selectorValue) => {
		return (
			globalThis.document.querySelector(selectorValue)?.textContent ?? ""
		);
	}, selector);
}

/**
 * Read the current sandbox shell URL.
 *
 * @returns {Promise<string>}
 */
export function pageUrl() {
	return commands.sandboxPageUrl();
}

/**
 * Read the current value from a shell-side form control.
 *
 * @param {string} selector
 * @returns {Promise<string>}
 */
export function pageValue(selector) {
	return commands.sandboxPageValue(selector);
}

/**
 * Report whether a shell-side element is visible.
 *
 * @param {string} selector
 * @returns {Promise<boolean>}
 */
export function pageVisible(selector) {
	return commands.sandboxPageVisible(selector);
}

/**
 * Read the rendered preview text from the shadow-DOM module config editor.
 *
 * @returns {Promise<string>}
 */
export function readModuleConfigEditorText() {
	return commands.sandboxReadModuleConfigEditorText();
}

/**
 * Read a project-relative text file from disk.
 *
 * Browser-backed specs use this for fixture files that need round-trip edits.
 *
 * @param {string} relativePath
 * @returns {Promise<string>}
 */
export function readTextFile(relativePath) {
	return commands.sandboxReadTextFile(relativePath);
}

/**
 * Read a text file from the isolated mutable fixture workspace of the current
 * browser-backed suite.
 *
 * @param {string} fixtureRelativePath
 * @returns {Promise<string>}
 */
export function readFixtureTextFile(fixtureRelativePath) {
	return commands.sandboxReadFixtureTextFile(fixtureRelativePath);
}

/**
 * Apply one named CSS scenario to the isolated mounted-module fixture stylesheet.
 *
 * @param {string} scenarioName
 * @returns {Promise<void>}
 */
export async function applyFixtureStyleScenario(scenarioName) {
	await commands.sandboxApplyFixtureStyleScenario(scenarioName);
}

/**
 * Restore the default runtime language and default mounted-module config, then
 * wait for the stage to reload.
 *
 * @returns {Promise<void>}
 */
export async function restoreDefaultsAndWait() {
	await commands.sandboxRestoreDefaultsAndWait();
}

/**
 * Change the persisted sandbox runtime language through the config UI.
 *
 * @param {string} languageCode
 * @returns {Promise<void>}
 */
export async function selectSandboxLanguage(languageCode) {
	await commands.sandboxSelectLanguage(languageCode);
}

/**
 * Click an element inside the mounted-module iframe.
 *
 * @param {string} selector
 * @returns {Promise<void>}
 */
export async function stageClick(selector) {
	await commands.sandboxStageClick(selector);
}

/**
 * Read one attribute from an element inside the mounted-module iframe.
 *
 * @param {string} selector
 * @param {string} attributeName
 * @returns {Promise<string|null>}
 */
export function stageAttribute(selector, attributeName) {
	return commands.sandboxStageAttribute(selector, attributeName);
}

/**
 * Evaluate serializable code inside the mounted-module iframe.
 *
 * @template TArg, TResult
 * @param {(arg: TArg) => TResult|Promise<TResult>} callback
 * @param {TArg} [arg]
 * @returns {Promise<TResult>}
 */
export function stageEvaluate<TArg = undefined, TResult = unknown>(
	callback: (arg: TArg) => TResult | Promise<TResult>,
	arg?: TArg
): Promise<TResult> {
	return commands.sandboxStageEvaluate(callback.toString(), arg);
}

/**
 * Read text content from the mounted-module iframe.
 *
 * @param {string} selector
 * @returns {Promise<string>}
 */
export function stageText(selector) {
	return commands.sandboxStageText(selector);
}

/**
 * Report whether an iframe-side element is visible.
 *
 * @param {string} selector
 * @returns {Promise<boolean>}
 */
export function stageVisible(selector) {
	return commands.sandboxStageVisible(selector);
}

/**
 * Write a project-relative text file on disk.
 *
 * @param {string} relativePath
 * @param {string} content
 * @returns {Promise<void>}
 */
export async function writeTextFile(relativePath, content) {
	await commands.sandboxWriteTextFile(relativePath, content);
}

/**
 * Write a text file inside the isolated mutable fixture workspace of the
 * current browser-backed suite.
 *
 * @param {string} fixtureRelativePath
 * @param {string} content
 * @returns {Promise<void>}
 */
export async function writeFixtureTextFile(fixtureRelativePath, content) {
	await commands.sandboxWriteFixtureTextFile(fixtureRelativePath, content);
}

/**
 * Replace the mounted-module config editor value through its custom-element API.
 *
 * @param {object} nextConfig
 * @returns {Promise<void>}
 */
export async function writeModuleConfig(nextConfig) {
	await commands.sandboxWriteModuleConfig(nextConfig);
}

/**
 * Click a shell-side control that triggers a stage reload and wait for the new
 * iframe runtime to become ready.
 *
 * @param {string} selector
 * @returns {Promise<void>}
 */
export async function clickAndWaitForStageReady(selector) {
	await commands.sandboxClickAndWaitForStageReady(selector);
}

/**
 * Click a shell-side control that refreshes stylesheet assets without reloading
 * the full stage runtime.
 *
 * @param {string} selector
 * @returns {Promise<void>}
 */
export async function clickAndWaitForStylesRefreshed(selector) {
	await commands.sandboxClickAndWaitForStylesRefreshed(selector);
}
