/**
 * Maintainer preview wiring for running the sandbox against the internal fixture module.
 */

import * as fs from "node:fs";
import * as path from "pathe";
import { fileURLToPath } from "node:url";

const fromOS = (p: string) => p.replace(/\\/g, "/");

const PREVIEW_MODULE_NAME = "MMM-TestModule";
const PREVIEW_MODULE_ENTRY = "MMM-TestModule.js";
const PREVIEW_MODULE_IDENTIFIER = "MMM-TestModule_sandbox";

type PreviewEnvOptions = {
	env?: NodeJS.ProcessEnv;
	packageRoot?: string;
};

const currentFilePath = fromOS(
	/* v8 ignore next 3 */
	typeof __filename === "string" ? __filename : fileURLToPath(import.meta.url)
);
const currentDirPath =
	/* v8 ignore next */
	typeof __dirname === "string"
		? fromOS(__dirname)
		: path.dirname(currentFilePath);

/**
 * Gets package root.
 */
function getPackageRoot(): string {
	/* v8 ignore next 4 */
	return path.basename(currentDirPath) === "bin" &&
		path.basename(path.dirname(currentDirPath)) === "dist"
		? path.resolve(currentDirPath, "..", "..")
		: path.resolve(currentDirPath, "..");
}

/**
 * Gets preview module root.
 */
function getPreviewModuleRoot(packageRoot = getPackageRoot()): string {
	return path.join(packageRoot, "tests", "_fixtures", "MMM-TestModule");
}

/**
 * Determines whether maintainer preview fixture.
 */
function hasMaintainerPreviewFixture(packageRoot = getPackageRoot()): boolean {
	const previewRoot = getPreviewModuleRoot(packageRoot);
	return (
		fs.existsSync(path.join(previewRoot, "package.json")) &&
		fs.existsSync(path.join(previewRoot, "node_helper.js")) &&
		fs.existsSync(path.join(previewRoot, PREVIEW_MODULE_ENTRY))
	);
}

/**
 * Internal helper for apply maintainer preview env.
 */
function applyMaintainerPreviewEnv({
	env = process.env,
	packageRoot = getPackageRoot()
}: PreviewEnvOptions = {}): {
	previewRoot: string;
	moduleName: string;
	moduleEntry: string;
	moduleIdentifier: string;
} {
	if (!hasMaintainerPreviewFixture(packageRoot)) {
		throw new Error(
			"Maintainer preview fixture is unavailable. Run without --preview or use a source checkout that includes tests\\_fixtures\\MMM-TestModule."
		);
	}

	const previewRoot = getPreviewModuleRoot(packageRoot);
	env.MM_SANDBOX_MOUNTED_MODULE_ROOT = previewRoot;

	return {
		previewRoot,
		moduleName: PREVIEW_MODULE_NAME,
		moduleEntry: PREVIEW_MODULE_ENTRY,
		moduleIdentifier: PREVIEW_MODULE_IDENTIFIER
	};
}

export {
	PREVIEW_MODULE_NAME,
	PREVIEW_MODULE_ENTRY,
	PREVIEW_MODULE_IDENTIFIER,
	getPackageRoot,
	getPreviewModuleRoot,
	hasMaintainerPreviewFixture,
	applyMaintainerPreviewEnv
};

export default {
	PREVIEW_MODULE_NAME,
	PREVIEW_MODULE_ENTRY,
	PREVIEW_MODULE_IDENTIFIER,
	getPackageRoot,
	getPreviewModuleRoot,
	hasMaintainerPreviewFixture,
	applyMaintainerPreviewEnv
};
