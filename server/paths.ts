/**
 * Mounted-module autodiscovery and filesystem path helpers for sandbox bootstrap.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

type JsonObject = Record<string, unknown>;
type MountedModuleInfo = {
	rootPath: string;
	moduleName: string;
	packageVersion: string;
	moduleEntry: string;
	moduleIdentifier: string;
	hasNodeHelper: boolean;
	sandbox: JsonObject;
};

const currentFilePath =
	typeof __filename === "string"
		? __filename
		: fileURLToPath(import.meta.url);
const currentDirPath =
	typeof __dirname === "string" ? __dirname : path.dirname(currentFilePath);

export const harnessRoot: string = path.resolve(currentDirPath, "..");
export const MAX_PARENT_PACKAGE_DEPTH = 3;
const harnessConfigRoot: string = path.join(harnessRoot, "config");

/**
 * Clones json.
 */
function cloneJson<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Determines whether plain object.
 */
function isPlainObject(value: unknown): value is JsonObject {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * Normalizes non empty string list.
 */
function normalizeNonEmptyStringList(
	value: unknown,
	keyName: string
): string[] {
	if (!Array.isArray(value)) {
		throw new TypeError(
			`package.json sandbox.${keyName} must be an array of strings.`
		);
	}

	return value.map((entry, index) => {
		if (typeof entry !== "string" || !entry.trim()) {
			throw new TypeError(
				`package.json sandbox.${keyName}[${index}] must be a non-empty string.`
			);
		}

		return entry.trim();
	});
}

/**
 * Reads package json.
 */
function readPackageJson(directoryPath: string): JsonObject | null {
	const packagePath = path.join(directoryPath, "package.json");
	if (!fs.existsSync(packagePath)) {
		return null;
	}

	return JSON.parse(fs.readFileSync(packagePath, "utf8")) as JsonObject;
}

/**
 * Gets root java script files.
 */
function getRootJavaScriptFiles(directoryPath: string): string[] {
	return fs
		.readdirSync(directoryPath, { withFileTypes: true })
		.filter((entry: import("node:fs").Dirent) => {
			return entry.isFile() && entry.name.endsWith(".js");
		})
		.map((entry: import("node:fs").Dirent) => entry.name);
}

/**
 * Gets package module name.
 */
function getPackageModuleName(
	packageData: JsonObject | null,
	directoryPath: string
): string {
	const packageName = packageData?.name;
	if (typeof packageName === "string" && packageName.trim()) {
		return (
			packageName.trim().split("/").pop() || path.basename(directoryPath)
		);
	}

	return path.basename(directoryPath);
}

/**
 * Finds module register entry.
 */
function findModuleRegisterEntry(
	directoryPath: string,
	fileNames: string[]
): string | null {
	const matchingFiles = fileNames.filter((fileName) => {
		if (fileName === "node_helper.js") {
			return false;
		}

		const filePath = path.join(directoryPath, fileName);
		try {
			return fs
				.readFileSync(filePath, "utf8")
				.includes("Module.register(");
		} catch (_error) {
			return false;
		}
	});

	return matchingFiles.length === 1 ? matchingFiles[0] : null;
}

/**
 * Gets package sandbox config.
 */
export function getPackageSandboxConfig(
	packageData: JsonObject | null
): JsonObject {
	if (!isPlainObject(packageData) || !isPlainObject(packageData.sandbox)) {
		return {};
	}

	const sandboxConfig = cloneJson(packageData.sandbox);

	if (Object.prototype.hasOwnProperty.call(sandboxConfig, "startup")) {
		sandboxConfig.startup = normalizeNonEmptyStringList(
			sandboxConfig.startup,
			"startup"
		);
	}

	return sandboxConfig;
}

/**
 * Resolves mounted module info.
 */
export function resolveMountedModuleInfo(
	directoryPath = process.cwd()
): MountedModuleInfo | null {
	const rootPath = path.resolve(directoryPath);
	const packageData = readPackageJson(rootPath);
	if (!packageData) {
		return null;
	}

	const moduleName = getPackageModuleName(packageData, rootPath);
	const rootJavaScriptFiles = getRootJavaScriptFiles(rootPath);
	const preferredEntry = `${moduleName}.js`;
	let moduleEntry = "";

	if (!moduleEntry) {
		if (fs.existsSync(path.join(rootPath, preferredEntry))) {
			moduleEntry = preferredEntry;
		} else if (
			typeof packageData.main === "string" &&
			packageData.main.trim() &&
			fs.existsSync(path.join(rootPath, packageData.main.trim()))
		) {
			moduleEntry = packageData.main.trim();
		} else {
			const magicMirrorNamedEntries = rootJavaScriptFiles.filter(
				(fileName) => {
					return /^MMM-.*\.js$/i.test(fileName);
				}
			);
			if (magicMirrorNamedEntries.length === 1) {
				moduleEntry = magicMirrorNamedEntries[0];
			} else {
				moduleEntry =
					findModuleRegisterEntry(rootPath, rootJavaScriptFiles) ||
					"";
			}
		}
	}

	if (!moduleEntry || !fs.existsSync(path.join(rootPath, moduleEntry))) {
		return null;
	}

	const packageVersion =
		typeof packageData.version === "string" && packageData.version.trim()
			? packageData.version.trim()
			: "";

	return {
		rootPath,
		moduleName,
		packageVersion,
		moduleEntry,
		moduleIdentifier: `${moduleName}_sandbox`,
		hasNodeHelper: fs.existsSync(path.join(rootPath, "node_helper.js")),
		sandbox: getPackageSandboxConfig(packageData)
	};
}

/**
 * Determines whether mounted module root.
 */
export function isMountedModuleRoot(directoryPath: string): boolean {
	return Boolean(resolveMountedModuleInfo(directoryPath));
}

/**
 * Finds mounted module root.
 */
export function findMountedModuleRoot(
	startPath: string,
	maxParentLevels = MAX_PARENT_PACKAGE_DEPTH
): string | null {
	let currentPath = path.resolve(startPath);

	if (isMountedModuleRoot(currentPath)) {
		return currentPath;
	}

	for (let level = 0; level < maxParentLevels; level += 1) {
		const parentPath = path.dirname(currentPath);
		if (parentPath === currentPath) {
			return null;
		}

		currentPath = parentPath;
		if (isMountedModuleRoot(currentPath)) {
			return currentPath;
		}
	}

	return null;
}

/**
 * Resolves repo root.
 */
export function resolveRepoRoot(): string {
	if (process.env.MM_SANDBOX_MOUNTED_MODULE_ROOT) {
		return path.resolve(process.env.MM_SANDBOX_MOUNTED_MODULE_ROOT);
	}

	return (
		findMountedModuleRoot(process.cwd(), MAX_PARENT_PACKAGE_DEPTH) ||
		findMountedModuleRoot(harnessRoot, MAX_PARENT_PACKAGE_DEPTH) ||
		process.cwd()
	);
}

/**
 * Resolves active mounted module info.
 */
export function resolveActiveMountedModuleInfo(): MountedModuleInfo | null {
	if (process.env.MM_SANDBOX_MOUNTED_MODULE_ROOT) {
		return resolveMountedModuleInfo(
			process.env.MM_SANDBOX_MOUNTED_MODULE_ROOT
		);
	}

	const cwdMountedRoot = findMountedModuleRoot(
		process.cwd(),
		MAX_PARENT_PACKAGE_DEPTH
	);
	if (cwdMountedRoot) {
		return resolveMountedModuleInfo(cwdMountedRoot);
	}

	const harnessMountedRoot = findMountedModuleRoot(
		harnessRoot,
		MAX_PARENT_PACKAGE_DEPTH
	);
	if (harnessMountedRoot) {
		return resolveMountedModuleInfo(harnessMountedRoot);
	}

	return null;
}

/**
 * Creates missing mounted module error.
 */
export function createMissingMountedModuleError(): Error {
	return new Error(
		"No mounted MagicMirror module could be resolved. Run the sandbox from a module repo, set MM_SANDBOX_MOUNTED_MODULE_ROOT, or use --preview for the maintainer fixture."
	);
}

export const repoRoot = resolveRepoRoot();
export const configRoot = harnessConfigRoot;
export const shimsRoot = path.join(harnessRoot, "shims");

export default {
	harnessRoot,
	MAX_PARENT_PACKAGE_DEPTH,
	resolveMountedModuleInfo,
	resolveActiveMountedModuleInfo,
	createMissingMountedModuleError,
	getPackageSandboxConfig,
	isMountedModuleRoot,
	findMountedModuleRoot,
	resolveRepoRoot,
	repoRoot,
	configRoot,
	shimsRoot
};
