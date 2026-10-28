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

/** A plain release number, which must match the installed package exactly. */
const RELEASE_VERSION_RE = /^\d+\.\d+\.\d+$/;

/**
 * Returns the built-in core, plus the version named by
 * `MM_SANDBOX_TEST_CORE_VERSION`.
 *
 * Without the env var the matrix is the built-in core alone, and suites
 * pinned to other cores skip. A requested core that cannot join the matrix
 * throws instead: an explicit request must never degrade into a green run on
 * the built-in core only.
 *
 * @throws {Error} when the requested core is not installed in mmvm, has no
 *   built shims, has no readable version, or is a different release
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
	const fail = (problem: string): never => {
		throw new Error(
			`[core-matrix] ${TEST_CORE_VERSION_ENV}=${requested}: ${problem}. Install it with \`npx tsx scripts/install-test-core.ts ${requested}\`, or unset ${TEST_CORE_VERSION_ENV}.`
		);
	};
	if (!isVersionInstalled(key)) {
		fail(`version "${key}" is not installed in mmvm`);
	}
	if (!areShimsBuilt(key)) {
		fail(`version "${key}" is installed but its shims are not built`);
	}
	const installed = getInstalledMmVersion(key);
	if (!installed) {
		fail(`version "${key}" has no readable MagicMirror package version`);
	}
	if (RELEASE_VERSION_RE.test(requested) && installed !== requested) {
		fail(`version "${key}" holds MagicMirror ${installed}`);
	}
	cores.push({ version: installed as string, key });
	return cores;
}

declare module "vitest" {
	export interface ProvidedContext {
		stageCoreMatrix: CoreMatrixEntry[];
	}
}
