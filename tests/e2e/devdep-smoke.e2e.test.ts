/**
 * End-to-end smoke coverage for consumer devDependency installs.
 */
import { test } from "vitest";
import {
	allocateLoopbackPort,
	installTarballAsDevDependency,
	runInstalledSmokeBinary,
	withPackedSandbox
} from "./helpers.ts";

/**
 * Packaged-install smoke coverage for the consumer `devDependency` workflow.
 */
test("packaged sandbox boots after consumer devDependency install", async () => {
	const smokePort = await allocateLoopbackPort();
	await withPackedSandbox(
		"magicmirror-module-sandbox-devdep-smoke-",
		async ({ moduleRoot, tarballPath }) => {
			installTarballAsDevDependency(tarballPath, moduleRoot);
			await runInstalledSmokeBinary(moduleRoot, smokePort);
		}
	);
});
