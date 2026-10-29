/**
 * Fixture root and reset helpers for the maintained browser test module.
 */
/**
 * Fixture root and reset helpers for the maintained browser test module.
 */
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFixtureStylesheet } from "./test-module-style-fixture.ts";

const helpersDir = dirname(fileURLToPath(import.meta.url));

/** Default fixture: no getDom override, renders on every supported core. */
export const sourceFixtureRoot = join(
	helpersDir,
	"..",
	"_fixtures",
	"MMM-TestModule"
);
/**
 * Fixture variant whose getDom awaits `this._super()`: it renders on 2.35-2.36
 * and fails from 2.37 (D1). Only the version-pinned core-fidelity suites
 * mount it; the module still registers, and is mounted, as `MMM-TestModule`.
 */
export const superGetDomFixtureRoot = join(
	helpersDir,
	"..",
	"_fixtures",
	"MMM-TestModule-super-getdom"
);

/** Which fixture source a browser session mounts. */
export type FixtureVariant = "default" | "super-getdom";

/**
 * Resolve the source directory of one fixture variant.
 *
 * @param {FixtureVariant} variant
 * @returns {string}
 */
export function getFixtureSourceRoot(variant: FixtureVariant): string {
	return variant === "super-getdom"
		? superGetDomFixtureRoot
		: sourceFixtureRoot;
}
export const browserSuiteFixtureRoot = join(
	helpersDir,
	"..",
	"..",
	".runtime-cache",
	"browser-suites"
);
/**
 * Resolve the isolated mutable fixture root for one browser-backed suite.
 *
 * @param {string} suiteName
 * @returns {string}
 */
export function getBrowserSuiteFixtureRoot(suiteName) {
	return join(browserSuiteFixtureRoot, suiteName, "MMM-TestModule");
}

/**
 * Build the mutable file paths used by one isolated browser-backed suite.
 *
 * @param {string} suiteName
 * @returns {{
 * 	root: string,
 * 	configPath: string,
 * 	runtimeConfigPath: string,
 * 	stylePath: string
 * }}
 */
export function getBrowserSuiteFixturePaths(suiteName) {
	const root = getBrowserSuiteFixtureRoot(suiteName);
	return {
		root,
		stylePath: join(root, "MMM-TestModule.css")
	};
}

/**
 * Ensure that an isolated mutable fixture workspace exists for one suite.
 *
 * @param {string} suiteName
 * @returns {string}
 */
export function ensureBrowserSuiteFixtureFiles(suiteName) {
	const fixtureRoot = getBrowserSuiteFixtureRoot(suiteName);
	if (!existsSync(fixtureRoot)) {
		mkdirSync(dirname(fixtureRoot), {
			recursive: true
		});
		cpSync(sourceFixtureRoot, fixtureRoot, {
			recursive: true
		});
	}
	return fixtureRoot;
}

/**
 * Restore the mutable MMM-TestModule fixture files used by one browser-backed suite.
 *
 * Integration and UI specs intentionally edit config and style files on disk.
 * Resetting them inside an isolated suite workspace keeps each suite
 * deterministic even after a prior timeout or failed cleanup, without sharing
 * mutable state with other browser-backed suites.
 *
 * @param {string} suiteName
 * @returns {void}
 */
export function resetBrowserSuiteFixtureFiles(suiteName) {
	const fixtureRoot = ensureBrowserSuiteFixtureFiles(suiteName);
	rmSync(join(fixtureRoot, "module.config.json"), { force: true });
	rmSync(join(fixtureRoot, "runtime.config.json"), { force: true });
	writeFixtureStylesheet(join(fixtureRoot, "MMM-TestModule.css"));
}
