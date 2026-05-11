/**
 * @file take-screenshots.ts
 * @description Automated docs screenshot capture for magicmirror-module-sandbox.
 *
 * ## What it does
 *
 * Starts its own sandbox instance on a random free port (so it never
 * conflicts with a sandbox you already have running), navigates every
 * sidebar domain and sub-tab, and saves PNG files to `docs/screenshots/`.
 * All four themes are also captured. The process is killed when done.
 *
 * ## How to run
 *
 *   npm run docs:screenshots
 *
 * No running sandbox required — the script manages its own lifecycle.
 *
 * ## Output files
 *
 *   docs/screenshots/
 *     runtime-lifecycle.png         Runtime domain, Lifecycle tab
 *     config-general.png            Config domain, General tab
 *     config-module.png             Config domain, Module (config editor) tab
 *     notifications-emit.png        Notifications domain, Emit tab
 *     notifications-log.png         Notifications domain, Log tab
 *     notifications-websocket.png   Notifications domain, WebSocket tab
 *     debug-helper-log.png          Debug domain, Helper Log tab
 *     debug-console-log.png         Debug domain, Console Log tab
 *     quality.png                   Quality domain
 *     mmversion.png                 MM Version domain
 *     about.png                     About domain
 *     themes/
 *       theme-switcher.png          Theme picker dropdown open (all options visible)
 *       carbon-slate.png
 *       obsidian-amber.png
 *       violet-circuit.png
 *       phosphor-green.png
 *
 * ## How the sidebar works (important for maintenance)
 *
 * The sandbox page has a collapsible sidebar controlled by JavaScript.
 * On initial load the sidebar opens automatically to the "runtime" domain.
 * The body-level div `#harness-body` gets `data-sidebar-open="true"` once
 * scripts have initialised. Each domain panel is a `<section class="sandbox-domain"
 * data-domain="...">` element that gets `data-active="true"` when selected.
 * Domain panels are `display:none` by default; `display:flex` when active.
 * Tab panels inside domains follow the same `data-tab-panel` / `data-active` pattern.
 *
 * To navigate to a domain the script clicks the hidden-but-in-DOM nav link
 * `#menu-<domain>` via `page.evaluate`, which fires the same click handlers as
 * the visible dropdown in the topbar.
 *
 * ## If screenshots look wrong
 *
 * - Increase `waitForTimeout` values if content hasn't loaded yet.
 * - Increase `waitForSandbox` `maxMs` if startup is slow on your machine.
 * - For new domains/tabs: add an entry to `navigateDomain` callers and check
 *   that the selector pattern `.sandbox-domain[data-domain="X"]` matches the
 *   server template in `server/templates/partials/sidebar-<domain>.eta`.
 * - For new themes: add to the `themes` array; the value must match
 *   `data-theme-value` in the Topbar component and `[data-theme]` in SCSS.
 *
 * ## Viewport
 *
 * All screenshots are taken at 1366×1024 px (defined by `VIEWPORT`).
 * Theme screenshots re-use the Runtime domain view as a representative frame.
 */
import { chromium, type Page } from "playwright";
import * as path from "pathe";
import { fileURLToPath } from "node:url";
import * as net from "node:net";
import * as http from "node:http";
import { spawn, type ChildProcess } from "node:child_process";

const currentFilePath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(currentFilePath), "..");
const screenshotsDir = path.join(repoRoot, "docs", "screenshots");
const themesDir = path.join(screenshotsDir, "themes");

/**
 * Path to the internal fixture module used for maintainer preview.
 * Must point to a directory that can be resolved by `resolveActiveMountedModuleInfo`
 * (i.e. a valid MM module with a detectable entry file and package.json).
 */
const FIXTURE_ROOT = path.join(
	repoRoot,
	"tests",
	"_fixtures",
	"MMM-TestModule"
);

/** Chromium viewport for all screenshots. */
const VIEWPORT = { width: 1366, height: 1024 };

