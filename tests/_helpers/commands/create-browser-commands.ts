/**
 * Custom Vitest browser command wiring for sandbox-backed browser suites.
 */
import fs from "node:fs";
import path from "node:path";
import { setTimeout } from "node:timers";
import { fileURLToPath } from "node:url";
import {
	cloneDefaultTestModuleConfig,
	getDefaultRuntimeConfig
} from "../../integration/helpers.ts";
import {
	browserInspectionCursorInitScript,
	getBrowserInspectionOptions
} from "../browser-inspection.ts";
import { writeFixtureStylesheet } from "../test-module-style-fixture.ts";
import { resetBrowserSuiteFixtureFiles } from "../test-module-fixture.ts";
import { resetPersistedStateForModuleRoot } from "../test-module-persistence.ts";
import { createSandboxRuntimeController } from "./runtime-controller.ts";

const projectRoot = path.join(
	path.dirname(fileURLToPath(import.meta.url)),
	"..",
	"..",
	".."
);
const stageReadyEventName = "module-sandbox:stage-ready";
const stageFrameSelector = "#module-stage-frame";
const sandboxPages = new Map();
type ModuleConfigEditor = HTMLElement & { json_value: unknown };

/**
 * Close every cached auxiliary page owned by one browser suite.
 *
 * @param {"integration"|"ui"} suiteName
 * @returns {Promise<void>}
 */
export async function cleanupAllSandboxPagesForSuite(suiteName) {
	const contextPrefix = `${suiteName}:`;
	const pages = Array.from(sandboxPages.entries()).filter(([contextKey]) => {
		return contextKey.startsWith(contextPrefix);
	});

	for (const [contextKey, page] of pages) {
		sandboxPages.delete(contextKey);
		if (!page.isClosed()) {
			await page.close();
		}
	}
}

/**
 * Minimal Vitest browser command context passed to custom command handlers.
 *
 * @typedef {{
 * 	context: { newPage: () => Promise<any> },
 * 	sessionId: string
 * }} SandboxCommandContext
 */

/**
 * Build the browser command registry consumed by Vitest browser mode.
 *
 * Integration and UI suites share the same high-level command vocabulary, but
 * each suite needs its own runtime contract so browser-backed specs can stay
 * isolated while reusing one shared command language.
 *
 * @param {"integration"|"ui"} suiteName
 * @returns {Record<string, (...args: any[]) => any>}
 */
