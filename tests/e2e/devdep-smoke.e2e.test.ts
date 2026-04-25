/**
 * End-to-end smoke coverage for consumer devDependency installs.
 */
/**
 * End-to-end smoke coverage for consumer devDependency installs.
 */
import { test } from "vitest";
import {
	installTarballAsDevDependency,
	runInstalledSmokeBinary,
	withPackedSandbox
} from "./helpers.ts";
const smokePort = 3415;

/**
 * Packaged-install smoke coverage for the consumer `devDependency` workflow.
 */
test("packaged sandbox boots after consumer devDependency install", async () => {
	await withPackedSandbox(
		"magicmirror-module-sandbox-devdep-smoke-",
		async ({ moduleRoot, tarballPath }) => {
			installTarballAsDevDependency(tarballPath, moduleRoot);
			await runInstalledSmokeBinary(moduleRoot, smokePort);
		}
	);
});
