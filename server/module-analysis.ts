/**
 * VendorModuleAnalyzer implementation and in-memory analysis result store
 * with Socket.IO wiring for live quality findings.
 */

import * as fs from "node:fs";
import * as path from "pathe";
import type { AnalysisFinding, ModuleAnalysisResult } from "./analysis-types.ts";
import {
	detectUsedDependencies,
	extractDeclaredDependencyNames,
	findMissingDependencies,
	shouldAnalyzeFileForDependencyUsage
} from "./vendor/check-modules/dependency-usage.ts";
import { MISSING_DEPENDENCY_RULE_ID } from "./vendor/check-modules/missing-dependency-rule.ts";
import { analyzeModule } from "./vendor/check-modules/module-analyzer.ts";

// ---------------------------------------------------------------------------
// IModuleAnalyzer interface
// ---------------------------------------------------------------------------

export interface IModuleAnalyzer {
	/**
	 * Runs all analysis passes on the mounted module and returns a result.
	 *
	 * @param {string} moduleRoot - Absolute path to the module root directory.
	 * @param {string} moduleName - Display name of the module.
	 * @returns {Promise<ModuleAnalysisResult>}
	 */
	analyze(moduleRoot: string, moduleName: string): Promise<ModuleAnalysisResult>;
}

// ---------------------------------------------------------------------------
// Severity mapping
// ---------------------------------------------------------------------------

type VendorCategory = string;

/**
 * Maps upstream category strings to internal severity levels.
 */
function mapCategoryToSeverity(
	category: VendorCategory
): "error" | "warning" | "info" {
	switch (category) {
		case "Deprecated":
		case "Outdated":
		case "Typo":
		case "Warning":
			return "warning";
		case "Recommendation":
			return "info";
		default:
			return "info";
	}
}

// ---------------------------------------------------------------------------
// Issue string parser
//
// Upstream format examples:
//   "Category: description text"
//   "Category: Found `pattern` in file `filename`: description"
// ---------------------------------------------------------------------------

