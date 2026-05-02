/**
 * Playwright-side sandbox UI helpers shared by browser-backed suites.
 */
/**
 * Playwright-side sandbox UI helpers shared by browser-backed suites.
 */
import { expect } from "@playwright/test";
import { resetBrowserSuiteFixtureFiles } from "./test-module-fixture.ts";

/**
 * Open the sandbox host page.
 *
 * @param {import("@playwright/test").Page} page
 * @returns {Promise<void>}
 */
async function gotoSandbox(page) {
	resetBrowserSuiteFixtureFiles("ui");
	await page.goto("/");
	await expect(page.locator("#module-stage-frame")).toBeVisible();
	await expect(page.locator("#lifecycle-started")).toHaveText("Yes");
	await expect(page.locator("#lifecycle-dom-ready")).toHaveText("Yes");
}

/**
 * Open one topbar domain and assert that its panel became active.
 *
 * @param {import("@playwright/test").Page} page
 * @param {"runtime"|"config"|"notifications"|"debug"|"about"} domain
 * @returns {Promise<import("@playwright/test").Locator>}
 */
async function openDomain(page, domain) {
	const panel = page.locator(`#domain-${domain}`);
	if ((await panel.getAttribute("data-active")) !== "true") {
		await page.click(`#menu-${domain}`);
	}
	await expect(panel).toHaveAttribute("data-active", "true");
	return panel;
}

/**
 * Open one tab inside an already tabbed sidebar domain.
 *
 * @param {import("@playwright/test").Page} page
 * @param {"config"|"notifications"|"debug"|"runtime"} domain
 * @param {string} tab
 * @returns {Promise<import("@playwright/test").Locator>}
 */
async function openSidebarTab(page, domain, tab) {
	await openDomain(page, domain);
	const button = page.locator(
		`.sandbox-tab[data-domain="${domain}"][data-tab="${tab}"]`
	);
	const panel = page.locator(
		`.sandbox-tabpanel[data-domain="${domain}"][data-tab-panel="${tab}"]`
	);
	if ((await button.getAttribute("data-active")) !== "true") {
		await button.click();
	}
	await expect(button).toHaveAttribute("data-active", "true");
	await expect(panel).toHaveAttribute("data-active", "true");
	return panel;
}

/**
 * Resolve the iframe that hosts the mounted module runtime.
 *
 * @param {import("@playwright/test").Page} page
 * @returns {Promise<import("@playwright/test").Frame>}
 */
async function getStageFrame(page) {
	await expect
		.poll(async () => {
			const frame = page.frame({ name: "module-stage-frame" });
			if (!frame) {
				return false;
			}

			try {
				return await frame.evaluate(() =>
					Boolean(globalThis.__moduleSandboxModule)
				);
			} catch {
				return false;
			}
		})
		.toBe(true);

	return page.frame({ name: "module-stage-frame" });
}

/**
 * Arm a flag in the browser for the next stage-ready event.
 *
 * Must be awaited BEFORE the action that triggers the event so the listener
 * is registered before the CDP round-trip for the click returns.  Follow with
 * {@link waitForArmedStageReady} after the triggering action.
 *
 * @param {import("@playwright/test").Page} page
 * @returns {Promise<void>}
 */
async function armStageReady(page) {
	await page.evaluate(() => {
		(window as any).__SANDBOX_STAGE_READY_SEEN__ = false;
		globalThis.addEventListener(
			"module-sandbox:stage-ready",
			() => {
				(window as any).__SANDBOX_STAGE_READY_SEEN__ = true;
			},
			{ once: true }
		);
	});
}

/**
 * Wait until the previously armed stage-ready flag is set.
 *
 * @param {import("@playwright/test").Page} page
 * @returns {Promise<void>}
 */
async function waitForArmedStageReady(page) {
	await expect
		.poll(() =>
			page.evaluate(() =>
				Boolean((window as any).__SANDBOX_STAGE_READY_SEEN__)
			)
		)
		.toBe(true);
}

/**
 * Arm a flag in the browser for the next styles-refreshed event.
 *
 * Must be awaited BEFORE the action that triggers the event.  Follow with
 * {@link waitForArmedStylesRefreshed} after the triggering action.
 *
 * @param {import("@playwright/test").Page} page
 * @returns {Promise<void>}
 */
async function armStylesRefreshed(page) {
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
}

/**
 * Wait until the previously armed styles-refreshed flag is set.
 *
 * @param {import("@playwright/test").Page} page
 * @returns {Promise<void>}
 */
async function waitForArmedStylesRefreshed(page) {
	await expect
		.poll(() =>
			page.evaluate(() =>
				Boolean((window as any).__SANDBOX_STYLES_REFRESHED_SEEN__)
			)
		)
		.toBe(true);
}

export default {
	gotoSandbox,
	openDomain,
	openSidebarTab,
	getStageFrame,
	armStageReady,
	waitForArmedStageReady,
	armStylesRefreshed,
	waitForArmedStylesRefreshed
};
