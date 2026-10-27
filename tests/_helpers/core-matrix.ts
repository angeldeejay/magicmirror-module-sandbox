/**
 * MagicMirror cores a test run can boot the real-core stage against.
 *
 * Node-side only: the browser suites receive the matrix through Vitest
 * `provide`/`inject` (key `stageCoreMatrix`), because browser test files
 * cannot read the file system or the environment.
 */
import process from "node:process";
import {
	areShimsBuilt,
	getBuiltInMmVersion,
	getInstalledMmVersion,
	isVersionInstalled,
	sanitizeVersion
} from "../../server/mm-version-manager.ts";

/** Test-only env var naming one extra mmvm version to run the matrix on. */
export const TEST_CORE_VERSION_ENV = "MM_SANDBOX_TEST_CORE_VERSION";

export type CoreMatrixEntry = {
	/** MagicMirror version the core reports (`window.mmVersion`). */
	version: string;
	/** mmvm version key, or null for the built-in core. */
	key: string | null;
};

/**
 * Returns the built-in core, plus the version named by
 * `MM_SANDBOX_TEST_CORE_VERSION` when it is installed in mmvm with its shims.
 */
export function availableCores(
	env: NodeJS.ProcessEnv = process.env
): CoreMatrixEntry[] {
	const cores: CoreMatrixEntry[] = [
		{ version: getBuiltInMmVersion() ?? "", key: null }
	];
	const requested = env[TEST_CORE_VERSION_ENV]?.trim();
	if (!requested) {
		return cores;
	}

	const key = sanitizeVersion(requested);
	if (!isVersionInstalled(key) || !areShimsBuilt(key)) {
		console.warn(
			`[core-matrix] ${TEST_CORE_VERSION_ENV}=${requested} is not installed in mmvm with its shims; running on the built-in core only.`
		);
		return cores;
	}
	cores.push({ version: getInstalledMmVersion(key) ?? key, key });
	return cores;
}

declare module "vitest" {
	export interface ProvidedContext {
		stageCoreMatrix: CoreMatrixEntry[];
	}
}