export function createSandboxBrowserCommands(suiteName) {
	const runtimeController = createSandboxRuntimeController(suiteName);
	const inspectionOptions = getBrowserInspectionOptions();

	/**
	 * Pause briefly after shell interactions that trigger async sandbox work.
	 *
	 * @param {number} delay
	 * @returns {Promise<void>}
	 */
	async function sleep(delay) {
		await new Promise((resolve) => setTimeout(resolve, delay));
	}

	/**
	 * Return the cached auxiliary page for the current Vitest browser session.
	 *
	 * @param {SandboxCommandContext} context
	 * @returns {Promise<any>}
	 */
	async function getSandboxPage(context) {
		const contextKey = runtimeController.resolveContextKey(
			context.sessionId
		);
		const existingPage = sandboxPages.get(contextKey);
		if (existingPage && !existingPage.isClosed()) {
			return existingPage;
		}

		const page = await context.context.newPage();
		if (inspectionOptions.showCursor) {
			await page.addInitScript({
				content: browserInspectionCursorInitScript
			});
		}
		sandboxPages.set(contextKey, page);
		return page;
	}

	/**
	 * Wait for the next shell-side stage-ready event emitted after a reload.
	 *
	 * @param {any} page
	 * @returns {Promise<void>}
	 */
	async function waitForNextStageReady(page) {
		await page.evaluate((eventName) => {
			return new Promise<void>((resolve) => {
				globalThis.addEventListener(eventName, () => resolve(), {
					once: true
				});
			});
		}, stageReadyEventName);
	}

	/**
	 * Resolve the mounted-module iframe once the shell has attached it and the
	 * browser exposes a live Frame handle.
	 *
	 * @param {any} page
	 * @returns {Promise<any>}
	 */
	async function waitForStageFrame(page) {
		const frameElement = await page.waitForSelector(stageFrameSelector, {
			state: "visible"
		});

		const timeoutAt = Date.now() + 5_000;
		while (Date.now() < timeoutAt) {
			const frame = await frameElement.contentFrame();
			if (frame) {
				return frame;
			}
			await sleep(50);
		}

		throw new Error(
			"Timed out waiting for the mounted-module iframe frame."
		);
	}

	/**
	 * Reset mutable fixture state and open the sandbox shell for one session.
	 *
	 * @param {SandboxCommandContext} context
	 * @returns {Promise<void>}
	 */
	async function gotoSandbox(context) {
		const runtime =
			await runtimeController.getLiveRuntimeForContext(context);
		if (runtimeController.usesPerSessionRuntime) {
			writeFixtureStylesheet(runtime.fixtureStylePath);
		} else {
			resetBrowserSuiteFixtureFiles(runtime.suiteName);
		}
		resetPersistedStateForModuleRoot(runtime.fixtureRoot);
		const page = await getSandboxPage(context);
		if (inspectionOptions.headed) {
			await page.bringToFront();
		}
		await page.goto(runtime.baseUrl, {
			waitUntil: "networkidle"
		});
		await waitForStageFrame(page);
	}

	/**
	 * Open one top-level sidebar domain in the sandbox shell.
	 *
	 * @param {SandboxCommandContext} context
	 * @param {string} domain
	 * @returns {Promise<void>}
	 */
	async function openDomain(context, domain) {
		const page = await getSandboxPage(context);
		const alreadyOpen = await page.evaluate((domainValue) => {
			const body = globalThis.document.getElementById("harness-body");
			const menu = globalThis.document.getElementById(
				`menu-${domainValue}`
			);
			const panel = globalThis.document.getElementById(
				`domain-${domainValue}`
			);
			return (
				body?.dataset.sidebarOpen === "true" &&
				menu?.getAttribute("data-active") === "true" &&
				panel?.getAttribute("data-active") === "true"
			);
		}, domain);
		if (!alreadyOpen) {
			await page.locator(`#menu-${domain}`).click();
		}
		await page.locator(`#domain-${domain}[data-active="true"]`).waitFor({
			state: "visible"
		});
		await sleep(50);
	}

	/**
	 * Open one tab inside a sidebar domain.
	 *
	 * @param {SandboxCommandContext} context
	 * @param {string} domain
	 * @param {string} tab
	 * @returns {Promise<void>}
	 */
	async function openSidebarTab(context, domain, tab) {
		await openDomain(context, domain);
		const page = await getSandboxPage(context);
		const tabLocator = page.locator(
			`.sandbox-tab[data-domain="${domain}"][data-tab="${tab}"]`
		);
		await tabLocator.waitFor({
			state: "visible"
		});
		await tabLocator.click();
		await sleep(50);
	}

	/**
	 * Internal helper for page click.
	 */
	async function pageClick(context, selector) {
		const page = await getSandboxPage(context);
		await page.locator(selector).click();
	}

	/**
	 * Internal helper for page fill.
	 */
	async function pageFill(context, selector, value) {
		const page = await getSandboxPage(context);
		await page.locator(selector).fill(value);
	}

	/**
	 * Internal helper for page select.
	 */
	async function pageSelect(context, selector, value) {
		const page = await getSandboxPage(context);
		await page.locator(selector).selectOption(value);
	}

	/**
	 * Internal helper for page check.
	 */
	async function pageCheck(context, selector) {
		const page = await getSandboxPage(context);
		await page.locator(selector).check();
	}

	/**
	 * Internal helper for page uncheck.
	 */
	async function pageUncheck(context, selector) {
		const page = await getSandboxPage(context);
		await page.locator(selector).uncheck();
	}

	/**
	 * Internal helper for page attribute.
	 */
	async function pageAttribute(context, selector, attributeName) {
		const page = await getSandboxPage(context);
		return page.locator(selector).getAttribute(attributeName);
	}

	/**
	 * Internal helper for page count.
	 */
	async function pageCount(context, selector) {
		const page = await getSandboxPage(context);
		return page.locator(selector).count();
	}

	/**
	 * Internal helper for page value.
	 */
	async function pageValue(context, selector) {
		const page = await getSandboxPage(context);
		return page.locator(selector).inputValue();
	}

	/**
	 * Internal helper for page visible.
	 */
	async function pageVisible(context, selector) {
		const page = await getSandboxPage(context);
		return page
			.locator(selector)
			.isVisible()
			.catch(() => false);
	}

	/**
	 * Internal helper for page disabled.
	 */
	async function pageDisabled(context, selector) {
		const page = await getSandboxPage(context);
		return page.locator(selector).isDisabled();
	}

	/**
	 * Internal helper for page url.
	 */
	async function pageUrl(context) {
		const page = await getSandboxPage(context);
		return page.url();
	}

	/**
	 * Serialize and evaluate code in the shell document.
	 *
	 * @param {SandboxCommandContext} context
	 * @param {string} source
	 * @param {unknown} arg
	 * @returns {Promise<unknown>}
	 */
	async function pageEvaluate(context, source, arg) {
		const page = await getSandboxPage(context);
		return page.evaluate(
			async ({ expression, value }) => {
				const fn = globalThis.eval(`(${expression})`);
				return fn(value);
			},
			{
				expression: source,
				value: arg
			}
		);
	}

	/**
	 * Internal helper for stage click.
	 */
	async function stageClick(context, selector) {
		const page = await getSandboxPage(context);
		const frame = await waitForStageFrame(page);
		await frame.locator(selector).click();
	}

	/**
	 * Internal helper for stage text.
	 */
	async function stageText(context, selector) {
		const page = await getSandboxPage(context);
		const frame = await waitForStageFrame(page);
		return (await frame.locator(selector).textContent()) || "";
	}

	/**
	 * Internal helper for stage visible.
	 */
	async function stageVisible(context, selector) {
		const page = await getSandboxPage(context);
		const frame = await waitForStageFrame(page);
		return frame
			.locator(selector)
			.isVisible()
			.catch(() => false);
	}

	/**
	 * Internal helper for stage attribute.
	 */
	async function stageAttribute(context, selector, attributeName) {
		const page = await getSandboxPage(context);
		const frame = await waitForStageFrame(page);
		return frame.locator(selector).getAttribute(attributeName);
	}

	/**
	 * Serialize and evaluate code in the mounted-module iframe.
	 *
	 * @param {SandboxCommandContext} context
	 * @param {string} source
	 * @param {unknown} arg
	 * @returns {Promise<unknown>}
	 */
	async function stageEvaluate(context, source, arg) {
		const page = await getSandboxPage(context);
		const frame = await waitForStageFrame(page);
		return frame.evaluate(
			async ({ expression, value }) => {
				const fn = globalThis.eval(`(${expression})`);
				return fn(value);
			},
			{
				expression: source,
				value: arg
			}
		);
	}

	/**
	 * Reads module config editor text.
	 */
	async function readModuleConfigEditorText(context) {
		const page = await getSandboxPage(context);
		return page.locator("module-config-editor").evaluate((element) => {
			const root = element.shadowRoot;
			return root ? root.textContent : "";
		});
	}

	/**
	 * Internal helper for select sandbox language.
	 */
	async function selectSandboxLanguage(context, languageCode) {
		const page = await getSandboxPage(context);
		await page.selectOption("#config-language", languageCode);
	}

	/**
	 * Writes module config.
	 */
	async function writeModuleConfig(context, nextConfig) {
		const page = await getSandboxPage(context);
		await page.evaluate((configValue) => {
			const editor = globalThis.document.getElementById(
				"module-config-editor"
			) as ModuleConfigEditor | null;
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
	 * Internal helper for click and wait for stage ready.
	 */
	async function clickAndWaitForStageReady(context, selector) {
		const page = await getSandboxPage(context);
		await Promise.all([waitForNextStageReady(page), page.click(selector)]);
		await waitForStageFrame(page);
	}

	/**
	 * Internal helper for click and wait for styles refreshed.
	 */
	async function clickAndWaitForStylesRefreshed(context, selector) {
		const page = await getSandboxPage(context);
		await Promise.all([
			page.evaluate(() => {
				return new Promise<void>((resolve) => {
					globalThis.addEventListener(
						"module-sandbox:styles-refreshed",
						() => resolve(),
						{
							once: true
						}
					);
				});
			}),
			page.click(selector)
		]);
	}

	/**
	 * Reads text file.
	 */
	function readTextFile(_context, relativePath) {
		return fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
	}

	/**
	 * Writes text file.
	 */
	function writeTextFile(_context, relativePath, content) {
		fs.writeFileSync(path.join(projectRoot, relativePath), content, "utf8");
	}

	/**
	 * Reads fixture text file.
	 */
	async function readFixtureTextFile(context, fixtureRelativePath) {
		const runtime = await runtimeController.getRuntimeForContext(context);
		return fs.readFileSync(
			path.join(runtime.fixtureRoot, fixtureRelativePath),
			"utf8"
		);
	}

	/**
	 * Writes fixture text file.
	 */
	async function writeFixtureTextFile(context, fixtureRelativePath, content) {
		const runtime = await runtimeController.getRuntimeForContext(context);
		fs.writeFileSync(
			path.join(runtime.fixtureRoot, fixtureRelativePath),
			content,
			"utf8"
		);
	}

	/**
	 * Internal helper for apply fixture style scenario.
	 */
	async function applyFixtureStyleScenario(context, scenarioName) {
		const runtime = await runtimeController.getRuntimeForContext(context);
		writeFixtureStylesheet(
			path.join(runtime.fixtureRoot, "MMM-TestModule.css"),
			scenarioName
		);
	}

	/**
	 * Internal helper for restore defaults and wait.
	 */
	async function restoreDefaultsAndWait(context) {
		const defaultRuntimeConfig = getDefaultRuntimeConfig();
		const defaultTestModuleConfig = cloneDefaultTestModuleConfig();

		await openSidebarTab(context, "config", "general");
		await selectSandboxLanguage(context, defaultRuntimeConfig.language);
		await openSidebarTab(context, "config", "module");
		await writeModuleConfig(context, defaultTestModuleConfig);
		await clickAndWaitForStageReady(context, "#module-config-save");
	}

	/**
	 * Closes sandbox.
	 */
	async function closeSandbox(context) {
		const contextKey = runtimeController.resolveContextKey(
			context.sessionId
		);
		const page = sandboxPages.get(contextKey);
		if (!page || page.isClosed()) {
			sandboxPages.delete(contextKey);
			await runtimeController.cleanupRuntimeForSession(context.sessionId);
			return;
		}

		sandboxPages.delete(contextKey);
		await page.close();
		await runtimeController.cleanupRuntimeForSession(context.sessionId);
	}

	return {
		sandboxClickAndWaitForStageReady: clickAndWaitForStageReady,
		sandboxClickAndWaitForStylesRefreshed: clickAndWaitForStylesRefreshed,
		sandboxClose: closeSandbox,
		sandboxPageAttribute: pageAttribute,
		sandboxPageCheck: pageCheck,
		sandboxPageCount: pageCount,
		sandboxGoto: gotoSandbox,
		sandboxPageDisabled: pageDisabled,
		sandboxPageEvaluate: pageEvaluate,
		sandboxPageFill: pageFill,
		sandboxOpenDomain: openDomain,
		sandboxOpenSidebarTab: openSidebarTab,
		sandboxPageClick: pageClick,
		sandboxPageSelect: pageSelect,
		sandboxPageValue: pageValue,
		sandboxPageUrl: pageUrl,
		sandboxPageUncheck: pageUncheck,
		sandboxPageVisible: pageVisible,
		sandboxReadFixtureTextFile: readFixtureTextFile,
		sandboxReadTextFile: readTextFile,
		sandboxReadModuleConfigEditorText: readModuleConfigEditorText,
		sandboxApplyFixtureStyleScenario: applyFixtureStyleScenario,
		sandboxRestoreDefaultsAndWait: restoreDefaultsAndWait,
		sandboxSelectLanguage: selectSandboxLanguage,
		sandboxStageAttribute: stageAttribute,
		sandboxStageClick: stageClick,
		sandboxStageEvaluate: stageEvaluate,
		sandboxStageText: stageText,
		sandboxStageVisible: stageVisible,
		sandboxWriteFixtureTextFile: writeFixtureTextFile,
		sandboxWriteTextFile: writeTextFile,
		sandboxWriteModuleConfig: writeModuleConfig
	};
}
