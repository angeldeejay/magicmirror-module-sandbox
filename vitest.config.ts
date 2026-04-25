/**
 * Root Vitest configuration for all maintained sandbox-owned suites.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, defineProject } from "vitest/config";
import {
	getBrowserInspectionOptions,
	getBrowserWorkerConfig
} from "./tests/_helpers/browser-inspection.ts";

const repoRoot = path.dirname(fileURLToPath(import.meta.url));
const knownProjects = new Set(["unit", "e2e", "integration", "ui"]);

function getRequestedProjects(argv = process.argv): Set<string> {
	const projects = new Set<string>();

	for (let index = 0; index < argv.length; index += 1) {
		const entry = argv[index];
		if (entry === "--project") {
			const nextValue = argv[index + 1];
			if (nextValue && knownProjects.has(nextValue)) {
				projects.add(nextValue);
			}
			continue;
		}

		if (entry.startsWith("--project=")) {
			const projectName = entry.slice("--project=".length);
			if (knownProjects.has(projectName)) {
				projects.add(projectName);
			}
		}
	}

	return projects;
}

function shouldIncludeProject(
	requestedProjects: Set<string>,
	projectName: string
): boolean {
	return requestedProjects.size === 0 || requestedProjects.has(projectName);
}

/**
 * Root Vitest config for all sandbox-owned suites.
 *
 * Projects keep the suite-specific behavior in one place while npm scripts use
 * Vitest's native `--project` selection instead of a custom runner.
 */
export default defineConfig(async () => {
	const requestedProjects = getRequestedProjects();
	const projects = [];
	const browserInspectionOptions = getBrowserInspectionOptions();
	const browserWorkerConfig = getBrowserWorkerConfig(
		{
			fileParallelism: true,
			maxWorkers: 4,
			minWorkers: 2
		},
		browserInspectionOptions
	);

	if (shouldIncludeProject(requestedProjects, "unit")) {
		projects.push(
			defineProject({
				extends: true,
				test: {
					name: "unit",
					environment: "node",
					globals: true,
					setupFiles: [
						path.join(
							repoRoot,
							"tests",
							"unit",
							"vitest-setup.unit.ts"
						)
					],
					include: [
						path.posix.join("tests", "unit", "**", "*.test.ts")
					]
				}
			})
		);
	}

	if (shouldIncludeProject(requestedProjects, "e2e")) {
		projects.push(
			defineProject({
				extends: true,
				test: {
					name: "e2e",
					environment: "node",
					globals: true,
					include: [
						path.posix.join("tests", "e2e", "**", "*.e2e.test.ts")
					],
					globalSetup: [
						path.join(
							repoRoot,
							"tests",
							"e2e",
							"vitest-setup.e2e.ts"
						)
					],
					fileParallelism: true,
					maxWorkers: 2,
					minWorkers: 2,
					testTimeout: 120_000,
					hookTimeout: 120_000
				}
			})
		);
	}

	if (
		shouldIncludeProject(requestedProjects, "integration") ||
		shouldIncludeProject(requestedProjects, "ui")
	) {
		const { playwright } = await import("@vitest/browser-playwright");
		const { createSandboxBrowserCommands } =
			await import("./tests/_helpers/commands/create-browser-commands.ts");
		const browserProvider = playwright({
			actionTimeout: 5_000,
			launchOptions:
				browserInspectionOptions.slowMo > 0
					? {
							slowMo: browserInspectionOptions.slowMo
						}
					: undefined
		});

		if (shouldIncludeProject(requestedProjects, "integration")) {
			projects.push(
				defineProject({
					extends: true,
					test: {
						name: "integration",
						include: [
							path.posix.join(
								"tests",
								"integration",
								"**",
								"*.browser.test.ts"
							)
						],
						...browserWorkerConfig,
						testTimeout: 120_000,
						hookTimeout: 120_000,
						browser: {
							enabled: true,
							headless: browserInspectionOptions.headless,
							provider: browserProvider,
							instances: [
								{
									browser: "chromium"
								}
							],
							commands:
								createSandboxBrowserCommands("integration"),
							viewport: {
								width: 1440,
								height: 960
							}
						}
					} as any
				})
			);
		}

		if (shouldIncludeProject(requestedProjects, "ui")) {
			projects.push(
				defineProject({
					extends: true,
					test: {
						name: "ui",
						include: [
							path.posix.join(
								"tests",
								"ui",
								"**",
								"*.browser.test.ts"
							)
						],
						...browserWorkerConfig,
						testTimeout: 120_000,
						hookTimeout: 120_000,
						browser: {
							enabled: true,
							headless: browserInspectionOptions.headless,
							provider: browserProvider,
							instances: [
								{
									browser: "chromium"
								}
							],
							commands: createSandboxBrowserCommands("ui"),
							viewport: {
								width: 1440,
								height: 960
							}
						}
					} as any
				})
			);
		}
	}

	return {
		root: repoRoot,
		test: {
			reporters: [
				"default",
				path.join(
					repoRoot,
					"tests",
					"_helpers",
					"journey-coverage.reporter.ts"
				)
			],
			globalSetup: [
				path.join(repoRoot, "tests", "vitest-global-setup.ts")
			],
			coverage: {
				exclude: ["shims/generated/**"],
				provider: "v8",
				reportOnFailure: true,
				reporter: ["text-summary", "json-summary", "json"],
				thresholds: {
					lines: 80,
					functions: 80,
					branches: 80,
					statements: 80
				}
			},
			projects
		}
	};
});
