/**
 * Browser-backed integration coverage for switching the MagicMirror core on
 * the stage: activating another core reloads the stage into it, exactly
 * once, and the module keeps talking to the helper that now runs on that
 * core.
 *
 * It needs a second core, so it runs only when `MM_SANDBOX_TEST_CORE_VERSION`
 * adds one to the matrix (`tests/_helpers/core-matrix.ts`). The server runs
 * under a private core home, so the switch never reaches the homes other test
 * files' servers read.
 */
import { afterAll, describe, expect, inject, test } from "vitest";
import {
	closeSandbox,
	gotoSandbox,
	pageEvaluate,
	pageText,
	stageEvaluate
} from "../_helpers/helpers.browser.ts";

type StageScope = typeof globalThis & {
	__moduleSandboxModule?: {
		helperReply?: string;
		sendSocketNotification: (notification: string, payload: unknown) => void;
	};
	mmVersion?: string;
	__versionSwitchMarker?: boolean;
};
type LogEntry = { direction?: string; notification?: string };
type ShellScope = typeof globalThis & {
	__MICROCORE__: {
		stageReady?: boolean;
		stageMmVersion?: string;
		websocketLog?: LogEntry[];
	};
	__stageDocumentLoads?: number;
};

const cores = inject("stageCoreMatrix");
const builtIn = cores.find((entry) => entry.key === null);
const other = cores.find((entry) => entry.key !== null);

/** Time a second, unwanted stage boot would need to show up. */
const SETTLE_MS = 2_500;

afterAll(async () => {
	// Leave the private home on the built-in core even when a test failed.
	await pageEvaluate(() =>
		fetch("/__harness/mm-versions/active", { method: "DELETE" }).then(
			() => undefined
		)
	).catch(() => undefined);
	await closeSandbox();
});

/**
 * Count every document the stage frame loads from now on. The listener is
 * installed once per shell page; later calls only restart the count.
 */
async function countStageDocumentLoads(): Promise<void> {
	await pageEvaluate(() => {
		const scope = globalThis as ShellScope;
		if (scope.__stageDocumentLoads === undefined) {
			document
				.getElementById("module-stage-frame")
				?.addEventListener("load", () => {
					scope.__stageDocumentLoads =
						(scope.__stageDocumentLoads ?? 0) + 1;
				});
		}
		scope.__stageDocumentLoads = 0;
	});
}

function stageDocumentLoads(): Promise<number> {
	return pageEvaluate(
		() => (globalThis as ShellScope).__stageDocumentLoads ?? -1
	);
}

/** Wait until the stage runs `version` with the module created and reported. */
async function waitForStageOn(version: string): Promise<void> {
	await expect
		.poll(
			() =>
				stageEvaluate(() => {
					const scope = globalThis as StageScope;
					return Boolean(scope.__moduleSandboxModule) && scope.mmVersion;
				}),
			{ timeout: 60_000 }
		)
		.toBe(version);
	await expect
		.poll(
			() =>
				pageEvaluate(() => {
					const core = (globalThis as ShellScope).__MICROCORE__;
					return core.stageReady === true && core.stageMmVersion;
				}),
			{ timeout: 30_000 }
		)
		.toBe(version);
}

/**
 * Mark the current stage document, let any further reload happen, and check
 * that the marked document is still the one running.
 */
async function expectNoFurtherBoot(version: string): Promise<void> {
	await stageEvaluate(() => {
		(globalThis as StageScope).__versionSwitchMarker = true;
	});
	await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
	expect(
		await stageEvaluate(() => {
			const scope = globalThis as StageScope;
			return {
				sameDocument: scope.__versionSwitchMarker === true,
				mmVersion: scope.mmVersion
			};
		})
	).toEqual({ sameDocument: true, mmVersion: version });
}

