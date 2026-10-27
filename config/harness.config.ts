/**
 * Harness bootstrap config derived from mounted-module autodiscovery plus sandbox defaults.
 */

import {
	createMissingMountedModuleError,
	resolveActiveMountedModuleInfo
} from "../server/paths.ts";

/** Maintainer CLI flag that enables the real-core stage. */
export const REAL_CORE_STAGE_FLAG = "--real-core-stage";

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
		hiddenOnStartup: false,
		// Maintainer-only, temporary: serve the real MagicMirror core in the
		// stage (`/__stage/`). Set only by the `--real-core-stage` CLI flag.
		realCoreStage: process.argv.includes(REAL_CORE_STAGE_FLAG)
	};
}
