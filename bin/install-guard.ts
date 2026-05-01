#!/usr/bin/env -S node --experimental-strip-types

/**
 * Postinstall guard that enforces supported consumer install modes for the sandbox package.
 */

import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "pathe";
import { fileURLToPath, pathToFileURL } from "node:url";

const fromOS = (p: string) => p.replace(/\\/g, "/");

const currentFilePath = fromOS(
	typeof __filename === "string"
		? __filename
		: fileURLToPath(import.meta.url)
);
const currentDirPath =
	typeof __dirname === "string" ? fromOS(__dirname) : path.dirname(currentFilePath);

type PackageJsonManifest = {
	name?: string;
	dependencies?: Record<string, string>;
	devDependencies?: Record<string, string>;
};

type SyncAssets = (options?: { packageRoot?: string }) => void;

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
 * Reads json file.
 */
function readJsonFile(filePath: string): unknown {
	return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

/**
 * Gets package name.
 */
function getPackageName(packageRoot = getPackageRoot()): string {
	return (
		(
			readJsonFile(
				path.join(packageRoot, "package.json")
			) as PackageJsonManifest
		).name || ""
	);
}

/**
 * Synchronizes magic mirror assets for maintainer repo.
 */
function syncMagicMirrorAssetsForMaintainerRepo({
	packageRoot = getPackageRoot()
}: {
	packageRoot?: string;
} = {}): void {
	const sourceScriptPath = path.join(
		packageRoot,
		"bin",
		"sync-magicmirror-assets.ts"
	);
	const distScriptPath = path.join(
		packageRoot,
		"dist",
		"bin",
		"sync-magicmirror-assets.js"
	);
	const scriptPath = fs.existsSync(sourceScriptPath)
		? sourceScriptPath
		: distScriptPath;
	const args = scriptPath.endsWith(".ts")
		? ["--experimental-strip-types", scriptPath]
		: [scriptPath];
	const result = spawnSync(process.execPath, args, {
		cwd: packageRoot,
		stdio: "inherit"
	});

	if (result.status !== 0) {
		throw new Error(
			`[module-sandbox] MagicMirror asset sync failed during postinstall (exit ${String(result.status)}).`
		);
	}
}

/**
 * Resolves consumer package json path.
 */
function resolveConsumerPackageJsonPath({
	env = process.env,
	packageRoot = getPackageRoot()
}: {
	env?: NodeJS.ProcessEnv;
	packageRoot?: string;
} = {}): string | null {
	const candidateRoots = [env.INIT_CWD, env.npm_config_local_prefix].filter(
		(rootPath): rootPath is string => Boolean(rootPath)
	);

	for (const candidateRoot of candidateRoots) {
		const normalizedRoot = path.resolve(candidateRoot);
		const packageJsonPath = path.join(normalizedRoot, "package.json");

		if (normalizedRoot !== packageRoot && fs.existsSync(packageJsonPath)) {
			return packageJsonPath;
		}
	}

	return null;
}

/**
 * Determines whether maintainer source repo.
 */
function isMaintainerSourceRepo({
	env = process.env,
	packageRoot = getPackageRoot()
}: {
	env?: NodeJS.ProcessEnv;
	packageRoot?: string;
} = {}): boolean {
	if (!env.INIT_CWD) {
		return false;
	}

	return (
		path.resolve(env.INIT_CWD) === packageRoot &&
		fs.existsSync(
			path.join(packageRoot, "client", "scss", "entrypoint.scss")
		) &&
		fs.existsSync(path.join(packageRoot, "scripts", "build-dist.ts"))
	);
}

/**
 * Gets install section.
 */
function getInstallSection(
	consumerPackageJson: PackageJsonManifest,
	packageName: string
): "dependencies" | "devDependencies" | null {
	if (consumerPackageJson.dependencies?.[packageName]) {
		return "dependencies";
	}

	if (consumerPackageJson.devDependencies?.[packageName]) {
		return "devDependencies";
	}

	return null;
}

/**
 * Internal helper for assert supported install type.
 */
function assertSupportedInstallType({
	consumerPackageJson,
	consumerPackageJsonPath,
	packageName
}: {
	consumerPackageJson: PackageJsonManifest;
	consumerPackageJsonPath: string;
	packageName: string;
}): "dependencies" | "devDependencies" | null {
	const installSection = getInstallSection(consumerPackageJson, packageName);

	if (installSection !== "dependencies") {
		return installSection;
	}

	throw new Error(
		[
			`[module-sandbox] ${packageName} must be installed as a devDependency, not a dependency.`,
			`[module-sandbox] Move it from "dependencies" to "devDependencies" in ${consumerPackageJsonPath}.`,
			`[module-sandbox] Example: npm uninstall ${packageName} && npm install --save-dev ${packageName}`
		].join("\n")
	);
}

/**
 * Runs install guard.
 */
function runInstallGuard({
	env = process.env,
	packageRoot = getPackageRoot(),
	stderr = process.stderr
}: {
	env?: NodeJS.ProcessEnv;
	packageRoot?: string;
	stderr?: Pick<NodeJS.WriteStream, "write">;
} = {}): void {
	const packageName = getPackageName(packageRoot);
	const consumerPackageJsonPath = resolveConsumerPackageJsonPath({
		env,
		packageRoot
	});

	if (!consumerPackageJsonPath) {
		return;
	}

	const consumerPackageJson = readJsonFile(
		consumerPackageJsonPath
	) as PackageJsonManifest;
	assertSupportedInstallType({
		consumerPackageJson,
		consumerPackageJsonPath,
		packageName
	});

	stderr.write("");
}

/**
 * Runs maintainer postinstall.
 */
function runMaintainerPostinstall({
	env = process.env,
	packageRoot = getPackageRoot(),
	syncAssets = syncMagicMirrorAssetsForMaintainerRepo
}: {
	env?: NodeJS.ProcessEnv;
	packageRoot?: string;
	syncAssets?: SyncAssets;
} = {}): void {
	if (!isMaintainerSourceRepo({ env, packageRoot })) {
		return;
	}

	syncAssets({ packageRoot });
}

/**
 * Runs postinstall.
 */
function runPostinstall({
	env = process.env,
	packageRoot = getPackageRoot(),
	stderr = process.stderr,
	syncAssets = syncMagicMirrorAssetsForMaintainerRepo
}: {
	env?: NodeJS.ProcessEnv;
	packageRoot?: string;
	stderr?: Pick<NodeJS.WriteStream, "write">;
	syncAssets?: SyncAssets;
} = {}): void {
	runInstallGuard({
		env,
		packageRoot,
		stderr
	});
	runMaintainerPostinstall({
		env,
		packageRoot,
		syncAssets
	});
}

/**
 * Determines whether direct execution.
 */
function isDirectExecution(): boolean {
	const entrypointPath = process.argv[1];
	if (!entrypointPath) {
		return false;
	}

	return pathToFileURL(path.resolve(entrypointPath)).href === import.meta.url;
}

if (isDirectExecution()) {
	try {
		runPostinstall();
	} catch (error) {
		process.stderr.write(
			`${error instanceof Error ? error.message : String(error)}\n`
		);
		process.exit(1);
	}
}

export {
	assertSupportedInstallType,
	getInstallSection,
	getPackageName,
	getPackageRoot,
	isMaintainerSourceRepo,
	readJsonFile,
	resolveConsumerPackageJsonPath,
	runInstallGuard,
	runMaintainerPostinstall,
	runPostinstall
};

export default {
	assertSupportedInstallType,
	getInstallSection,
	getPackageName,
	getPackageRoot,
	isMaintainerSourceRepo,
	readJsonFile,
	resolveConsumerPackageJsonPath,
	runInstallGuard,
	runMaintainerPostinstall,
	runPostinstall
};
