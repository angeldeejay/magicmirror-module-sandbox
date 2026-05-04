/**
 * Harness bootstrap config derived from mounted-module autodiscovery plus sandbox defaults.
 */

import {
	createMissingMountedModuleError,
	resolveActiveMountedModuleInfo
} from "../server/paths.ts";

/**
 * Creates harness config.
 */
export function createHarnessConfig() {
	const detectedModuleInfo = resolveActiveMountedModuleInfo();
	if (!detectedModuleInfo) {
		throw createMissingMountedModuleError();
	}

	return {
		host: process.env.MM_SANDBOX_HOST || "127.0.0.1",
		port: Number(process.env.MM_SANDBOX_PORT) || 3010,
		language: "en",
		locale: "en-US",
		moduleName: detectedModuleInfo.moduleName,
		moduleEntry: detectedModuleInfo.moduleEntry,
		moduleIdentifier: detectedModuleInfo.moduleIdentifier,
		sandbox: detectedModuleInfo.sandbox,
		configDeepMerge: false,
		mmVersion: "2.36.0",
		header: false,
		hiddenOnStartup: false
	};
}
