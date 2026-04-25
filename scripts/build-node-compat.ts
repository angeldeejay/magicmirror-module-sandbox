/**
 * Build script that generates CommonJS shim wrappers for MagicMirror compatibility modules.
 */

import * as fs from "node:fs";
import { createRequire } from "node:module";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { buildSync, transformSync } from "esbuild";

const __filename = fileURLToPath(import.meta.url);
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
type SourceReplacement = {
	searchValue: string;
	replaceValue: string;
	label: string;
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
 * Ensures directory.
 */
function ensureDirectory(directoryPath: string): void {
	fs.mkdirSync(directoryPath, {
		recursive: true
	});
}

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
 * Resolves magic mirror root.
 */
function resolveMagicMirrorRoot(): string {
	const magicMirrorEntryPath = nodeRequire.resolve("magicmirror", {
		paths: [root]
	});
	return path.resolve(path.dirname(magicMirrorEntryPath), "..");
}

/**
 * Loads a patch template.
 */
function loadPatchTemplate(templateName: string): string {
	return fs.readFileSync(path.join(templatesRoot, templateName), "utf8");
}

/**
 * Renders a patch template with string replacements.
 */
function renderPatchTemplate(
	templateName: string,
	replacements: Record<string, string> = {}
): string {
	let rendered = loadPatchTemplate(templateName);
	for (const [placeholder, value] of Object.entries(replacements)) {
		rendered = rendered.replaceAll(placeholder, value);
	}

	return rendered;
}

/**
 * Loads source replacements.
 */
function loadSourceReplacements(templateName: string): SourceReplacement[] {
	return JSON.parse(loadPatchTemplate(templateName)) as SourceReplacement[];
}

/**
 * Applies declarative source replacements.
 */
function applySourceReplacements(
	source: string,
	replacements: SourceReplacement[]
): string {
	let rewrittenSource = source;
	for (const { searchValue, replaceValue, label } of replacements) {
		if (!rewrittenSource.includes(searchValue)) {
			throw new Error(
				`Could not adapt ${label} because the expected source snippet was not found.`
			);
		}
		rewrittenSource = rewrittenSource.replace(searchValue, replaceValue);
	}

	return rewrittenSource;
}

/**
 * Adapts core logger source.
 */
function adaptCoreLoggerSource(source: string): string {
	const rewrittenSource = applySourceReplacements(
		source,
		loadSourceReplacements("core-logger-replacements.json")
	);

	return `${rewrittenSource}
${renderPatchTemplate("core-logger-postlude.js", {
	__HELPER_LOG_METHODS__: JSON.stringify(helperLogMethods)
})}`;
}

/**
 * Adapts core node helper source.
 */
function adaptCoreNodeHelperSource(source: string): string {
	const rewrittenSource = applySourceReplacements(
		source,
		loadSourceReplacements("core-node-helper-replacements.json")
	);

	return `${rewrittenSource}
${renderPatchTemplate("core-node-helper-postlude.js")}`;
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
	const magicMirrorRoot = resolveMagicMirrorRoot();
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
	? path.resolve(process.argv[1]) === __filename
	: false;

if (isMain) {
	buildNodeCompat();
}