const FOUND_IN_FILE_RE =
	/^([^:]+):\s+Found\s+`([^`]*)`\s+in\s+file\s+`([^`]*)`:?\s*(.*)/s;
const PLAIN_CATEGORY_RE = /^([^:]+):\s+(.*)/s;

/**
 * Parses a single upstream issue string into an AnalysisFinding.
 */
function parseIssueString(issue: string, index: number): AnalysisFinding {
	const foundMatch = FOUND_IN_FILE_RE.exec(issue);
	if (foundMatch) {
		const [, category, , filename, description] = foundMatch;
		return {
			id: `vendor-issue-${index}`,
			category: (category ?? "Unknown").trim(),
			severity: mapCategoryToSeverity((category ?? "").trim()),
			description: (description ?? issue).trim(),
			file: (filename ?? null) || null
		};
	}

	const plainMatch = PLAIN_CATEGORY_RE.exec(issue);
	if (plainMatch) {
		const [, category, description] = plainMatch;
		return {
			id: `vendor-issue-${index}`,
			category: (category ?? "Unknown").trim(),
			severity: mapCategoryToSeverity((category ?? "").trim()),
			description: (description ?? issue).trim(),
			file: null
		};
	}

	return {
		id: `vendor-issue-${index}`,
		category: "Unknown",
		severity: "info",
		description: issue.trim(),
		file: null
	};
}

// ---------------------------------------------------------------------------
// File walker — recursive, excludes node_modules and .git
// ---------------------------------------------------------------------------

/**
 * Recursively walks a directory and returns absolute file paths, skipping
 * `node_modules` and `.git` subtrees.
 */
function walkDirectory(dir: string, results: string[] = []): string[] {
	let entries: fs.Dirent[];
	try {
		entries = fs.readdirSync(dir, { withFileTypes: true });
	} catch {
		return results;
	}

	for (const entry of entries) {
		if (entry.name === "node_modules" || entry.name === ".git") {
			continue;
		}

		const fullPath = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			walkDirectory(fullPath, results);
		} else if (entry.isFile()) {
			results.push(fullPath);
		}
	}

	return results;
}

// ---------------------------------------------------------------------------
// VendorModuleAnalyzer
// ---------------------------------------------------------------------------

export class VendorModuleAnalyzer implements IModuleAnalyzer {
	/**
	 * Runs all analysis passes against the module at `moduleRoot`.
	 *
	 * @param {string} moduleRoot - Absolute path to the module root directory.
	 * @param {string} moduleName - Display name of the module.
	 * @returns {Promise<ModuleAnalysisResult>}
	 */
	async analyze(
		moduleRoot: string,
		moduleName: string
	): Promise<ModuleAnalysisResult> {
		const startTime = Date.now();

		try {
			// Step 1 — Read package.json
			let packageJson: Record<string, unknown> | null = null;
			let moduleUrl: string | null = null;
			const packageJsonPath = path.join(moduleRoot, "package.json");
			try {
				const raw = fs.readFileSync(packageJsonPath, "utf8");
				packageJson = JSON.parse(raw) as Record<string, unknown>;
				const repo = packageJson.repository;
				if (
					repo !== null &&
					typeof repo === "object" &&
					!Array.isArray(repo) &&
					typeof (repo as Record<string, unknown>).url === "string"
				) {
					moduleUrl = ((repo as Record<string, unknown>).url as string) || null;
				} else if (typeof packageJson.homepage === "string" && packageJson.homepage) {
					moduleUrl = packageJson.homepage;
				} else {
					moduleUrl = null;
				}
			} catch {
				moduleUrl = null;
			}

			// Step 2 — Walk files (forward-slash normalized for vendor compat)
			const rawFiles = walkDirectory(moduleRoot);
			const files = rawFiles.map((f) => f); // pathe already uses forward slashes

			// Step 3 — First pass via vendor analyzeModule
			const vendorResult = await analyzeModule(
				moduleRoot,
				moduleName,
				moduleUrl ?? "",
				files
			);

			const findings: AnalysisFinding[] = vendorResult.issues.map(
				(issue, index) => parseIssueString(issue, index)
			);

			// Step 4 — Second pass: dependency usage
			const usedDependencies = new Set<string>();
			for (const absFile of rawFiles) {
				const relativePath = path.relative(moduleRoot, absFile);
				if (shouldAnalyzeFileForDependencyUsage(relativePath)) {
					let content = "";
					try {
						content = fs.readFileSync(absFile, "utf8");
					} catch {
						// skip unreadable files
					}
					if (content) {
						const detected = detectUsedDependencies(content);
						for (const dep of detected) {
							usedDependencies.add(dep);
						}
					}
				}
			}

			const declaredDependencies = extractDeclaredDependencyNames(packageJson);
			const missingDeps = findMissingDependencies({
				usedDependencies,
				declaredDependencies
			});

			for (const dep of missingDeps) {
				findings.push({
					id: MISSING_DEPENDENCY_RULE_ID,
					category: "MissingDependency",
					severity: "error",
					description: `Package '${dep}' is imported but not declared in package.json dependencies.`,
					file: null
				});
			}

			// Step 5 — Inject url-validation-skipped finding when no URL
			if (!moduleUrl) {
				findings.unshift({
					id: "url-validation-skipped",
					category: "Warning",
					severity: "warning",
					description:
						"GitHub URL not available in package.json — clone URL and exception checks were skipped.",
					file: null
				});
			}

			// Step 6 — Assemble result
			const errors = findings.filter((f) => f.severity === "error").length;
			const warnings = findings.filter((f) => f.severity === "warning").length;
			const info = findings.filter((f) => f.severity === "info").length;

			return {
				moduleName,
				moduleRoot,
				analyzedAt: startTime,
				durationMs: Date.now() - startTime,
				moduleUrl,
				findings,
				findingCounts: {
					total: findings.length,
					errors,
					warnings,
					info
				},
				error: null
			};
		} catch (err) {
			return {
				moduleName,
				moduleRoot,
				analyzedAt: startTime,
				durationMs: Date.now() - startTime,
				moduleUrl: null,
				findings: [],
				findingCounts: { total: 0, errors: 0, warnings: 0, info: 0 },
				error: err instanceof Error ? err.message : String(err)
			};
		}
	}
}

// ---------------------------------------------------------------------------
// State store (mirrors log-store.ts pattern)
// ---------------------------------------------------------------------------

let lastResult: ModuleAnalysisResult | null = null;
let socketServer: import("socket.io").Server | null = null;

/**
 * Wires the Socket.IO server instance so setAnalysisResult can push live events.
 *
 * @param {import("socket.io").Server} io
 */
export function attachAnalysisSocketServer(
	io: import("socket.io").Server
): void {
	socketServer = io;
}

/**
 * Returns the most recent analysis result, or null if none is available yet.
 *
 * @returns {ModuleAnalysisResult | null}
 */
export function getLastAnalysisResult(): ModuleAnalysisResult | null {
	return lastResult;
}

/**
 * Clears the stored analysis result.
 */
export function clearAnalysisResult(): void {
	lastResult = null;
}

/**
 * Stores the analysis result and emits it to all connected Socket.IO clients
 * as a "harness:quality-result" event.
 *
 * @param {ModuleAnalysisResult} result
 */
export function setAnalysisResult(result: ModuleAnalysisResult): void {
	lastResult = result;
	if (socketServer) {
		socketServer.emit("harness:quality-result", result);
	}
}
