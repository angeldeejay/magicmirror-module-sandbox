/**
 * Write a unified GitHub Actions job summary for v8 and journey coverage.
 */
const fs = require("node:fs") as typeof import("node:fs");
const path = require("node:path") as typeof import("node:path");

type V8MetricName = "statements" | "branches" | "functions" | "lines";
type JourneyMetricName = "journeys" | "transitions" | "outcomes";
type JourneySuiteName = "integration" | "ui";

type V8MetricSummary = {
	total: number;
	covered: number;
	skipped: number;
	pct: number;
};

type V8CoverageSummary = {
	total: Record<V8MetricName, V8MetricSummary> & {
		branchesTrue?: V8MetricSummary;
	};
};

type JourneyMetricSummary = {
	covered: number;
	total: number;
	percent: number;
};

type JourneySuiteSummary = {
	suite: JourneySuiteName;
	journeys: JourneyMetricSummary;
	transitions: JourneyMetricSummary;
	outcomes: JourneyMetricSummary;
};

type OverallSummary = Omit<JourneySuiteSummary, "suite"> & { suite: "overall" };

type JourneyCoverageSummary = {
	suites: JourneySuiteSummary[];
};

const repoRoot = path.resolve(__dirname, "..");
const coverageSummaryPath = path.join(
	repoRoot,
	"coverage",
	"coverage-summary.json"
);
const journeyCoverageDirectory = path.join(
	repoRoot,
	".runtime-cache",
	"journey-coverage"
);
const journeySuiteNames: readonly JourneySuiteName[] = ["integration", "ui"];
const v8MetricNames: readonly V8MetricName[] = [
	"statements",
	"branches",
	"functions",
	"lines"
];

/**
 * Reads one JSON file when it exists.
 */
