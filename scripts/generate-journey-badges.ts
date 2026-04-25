/**
 * Generate Shields-based badges for journey coverage summaries.
 */
const fs = require("node:fs") as typeof import("node:fs");
const path = require("node:path") as typeof import("node:path");

type JourneyMetric = "journeys" | "transitions" | "outcomes";
type JourneySuiteName = "integration" | "ui";

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
	score: number;
};

type JourneyCoverageSummary = {
	suites: JourneySuiteSummary[];
};

const rootDirectory = path.resolve(__dirname, "..");
const journeyCoverageDirectory = path.join(
	rootDirectory,
	".runtime-cache",
	"journey-coverage"
);
const badgeOutputDirectory = path.join(
	rootDirectory,
	"coverage",
	"journey-badges"
);
const trackedSuites: readonly JourneySuiteName[] = ["integration", "ui"];
const trackedMetrics: readonly JourneyMetric[] = [
	"journeys",
	"transitions",
	"outcomes"
];

/**
 * Reads one journey summary JSON file.
 */
function readJourneySummary(suite: JourneySuiteName): JourneySuiteSummary {
	const summaryPath = path.join(
		journeyCoverageDirectory,
		`summary.${suite}.json`
	);
	if (!fs.existsSync(summaryPath)) {
		throw new Error(
			`Missing journey coverage summary for suite "${suite}" at "${summaryPath}".`
		);
	}

	const parsed = JSON.parse(
		fs.readFileSync(summaryPath, "utf8")
	) as JourneyCoverageSummary;
	const suiteSummary = parsed.suites.find((entry) => entry.suite === suite);
	if (!suiteSummary) {
		throw new Error(
			`Journey coverage summary "${summaryPath}" does not contain suite "${suite}".`
		);
	}

	return suiteSummary;
}

/**
 * Maps one percentage to a Shields color.
 */
function getBadgeColor(percent: number): string {
	if (percent < 70) {
		return "red";
	}
	if (percent < 80) {
		return "yellow";
	}
	if (percent < 90) {
		return "orange";
	}
	return "brightgreen";
}

/**
 * Builds the Shields endpoint for one journey coverage badge.
 */
function buildBadgeUrl(
	suite: JourneySuiteName,
	metric: JourneyMetric,
	percent: number
): string {
	const badgeUrl = new URL("https://img.shields.io/badge");
	badgeUrl.pathname = `/badge/${encodeURIComponent(`${metric}:${suite}`)}-${encodeURIComponent(`${percent.toFixed(2)}%`)}-${getBadgeColor(percent)}.svg`;
	return badgeUrl.toString();
}

/**
 * Downloads one badge SVG.
 */
async function downloadBadge(
	destinationPath: string,
	url: string
): Promise<void> {
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(
			`Failed to download badge "${url}": ${response.status} ${response.statusText}`
		);
	}

	const badgeSvg = await response.text();
	fs.writeFileSync(destinationPath, badgeSvg, "utf8");
}

/**
 * Generates journey coverage badges for each tracked suite/metric pair.
 */
async function generateJourneyBadges(): Promise<void> {
	fs.mkdirSync(badgeOutputDirectory, {
		recursive: true
	});

	for (const suite of trackedSuites) {
		const suiteSummary = readJourneySummary(suite);
		for (const metric of trackedMetrics) {
			const metricSummary = suiteSummary[metric];
			const badgePath = path.join(
				badgeOutputDirectory,
				`${metric}-${suite}.svg`
			);
			await downloadBadge(
				badgePath,
				buildBadgeUrl(suite, metric, metricSummary.percent)
			);
		}
	}

	console.log("Journey coverage badges created successfully.");
}

void generateJourneyBadges();
