/**
 * Stylesheet fixture writers for browser-backed sandbox style scenarios.
 */
/**
 * Stylesheet fixture writers for browser-backed sandbox style scenarios.
 */
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
	fixtureStyleScenarios,
	fixtureStyleSelector
} from "./test-module-style-scenarios.ts";

const nodeRequire = createRequire(import.meta.url);
const helpersDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(helpersDir, "..", "..");

/**
 * Resolve the maintained `css-tree` parser for CSS-backed fixture scenarios.
 *
 * @returns {typeof import("css-tree")}
 */
function getCssTree() {
	const cssTreePath = nodeRequire.resolve("css-tree", {
		paths: [repoRoot]
	});
	return nodeRequire(cssTreePath);
}

/**
 * Resolve one named CSS scenario for the fixture module.
 *
 * @param {string} [scenarioName]
 * @returns {{ probeColor: string, fontWeight: string }}
 */
export function getFixtureStyleScenario(scenarioName = "default") {
	const scenario = fixtureStyleScenarios[scenarioName];
	if (!scenario) {
		throw new Error(`Unknown fixture style scenario: ${scenarioName}`);
	}
	return scenario;
}

/**
 * Generate the fixture stylesheet for one named scenario through `css-tree`.
 *
 * @param {string} [scenarioName]
 * @returns {string}
 */
export function buildFixtureStylesheet(scenarioName = "default") {
	const scenario = getFixtureStyleScenario(scenarioName);
	const cssTree = getCssTree();
	const stylesheet = cssTree.parse(
		`${fixtureStyleSelector} { color: ${scenario.probeColor}; font-weight: ${scenario.fontWeight}; }`
	);
	return `${cssTree.generate(stylesheet)}\n`;
}

/**
 * Write one named fixture stylesheet scenario to disk.
 *
 * @param {string} stylePath
 * @param {string} [scenarioName]
 * @returns {void}
 */
export function writeFixtureStylesheet(stylePath, scenarioName = "default") {
	writeFileSync(stylePath, buildFixtureStylesheet(scenarioName), "utf8");
}