function readJsonFile<T>(filePath: string): T | null {
	if (!fs.existsSync(filePath)) {
		return null;
	}

	return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

/**
 * Formats one numeric percentage for markdown tables.
 */
function formatPercent(value: number): string {
	return `${value.toFixed(2)}%`;
}

/**
 * Formats one covered/total pair for markdown tables.
 */
function formatCoverageRatio(covered: number, total: number): string {
	return `${covered} / ${total}`;
}

/**
 * Converts one metric name into a title-cased label.
 */
function toTitleCase(value: string): string {
	return value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * Calculates one percentage from covered and total counts.
 */
function toPercent(covered: number, total: number): number {
	if (total === 0) {
		return 100;
	}

	return Number(((covered / total) * 100).toFixed(2));
}

/**
 * Calculates the weighted journey score headline.
 */
function toJourneyScore(
	journeyPercent: number,
	transitionPercent: number,
	outcomePercent: number
): number {
	return Number(
		(
			journeyPercent * 0.4 +
			transitionPercent * 0.35 +
			outcomePercent * 0.25
		).toFixed(1)
	);
}

/**
 * Reads all available journey suite summaries.
 */
function readJourneySuites(): JourneySuiteSummary[] {
	return journeySuiteNames
		.map((suite) => {
			const filePath = path.join(
				journeyCoverageDirectory,
				`summary.${suite}.json`
			);
			const summary = readJsonFile<JourneyCoverageSummary>(filePath);
			return summary?.suites.find((entry) => entry.suite === suite) ?? null;
		})
		.filter((entry): entry is JourneySuiteSummary => entry !== null);
}

/**
 * Builds the aggregate journey row when multiple suites are available.
 */
function buildJourneyOverall(
	suites: readonly (JourneySuiteSummary | OverallSummary)[]
): OverallSummary | null {
	if (suites.length === 0) {
		return null;
	}

	const totalJourneysCovered = suites.reduce(
		(total, suite) => total + suite.journeys.covered,
		0
	);
	const totalJourneys = suites.reduce(
		(total, suite) => total + suite.journeys.total,
		0
	);
	const totalTransitionsCovered = suites.reduce(
		(total, suite) => total + suite.transitions.covered,
		0
	);
	const totalTransitions = suites.reduce(
		(total, suite) => total + suite.transitions.total,
		0
	);
	const totalOutcomesCovered = suites.reduce(
		(total, suite) => total + suite.outcomes.covered,
		0
	);
	const totalOutcomes = suites.reduce(
		(total, suite) => total + suite.outcomes.total,
		0
	);
	const journeysPercent = toPercent(totalJourneysCovered, totalJourneys);
	const transitionsPercent = toPercent(
		totalTransitionsCovered,
		totalTransitions
	);
	const outcomesPercent = toPercent(totalOutcomesCovered, totalOutcomes);

	return {
		suite: "overall",
		journeys: {
			covered: totalJourneysCovered,
			total: totalJourneys,
			percent: journeysPercent
		},
		transitions: {
			covered: totalTransitionsCovered,
			total: totalTransitions,
			percent: transitionsPercent
		},
		outcomes: {
			covered: totalOutcomesCovered,
			total: totalOutcomes,
			percent: outcomesPercent
		}
	};
}

/**
 * Builds the markdown block for v8 coverage.
 */
function buildV8Section(): string[] {
	const summary = readJsonFile<V8CoverageSummary>(coverageSummaryPath);
	if (!summary) {
		return [
			"### Code coverage",
			"",
			"_No `coverage/coverage-summary.json` file was produced in this run._",
			""
		];
	}

	return [
		"### Code coverage",
		"",
		"| Metric | Percentage | Covered / Total |",
		"| --- | ---: | ---: |",
		...v8MetricNames.map((metricName) => {
			const metric = summary.total[metricName];
			return (
				"| " +
				[
					toTitleCase(metricName),
					formatPercent(metric.pct),
					formatCoverageRatio(metric.covered, metric.total)
				].join(" | ") +
				" |"
			);
		}),
		""
	];
}

/**
 * Builds the markdown block for journey coverage.
 */
function buildJourneySection(): string[] {
	const suites: (JourneySuiteSummary | OverallSummary)[] = readJourneySuites();
	if (suites.length === 0) {
		return [
			"### Journey coverage",
			"",
			"_No journey coverage summary files were produced in this run._",
			""
		];
	}

	const labels = ["journeys", "transitions", "outcomes"] as (keyof Omit<
		JourneySuiteSummary,
		"suite"
	>)[];

	const formatSuiteRow = (
		suite: JourneySuiteSummary | OverallSummary
	): string => {
		let rowPercentage = 0.0;
		let rowTotal = 0;
		let rowCovered = 0;
		return (
			"| " +
			[
				toTitleCase(suite.suite),
				...labels.map((label) => {
					rowPercentage += suite[label].percent;
					rowTotal += suite[label].total;
					rowCovered += suite[label].covered;
					return formatCoverageRatio(suite[label].covered, suite[label].total);
				}),
				formatPercent(rowPercentage / labels.length),
				formatCoverageRatio(rowCovered, rowTotal),
				toJourneyScore(
					suite.journeys.percent,
					suite.transitions.percent,
					suite.outcomes.percent
				)
			].join(" | ") +
			" |"
		);
	};

	const overall = buildJourneyOverall(suites);
	if (overall) {
		suites.push(overall);
	}
	const rows = suites.map((suite) => formatSuiteRow(suite));

	return [
		"### Journey coverage",
		"",
		"| Suite | Journeys | Transitions | Outcomes | Percentage | Covered / Total | Score |",
		"| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
		...rows,
		""
	];
}

/**
 * Writes the markdown summary to GitHub Actions when available, or stdout when
 * running locally.
 */
function writeSummary(markdown: string): void {
	const summaryPath = process.env.GITHUB_STEP_SUMMARY;
	if (!summaryPath) {
		process.stdout.write(`${markdown}\n`);
		return;
	}

	fs.writeFileSync(summaryPath, `${markdown}\n`, "utf8");
}

/**
 * Builds and writes the unified provider summary.
 */
function main(): void {
	const markdown = [
		"## Coverage providers",
		"",
		...buildV8Section(),
		...buildJourneySection()
	].join("\n");
	writeSummary(markdown);
}

main();
