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
import { createRequire } from "node:module";
import * as path from "pathe";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildSync } from "esbuild";
import * as sass from "sass";
import { ensureDirectory, fromOS, resolveMagicMirrorRoot } from "./shared.ts";

type BuildScope = "all" | "styles" | "shell" | "runtime";

const __filename = fromOS(fileURLToPath(import.meta.url));
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");
const clientRoot = path.join(root, "client");
const generatedRoot = path.join(clientRoot, "generated");
const nodeRequire = createRequire(import.meta.url);
const stylesInputPath = path.join(clientRoot, "scss", "entrypoint.scss");
const stylesOutputPath = path.join(clientRoot, "styles", "harness.css");
const runtimeEntryPoints = [
	path.join(clientRoot, "runtime.ts"),
	...collectTypeScriptEntries(path.join(clientRoot, "runtime")),
	...collectTypeScriptEntries(path.join(clientRoot, "vendor"))
];
const coreBrowserVendorAssets = [
	"croner.js",
	"moment.js",
	"moment-timezone.js",
	"nunjucks.js"
] as const;

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
	fs.rmSync(path.join(generatedRoot, "runtime.js"), {
		force: true
	});
}

/**
 * Copies browser vendor assets from the local MagicMirror dependency using the
 * core vendor map so the sandbox stays aligned with upstream browser runtime
 * choices.
 */
function resolveCoreVendorAssetPath(
	magicMirrorRoot: string,
	sourceRelativePath: string
): string {
	const candidatePaths = [
		path.join(magicMirrorRoot, sourceRelativePath),
		path.join(root, sourceRelativePath)
	];
	const resolvedPath = candidatePaths.find((candidatePath) =>
		fs.existsSync(candidatePath)
	);
	if (!resolvedPath) {
		throw new Error(
			`MagicMirror vendor asset could not be resolved: ${sourceRelativePath}.`
		);
	}

	return resolvedPath;
}

/**
 * Copies browser vendor assets from the local MagicMirror dependency using the
 * core vendor map so the sandbox stays aligned with upstream browser runtime
 * choices.
 */
function syncCoreBrowserVendorAssets(): void {
	const magicMirrorRoot = resolveMagicMirrorRoot(root);
	const magicMirrorVendorMapPath = path.join(
		magicMirrorRoot,
		"js",
		"vendor.js"
	);
	const magicMirrorVendorMap = nodeRequire(
		magicMirrorVendorMapPath
	) as Record<string, string>;
	for (const assetName of coreBrowserVendorAssets) {
		const sourceRelativePath = magicMirrorVendorMap[assetName];
		if (typeof sourceRelativePath !== "string" || !sourceRelativePath) {
			throw new Error(
				`MagicMirror vendor map does not define a source for ${assetName}.`
			);
		}
		const sourcePath = resolveCoreVendorAssetPath(
			magicMirrorRoot,
			sourceRelativePath
		);
		const destinationPath = path.join(generatedRoot, "vendor", assetName);
		ensureDirectory(path.dirname(destinationPath));
		fs.copyFileSync(sourcePath, destinationPath);
	}
}

/**
 * Syncs Font Awesome webfonts from node_modules into client/webfonts/.
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
 * Copies Font Awesome all.min.css from node_modules into client/styles/ so
 * the runtime can serve it without a prod dependency on the npm package.
 */
function syncFontAwesomeCss(): void {
	const sourcePath = path.join(
		root,
		"node_modules",
		"@fortawesome",
		"fontawesome-free",
		"css",
		"all.min.css"
	);
	const destPath = path.join(clientRoot, "styles", "font-awesome.css");
	ensureDirectory(path.dirname(destPath));
	fs.copyFileSync(sourcePath, destPath);
}

/**
 * Builds styles.
 */
function buildStyles(): void {
	syncFontAwesomeWebfonts();
	syncOpenSansWebfonts();
	syncFontAwesomeCss();
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
	syncCoreBrowserVendorAssets();
	syncAceVendorFiles();
	buildJsBeautifyBundle();
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
