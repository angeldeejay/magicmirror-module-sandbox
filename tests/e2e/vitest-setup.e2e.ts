/**
 * Global setup for packaged-install smoke coverage.
 */
/**
 * Global setup for packaged-install smoke coverage.
 */
import {
	cleanupPackedSandboxTarball,
	preparePackedSandboxTarball
} from "./helpers.ts";

/**
 * Build and pack the sandbox once before the e2e smoke suite starts.
 *
 * The e2e specs run in isolated Vitest workers, so suite-wide tarball reuse has
 * to be coordinated from global setup rather than process-local module state.
 *
 * @returns {Promise<() => Promise<void>>}
 */
export async function setup() {
	preparePackedSandboxTarball();

	return async () => {
		cleanupPackedSandboxTarball();
	};
}
