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
import * as path from "pathe";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildSync } from "esbuild";
import * as sass from "sass";
import { ensureDirectory, fromOS } from "./shared.ts";

type BuildScope = "all" | "styles" | "shell" | "runtime";

const __filename = fromOS(fileURLToPath(import.meta.url));
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");
const clientRoot = path.join(root, "client");
const generatedRoot = path.join(clientRoot, "generated");
const stylesInputPath = path.join(clientRoot, "scss", "entrypoint.scss");
const stylesOutputPath = path.join(clientRoot, "styles", "harness.css");
const stageIsolationInputPath = path.join(
	clientRoot,
	"scss",
	"stage-isolation.scss"
);
const stageIsolationOutputPath = path.join(
	generatedRoot,
	"stage-isolation.css"
);
const runtimeEntryPoints = [
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
	// Left over from the retired hand-port runtime bootstrap.
	fs.rmSync(path.join(generatedRoot, "runtime.js"), {
		force: true
	});
	fs.rmSync(path.join(generatedRoot, "stage-observer.js"), {
		force: true
	});
}

/**
 * Syncs Font Awesome webfonts from node_modules into client/webfonts/ for the
 * shell: `harness.css` (`client/scss/_fontawesome.scss`) loads
 * `../webfonts/fa-solid-900.woff2`, served at `/__harness/webfonts/`.
 * This keeps the copied fonts aligned with the installed FA version.
 */
function syncFontAwesomeWebfonts(): void {
	const sourceDir = path.join(
		root,
		"node_modules",
		"@fortawesome",
		"fontawesome-free",
		"webfonts"
	);
	const destDir = path.join(clientRoot, "webfonts");
	ensureDirectory(destDir);
	for (const file of fs.readdirSync(sourceDir)) {
		if (file.endsWith(".woff2")) {
			fs.copyFileSync(
				path.join(sourceDir, file),
				path.join(destDir, file)
			);
		}
	}
}

/**
 * Syncs Open Sans webfonts (latin + latin-ext, normal only) from node_modules
 * into client/webfonts/ so the harness UI font is available at runtime.
 */
function syncOpenSansWebfonts(): void {
	const sourceDir = path.join(
		root,
		"node_modules",
		"@fontsource",
		"open-sans",
		"files"
	);
	const destDir = path.join(clientRoot, "webfonts");
	ensureDirectory(destDir);
	const subsets = ["latin", "latin-ext"];
	const weights = ["300", "400", "600", "700"];
	for (const file of fs.readdirSync(sourceDir)) {
		if (
			file.endsWith(".woff2") &&
			subsets.some((s) => file.includes(`-${s}-`)) &&
			weights.some((w) => file.includes(`-${w}-`)) &&
			file.includes("-normal.")
		) {
			fs.copyFileSync(
				path.join(sourceDir, file),
				path.join(destDir, file)
			);
		}
	}
}

/**
 * Builds styles.
 */
function buildStyles(): void {
	syncFontAwesomeWebfonts();
	syncOpenSansWebfonts();
	const result = sass.compile(stylesInputPath, {
		style: "compressed",
		sourceMap: false
	});
	ensureDirectory(path.dirname(stylesOutputPath));
	fs.writeFileSync(stylesOutputPath, result.css, "utf8");
	buildStageIsolationStyles();
}

/**
 * Compiles the stage isolation stylesheet, which the stage page
 * links from its injection block (`/__harness/generated/stage-isolation.css`).
 */
function buildStageIsolationStyles(): void {
	const result = sass.compile(stageIsolationInputPath, {
		style: "compressed",
		sourceMap: false
	});
	ensureDirectory(generatedRoot);
	fs.writeFileSync(stageIsolationOutputPath, result.css, "utf8");
}

/**
 * Builds shell.
 */
async function buildShell(): Promise<void> {
	const { build } = await import("vite");
	const viteConfigModule = await import(
		pathToFileURL(path.join(root, "vite.config.ts")).href
	);
	await build(viteConfigModule.default);
}

/**
 * Copies Ace Editor vendor files (core + JS mode) into generated/vendor/ so
 * they can be served as static scripts without bundling.
 */
function syncAceVendorFiles(): void {
	const aceRoot = path.join(
		root,
		"node_modules",
		"ace-builds",
		"src-noconflict"
	);
	const destDir = path.join(generatedRoot, "vendor");
	ensureDirectory(destDir);
	for (const [src, dest] of [
		["ace.js", "ace.js"],
		["mode-javascript.js", "ace-mode-javascript.js"]
	] as const) {
		fs.copyFileSync(path.join(aceRoot, src), path.join(destDir, dest));
	}
}

/**
 * Bundles js-beautify + its wrapper into a single browser-ready script that
 * exposes window.js_beautify. Uses bundle:true only for this file.
 */
function buildJsBeautifyBundle(): void {
	const destDir = path.join(generatedRoot, "vendor");
	ensureDirectory(destDir);
	buildSync({
		entryPoints: [path.join(clientRoot, "vendor", "js-beautify-bundle.ts")],
		outfile: path.join(destDir, "js-beautify.js"),
		bundle: true,
		legalComments: "none",
		logLevel: "silent",
		target: "es2021"
	});
}

/**
 * Bundles jsonc-parser into a browser-ready script that exposes window.jsoncParser.
 */
function buildJsoncParserBundle(): void {
	const destDir = path.join(generatedRoot, "vendor");
	ensureDirectory(destDir);
	buildSync({
		entryPoints: [path.join(clientRoot, "vendor", "jsonc-parser-bundle.ts")],
		outfile: path.join(destDir, "jsonc-parser.js"),
		bundle: true,
		legalComments: "none",
		logLevel: "silent",
		target: "es2021"
	});
}

/**
 * Bundles the stage observer into one classic script
 * (`generated/stage-observer.js`), injected before the core scripts.
 */
function buildStageObserverBundle(): void {
	ensureDirectory(generatedRoot);
	buildSync({
		entryPoints: [path.join(clientRoot, "stage-observer", "index.ts")],
		outfile: path.join(generatedRoot, "stage-observer.js"),
		bundle: true,
		format: "iife",
		legalComments: "none",
		logLevel: "silent",
		target: "es2021"
	});
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
	syncAceVendorFiles();
	buildJsBeautifyBundle();
	buildJsoncParserBundle();
	buildStageObserverBundle();
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