/**
 * Returns a TCP port that is free on 127.0.0.1 at the moment of the call.
 * Uses the OS port-0 trick: bind to port 0, read the assigned port, close.
 * There is a tiny TOCTOU window between close and the sandbox bind, but it
 * is negligible in practice on a developer machine.
 */
function getFreePort(): Promise<number> {
	return new Promise((resolve, reject) => {
		const server = net.createServer();
		server.listen(0, "127.0.0.1", () => {
			const addr = server.address() as net.AddressInfo;
			server.close(() => resolve(addr.port));
		});
		server.on("error", reject);
	});
}

/**
 * Polls `http://127.0.0.1:<port>/` every 300 ms until it returns a non-5xx
 * response or `maxMs` milliseconds elapse, whichever comes first.
 * Rejects with a descriptive error on timeout.
 *
 * @param port - Port the sandbox is expected to listen on.
 * @param maxMs - Maximum wait time in milliseconds (default 30 000).
 */
function waitForSandbox(port: number, maxMs = 30_000): Promise<void> {
	return new Promise((resolve, reject) => {
		const deadline = Date.now() + maxMs;
		function attempt() {
			if (Date.now() > deadline) {
				reject(
					new Error(
						`Sandbox did not start on port ${port} within ${maxMs}ms`
					)
				);
				return;
			}
			const req = http.get(`http://127.0.0.1:${port}/`, (res) => {
				res.resume();
				if (res.statusCode && res.statusCode < 500) resolve();
				else setTimeout(attempt, 300);
			});
			req.on("error", () => setTimeout(attempt, 300));
			req.end();
		}
		attempt();
	});
}

/**
 * Spawns the sandbox server against the internal fixture module.
 *
 * Equivalent to `npm run server:preview` but on an explicit port and with
 * stdio suppressed so output does not pollute the screenshot log.
 *
 * Uses `process.execPath` (the current Node binary) + the tsx CLI path so
 * tsx does not need to be on PATH — only in `node_modules/.bin/`.
 *
 * @param port - Port to bind the sandbox to (set via MM_SANDBOX_PORT env).
 * @returns The spawned ChildProcess — caller must call `.kill()` when done.
 */
function startSandbox(port: number): ChildProcess {
	const tsxCli = path.join(
		repoRoot,
		"node_modules",
		"tsx",
		"dist",
		"cli.mjs"
	);
	const entrypoint = path.join(
		repoRoot,
		"bin",
		"magicmirror-module-sandbox.ts"
	);
	return spawn(process.execPath, [tsxCli, entrypoint, "--preview"], {
		cwd: repoRoot,
		env: {
			...process.env,
			MM_SANDBOX_PORT: String(port),
			MM_SANDBOX_MOUNTED_MODULE_ROOT: FIXTURE_ROOT
		},
		stdio: "ignore"
	});
}

/**
 * Waits until the sidebar is open (i.e. a domain panel is active).
 * `#harness-body[data-sidebar-open="true"]` is set by `initializeDebugPanel`
 * inside `shell-stage.ts` once Socket.IO connects and the notification engine
 * is ready. On initial load this resolves automatically because the sandbox
 * opens the "runtime" domain by default.
 */
async function waitForSidebarOpen(page: Page): Promise<void> {
	await page.waitForSelector('#harness-body[data-sidebar-open="true"]', {
		timeout: 15000
	});
}

/**
 * Navigates the sidebar to a top-level domain by clicking its nav link.
 *
 * The nav links `#menu-<domain>` are always present in the DOM (inside the
 * topbar dropdown) but may be visually hidden when the dropdown is closed.
 * Clicking via `page.evaluate` bypasses Playwright's visibility check and
 * fires the same handler that closes the dropdown and activates the domain.
 *
 * After the click the function waits for:
 *   1. `#harness-body[data-sidebar-open="true"]` — sidebar is open
 *   2. `.sandbox-domain[data-domain="<domain>"][data-active="true"]` — the
 *      domain panel is visible (it transitions from `display:none` to
 *      `display:flex` when `data-active="true"` is set)
 *
 * @param page - Playwright Page.
 * @param domain - Domain id: "runtime" | "config" | "notifications" | "debug" | "quality" | "mmversion" | "about"
 */
