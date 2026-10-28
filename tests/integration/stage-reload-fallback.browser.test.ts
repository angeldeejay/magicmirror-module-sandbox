/**
 * Browser-backed integration coverage for the shell's stage reload fallback:
 * when a stage `harness:reload` says the core's own RELOAD performs the
 * reload (`reloadedBy: "core"`) but no stage document loads, the shell
 * reloads the frame itself, exactly once (client/runtime/shell-stage.ts).
 *
 * The lost RELOAD is simulated by delivering only the shell event: the
 * server sends no RELOAD, as happens when another tab's core took it or the
 * listening socket belonged to a document that was already unloading.
 */
import { afterAll, expect, test } from "vitest";
import {
	closeSandbox,
	gotoSandbox,
	pageEvaluate,
	stageEvaluate
} from "../_helpers/helpers.browser.ts";

type ShellScope = typeof globalThis & {
	__MICROCORE__: {
		stageReady?: boolean;
		coreReloadFallbackMs?: number;
		rootSocket: { listeners: (event: string) => Array<(p: unknown) => void> };
	};
	__fallbackLoads?: number;
	__fallbackReloadedEvents?: number;
};
type StageScope = typeof globalThis & {
	__moduleSandboxModule?: unknown;
	__fallbackMarker?: boolean;
};

/** Short fallback delay so the test does not wait the production 5 s. */
const FALLBACK_MS = 800;

afterAll(async () => {
	await closeSandbox();
});

test("a core reload that never loads the stage falls back to one frame reload", async () => {
	await gotoSandbox({ coreKey: null });
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
	await stageEvaluate(() => {
		(globalThis as StageScope).__fallbackMarker = true;
	});

	await pageEvaluate((delay) => {
		const scope = globalThis as ShellScope;
		scope.__fallbackLoads = 0;
		scope.__fallbackReloadedEvents = 0;
		document
			.getElementById("module-stage-frame")
			?.addEventListener("load", () => {
				scope.__fallbackLoads = (scope.__fallbackLoads ?? 0) + 1;
			});
		globalThis.addEventListener("module-sandbox:stage-reloaded", () => {
			scope.__fallbackReloadedEvents =
				(scope.__fallbackReloadedEvents ?? 0) + 1;
		});
		scope.__MICROCORE__.coreReloadFallbackMs = delay;
		for (const listener of scope.__MICROCORE__.rootSocket.listeners(
			"harness:reload"
		)) {
			listener({
				event: "manual-restart",
				scope: "stage",
				version: "lost-core-reload",
				reloadedBy: "core"
			});
		}
	}, FALLBACK_MS);

	// Before the delay the shell leaves the frame to the core.
	await new Promise((resolve) => setTimeout(resolve, FALLBACK_MS / 2));
	expect(
		await pageEvaluate(() => (globalThis as ShellScope).__fallbackLoads)
	).toBe(0);

	await expect
		.poll(() =>
			stageEvaluate(() => ({
				marker: (globalThis as StageScope).__fallbackMarker === true,
				url: location.search
			}))
		)
		.toEqual({ marker: false, url: "?v=lost-core-reload" });
	await expect
		.poll(() =>
			stageEvaluate(() =>
				Boolean((globalThis as StageScope).__moduleSandboxModule)
			)
		)
		.toBe(true);

	// No second reload follows.
	await new Promise((resolve) => setTimeout(resolve, FALLBACK_MS * 3));
	expect(
		await pageEvaluate(() => {
			const scope = globalThis as ShellScope;
			return {
				loads: scope.__fallbackLoads,
				reloadedEvents: scope.__fallbackReloadedEvents
			};
		})
	).toEqual({ loads: 1, reloadedEvents: 1 });
});
