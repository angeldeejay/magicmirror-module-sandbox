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
};
const magicMirrorCompatTargets = [
	{
		sourceName: "class.js",
		destinationPath: path.join("js", "class.js")
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
		destinationPath: path.join("js", "http_fetcher.js")
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
 * Bundles Express from the magicmirror package's own dependency tree into
 * shims/generated/node_modules/express/index.js so that node_helper.js can
 * require('express') via standard Node module resolution without any source patch.
 */
function bundleExpressForNodeHelper(): void {
	const magicMirrorRoot = resolveMagicMirrorRoot(root);
	const expressEntry = nodeRequire.resolve("express", {
		paths: [magicMirrorRoot]
	});
	const outFile = path.join(
		generatedRoot,
		"node_modules",
		"express",
		"index.js"
	);
	ensureDirectory(path.dirname(outFile));
	buildSync({
		entryPoints: [expressEntry],
		outfile: outFile,
		bundle: true,
		format: "cjs",
		platform: "node",
		target: "node22",
		logLevel: "silent"
	});
}

/**
 * Bundles undici from the magicmirror package's own dependency tree into
 * shims/generated/node_modules/undici/index.js so that server_functions.js can
 * require('undici') via standard Node module resolution without any source patch
 * and without adding undici as a sandbox dependency.
 */
function bundleUndiciForNodeHelper(): void {
	const magicMirrorRoot = resolveMagicMirrorRoot(root);
	const undiciEntry = nodeRequire.resolve("undici", {
		paths: [magicMirrorRoot]
	});
	const outFile = path.join(
		generatedRoot,
		"node_modules",
		"undici",
		"index.js"
	);
	ensureDirectory(path.dirname(outFile));
	buildSync({
		entryPoints: [undiciEntry],
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
function syncMagicMirrorCompatFiles(): void {
	const magicMirrorRoot = resolveMagicMirrorRoot(root);
	const magicMirrorPackagePath = path.join(magicMirrorRoot, "package.json");
	const magicMirrorPackage = JSON.parse(
		fs.readFileSync(magicMirrorPackagePath, "utf8")
	) as {
		version?: unknown;
	};

	for (const {
		sourceName,
		destinationPath,
		transformSource
	} of magicMirrorCompatTargets) {
		const targetPath = path.join(magicMirrorCompatRoot, destinationPath);
		ensureDirectory(path.dirname(targetPath));
		const copiedSource = fs.readFileSync(
			path.join(magicMirrorRoot, "js", sourceName),
			"utf8"
		);
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
				imports: {
					"#server_functions": {
						default: "./js/server_functions.js"
					},
					"#http_fetcher": {
						default: "./js/http_fetcher.js"
					}
				}
			},
			null,
			2
		)}\n`,
		"utf8"
	);
}

/**
 * Builds node compat.
 */
export function buildNodeCompat(): void {
	clearDirectory(generatedRoot);
	ensureDirectory(generatedRoot);
	bundleExpressForNodeHelper();
	bundleUndiciForNodeHelper();
	buildSync({
		entryPoints,
		outdir: generatedRoot,
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
		const generatedEntryPath = path.join(generatedRoot, relativePath);
		rewriteRelativeTypeScriptSpecifiers(generatedEntryPath);
		normalizeCommonJsDefaultExport(generatedEntryPath);
	}

	syncMagicMirrorCompatFiles();
}

const isMain = process.argv[1]
	? path.resolve(fromOS(process.argv[1])) === __filename
	: false;

if (isMain) {
	buildNodeCompat();
}
