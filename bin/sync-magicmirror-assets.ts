#!/usr/bin/env -S node --experimental-strip-types

/**
 * Maintainer asset-sync entrypoint for copying MagicMirror CSS and font assets into the sandbox.
 */

import * as fs from "node:fs";
import { createRequire } from "node:module";
import * as path from "pathe";
import { fileURLToPath } from "node:url";
import { transformSync } from "esbuild";
import {
	inlineAndRewriteStylesheet,
	rewriteCssAssetUrls as rewriteCssAssetUrlsFromParser
} from "./helpers/css-bundler.ts";

const MANAGED_ASSET_MANIFEST_FILE = ".magicmirror-managed-assets.json";
const fromOS = (p: string) => p.replace(/\\/g, "/");
const currentFilePath = fromOS(
	/* v8 ignore next 3 */
	typeof __filename === "string"
		? __filename
		: fileURLToPath(import.meta.url)
);
const currentDirPath =
	/* v8 ignore next */
	typeof __dirname === "string" ? fromOS(__dirname) : path.dirname(currentFilePath);
const nodeRequire = createRequire(
	/* v8 ignore next */
	typeof __filename === "string" ? __filename : import.meta.url
);

type CopiedFiles = Map<string, string>;

/**
 * Gets package root.
 */
function getPackageRoot(): string {
	const candidateRoot = path.resolve(currentDirPath, "..");
	return path.basename(candidateRoot) === "dist"
		? path.resolve(candidateRoot, "..")
		: candidateRoot;
}

/**
 * Resolves magic mirror root.
 */
