/**
 * Build script that generates CommonJS shim wrappers for MagicMirror compatibility modules.
 */

import * as fs from "node:fs";
import { createRequire } from "node:module";
import * as path from "pathe";
import { fileURLToPath } from "node:url";
import { buildSync, transformSync } from "esbuild";
import { ensureDirectory, fromOS, resolveMagicMirrorRoot } from "./shared.ts";

const __filename = fromOS(fileURLToPath(import.meta.url));
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");
const shimsRoot = path.join(root, "shims");
const templatesRoot = path.join(root, "scripts", "templates");
const generatedRoot = path.join(shimsRoot, "generated");
const nodeRequire = createRequire(import.meta.url);
const entryPoints = ["logger.ts", "node_helper.ts"].map((fileName) =>
	path.join(shimsRoot, fileName)
);
const magicMirrorCompatRoot = path.join(generatedRoot, "magicmirror-core");
type MagicMirrorCompatTarget = {
	sourceName: string;
	destinationPath: string;
	transformSource?: (source: string) => string;
	optional?: boolean;
};
const magicMirrorCompatTargets = [
	{
		// Removed in MagicMirror 2.37.0, when node_helper became an ES6 class.
		sourceName: "class.js",
		destinationPath: path.join("js", "class.js"),
		optional: true
	},
	{
		sourceName: "logger.js",
		destinationPath: path.join("js", "logger.js"),
		transformSource: adaptCoreLoggerSource
	},
	{
		sourceName: "node_helper.js",
		destinationPath: path.join("js", "node_helper.js"),
		transformSource: adaptCoreNodeHelperSource
	},
	{
		sourceName: "http_fetcher.js",
		destinationPath: path.join("js", "http_fetcher.js"),
		optional: true
	},
	{
		sourceName: "server_functions.js",
		destinationPath: path.join("js", "server_functions.js")
	}
] satisfies MagicMirrorCompatTarget[];

const helperLogMethods = [
	"debug",
	"log",
	"info",
	"warn",
	"error",
	"group",
	"groupCollapsed",
	"groupEnd",
	"time",
	"timeEnd",
	"timeStamp"
];

/**
 * Clears directory.
 */
function clearDirectory(directoryPath: string): void {
	fs.rmSync(directoryPath, {
		recursive: true,
		force: true,
		maxRetries: 10,
		retryDelay: 50
	});
}

/**
 * Loads a template file from the templates directory.
 */
function loadTemplate(templateName: string): string {
	return fs.readFileSync(path.join(templatesRoot, templateName), "utf8");
}

/**
 * Renders a template with string replacements.
 */
function renderTemplate(
	templateName: string,
	replacements: Record<string, string> = {}
): string {
	let rendered = loadTemplate(templateName);
	for (const [placeholder, value] of Object.entries(replacements)) {
		rendered = rendered.replaceAll(placeholder, value);
	}

	return rendered;
}

/**
 * Adapts core logger source: appends sandbox postlude (log forwarding, setLogLevel re-wrap).
 * No source patches applied — fidelity principle.
 */
function adaptCoreLoggerSource(source: string): string {
	return `${source}\n${renderTemplate("core-logger-postlude.js", {
		__HELPER_LOG_METHODS__: JSON.stringify(helperLogMethods)
	})}`;
}

/**
 * Adapts core node_helper source: appends sandbox postlude (socket namespace rewiring).
 * No source patches applied — fidelity principle.
 */
function adaptCoreNodeHelperSource(source: string): string {
	return `${source}\n${renderTemplate("core-node-helper-postlude.js")}`;
}

/**
 * Third-party packages the copied core files require at runtime: `express`
 * (node_helper.js), `undici` and `ipaddr.js` (server_functions.js).
 */
const coreRuntimeDependencies = ["express", "undici", "ipaddr.js"];

/**
 * Bundles one package from the magicmirror package's own dependency tree into
 * <outputRoot>/node_modules/<name>/index.js, so the copied core files can
 * require it through standard Node module resolution without any source patch
 * and without adding it as a sandbox dependency. This matters for mmvm shims
 * under ~/.mmvm/shims/<version>/, which have no parent node_modules to fall
 * back on.
 */
function bundleCoreDependency(
	packageName: string,
	magicMirrorRoot: string,
	outputRoot: string
): void {
	const entry = nodeRequire.resolve(packageName, {
		paths: [magicMirrorRoot]
	});
	const outFile = path.join(
		outputRoot,
		"node_modules",
		packageName,
		"index.js"
	);
	ensureDirectory(path.dirname(outFile));
	buildSync({
		entryPoints: [entry],
		outfile: outFile,
		bundle: true,
		format: "cjs",
		platform: "node",
		target: "node22",
		logLevel: "silent"
	});
}

/**
 * Rewrites relative type script specifiers.
 */
