/**
 * End-to-end smoke coverage for consumer npx installs.
 */
import { test } from "vitest";
import { allocateLoopbackPort, runSmokeCommand, withPackedSandbox } from "./helpers.ts";

/**
 * Packaged-install smoke coverage for the one-off `npm exec --package` workflow.
 */
test("packaged sandbox boots through npm exec --package", async () => {
	const smokePort = await allocateLoopbackPort();
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
