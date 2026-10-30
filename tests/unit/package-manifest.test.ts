/**
 * Pins which packages the published sandbox installs for its consumers.
 */
import * as fs from "node:fs";
import * as path from "pathe";
import { expect, test } from "vitest";

const repoRoot = path.resolve(import.meta.dirname, "../..");
const manifest = JSON.parse(
	fs.readFileSync(path.join(repoRoot, "package.json"), "utf8")
) as {
	dependencies: Record<string, string>;
	devDependencies: Record<string, string>;
};

test("MagicMirror dependencies a node_helper commonly requires stay installed", () => {
	// On a real mirror a module's node_helper resolves MagicMirror's own
	// dependencies; in a consumer install it resolves the sandbox's, hoisted
	// next to the module.
	for (const name of ["express", "moment", "moment-timezone"]) {
		expect(manifest.dependencies[name], name).toBeTruthy();
	}
});

test("packages the published dist/ already bundles or copies are not installed", () => {
	for (const name of [
		"preact",
		"semver",
		"js-beautify",
		"jsonc-parser",
		"@fontsource/open-sans",
		"animate.css",
		"npm-check-updates",
		"npm-deprecated-check"
	]) {
		expect(manifest.dependencies[name], name).toBeUndefined();
		expect(manifest.devDependencies[name], name).toBeTruthy();
	}
});
