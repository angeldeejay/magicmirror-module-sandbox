/**
 * Port of the official module-check dependency integrations.
 *
 * Source: MagicMirrorOrg/MagicMirror-3rd-Party-Modules
 * `pipeline/workers/process-module.ts` → `runNpmCheckUpdates`,
 * `runDeprecatedCheck`, `applyDependencyIntegrations` and `NCU_COOLDOWN`.
 * The reviewed upstream text lives in
 * `scripts/upstream-snapshots/dependency-integrations.txt`;
 * `build:02-sync-analyzer` fails when upstream diverges from it.
 *
 * Mechanical difference: upstream runs `npx npm-check-updates` / `npx ndc`
 * from its own repository, where npx resolves the bins from its
 * node_modules. The sandbox runs the same tools through `npm exec` with
 * their versions pinned (`DEPENDENCY_TOOL_VERSIONS`), so npm fetches them
 * into its cache on first use instead of the sandbox depending on them, and a
 * module directory's own copy (or a newer release) is never picked up. The
 * timeout allows for that first download.
 */

import { execFile } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/**
 * Exact versions of the dependency tools `npm exec` runs. Kept equal to the
 * devDependencies (pinned by a unit test), so dependency updates move them.
 */
export const DEPENDENCY_TOOL_VERSIONS: Readonly<Record<string, string>> =
	Object.freeze({
		"npm-check-updates": "23.1.1",
		"npm-deprecated-check": "2.1.1"
	});

/** Upstream's per-tool timeout plus room for npm's first download. */
const DEPENDENCY_TOOL_TIMEOUT_MS = 180_000;

export const NCU_COOLDOWN = "7d";

/**
 * Defaults of upstream `DEFAULT_ANALYSIS_CONFIG` (scripts/parallel-processing.ts).
 */
export const OFFICIAL_DEPENDENCY_INTEGRATION_DEFAULTS: Readonly<{
	deep: boolean;
	ncu: boolean;
	npmDeprecatedCheck: boolean;
}> = Object.freeze({
	deep: true,
	ncu: true,
	npmDeprecatedCheck: true
});

type DependencyIntegrationConfig = {
	deep?: boolean;
	ncu?: boolean;
	npmDeprecatedCheck?: boolean;
};

type BinRunner = (
	packageName: string,
	binName: string,
	args: string[],
	options: { cwd: string; timeout: number }
) => Promise<{ stdout: string; stderr: string }>;

/**
 * Builds the `npm exec` command line that runs one pinned tool bin. On
 * Windows npm is a `.cmd` shim, which only `cmd.exe` can start.
 */
export function buildNpmExecCommand(
	packageName: string,
	binName: string,
	args: string[],
	platform: NodeJS.Platform = process.platform
): { command: string; args: string[] } {
	const version = DEPENDENCY_TOOL_VERSIONS[packageName];
	if (!version) {
		throw new Error(`${packageName} has no pinned version`);
	}
	const npmArgs = [
		"exec",
		"--yes",
		`--package=${packageName}@${version}`,
		"--",
		binName,
		...args
	];
	return platform === "win32"
		? { command: "cmd.exe", args: ["/d", "/s", "/c", "npm", ...npmArgs] }
		: { command: "npm", args: npmArgs };
}

/**
 * Default bin runner: `npm exec` of the pinned tool in the module directory.
 */
const runPackageBin: BinRunner = async (
	packageName,
	binName,
	args,
	options
) => {
	const invocation = buildNpmExecCommand(packageName, binName, args);
	const { stdout, stderr } = await execFileAsync(
		invocation.command,
		invocation.args,
		{ ...options, windowsHide: true }
	);
	return { stdout: String(stdout ?? ""), stderr: String(stderr ?? "") };
};

/**
 * Upstream `getErrorMessage`.
 */
function getErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

/**
 * Upstream `mergeUniqueIssues` for string issue lists.
 */
function mergeUniqueIssues(target: string[], issues: string[]): void {
	const existing = new Set(target);
	for (const issue of issues) {
		if (!existing.has(issue)) {
			target.push(issue);
			existing.add(issue);
		}
	}
}

/**
 * Upstream `runNpmCheckUpdates`.
 */
async function runNpmCheckUpdates(
	moduleDir: string,
	runBin: BinRunner
): Promise<string[]> {
	try {
		const { stdout } = await runBin(
			"npm-check-updates",
			"npm-check-updates",
			["--jsonUpgraded", "--cooldown", NCU_COOLDOWN],
			{ cwd: moduleDir, timeout: DEPENDENCY_TOOL_TIMEOUT_MS }
		);

		const output = String(stdout ?? "").trim();
		if (!output) {
			return [];
		}

		const parsed = JSON.parse(output) as Record<string, string>;
		return Object.entries(parsed).map(
			([dependency, targetVersion]) => `${dependency} -> ${targetVersion}`
		);
	} catch (error) {
		console.warn(
			`[module-sandbox] npm-check-updates failed in ${moduleDir}: ${getErrorMessage(error)}`
		);
		return [];
	}
}

/**
 * Upstream `runDeprecatedCheck`.
 */
async function runDeprecatedCheck(
	moduleDir: string,
	runBin: BinRunner
): Promise<string | null> {
	try {
		const { stdout, stderr } = await runBin(
			"npm-deprecated-check",
			"ndc",
			["current"],
			{ cwd: moduleDir, timeout: DEPENDENCY_TOOL_TIMEOUT_MS }
		);

		const output = `${String(stdout ?? "")}${String(stderr ?? "")}`.trim();
		if (
			!output ||
			output.includes("There are no deprecated dependencies.")
		) {
			return null;
		}

		const lines = output
			.split(/\r?\n/u)
			.map((line) => line.trim())
			.filter((line) => line.includes(":"));

		if (lines.length === 0) {
			return null;
		}

		return lines.join("\n");
	} catch (error) {
		console.warn(
			`[module-sandbox] npm-deprecated-check failed in ${moduleDir}: ${getErrorMessage(error)}`
		);
		return null;
	}
}

/**
 * Upstream `applyDependencyIntegrations`: appends npm-check-updates and
 * npm-deprecated-check findings to `issues`, within the official issue budget
 * (skipped once 4, respectively 3, issues are already present).
 */
export async function applyOfficialDependencyIntegrations(
	moduleDir: string,
	issues: string[],
	analysisConfig: DependencyIntegrationConfig = OFFICIAL_DEPENDENCY_INTEGRATION_DEFAULTS,
	runBin: BinRunner = runPackageBin
): Promise<void> {
	if (analysisConfig.deep === false) {
		return;
	}

	const packageJsonPath = path.join(moduleDir, "package.json");
	if (!fs.existsSync(packageJsonPath)) {
		return;
	}

	if (issues.length >= 4) {
		return;
	}

	if (analysisConfig.ncu !== false) {
		const upgrades = await runNpmCheckUpdates(moduleDir, runBin);
		if (upgrades.length > 0) {
			const header = `Information: There are updates for ${upgrades.length} dependencie(s):`;
			const details = upgrades.map((entry) => `   - ${entry}`).join("\n");
			mergeUniqueIssues(issues, [`${header}\n${details}`]);
		}
	}

	if (issues.length >= 3) {
		return;
	}

	if (analysisConfig.npmDeprecatedCheck !== false) {
		const deprecated = await runDeprecatedCheck(moduleDir, runBin);
		if (deprecated) {
			mergeUniqueIssues(issues, [deprecated]);
		}
	}
}
