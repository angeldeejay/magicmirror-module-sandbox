/**
 * Build browser-facing sandbox client assets from maintained source files.
 *
 * Supported scopes:
 * - all: styles + shell bundle + runtime/vendor browser scripts
 * - styles: compiled harness stylesheet only
 * - shell: Vite shell bundle only
 * - runtime: transpiled browser runtime/vendor scripts only
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildSync } from "esbuild";
import * as sass from "sass";

type BuildScope = "all" | "styles" | "shell" | "runtime";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");
const clientRoot = path.join(root, "client");
const generatedRoot = path.join(clientRoot, "generated");
const stylesInputPath = path.join(clientRoot, "scss", "entrypoint.scss");
const stylesOutputPath = path.join(clientRoot, "styles", "harness.css");
const runtimeEntryPoints = [
	path.join(clientRoot, "runtime.ts"),
	...collectTypeScriptEntries(path.join(clientRoot, "runtime")),
	...collectTypeScriptEntries(path.join(clientRoot, "vendor"))
];

/**
 * Collects type script entries.
 */
function collectTypeScriptEntries(directoryPath: string): string[] {
	if (!fs.existsSync(directoryPath)) {
		return [];
	}

	return fs
		.readdirSync(directoryPath, {
			withFileTypes: true
		})
		.flatMap((entry: import("node:fs").Dirent) => {
			const entryPath = path.join(directoryPath, entry.name);
			if (entry.isDirectory()) {
				return collectTypeScriptEntries(entryPath);
			}
			return entry.name.endsWith(".ts") ? [entryPath] : [];
		});
}

/**
 * Ensures directory.
 */
function ensureDirectory(directoryPath: string): void {
	fs.mkdirSync(directoryPath, {
		recursive: true
	});
}

/**
 * Clears runtime outputs.
 */
function clearRuntimeOutputs(): void {
	fs.rmSync(path.join(generatedRoot, "runtime"), {
		force: true,
		recursive: true
	});
	fs.rmSync(path.join(generatedRoot, "vendor"), {
		force: true,
		recursive: true
	});
	fs.rmSync(path.join(generatedRoot, "runtime.js"), {
		force: true
	});
}

/**
 * Builds styles.
 */
function buildStyles(): void {
	const result = sass.compile(stylesInputPath, {
		style: "compressed",
		sourceMap: false
	});
	ensureDirectory(path.dirname(stylesOutputPath));
	fs.writeFileSync(stylesOutputPath, result.css, "utf8");
}

/**
 * Builds shell.
 */
async function buildShell(): Promise<void> {
	const { build } = await import("vite");
	const viteConfigModule = await import(
		pathToFileURL(path.join(root, "vite.config.mjs")).href
	);
	await build(viteConfigModule.default);
}

/**
 * Builds runtime.
 */
function buildRuntime(): void {
	clearRuntimeOutputs();
	ensureDirectory(generatedRoot);
	buildSync({
		entryPoints: runtimeEntryPoints,
		outdir: generatedRoot,
		outbase: clientRoot,
		bundle: false,
		legalComments: "none",
		logLevel: "silent",
		target: "es2021"
	});
}

/**
 * Parses scope.
 */
function parseScope(argv: string[]): BuildScope {
	const scopeFlagIndex = argv.indexOf("--scope");
	if (scopeFlagIndex === -1) {
		return "all";
	}
	const nextValue = argv[scopeFlagIndex + 1];
	if (
		nextValue === "styles" ||
		nextValue === "shell" ||
		nextValue === "runtime" ||
		nextValue === "all"
	) {
		return nextValue;
	}
	throw new Error(
		`Unsupported client asset build scope: ${String(nextValue || "")}`
	);
}

/**
 * Internal helper for main.
 */
async function main(): Promise<void> {
	const scope = parseScope(process.argv.slice(2));
	if (scope === "styles" || scope === "all") {
		buildStyles();
	}
	if (scope === "runtime" || scope === "all") {
		buildRuntime();
	}
	if (scope === "shell" || scope === "all") {
		await buildShell();
	}
}

main().catch((error: unknown) => {
	console.error("[module-sandbox] failed to build client assets", error);
	process.exitCode = 1;
});
