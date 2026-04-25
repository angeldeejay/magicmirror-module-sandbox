/**
 * Integration-suite Vitest browser setup entrypoint.
 */
/**
 * Integration-suite Vitest browser setup entrypoint.
 */
import { setupBrowserSuite } from "./vitest-setup.browser.ts";

/**
 * Dedicated Vitest browser bootstrap entrypoint for the integration suite.
 *
 * @returns {Promise<void|(() => Promise<void>)>}
 */
export async function setup() {
	return setupBrowserSuite("integration");
}
