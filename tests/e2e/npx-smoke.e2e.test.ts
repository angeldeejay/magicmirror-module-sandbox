/**
 * End-to-end smoke coverage for consumer npx installs.
 */
/**
 * End-to-end smoke coverage for consumer npx installs.
 */
import { test } from "vitest";
import { runSmokeCommand, withPackedSandbox } from "./helpers.ts";
const smokePort = 3414;

/**
 * Packaged-install smoke coverage for the one-off `npm exec --package` workflow.
 */
test("packaged sandbox boots through npm exec --package", async () => {
	await withPackedSandbox(
		"magicmirror-module-sandbox-npx-smoke-",
		async ({ moduleRoot, tarballPath }) => {
			await runSmokeCommand(
				[
					"exec",
					"--yes",
					"--package",
					tarballPath,
					"--",
					"magicmirror-module-sandbox"
				],
				moduleRoot,
				smokePort
			);
		}
	);
});
