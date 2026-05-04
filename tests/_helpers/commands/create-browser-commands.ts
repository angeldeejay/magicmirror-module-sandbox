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
// Cache: Page → live Frame handle.
// Eliminates waitForSelector + waitForFunction + contentFrame() loop on
// repeated mid-test calls to waitForStageFrame (stageClick, stageText, …).
// Invalidated before page.goto() and before any action that triggers a stage reload.
const stageFrameCache = new WeakMap<object, any>();
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
	 * Arm a one-shot flag in the browser for the next stage-ready event.
	 *
	 * Must be awaited BEFORE any action that triggers the event so the listener
	 * is registered before the CDP round-trip for the click returns.
	 *
	 * @param {any} page
	 * @returns {Promise<void>}
	 */
	async function armStageReadyFlag(page) {
		// Invalidate the frame cache — a stage reload is about to happen.
		stageFrameCache.delete(page);
		await page.evaluate((eventName) => {
			(window as any).__SANDBOX_STAGE_READY_SEEN__ = false;
			globalThis.addEventListener(
				eventName,
				() => {
					(window as any).__SANDBOX_STAGE_READY_SEEN__ = true;
				},
				{ once: true }
			);
		}, stageReadyEventName);
	}

	/**
	 * Wait until the previously armed stage-ready flag is set.
	 *
	 * @param {any} page
	 * @returns {Promise<void>}
	 */
	async function waitForArmedStageReady(page) {
		await page.waitForFunction(
			() => Boolean((window as any).__SANDBOX_STAGE_READY_SEEN__),
			undefined,
			{ timeout: 20_000 }
		);
	}

	/**
	 * Resolve the mounted-module iframe once the shell has attached it and the
	 * browser exposes a live Frame handle.
	 *
	 * @param {any} page
	 * @returns {Promise<any>}
	 */
	async function waitForStageFrame(page): Promise<any> {
		// Fast path: return the cached Frame handle when the stage is already
		// confirmed ready and the frame is still attached.
		// The cache is invalidated before page.goto() and before any action that
		// triggers a stage reload (armStageReadyFlag).
		const cached = stageFrameCache.get(page);
		if (cached) {
			try {
				if (!cached.isDetached()) {
					return cached;
				}
			} catch {
				// Frame API error — fall through to full acquisition.
			}
			stageFrameCache.delete(page);
		}

		// Wait for the stage frame element to be visible first.
		await page.waitForSelector(stageFrameSelector, { state: "visible" });

		// Wait for boot to complete by polling core.bootComplete on the SHELL page.
		//
		// Protocol:
		//   - iframe calls publishStageReady(bootComplete) after every boot settle.
		//   - shell-stage.js sets core.bootComplete from the postMessage payload.
		//   - bootComplete is true only when runtime.ts's boot() promise settles
		//     (resolved or rejected); false for the early snapshot fired by
		//     requestStageSnapshot (which can arrive before boot finishes).
		//   - shell-stage.js resets bootComplete to false on DOMContentLoaded and
		//     on every iframe "load" event, so a harness:reload cycle also resets it.
		//
		// Checking the shell page avoids stale frame-handle issues entirely.
		try {
			await page.waitForFunction(
				() => Boolean((window as any).__MICROCORE__?.bootComplete),
				undefined,
				{ timeout: 20_000 }
			);
		} catch {
			const diagState = await page
				.evaluate(() => {
					const core = (window as any).__MICROCORE__;
					return {
						coreExists: Boolean(core),
						stageReady: core ? core.stageReady : null,
						bootComplete: core ? core.bootComplete : null,
						lifecycleState: core
							? Object.assign({}, core.lifecycleState)
							: null
					};
				})
				.catch(() => ({ evalError: true }));
			throw new Error(
				`waitForStageFrame: boot timeout after 20 s. Shell state: ${JSON.stringify(diagState)}`
			);
		}

		// Acquire a live frame handle now that boot is confirmed complete.
		const frameElement = await page.waitForSelector(stageFrameSelector, {
			state: "visible"
		});
		const timeoutAt = Date.now() + 5_000;
		let frame = null;
		while (Date.now() < timeoutAt) {
			frame = await frameElement.contentFrame();
			if (frame) break;
			await sleep(50);
		}
		if (!frame) {
			throw new Error(
				"Timed out waiting for the mounted-module iframe frame."
			);
		}

		stageFrameCache.set(page, frame);
		return frame;
	}

	/**
	 * Reset fixture state and reload only the stage iframe, reusing the already-open
	 * shell page. Skips the full page.goto() navigation — ~3–5× faster than gotoSandbox.
	 *
	 * Protocol:
	 *   1. Reset fixture files (same as gotoSandbox).
	 *   2. Arm the stage-ready listener before triggering any reload.
	 *   3. POST /__harness/restart → server restarts helper AND emits
	 *      Socket.IO "harness:reload" → shell calls core.reloadStage() →
	 *      stage iframe reloads → module boots fresh.
	 *   4. Wait for stage-ready event and confirm bootComplete.
	 *
	 * Falls back to gotoSandbox when the shell is not yet loaded (e.g. first
	 * call in a test file).
	 *
	 * @param {SandboxCommandContext} context
	 * @returns {Promise<void>}
	 */
	async function resetSandbox(context) {
		const runtime = await runtimeController.getLiveRuntimeForContext(context);
		const page = await getSandboxPage(context);

		// Guard: fall back to full navigation if the shell is not loaded yet.
		const shellLoaded = await page
			.evaluate(() => Boolean((window as any).__MICROCORE__))
			.catch(() => false);
		if (!shellLoaded) {
			return gotoSandbox(context);
		}

		if (runtimeController.usesPerSessionRuntime) {
			writeFixtureStylesheet(runtime.fixtureStylePath);
		} else {
			resetBrowserSuiteFixtureFiles(runtime.suiteName);
		}
		resetPersistedStateForModuleRoot(runtime.fixtureRoot);

		// Arm the listener BEFORE POSTing — the Socket.IO reload can arrive
		// very quickly and we must not miss the stage-ready event.
		await armStageReadyFlag(page);

		// Restart helper and trigger stage iframe reload via Socket.IO.
		await fetch(`${runtime.baseUrl}/__harness/restart`, { method: "POST" });

		await waitForArmedStageReady(page);
		await waitForStageFrame(page);
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
		// Invalidate the frame cache — navigation replaces the entire document.
		stageFrameCache.delete(page);
		if (inspectionOptions.headed) {
			await page.bringToFront();
		}
		await page.goto(runtime.baseUrl, {
			waitUntil: "domcontentloaded"
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
		// Wait for the corresponding tab panel to become active instead of an
		// arbitrary sleep — this is resilient to animation timing differences.
		await page
			.locator(
				`.sandbox-tabpanel[data-domain="${domain}"][data-tab-panel="${tab}"][data-active="true"]`
			)
			.waitFor({ state: "visible" });
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
			return (element as any).getFullDisplayText?.() ?? "";
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
	 * Writes raw text into the mounted-module config editor, preserving comments.
	 */
	async function writeModuleConfigRaw(context, rawText) {
		const page = await getSandboxPage(context);
		await page.evaluate((text) => {
			const editor = globalThis.document.getElementById(
				"module-config-editor"
			) as (ModuleConfigEditor & { raw_string: string }) | null;
			if (!editor) {
				throw new Error("Module config editor was not found.");
			}
			editor.raw_string = text;
			editor.dispatchEvent(new Event("input", { bubbles: true }));
			editor.dispatchEvent(
				new CustomEvent("json-editor:state", { bubbles: true })
			);
		}, rawText);
	}

	/**
	 * Internal helper for click and wait for stage ready.
	 *
	 * Arms the listener BEFORE the click to prevent the event from firing
	 * during the CDP round-trip and being missed.
	 */
	async function clickAndWaitForStageReady(context, selector) {
		const page = await getSandboxPage(context);
		await armStageReadyFlag(page);
		await page.click(selector);
		await waitForArmedStageReady(page);
		await waitForStageFrame(page);
	}

	/**
	 * Internal helper for click and wait for styles refreshed.
	 *
	 * Arms the listener BEFORE the click to prevent the event from firing
	 * during the CDP round-trip and being missed.
	 */
	async function clickAndWaitForStylesRefreshed(context, selector) {
		const page = await getSandboxPage(context);
		await page.evaluate(() => {
			(window as any).__SANDBOX_STYLES_REFRESHED_SEEN__ = false;
			globalThis.addEventListener(
				"module-sandbox:styles-refreshed",
				() => {
					(window as any).__SANDBOX_STYLES_REFRESHED_SEEN__ = true;
				},
				{ once: true }
			);
		});
		await page.click(selector);
		await page.waitForFunction(
			() => Boolean((window as any).__SANDBOX_STYLES_REFRESHED_SEEN__),
			undefined,
			{ timeout: 15_000 }
		);
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
	 * Writes fixture text file, skipping the write when content is unchanged.
	 *
	 * Avoiding unnecessary writes prevents the sandbox watcher from emitting
	 * spurious harness:reload events that would restart the stage mid-test.
	 */
	async function writeFixtureTextFile(context, fixtureRelativePath, content) {
		const runtime = await runtimeController.getRuntimeForContext(context);
		const filePath = path.join(runtime.fixtureRoot, fixtureRelativePath);
		try {
			const existing = fs.readFileSync(filePath, "utf8");
			if (existing === content) {
				return;
			}
		} catch {
			// File does not exist yet — fall through to write.
		}
		fs.writeFileSync(filePath, content, "utf8");
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
		sandboxReset: resetSandbox,
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
		sandboxWriteModuleConfig: writeModuleConfig,
		sandboxWriteModuleConfigRaw: writeModuleConfigRaw
	};
}
