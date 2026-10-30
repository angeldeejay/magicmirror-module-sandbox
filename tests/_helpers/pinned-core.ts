/**
 * Shared plumbing for the version-pinned core-fidelity suites
 * (`tests/integration/core-fidelity/pinned/<version>.browser.test.ts`).
 *
 * Each pinned file runs against the stage on exactly one MagicMirror core,
 * picked from the core matrix that `tests/_helpers/core-matrix.ts` provides.
 * When that core is not part of the run, the whole file is skipped and its
 * suite name says why.
 */
import { inject } from "vitest";
import type { CoreMatrixEntry } from "./core-matrix.ts";
import { gotoSandbox, stageEvaluate } from "./helpers.browser.ts";

export type PinnedCore = {
	/** Matrix entry for the pinned core, or null when it is not in this run. */
	core: CoreMatrixEntry | null;
	/** Suite name, carrying the skip reason when the core is unavailable. */
	suiteName: string;
};

/**
 * Resolve the matrix entry a pinned suite runs on.
 *
 * @param {string} version - MagicMirror version the suite is pinned to
 * @returns {PinnedCore}
 */
export function resolvePinnedCore(version: string): PinnedCore {
	const core =
		inject("stageCoreMatrix").find((entry) => entry.version === version) ??
		null;
	return {
		core,
		suiteName: core
			? `pinned core ${version}`
			: `pinned core ${version} (skipped: core ${version} is not available in this run; it is neither the built-in core nor installed in mmvm and named by MM_SANDBOX_TEST_CORE_VERSION)`
	};
}

/**
 * Open the stage on one core and wait until the core handed its
 * module instances to `MM.modulesStarted`, so `MM.getModules()` returns the
 * mounted module.
 *
 * The pinned suites mount the `super-getdom` fixture variant, whose getDom
 * awaits `this._super()`: their D1 expectations (and the probes that build on
 * the fixture's getDom) are written against it. The transversal suites mount
 * the version-portable default fixture.
 *
 * @param {CoreMatrixEntry} core
 * @returns {Promise<void>}
 */
export async function openPinnedStage(core: CoreMatrixEntry): Promise<void> {
	await gotoSandbox({ coreKey: core.key, fixture: "super-getdom" });
	const timeoutAt = Date.now() + 20_000;
	while (
		!(await stageEvaluate(() =>
			// 2.35-2.36 declare MM as a global lexical binding, 2.37+ assign
			// it to globalThis; a free identifier reaches both.
			globalThis.eval(
				"typeof MM !== 'undefined' && MM.getModules().length > 0"
			)
		))
	) {
		if (Date.now() > timeoutAt) {
			throw new Error(
				`The ${core.version} core never started the mounted module.`
			);
		}
		await new Promise((resolve) => setTimeout(resolve, 100));
	}
}
