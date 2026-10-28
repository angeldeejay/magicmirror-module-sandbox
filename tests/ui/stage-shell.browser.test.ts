/**
 * Shell chrome around the stage, which runs the active MagicMirror core.
 *
 * The topbar badge must name the core that actually runs in the stage, and
 * the theme switch must restyle the shell without disturbing the stage. Runs
 * once per core in `tests/_helpers/core-matrix.ts`.
 */
import { afterAll, describe, expect, inject, test } from "vitest";
import {
	closeSandbox,
	gotoSandbox,
	pageAttribute,
	pageClick,
	pageEvaluate,
	pageText,
	stageEvaluate
} from "../_helpers/helpers.browser.ts";

type StageScope = typeof globalThis & {
	__moduleSandboxModule?: unknown;
	mmVersion?: string;
	__stageShellMarker?: boolean;
};
type ShellScope = typeof globalThis & {
	__MICROCORE__: { stageReady?: boolean; stageMmVersion?: string };
};

const cores = inject("stageCoreMatrix");

afterAll(async () => {
	await closeSandbox();
});

/** Boots the stage on one core and waits for the shell to be ready. */
async function boot(coreKey: string | null): Promise<void> {
	await gotoSandbox({ coreKey });
	await expect
		.poll(() =>
			stageEvaluate(() =>
				Boolean((globalThis as StageScope).__moduleSandboxModule)
			)
		)
		.toBe(true);
	await expect
		.poll(() =>
			pageEvaluate(() =>
				Boolean((globalThis as ShellScope).__MICROCORE__.stageReady)
			)
		)
		.toBe(true);
}

describe.each(cores)("core $version", ({ version, key }) => {
	test("the version badge names the running core", async () => {
		await boot(key);

		expect(
			await stageEvaluate(() => (globalThis as StageScope).mmVersion)
		).toBe(version);
		await expect
			.poll(() => pageText(".mmv-topbar-badge__label"))
			.toBe(version);
		// The value came from the stage's own report, not the server state.
		expect(
			await pageEvaluate(
				() => (globalThis as ShellScope).__MICROCORE__.stageMmVersion
			)
		).toBe(version);
	});

	test("the theme switch restyles the shell and leaves the stage running", async () => {
		await boot(key);
		await stageEvaluate(() => {
			(globalThis as StageScope).__stageShellMarker = true;
		});
		const themeBefore = await pageEvaluate(
			() => document.documentElement.dataset.theme ?? ""
		);
		const target =
			themeBefore === "violet-circuit" ? "phosphor-green" : "violet-circuit";

		await pageClick('[aria-label="Switch theme"]');
		await pageClick(`[data-theme-value="${target}"]`);

		await expect
			.poll(() =>
				pageEvaluate(() => document.documentElement.dataset.theme ?? "")
			)
			.toBe(target);
		expect(await pageAttribute("html", "data-theme")).toBe(target);

		// The same stage document, still holding the running core and module.
		expect(
			await stageEvaluate(() => {
				const scope = globalThis as StageScope;
				return {
					sameDocument: scope.__stageShellMarker === true,
					hasModule: Boolean(scope.__moduleSandboxModule),
					mmVersion: scope.mmVersion
				};
			})
		).toEqual({ sameDocument: true, hasModule: true, mmVersion: version });
		await expect
			.poll(() => pageText(".mmv-topbar-badge__label"))
			.toBe(version);
	});
});
