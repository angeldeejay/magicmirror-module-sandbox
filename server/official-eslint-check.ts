/**
 * Port of the official module-check ESLint pass.
 *
 * Source: MagicMirrorOrg/MagicMirror-3rd-Party-Modules
 * `pipeline/workers/process-module.ts` → `runEslintCheck` and its call site.
 * The reviewed upstream text lives in
 * `scripts/upstream-snapshots/run-eslint-check.txt`; `build:02-sync-analyzer`
 * fails when upstream diverges from it, so this port gets re-reviewed.
 *
 * The worker itself cannot be vendored (it pulls in git, sharp and the
 * pipeline cache), but everything it executes is: the vendored
 * `eslint-testconfig.ts` registers the official MAGICMIRROR_PLUGIN rules.
 * Only one mechanical difference exists: upstream points ESLint at the
 * config file by path, while the sandbox passes the imported config array
 * with `overrideConfigFile: true`. Both disable config lookup in the module
 * repository, so repository-owned ESLint configs never run.
 *
 * Local deviation: `localIgnores` excludes paths the module repository
 * ignores (see module-ignored-paths.ts). The official check lints a clean
 * clone, which never contains them.
 */

import * as path from "node:path";
import { ESLint, type Linter } from "eslint";
import officialTestConfig from "./vendor/check-modules/eslint-testconfig.ts";
import { getRuleById } from "./vendor/check-modules/rule-registry.ts";

/**
 * Defaults from upstream `scripts/check-modules/check-groups.config.json`
 * (snapshot: `scripts/upstream-snapshots/check-groups.config.json`).
 */
export const OFFICIAL_CHECK_GROUP_DEFAULTS: Readonly<{
	deep: boolean;
	eslint: boolean;
}> = Object.freeze({
	deep: true,
	eslint: true
});

/**
 * Runs the official ESLint pass and returns upstream-formatted issue strings.
 * `includeGeneralChecks` mirrors the upstream call site:
 * `analysisConfig.eslint !== false && analysisConfig.deep !== false`.
 */
export async function runOfficialEslintCheck(
	moduleDir: string,
	includeGeneralChecks = OFFICIAL_CHECK_GROUP_DEFAULTS.eslint !== false &&
		OFFICIAL_CHECK_GROUP_DEFAULTS.deep !== false,
	localIgnores: string[] = []
): Promise<string[]> {
	const moduleOverrides: Linter.Config[] = path
		.basename(path.resolve(moduleDir))
		.startsWith("MMM-Remote-Control")
		? [
				{
					files: ["**/node_helper.js"],
					languageOptions: {
						globals: {
							Module: "writable"
						}
					}
				}
			]
		: [];
	const eslint = new ESLint({
		cwd: path.resolve(moduleDir),
		overrideConfigFile: true,
		overrideConfig: [
			...(officialTestConfig as Linter.Config[]),
			...moduleOverrides,
			...(localIgnores.length > 0 ? [{ ignores: localIgnores }] : [])
		],
		allowInlineConfig: false,
		errorOnUnmatchedPattern: false,
		fix: false
	});
	const results = await eslint.lintFiles([
		"**/*.{js,mjs,cjs,yaml,yml}",
		"**/package.json"
	]);
	const issues: string[] = [];
	const generalIssues: string[] = [];
	for (const result of results) {
		const relativePath = path.relative(moduleDir, result.filePath);
		for (const message of result.messages) {
			if (message.ruleId === "eslintN/no-deprecated-api") {
				const rule = getRuleById("text-deprecated-node-api");
				if (rule) {
					issues.push(
						`${rule.category}: In \`${relativePath}:${message.line}:${message.column}\`: ${message.message}`
					);
				}
			} else if (message.ruleId?.startsWith("magicmirror/")) {
				const rule = message.messageId
					? getRuleById(message.messageId)
					: null;
				if (rule) {
					issues.push(
						`${rule.category}: In \`${relativePath}:${message.line}:${message.column}\`: ${message.message}`
					);
				}
			} else if (includeGeneralChecks || message.fatal) {
				generalIssues.push(
					`${relativePath}: Line ${message.line}, Column ${message.column}: ${message.message} (rule: ${message.ruleId})`
				);
			}
		}
	}
	if (generalIssues.length > 0) {
		issues.push(
			`ESLint issues:\n${generalIssues.map((entry) => `   - ${entry}`).join("\n")}`
		);
	}
	return issues;
}
