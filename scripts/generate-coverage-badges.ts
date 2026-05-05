const { existsSync } = require("node:fs") as typeof import("node:fs");
const { execSync } = require("node:child_process") as typeof import("node:child_process");
const { resolve } = require("node:path") as typeof import("node:path");

const summaryPath = resolve(__dirname, "..", "coverage", "coverage-summary.json");
if (!existsSync(summaryPath)) {
	console.log("[report:10-badges] Skipped: coverage/coverage-summary.json not found");
	process.exit(0);
}

execSync("generate-coverage-report -p ./coverage/badges", {
	stdio: "inherit",
	cwd: resolve(__dirname, "..")
});
