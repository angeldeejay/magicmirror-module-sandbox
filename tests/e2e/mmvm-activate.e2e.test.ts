/**
 * End-to-end coverage for activating an mmvm version from a packaged install.
 */
import { test } from "vitest";
import {
	allocateLoopbackPort,
	installTarballAsDevDependency,
	runInstalledVersionActivation,
	withPackedSandbox
} from "./helpers.ts";

/**
 * The MM Version domain builds the helper shims of the activated version with
 * the packaged sandbox's own shim builder, which must ship in the tarball.
 */
test("packaged sandbox activates an installed mmvm version and builds its shims", async () => {
	const smokePort = await allocateLoopbackPort();
	await withPackedSandbox(
		"magicmirror-module-sandbox-mmvm-activate-",
		async ({ moduleRoot, tarballPath }) => {
			installTarballAsDevDependency(tarballPath, moduleRoot);
			await runInstalledVersionActivation(moduleRoot, smokePort);
		}
	);
});