async function navigateDomain(page: Page, domain: string): Promise<void> {
	await page.evaluate((d: string) => {
		const link = document.querySelector<HTMLElement>(`#menu-${d}`);
		if (link) link.click();
	}, domain);
	await waitForSidebarOpen(page);
	await page.waitForSelector(
		`.sandbox-domain[data-domain="${domain}"][data-active="true"]`,
		{ timeout: 8000 }
	);
}

/**
 * Activates a tab panel inside the currently open domain.
 *
 * Tab buttons: `[data-domain][data-tab]` (class `sandbox-tab`)
 * Tab panels:  `[data-domain][data-tab-panel]` (class `sandbox-tabpanel`)
 *
 * Waits for the target tab panel to become visible (`data-active="true"`,
 * which switches it from `display:none` to `display:block` or `display:flex`).
 *
 * @param page - Playwright Page.
 * @param domain - Parent domain id (e.g. "config").
 * @param tab - Tab id (e.g. "general", "module", "emit", "log", "websocket",
 *              "helper-log", "console-log", "lifecycle").
 */
async function clickTab(
	page: Page,
	domain: string,
	tab: string
): Promise<void> {
	await page.click(`[data-domain="${domain}"][data-tab="${tab}"]`);
	await page.waitForSelector(
		`.sandbox-tabpanel[data-domain="${domain}"][data-tab-panel="${tab}"][data-active="true"]`,
		{ timeout: 5000 }
	);
}

/**
 * Changes the active shell theme.
 *
 * Opens the theme picker dropdown (button `#harness-theme-btn`), clicks the
 * item matching `data-theme-value="<theme>"`, then waits for
 * `document.documentElement.dataset.theme` to equal the chosen value.
 *
 * Available theme values (must match `_themes.scss` and Topbar component):
 *   - "carbon-slate"
 *   - "obsidian-amber"
 *   - "violet-circuit"
 *   - "phosphor-green"
 *
 * @param page - Playwright Page.
 * @param theme - Theme value string.
 */
async function setTheme(page: Page, theme: string): Promise<void> {
	await page.click("#harness-theme-btn");
	await page.waitForSelector("[data-theme-value]", { timeout: 3000 });
	await page.click(`[data-theme-value="${theme}"]`);
	await page.waitForFunction(
		(t: string) => document.documentElement.dataset.theme === t,
		theme,
		{ timeout: 3000 }
	);
}

/**
 * Takes a viewport screenshot and saves it to `filepath`.
 * Logs the relative path to stdout so progress is visible.
 *
 * @param page - Playwright Page.
 * @param filepath - Absolute destination path (PNG).
 */
async function shot(page: Page, filepath: string): Promise<void> {
	await page.screenshot({ path: filepath, fullPage: false });
	console.log(`  ✓ ${path.relative(repoRoot, filepath)}`);
}

