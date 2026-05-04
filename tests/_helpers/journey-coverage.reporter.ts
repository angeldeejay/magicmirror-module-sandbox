/**
 * Vitest reporter that summarizes browser-backed journey coverage.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { Reporter, TestCase, TestModule, Vitest } from "vitest/node";
import {
	buildJourneyCoverageSummary,
	type JourneyCoverageMeta,
	type JourneyCoverageRecord,
	type JourneySuiteName
} from "./journey-coverage.ts";

/**
 * ANSI colors used to make the terminal summary feel closer to Vitest's
 * built-in coverage output.
 */
const ansiColors = {
	bold: "\u001B[1m",
	cyan: "\u001B[36m",
	dim: "\u001B[2m",
	green: "\u001B[32m",
	yellow: "\u001B[33m",
	reset: "\u001B[0m"
} as const;

/**
 * Collects all test cases from one reported test module.
 */
function collectTestCases(testModule: TestModule): TestCase[] {
	return Array.from(testModule.children.allTests());
}

/**
 * Applies an ANSI color when the terminal supports it.
 */
function colorize(
	enabled: boolean | undefined,
	color: Exclude<keyof typeof ansiColors, "reset">,
	text: string
): string {
	if (!enabled) {
		return text;
	}

	return `${ansiColors[color]}${text}${ansiColors.reset}`;
}

/**
 * Applies multiple ANSI styles in one pass.
 */
function stylize(
	enabled: boolean | undefined,
	styles: readonly Exclude<keyof typeof ansiColors, "reset">[],
	text: string
): string {
	if (!enabled || styles.length === 0) {
		return text;
	}

	return `${styles.map((style) => ansiColors[style]).join("")}${text}${ansiColors.reset}`;
}

/**
 * Resolves the coverage color for a percentage row.
 */
function getCoverageColor(
	percent: number
): Extract<keyof typeof ansiColors, "green" | "yellow"> {
	return percent >= 100 ? "green" : "yellow";
}

/**
 * Formats one coverage summary row.
 */
function formatSummaryRow(
	label: string,
	percent: number,
	colorEnabled: boolean | undefined = undefined,
	covered: number | undefined = undefined,
	total: number | undefined = undefined
): string {
	const paddedLabel = `${label}`.padEnd(13, " ");
	const paddedPercent = `${percent.toFixed(2)}%`.padEnd(8, " ");
	const paddedCovTotal =
		typeof covered === "number" && typeof total === "number"
			? ` ( ${covered}/${total} )`
			: "";
	return stylize(
		colorEnabled,
		["bold", getCoverageColor(percent)],
		`${paddedLabel}: ${paddedPercent}${paddedCovTotal}`
	);
}

/**
 * Reporter that turns test metadata into terminal and JSON journey coverage
 * summaries for browser-backed suites.
 */
class JourneyCoverageReporter implements Reporter {
	private ctx: Vitest | null = null;

	/**
	 * Stores the Vitest context for later access to config and logger services.
	 */
	onInit(vitest: Vitest): void {
		this.ctx = vitest;
	}

	/**
	 * Collects journey metadata from executed tests, writes summary artifacts,
	 * removes the legacy single-file artifact, and prints the terminal summary.
	 */
	async onTestRunEnd(testModules: ReadonlyArray<TestModule>): Promise<void> {
		const records: JourneyCoverageRecord[] = [];

		// Detect which suites are in scope from module paths so zero-coverage
		// artifacts are still written when all journey tests crash before
		// producing records (prevents stale 100% artifacts from surviving).
		const detectedSuites = new Set<JourneySuiteName>();
		for (const testModule of testModules) {
			const id = testModule.relativeModuleId.replace(/\\/g, "/");
			if (/\/tests\/ui\//.test(id)) detectedSuites.add("ui");
			if (/\/tests\/integration\//.test(id)) detectedSuites.add("integration");
		}

		for (const testModule of testModules) {
			for (const testCase of collectTestCases(testModule)) {
				const meta = testCase.meta().journeyCoverage as
					| JourneyCoverageMeta
					| undefined;
				if (!meta) {
					continue;
				}

				records.push({
					moduleId: testModule.relativeModuleId,
					testName: testCase.fullName,
					status: testCase.result().state,
					suite: meta.suite,
					journeys: [...meta.journeys],
					transitions: [...meta.transitions],
					outcomes: [...meta.outcomes]
				});
			}
		}

		const summary = buildJourneyCoverageSummary(records, [...detectedSuites]);
		if (!summary || !this.ctx) {
			return;
		}

		const reportDirectory = path.join(
			this.ctx.config.root,
			".runtime-cache",
			"journey-coverage"
		);
		fs.mkdirSync(reportDirectory, {
			recursive: true
		});
		const suiteSuffix = summary.overall.suites.slice().sort().join("-");
		const serializedSummary = `${JSON.stringify(summary, null, 2)}\n`;
		fs.writeFileSync(
			path.join(reportDirectory, `summary.${suiteSuffix}.json`),
			serializedSummary,
			"utf8"
		);
		fs.writeFileSync(
			path.join(reportDirectory, "summary.latest.json"),
			serializedSummary,
			"utf8"
		);
		fs.rmSync(path.join(reportDirectory, "summary.json"), {
			force: true
		});

		const colorEnabled = process.stdout.isTTY;
		this.ctx.logger.log(
			[
				"",
				`${colorize(colorEnabled, "cyan", " %")} ${colorize(
					colorEnabled,
					"dim",
					`Coverage report from`
				)} ${colorize(colorEnabled, "yellow", "JourneyCov")}`,
				"",
				"=========================== Journey coverage summary ===========================",
				...["journeys", "transitions", "outcomes"].map((label) =>
					formatSummaryRow(
						label.charAt(0).toUpperCase() + label.slice(1),
						summary.overall[label].percent,
						colorEnabled,
						summary.overall[label].covered,
						summary.overall[label].total
					)
				),
				"================================================================================"
			].join("\n")
		);
	}
}

export default JourneyCoverageReporter;