function resolveMagicMirrorRoot(packageRoot = getPackageRoot()): string {
	const magicMirrorEntryPath = nodeRequire.resolve("magicmirror", {
		paths: [packageRoot]
	});
	return path.resolve(path.dirname(magicMirrorEntryPath), "..");
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
 * Gets managed asset manifest path.
 */
function getManagedAssetManifestPath(fontsRoot: string): string {
	return path.join(fontsRoot, MANAGED_ASSET_MANIFEST_FILE);
}

/**
 * Reads managed asset manifest.
 */
function readManagedAssetManifest(fontsRoot: string): string[] {
	const manifestPath = getManagedAssetManifestPath(fontsRoot);
	if (!fs.existsSync(manifestPath)) {
		return [];
	}

	try {
		const parsed = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as {
			files?: unknown;
		};
		return Array.isArray(parsed.files)
			? parsed.files.filter(
					(filePath): filePath is string =>
						typeof filePath === "string"
				)
			: [];
	} catch (_error) {
		return [];
	}
}

/**
 * Writes managed asset manifest.
 */
function writeManagedAssetManifest({
	fontsRoot,
	copiedFiles
}: {
	fontsRoot: string;
	copiedFiles: CopiedFiles;
}): void {
	const manifestPath = getManagedAssetManifestPath(fontsRoot);
	const files = Array.from(copiedFiles.keys())
		.map((destinationPath) => path.relative(fontsRoot, destinationPath))
		.sort();

	fs.writeFileSync(
		manifestPath,
		`${JSON.stringify({ files }, null, 2)}\n`,
		"utf8"
	);
}

/**
 * Clears managed font assets.
 */
function clearManagedFontAssets(fontsRoot: string): void {
	if (!fs.existsSync(fontsRoot)) {
		return;
	}

	for (const relativeAssetPath of readManagedAssetManifest(fontsRoot)) {
		fs.rmSync(path.join(fontsRoot, relativeAssetPath), {
			force: true
		});
	}
	fs.rmSync(getManagedAssetManifestPath(fontsRoot), {
		force: true
	});
}

/**
 * Copies referenced asset.
 */
function copyReferencedAsset({
	assetUrl,
	sourceDirectory,
	targetFontsRoot,
	packageRoot = getPackageRoot(),
	copiedFiles = new Map<string, string>()
}: {
	assetUrl: string;
	sourceDirectory: string;
	targetFontsRoot: string;
	packageRoot?: string;
	copiedFiles?: CopiedFiles;
}): string {
	const normalizedAssetUrl = assetUrl.trim().replace(/^['"]|['"]$/g, "");
	if (
		!normalizedAssetUrl ||
		/^(?:data:|https?:|\/\/|#)/.test(normalizedAssetUrl)
	) {
		return assetUrl;
	}

	let sourceAssetPath = path.resolve(sourceDirectory, normalizedAssetUrl);
	if (
		!fs.existsSync(sourceAssetPath) &&
		normalizedAssetUrl.startsWith("../node_modules/")
	) {
		sourceAssetPath = path.join(
			packageRoot,
			"node_modules",
			normalizedAssetUrl.replace(/^\.\.\/node_modules\//, "")
		);
	}
	if (!fs.existsSync(sourceAssetPath)) {
		throw new Error(
			`[module-sandbox] Missing referenced MagicMirror asset: ${sourceAssetPath}`
		);
	}

	const assetFileName = path.basename(sourceAssetPath);
	const destinationPath = path.join(targetFontsRoot, assetFileName);
	const previousSourcePath = copiedFiles.get(destinationPath);
	if (previousSourcePath && previousSourcePath !== sourceAssetPath) {
		throw new Error(
			`[module-sandbox] Asset name collision while syncing MagicMirror CSS: ${assetFileName}`
		);
	}

	if (!previousSourcePath) {
		fs.copyFileSync(sourceAssetPath, destinationPath);
		copiedFiles.set(destinationPath, sourceAssetPath);
	}

	return `/__harness/fonts/${assetFileName}`;
}

/**
 * Rewrites css asset urls.
 */
function rewriteCssAssetUrls({
	cssSource,
	sourceDirectory,
	targetFontsRoot,
	packageRoot = getPackageRoot(),
	copiedFiles = new Map<string, string>()
}: {
	cssSource: string;
	sourceDirectory: string;
	targetFontsRoot: string;
	packageRoot?: string;
	copiedFiles?: CopiedFiles;
}): string {
	return rewriteCssAssetUrlsFromParser({
		cssSource,
		packageRoot,
		sourceDirectory,
		/**
		 * Rewrites asset url.
		 */
		rewriteAssetUrl: (rawUrl, rawUrlSourceDirectory) =>
			copyReferencedAsset({
				assetUrl: rawUrl,
				sourceDirectory: rawUrlSourceDirectory,
				targetFontsRoot,
				packageRoot,
				copiedFiles
			})
	});
}

/**
 * Internal helper for inline css imports.
 */
function inlineCssImports({
	entryCssPath,
	targetFontsRoot,
	packageRoot = getPackageRoot(),
	copiedFiles = new Map<string, string>()
}: {
	entryCssPath: string;
	targetFontsRoot: string;
	packageRoot?: string;
	copiedFiles?: CopiedFiles;
}): string {
	return inlineAndRewriteStylesheet({
		entryCssPath,
		packageRoot,
		/**
		 * Rewrites asset url.
		 */
		rewriteAssetUrl: (rawUrl, sourceDirectory) =>
			copyReferencedAsset({
				assetUrl: rawUrl,
				sourceDirectory,
				targetFontsRoot,
				packageRoot,
				copiedFiles
			})
	});
}

/**
 * Minifies css source.
 */
function minifyCssSource(cssSource: string): string {
	return transformSync(cssSource, {
		legalComments: "none",
		loader: "css",
		minify: true,
		target: "es2021"
	}).code;
}

/**
 * Writes generated file.
 */
function writeGeneratedFile(filePath: string, contents: string): void {
	fs.writeFileSync(filePath, `${contents.trim()}\n`, "utf8");
}

/**
 * Writes generated css file.
 */
function writeGeneratedCssFile(filePath: string, contents: string): void {
	writeGeneratedFile(filePath, minifyCssSource(contents));
}

/**
 * Synchronizes magic mirror assets.
 */
function syncMagicMirrorAssets({
	packageRoot = getPackageRoot(),
	magicMirrorRoot = resolveMagicMirrorRoot(packageRoot)
}: {
	packageRoot?: string;
	magicMirrorRoot?: string;
} = {}): void {
	const magicMirrorCssRoot = path.join(magicMirrorRoot, "css");
	const clientRoot = path.join(packageRoot, "client");
	const targetFontsRoot = path.join(clientRoot, "fonts");
	const targetStylesRoot = path.join(clientRoot, "styles");
	const copiedFiles = new Map<string, string>();
	const fontsCssPath = path.join(targetStylesRoot, "magicmirror-fonts.css");
	const stageCssPath = path.join(targetStylesRoot, "magicmirror-stage.css");

	ensureDirectory(targetFontsRoot);
	ensureDirectory(targetStylesRoot);
	clearManagedFontAssets(targetFontsRoot);

	const fontsCss = inlineCssImports({
		entryCssPath: path.join(magicMirrorCssRoot, "roboto.css"),
		targetFontsRoot,
		packageRoot,
		copiedFiles
	});
	const fontAwesomeCss = inlineCssImports({
		entryCssPath: path.join(magicMirrorCssRoot, "font-awesome.css"),
		targetFontsRoot,
		packageRoot,
		copiedFiles
	});
	const mainCss = inlineCssImports({
		entryCssPath: path.join(magicMirrorCssRoot, "main.css"),
		targetFontsRoot,
		packageRoot,
		copiedFiles
	});

	writeGeneratedCssFile(
		fontsCssPath,
		[
			"/* Generated from magicmirror/css/roboto.css. Do not edit manually. */",
			fontsCss
		].join("\n\n")
	);
	writeGeneratedCssFile(
		stageCssPath,
		[
			"/* Generated from MagicMirror core CSS. Do not edit manually. */",
			'@import url("/__harness/styles/magicmirror-fonts.css");',
			fontAwesomeCss,
			mainCss
		].join("\n\n")
	);
	writeManagedAssetManifest({
		fontsRoot: targetFontsRoot,
		copiedFiles
	});
}

const isMain = process.argv[1]
	? path.resolve(fromOS(process.argv[1])) === currentFilePath
	: false;

if (isMain) {
	try {
		syncMagicMirrorAssets();
	} catch (error) {
		process.stderr.write(
			`${error instanceof Error ? error.message : String(error)}\n`
		);
		process.exit(1);
	}
}

export {
	clearManagedFontAssets,
	copyReferencedAsset,
	getPackageRoot,
	inlineCssImports,
	getManagedAssetManifestPath,
	readManagedAssetManifest,
	resolveMagicMirrorRoot,
	rewriteCssAssetUrls,
	syncMagicMirrorAssets,
	writeManagedAssetManifest
};

export default {
	clearManagedFontAssets,
	copyReferencedAsset,
	getPackageRoot,
	inlineCssImports,
	getManagedAssetManifestPath,
	readManagedAssetManifest,
	resolveMagicMirrorRoot,
	rewriteCssAssetUrls,
	syncMagicMirrorAssets,
	writeManagedAssetManifest
};
