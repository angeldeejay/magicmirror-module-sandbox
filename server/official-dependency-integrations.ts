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
 * node_modules. The sandbox runs the same package bins, resolved from its
 * own dependencies, with the current Node executable, because npx inside the
 * module directory would resolve (or download) something else.
 */

import { execFile } from "node:child_process";
import * as fs from "node:fs";
import { createRequire } from "node:module";
import * as path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const nodeRequire = createRequire(
	/* v8 ignore next */
	typeof __filename === "string" ? __filename : import.meta.url
);

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
 * Resolves a package bin from the sandbox's own dependencies.
 */
function resolvePackageBin(packageName: string, binName: string): string {
	const packageJsonPath = nodeRequire.resolve(`${packageName}/package.json`);
	const packageJson = JSON.parse(
		fs.readFileSync(packageJsonPath, "utf8")
	) as {
		bin?: string | Record<string, string>;
	};
	const binPath =
		typeof packageJson.bin === "string"
			? packageJson.bin
			: packageJson.bin?.[binName];
	if (!binPath) {
		throw new Error(`${packageName} does not expose a "${binName}" bin`);
	}
	return path.join(path.dirname(packageJsonPath), binPath);
}

/**
 * Default bin runner: `node <bin> ...args` in the module directory.
 */
const runPackageBin: BinRunner = async (
	packageName,
	binName,
	args,
	options
) => {
	const { stdout, stderr } = await execFileAsync(
		process.execPath,
		[resolvePackageBin(packageName, binName), ...args],
		options
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
			{ cwd: moduleDir, timeout: 60_000 }
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
			{ cwd: moduleDir, timeout: 60_000 }
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