async function main(): Promise<void> {
	const port = await getFreePort();
	console.log(`Starting sandbox on port ${port}…`);
	const child = startSandbox(port);

	let browser;
	try {
		await waitForSandbox(port);
		console.log("Sandbox ready. Loading page…");

		const base = `http://127.0.0.1:${port}`;
		browser = await chromium.launch({ headless: true });
		const context = await browser.newContext({ viewport: VIEWPORT });
		const page = await context.newPage();

		await page.goto(base, { waitUntil: "domcontentloaded" });
		await waitForSidebarOpen(page);
		// Allow Socket.IO + stage iframe to settle before first screenshot.
		await page.waitForTimeout(2500);

		console.log("Runtime…");
		await navigateDomain(page, "runtime");
		await page.waitForTimeout(400);
		await shot(page, path.join(screenshotsDir, "runtime-lifecycle.png"));

		console.log("Config › General…");
		await navigateDomain(page, "config");
		await clickTab(page, "config", "general");
		await page.waitForTimeout(400);
		await shot(page, path.join(screenshotsDir, "config-general.png"));

		console.log("Config › Module…");
		await clickTab(page, "config", "module");
		// Extra wait: Ace editor initialises asynchronously inside the tab panel.
		await page.waitForTimeout(800);
		await shot(page, path.join(screenshotsDir, "config-module.png"));

		console.log("Notifications › Emit…");
		await navigateDomain(page, "notifications");
		await clickTab(page, "notifications", "emit");
		await page.waitForTimeout(400);
		await shot(page, path.join(screenshotsDir, "notifications-emit.png"));

		console.log("Notifications › Log…");
		await clickTab(page, "notifications", "log");
		await page.waitForTimeout(400);
		await shot(page, path.join(screenshotsDir, "notifications-log.png"));

		console.log("Notifications › WebSocket…");
		await clickTab(page, "notifications", "websocket");
		await page.waitForTimeout(400);
		await shot(
			page,
			path.join(screenshotsDir, "notifications-websocket.png")
		);

		console.log("Debug › Helper Log…");
		await navigateDomain(page, "debug");
		await clickTab(page, "debug", "helper-log");
		await page.waitForTimeout(400);
		await shot(page, path.join(screenshotsDir, "debug-helper-log.png"));

		console.log("Debug › Console Log…");
		await clickTab(page, "debug", "console-log");
		await page.waitForTimeout(400);
		await shot(page, path.join(screenshotsDir, "debug-console-log.png"));

		console.log("Quality…");
		await navigateDomain(page, "quality");
		// Extra wait: quality panel may trigger an analysis fetch on first open.
		await page.waitForTimeout(800);
		await shot(page, path.join(screenshotsDir, "quality.png"));

		console.log("MM Version…");
		await navigateDomain(page, "mmversion");
		// Extra wait: the domain fetches version state and GitHub releases on open.
		await page.waitForTimeout(1200);
		await shot(page, path.join(screenshotsDir, "mmversion.png"));

		console.log("About…");
		await navigateDomain(page, "about");
		await page.waitForTimeout(400);
		await shot(page, path.join(screenshotsDir, "about.png"));

		// Theme screenshots reuse the Runtime domain as a representative frame.
		const themes = [
			"carbon-slate",
			"obsidian-amber",
			"violet-circuit",
			"phosphor-green"
		] as const;

		for (const theme of themes) {
			console.log(`Theme › ${theme}…`);
			await setTheme(page, theme);
			await navigateDomain(page, "runtime");
			await page.waitForTimeout(400);
			await shot(page, path.join(themesDir, `${theme}.png`));
		}

		// Restore default theme first so localStorage is clean.
		await setTheme(page, "carbon-slate");

		// Capture the open theme-picker dropdown last — the browser closes right
		// after, so there is no need to close the dropdown cleanly.
		// Uses a bounding-box crop (button ∪ open menu + uniform padding) instead
		// of a full-viewport screenshot so the result is a compact partial image.
		console.log("Theme Switcher (open dropdown)…");
		await page.click("#harness-theme-btn");
		await page.waitForSelector("[data-theme-value]", { timeout: 3000 });
		await page.waitForTimeout(200);
		{
			const cropW = 206;
			const cropH = 204;
			const tsPath = path.join(themesDir, "theme-switcher.png");
			await page.screenshot({
				path: tsPath,
				clip: {
					x: VIEWPORT.width - cropW,
					y: 0,
					width: cropW,
					height: cropH
				}
			});
			console.log(`  ✓ ${path.relative(repoRoot, tsPath)}`);
		}
		await browser.close();
		console.log("\nAll screenshots done.");
	} finally {
		// Always kill the sandbox, even if an earlier step threw.
		child.kill();
	}
}

main().catch((err: unknown) => {
	console.error(err);
	process.exit(1);
});