function countLogEntries(direction: string, notification: string) {
	return pageEvaluate(
		([wantedDirection, wantedNotification]) =>
			((globalThis as ShellScope).__MICROCORE__.websocketLog ?? []).filter(
				(entry) =>
					entry.direction === wantedDirection &&
					entry.notification === wantedNotification
			).length,
		[direction, notification]
	);
}

let pingCount = 0;

/**
 * Ping the fixture helper once through the module instance; it must answer
 * exactly once. The instance API works on every core, while the fixture's
 * ping button only renders where its `this._super()` getDom does (2.36).
 */
async function expectOnePongPerPing(): Promise<void> {
	pingCount += 1;
	const message = `version switch ping ${pingCount}`;
	const pingsBefore = await countLogEntries("sent", "TEST_MODULE_PING");
	const pongsBefore = await countLogEntries("received", "TEST_MODULE_PONG");

	await stageEvaluate((pingMessage) => {
		(globalThis as StageScope).__moduleSandboxModule?.sendSocketNotification(
			"TEST_MODULE_PING",
			{ message: pingMessage }
		);
	}, message);

	await expect
		.poll(() =>
			stageEvaluate(
				() =>
					(globalThis as StageScope).__moduleSandboxModule?.helperReply ??
					""
			)
		)
		.toBe(message);
	await expect
		.poll(() => countLogEntries("received", "TEST_MODULE_PONG"))
		.toBe(pongsBefore + 1);
	// A second helper listener or logging middleware would add entries late.
	await new Promise((resolve) => setTimeout(resolve, 500));
	expect(await countLogEntries("sent", "TEST_MODULE_PING")).toBe(
		pingsBefore + 1
	);
	expect(await countLogEntries("received", "TEST_MODULE_PONG")).toBe(
		pongsBefore + 1
	);
}

/** Switch the core through the MM Version routes and wait for the stage. */
async function switchCore(
	request: { activate: string } | "reset",
	version: string
): Promise<void> {
	await countStageDocumentLoads();
	const status = await pageEvaluate(
		(body) =>
			(body === "reset"
				? fetch("/__harness/mm-versions/active", { method: "DELETE" })
				: fetch("/__harness/mm-versions/activate", {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({ version: body.activate })
					})
			).then((response) => response.status),
		request
	);
	expect(status).toBe(200);
	await waitForStageOn(version);
	await expectNoFurtherBoot(version);
	expect(await stageDocumentLoads()).toBe(1);
}

describe.skipIf(!other)(
	other
		? `version switch to core ${other.version}`
		: "version switch (skipped: needs a second core; set MM_SANDBOX_TEST_CORE_VERSION)",
	() => {
		test("a config save boots the stage exactly once", async () => {
			await gotoSandbox({
				coreKey: null,
				privateCoreHome: "version-switch"
			});
			await waitForStageOn(builtIn!.version);
			await countStageDocumentLoads();

			const status = await pageEvaluate(async () => {
				const current = await fetch("/__harness/config").then(
					(response) => response.json()
				);
				const response = await fetch("/__harness/config/module", {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify(current.moduleConfig)
				});
				return response.status;
			});
			expect(status).toBe(200);

			await expect
				.poll(stageDocumentLoads, { timeout: 30_000 })
				.toBeGreaterThan(0);
			await waitForStageOn(builtIn!.version);
			await expectNoFurtherBoot(builtIn!.version);
			expect(await stageDocumentLoads()).toBe(1);
		});

		test("activating another core reloads the stage into it", async () => {
			await gotoSandbox({
				coreKey: null,
				privateCoreHome: "version-switch"
			});
			await waitForStageOn(builtIn!.version);
			await expectOnePongPerPing();

			await switchCore({ activate: other!.version }, other!.version);
			await expect
				.poll(() => pageText(".mmv-topbar-badge__label"))
				.toBe(other!.version);
			await expectOnePongPerPing();

			await switchCore("reset", builtIn!.version);
			await expect
				.poll(() => pageText(".mmv-topbar-badge__label"))
				.toBe(builtIn!.version);
			await expectOnePongPerPing();
		});
	}
);
