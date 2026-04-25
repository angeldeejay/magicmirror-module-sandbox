/**
 * UI-suite Vitest browser setup entrypoint.
 */
/**
 * UI-suite Vitest browser setup entrypoint.
 */
import { setupBrowserSuite } from "./vitest-setup.browser.ts";

/**
 * Dedicated Vitest browser bootstrap entrypoint for the UI suite.
 *
 * @returns {Promise<void|(() => Promise<void>)>}
 */
export async function setup() {
	return setupBrowserSuite("ui");
}
