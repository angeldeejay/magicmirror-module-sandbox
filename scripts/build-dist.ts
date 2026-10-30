/**
 * Build the publishable `dist/` package contents for npm distribution.
 *
 * The script copies runtime assets, server code, shims, and the built-in
 * MagicMirror core's browser files (`dist/core/`, see `package-core.ts`), then
 * minifies the sandbox's own browser JavaScript and CSS so installed consumers
 * only receive the lean runtime package.
 */
import * as fs from "node:fs";
import * as path from "pathe";
import { fileURLToPath } from "node:url";
import { buildSync, transformSync } from "esbuild";
import { buildNodeCompat } from "./build-node-compat.ts";
import {
	distCopyTargets,
	distCoreDirectory,
	distScriptSources
} from "./dist-layout.ts";
import {
	packageBuiltInCore,
	packageCoreServerDependencies
} from "./package-core.ts";
import { getBuiltInMmVersion } from "../server/mm-version-manager.ts";
import { resolveBuiltInCoreRoot } from "../server/stage/core-root.ts";
import { ensureDirectory, fromOS } from "./shared.ts";

const __filename = fromOS(fileURLToPath(import.meta.url));
const __dirname = path.dirname(__filename);
const root: string = path.resolve(__dirname, "..");
const distRoot: string = path.join(root, "dist");
const distClientRoot: string = path.join(distRoot, "client");

const nodeEntryTargets: string[] = [
	path.join("bin", "magicmirror-module-sandbox.ts"),
	path.join("bin", "install-guard.ts"),
	path.join("bin", "sync-magicmirror-assets.ts")
];
const nodeSourceDirectories: string[] = ["config", "server", "shims"];

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
 * Copies target.
 */
function copyTarget(relativePath: string): void {
	const sourcePath = path.join(root, relativePath);
	const destinationPath = path.join(distRoot, relativePath);

	ensureDirectory(path.dirname(destinationPath));
	fs.cpSync(sourcePath, destinationPath, {
		recursive: true
	});
}

/**
 * Gets files matching an extension.
 */
function getFilesByExtension(
	directoryPath: string,
	extension: string
): string[] {
	return fs
		.readdirSync(directoryPath, {
			withFileTypes: true
		})
		.flatMap((entry: import("node:fs").Dirent) => {
			const entryPath = path.join(directoryPath, entry.name);
			if (entry.isDirectory()) {
				return getFilesByExtension(entryPath, extension);
			}
			return entry.name.endsWith(extension) ? [entryPath] : [];
		});
}

/**
 * Gets type script files.
 */
function getTypeScriptFiles(directoryPath: string): string[] {
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
				return getTypeScriptFiles(entryPath);
			}
			return entry.name.endsWith(".ts") ? [entryPath] : [];
		});
}

/**
 * Rewrites relative type script specifiers.
 */
function rewriteRelativeTypeScriptSpecifiers(
	filePath: string,
	outputExtension = ".js"
): void {
	const source = fs.readFileSync(filePath, "utf8");
	const rewritten = source
		.replace(
			/(require\(\s*["'])(\.[^"']+?)\.(ts|tsx)(["']\s*\))/g,
			`$1$2${outputExtension}$4`
		)
		.replace(
			/(import\(\s*["'])(\.[^"']+?)\.(ts|tsx)(["']\s*\))/g,
			`$1$2${outputExtension}$4`
		)
		.replace(
			/(from\s+["'])(\.[^"']+?)\.(ts|tsx)(["'])/g,
			`$1$2${outputExtension}$4`
		)
		.replace(
			/(require\(\s*["'])(\.[^"']+?)\.js(["']\s*\))/g,
			`$1$2${outputExtension}$3`
		)
		.replace(
			/(import\(\s*["'])(\.[^"']+?)\.js(["']\s*\))/g,
			`$1$2${outputExtension}$3`
		)
		.replace(
			/(from\s+["'])(\.[^"']+?)\.js(["'])/g,
			`$1$2${outputExtension}$3`
		);

	if (rewritten !== source) {
		fs.writeFileSync(filePath, rewritten, "utf8");
	}
}

/**
 * Minifies client java script.
 */
function minifyClientJavaScript(): void {
	getFilesByExtension(distClientRoot, ".js").forEach((filePath) => {
		const source = fs.readFileSync(filePath, "utf8");
		const result = transformSync(source, {
			loader: "js",
			legalComments: "none",
			minify: true,
			target: "es2021"
		});
		ensureDirectory(path.dirname(filePath));
		fs.writeFileSync(filePath, result.code);
	});
}

/**
 * Minifies dist css assets. The packaged core (`dist/core/`) is left as is:
 * core files are served verbatim.
 */
function minifyDistCss(): void {
	const packagedCoreRoot = path.join(distRoot, distCoreDirectory);
	getFilesByExtension(distRoot, ".css").forEach((filePath) => {
		if (filePath.startsWith(`${packagedCoreRoot}/`)) {
			return;
		}
		const source = fs.readFileSync(filePath, "utf8");
		const result = transformSync(source, {
			loader: "css",
			legalComments: "none",
			minify: true,
			target: "es2021"
		});
		ensureDirectory(path.dirname(filePath));
		fs.writeFileSync(filePath, result.code);
	});
}

/**
 * Transpiles node source trees.
 */
function transpileNodeSourceTrees(): void {
	const entryPoints = [
		...nodeSourceDirectories.flatMap((relativePath) => {
			return getTypeScriptFiles(path.join(root, relativePath));
		}),
		...distScriptSources.map((relativePath) => path.join(root, relativePath))
	];
	if (!entryPoints.length) {
		return;
	}

	buildSync({
		entryPoints,
		outdir: distRoot,
		outbase: root,
		bundle: false,
		format: "cjs",
		minify: true,
		outExtension: {
			".js": ".cjs"
		},
		platform: "node",
		packages: "external",
		target: "node22.21",
		logLevel: "silent"
	});

	entryPoints.forEach((entryPoint) => {
		const relativePath = path
			.relative(root, entryPoint)
			.replace(/\.ts$/, ".cjs");
		rewriteRelativeTypeScriptSpecifiers(
			path.join(distRoot, relativePath),
			".cjs"
		);
	});
}

/**
 * Builds node entrypoints.
 */
function buildNodeEntrypoints(): void {
	buildSync({
		entryPoints: nodeEntryTargets.map((relativePath) =>
			path.join(root, relativePath)
		),
		outdir: path.join(distRoot, "bin"),
		outbase: path.join(root, "bin"),
		bundle: true,
		format: "cjs",
		minify: true,
		platform: "node",
		packages: "external",
		target: "node22.21",
		logLevel: "silent"
	});
}

buildNodeCompat();
clearDirectory(distRoot);

distCopyTargets.forEach(copyTarget);
packageBuiltInCore(
	{
		root: resolveBuiltInCoreRoot(root),
		version: getBuiltInMmVersion() ?? "",
		key: null
	},
	path.join(distRoot, distCoreDirectory)
);
packageCoreServerDependencies(
	path.join(root, "shims", "generated", "node_modules"),
	path.join(distRoot, distCoreDirectory)
);
transpileNodeSourceTrees();
buildNodeEntrypoints();
minifyClientJavaScript();
minifyDistCss();
