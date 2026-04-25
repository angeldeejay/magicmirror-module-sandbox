/**
 * Persistence helpers for sandbox-owned temp config files used in tests.
 */
/**
 * Persistence helpers for sandbox-owned temp config files used in tests.
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { resolveSandboxPersistencePaths } from "../../server/config.ts";
import { resolveMountedModuleInfo } from "../../server/paths.ts";
import {
	cloneJson,
	defaultPersistedModuleConfig,
	defaultPersistedRuntimeConfig
} from "./test-module-persistence-defaults.ts";

/**
 * Resolve the temp persistence paths used by the sandbox for one mounted module root.
 *
 * @param {string} moduleRoot
 * @returns {{ tempRoot: string, hash: string, moduleConfigPath: string, runtimeConfigPath: string }}
 */
export function getPersistedStatePathsForModuleRoot(moduleRoot) {
	const mountedModuleInfo = resolveMountedModuleInfo(moduleRoot);
	if (!mountedModuleInfo) {
		throw new Error(
			`Cannot resolve mounted module info for "${moduleRoot}".`
		);
	}
	return resolveSandboxPersistencePaths(mountedModuleInfo);
}

/**
 * Persist one JSON payload to disk with stable formatting.
 *
 * @param {string} filePath
 * @param {unknown} value
 * @returns {void}
 */
function writeJsonFile(filePath, value) {
	mkdirSync(dirname(filePath), {
		recursive: true
	});
	writeFileSync(filePath, `${JSON.stringify(value, null, "\t")}\n`, "utf8");
}

/**
 * Reset the sandbox-owned persisted state for one mounted module root.
 *
 * @param {string} moduleRoot
 * @param {{
 * 	moduleConfig?: object,
 * 	runtimeConfig?: { language: string, locale?: string }
 * }} [overrides]
 * @returns {{ tempRoot: string, hash: string, moduleConfigPath: string, runtimeConfigPath: string }}
 */
export function resetPersistedStateForModuleRoot(
	moduleRoot,
	overrides: {
		moduleConfig?: object;
		runtimeConfig?: { language: string; locale?: string };
	} = {}
) {
	const persistencePaths = getPersistedStatePathsForModuleRoot(moduleRoot);
	writeJsonFile(
		persistencePaths.moduleConfigPath,
		cloneJson(overrides.moduleConfig || defaultPersistedModuleConfig)
	);
	writeJsonFile(
		persistencePaths.runtimeConfigPath,
		cloneJson(overrides.runtimeConfig || defaultPersistedRuntimeConfig)
	);
	return persistencePaths;
}

/**
 * Remove sandbox-owned persisted state for one mounted module root.
 *
 * @param {string} moduleRoot
 * @returns {void}
 */
export function clearPersistedStateForModuleRoot(moduleRoot) {
	const { moduleConfigPath, runtimeConfigPath } =
		getPersistedStatePathsForModuleRoot(moduleRoot);
	rmSync(moduleConfigPath, {
		force: true
	});
	rmSync(runtimeConfigPath, {
		force: true
	});
}
