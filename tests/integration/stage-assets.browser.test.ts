/**
 * Browser-backed integration coverage for mounted-module assets under the
 * stage prefix `/__stage/`.
 */
import { afterAll, expect, test } from "vitest";
import {
	closeSandbox,
	gotoSandbox,
	stageEvaluate,
	stageText
} from "../_helpers/helpers.browser.ts";
import { fixtureStyleScenarios } from "../_helpers/test-module-style-scenarios.ts";

afterAll(async () => {
	await closeSandbox();
});

type MagicMirrorModule = {
	name: string;
	translate: (key: string) => string;
};
type StageGlobals = typeof globalThis & {
	MM?: { getModules: () => MagicMirrorModule[] };
	mmVersion?: string;
	__testModuleFixtureEsmLoaded?: boolean;
};

/**
 * Whether a core version loads `.mjs` module scripts. Loaders up to 2.36
 * (`js/loader.js` `loadFile`) only handle the `js` and `css` extensions and
 * skip anything else; 2.37 added `.mjs`.
 */
function loadsMjsScripts(version: string): boolean {
	const [major, minor] = version.split(".").map(Number);
	return major > 2 || (major === 2 && minor >= 37);
}

test("module assets resolve under the stage prefix", async () => {
	await gotoSandbox();

	const stage = await stageEvaluate(() => {
		const scope = globalThis as StageGlobals;
		return {
			baseURI: globalThis.document.baseURI,
			marker: globalThis.document.documentElement.dataset.sandboxStage,
			mmVersion: scope.mmVersion ?? ""
		};
	});
	expect(new URL(stage.baseURI).pathname).toBe("/__stage/");
	expect(stage.marker).toBe("core");
	// The `.mjs` gate below depends on it; an empty version must fail loudly.
	expect(stage.mmVersion).not.toBe("");

	// getStyles: the fixture stylesheet applies.
	await expect
		.poll(() =>
			stageEvaluate(() => {
				const probe = globalThis.document.getElementById(
					"test-module-style-probe"
				);
				return probe ? globalThis.getComputedStyle(probe).color : "";
			})
		)
		.toBe(fixtureStyleScenarios.default.probeColor);

	// getScripts: the classic script ran before start().
	await expect
		.poll(() => stageText("#test-module-script-status"))
		.toBe("Script: test-script-ready");

	// getScripts: the `.mjs` script loads exactly when the version's loader
	// supports it (never forced by the sandbox).
	const esmLoaded = await stageEvaluate(
		() => (globalThis as StageGlobals).__testModuleFixtureEsmLoaded === true
	);
	expect(esmLoaded).toBe(loadsMjsScripts(stage.mmVersion));

	// getTemplate: the nunjucks template renders, with its translate filter.
	await expect
		.poll(() => stageText("#test-module-translation"))
		.toBe("Hola Sandbox Developer desde el modulo de prueba.");

	// getTranslations: the runtime language is `es`; es.json lacks the key, so
	// the core falls back to the first declared translation file (en.json).
	await expect
		.poll(() =>
			stageEvaluate(() => {
				const scope = globalThis as StageGlobals;
				const mm =
					scope.MM ??
					// 2.35-2.36 declare MM as a top-level const, not a global property.
					(globalThis.eval(
						"typeof MM === 'undefined' ? undefined : MM"
					) as StageGlobals["MM"] | undefined);
				const instance = mm
					?.getModules()
					.find((module) => module.name === "MMM-TestModule");
				return instance ? instance.translate("FIXTURE_KEY") : "";
			})
		)
		.toBe("Fixture translation from en.json");
});