function rewriteRelativeTypeScriptSpecifiers(filePath: string): void {
	const source = fs.readFileSync(filePath, "utf8");
	const rewritten = source
		.replace(
			/(require\(\s*["'])(\.[^"']+?)\.(ts|tsx)(["']\s*\))/g,
			"$1$2.js$4"
		)
		.replace(
			/(import\(\s*["'])(\.[^"']+?)\.(ts|tsx)(["']\s*\))/g,
			"$1$2.js$4"
		)
		.replace(/(from\s+["'])(\.[^"']+?)\.(ts|tsx)(["'])/g, "$1$2.js$4");

	if (rewritten !== source) {
		fs.writeFileSync(filePath, rewritten, "utf8");
	}
}

/**
 * Normalizes common js default export.
 */
function normalizeCommonJsDefaultExport(filePath: string): void {
	const source = fs.readFileSync(filePath, "utf8");
	const normalized = `${source}
const __moduleSandboxCompatExport = module.exports && "default" in module.exports
	? module.exports.default
	: module.exports;
module.exports = __moduleSandboxCompatExport;
module.exports.default = __moduleSandboxCompatExport;
`;
	fs.writeFileSync(filePath, normalized, "utf8");
}

/**
 * Synchronizes magic mirror compat files.
 */
function syncMagicMirrorCompatFiles(
	magicMirrorRoot: string,
	magicMirrorCompatRoot: string
): void {
	const magicMirrorPackagePath = path.join(magicMirrorRoot, "package.json");
	const magicMirrorPackage = JSON.parse(
		fs.readFileSync(magicMirrorPackagePath, "utf8")
	) as {
		version?: unknown;
	};

	const copiedTargets: string[] = [];
	for (const {
		sourceName,
		destinationPath,
		transformSource,
		optional
	} of magicMirrorCompatTargets) {
		const sourcePath = path.join(magicMirrorRoot, "js", sourceName);
		if (!fs.existsSync(sourcePath)) {
			if (optional) continue;
			throw new Error(`Required MM source file missing: ${sourcePath}`);
		}
		const targetPath = path.join(magicMirrorCompatRoot, destinationPath);
		ensureDirectory(path.dirname(targetPath));
		const copiedSource = fs.readFileSync(sourcePath, "utf8");
		const minified = transformSync(
			typeof transformSource === "function"
				? transformSource(copiedSource)
				: copiedSource,
			{
				legalComments: "none",
				loader: "js",
				minify: true,
				target: "es2021"
			}
		);
		fs.writeFileSync(targetPath, minified.code, "utf8");
		copiedTargets.push(sourceName);
	}

	const importsMap: Record<string, { default: string }> = {};
	if (copiedTargets.includes("server_functions.js")) {
		importsMap["#server_functions"] = {
			default: "./js/server_functions.js"
		};
	}
	if (copiedTargets.includes("http_fetcher.js")) {
		importsMap["#http_fetcher"] = { default: "./js/http_fetcher.js" };
	}

	fs.writeFileSync(
		path.join(magicMirrorCompatRoot, "package.json"),
		`${JSON.stringify(
			{
				name: "magicmirror-core-compat",
				version:
					typeof magicMirrorPackage.version === "string"
						? magicMirrorPackage.version
						: "",
				type: "commonjs",
				imports: importsMap
			},
			null,
			2
		)}\n`,
		"utf8"
	);
}

export type BuildNodeCompatOptions = {
	/** Override the MagicMirror package root (js/ parent). Defaults to installed magicmirror in node_modules. */
	mmRoot?: string;
	/** Override the output directory for generated shims. Defaults to shims/generated/. */
	outputRoot?: string;
};

/**
 * Builds node compat shims.
 * Accepts optional overrides for the MM source root and output directory to
 * support the mmvm version manager (multiple MM versions in ~/.mmvm/).
 */
export function buildNodeCompat(options: BuildNodeCompatOptions = {}): void {
	const effectiveMmRoot = options.mmRoot ?? resolveMagicMirrorRoot(root);
	const effectiveOutputRoot = options.outputRoot ?? generatedRoot;
	const effectiveCompatRoot = path.join(
		effectiveOutputRoot,
		"magicmirror-core"
	);

	clearDirectory(effectiveOutputRoot);
	ensureDirectory(effectiveOutputRoot);
	for (const packageName of coreRuntimeDependencies) {
		bundleCoreDependency(packageName, effectiveMmRoot, effectiveOutputRoot);
	}
	buildSync({
		entryPoints,
		outdir: effectiveOutputRoot,
		outbase: shimsRoot,
		bundle: false,
		format: "cjs",
		minify: true,
		platform: "node",
		packages: "external",
		target: "node22.21",
		logLevel: "silent"
	});

	for (const entryPoint of entryPoints) {
		const relativePath = path
			.relative(shimsRoot, entryPoint)
			.replace(/\.ts$/, ".js");
		const generatedEntryPath = path.join(effectiveOutputRoot, relativePath);
		rewriteRelativeTypeScriptSpecifiers(generatedEntryPath);
		normalizeCommonJsDefaultExport(generatedEntryPath);
	}

	syncMagicMirrorCompatFiles(effectiveMmRoot, effectiveCompatRoot);
}

const isMain = process.argv[1]
	? path.resolve(fromOS(process.argv[1])) === __filename
	: false;

if (isMain) {
	buildNodeCompat();
}
