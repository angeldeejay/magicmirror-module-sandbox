/**
 * Cross-version coverage for the stage observer's boot point
 * (`client/stage-observer/index.ts`, `watchCoreMM` in
 * `client/stage-observer/instance-hooks.ts`).
 *
 * The core's `js/main.js` provides `MM`. From 2.38 its module graph has a
 * top-level await: `js/socketclient.js` awaits
 * `import("/socket.io/socket.io.esm.min.js")`. So with a slow socket.io
 * client, the stage document loads before `main.js` has run. These tests
 * hold that import until the shell has seen the document's `load`. They then
 * check two things. The observer still hooks the created instance. A disabled
 * module reports `bootComplete` only once the core has provided `MM`, never
 * on `load` alone.
 *
 * The expectations come from the layout the stage serves, not from the
 * version string, so a stale `develop` install with the classic layout is
 * judged as classic:
 * - a `<script type="module">` `js/main.js` that assigns `globalThis.MM` gives
 *   the data property;
 * - a top-level `await import(` in `js/socketclient.js` holds `main.js`.
 *
 * A core without that await never requests the module, so the same tests
 * check that its boot is unchanged. Runs once per core in
 * `tests/_helpers/core-matrix.ts`.
 */
import { afterAll, afterEach, describe, expect, inject, test } from "vitest";
import {
	clearRequestHolds,
	closeSandbox,
	gotoSandbox,
	heldRequestCount,
	holdRequests,
	openSidebarTab,
	pageCheck,
	pageClick,
	pageEvaluate,
	releaseRequests,
	stageEvaluate
} from "../_helpers/helpers.browser.ts";

/** What the shell saw of one stage document while it booted. */
type BootProbe = {
	/** `typeof MM` in the stage on each frame `load`. */
	loads: string[];
	/**
	 * Each stage-ready message, with `typeof MM` in the stage when it arrived
	 * and whether the frame had loaded by then.
	 */
	readies: Array<{ bootComplete: boolean; mm: string; afterLoad: boolean }>;
};

type ProbeScope = typeof globalThis & {
	__bootProbe?: BootProbe;
	__MICROCORE__?: { bootComplete?: boolean };
};

/** The core layout the stage serves, read from its own files. */
type CoreLayout = {
	/** `js/main.js` is a module script that assigns `globalThis.MM` (2.37+). */
	assignsGlobalMM: boolean;
	/** `js/socketclient.js` awaits the socket.io client import (2.38+). */
	awaitsSocketIoImport: boolean;
};

const cores = inject("stageCoreMatrix");

/** The socket.io client module 2.38+ `js/socketclient.js` awaits. */
const SOCKET_IO_CLIENT_MODULE = "**/socket.io/socket.io.esm.min.js*";

afterEach(async () => {
	await clearRequestHolds();
});

afterAll(async () => {
	await closeSandbox();
});

/** Reads the served core layout from the stage's own `js/` files. */
function readCoreLayout(): Promise<CoreLayout> {
	return stageEvaluate(async () => {
		const moduleMain = Boolean(
			globalThis.document.querySelector(
				'script[type="module"][src$="js/main.js"]'
			)
		);
		const read = async (file: string) => {
			const response = await fetch(file);
			return response.ok ? response.text() : "";
		};
		const main = await read("js/main.js");
		const socketClient = await read("js/socketclient.js");
		return {
			assignsGlobalMM:
				moduleMain && /globalThis\.MM\s*=\s*MM\b/.test(main),
			// A top-level statement starts at column 0.
			awaitsSocketIoImport:
				moduleMain && /^\S[^\n]*\bawait import\(/m.test(socketClient)
		};
	});
}

/**
 * Records, in the shell, `typeof MM` in the stage on each frame load and on
 * each stage-ready message. It then holds the socket.io client module and
 * reloads the stage through Save. It returns the probe and the held request
 * count as they were at the reloaded document's `load`, after the snapshot
 * the shell requests on `load` was answered. Only then does it release the
 * module and wait for the reloaded document to be in the frame.
 */
async function reloadStageHoldingSocketIo(): Promise<{
	atLoad: BootProbe;
	heldAtLoad: number;
}> {
	await pageEvaluate(() => {
		const scope = globalThis as ProbeScope;
		const frame = globalThis.document.getElementById(
			"module-stage-frame"
		) as HTMLIFrameElement;
		const probe: BootProbe = { loads: [], readies: [] };
		scope.__bootProbe = probe;
		const typeofMM = () =>
			String(
				(
					frame.contentWindow as unknown as {
						eval: (source: string) => unknown;
					}
				).eval("typeof MM")
			);
		frame.addEventListener("load", () => {
			probe.loads.push(typeofMM());
		});
		globalThis.addEventListener("message", (event) => {
			const message = event.data as {
				source?: string;
				type?: string;
				detail?: { bootComplete?: boolean };
			} | null;
			if (
				event.source === frame.contentWindow &&
				message?.source === "module-sandbox-stage" &&
				message.type === "stage-ready"
			) {
				probe.readies.push({
					bootComplete: Boolean(message.detail?.bootComplete),
					mm: typeofMM(),
					afterLoad: probe.loads.length > 0
				});
			}
		});
	});
	await stageEvaluate(() => {
		(globalThis as Record<string, unknown>).__bootPreSave = true;
	});
	await holdRequests(SOCKET_IO_CLIENT_MODULE);
	await pageClick("#module-config-save");
	// The stage posts in order, so once the reply to the shell's post-load
	// snapshot request is in, any stage-ready the document posted on its own
	// `load` is in too.
	await expect
		.poll(() =>
			pageEvaluate(() => {
				const probe = (globalThis as ProbeScope).__bootProbe;
				return Boolean(
					probe &&
					probe.loads.length === 1 &&
					probe.readies.some((ready) => ready.afterLoad)
				);
			})
		)
		.toBe(true);
	const atLoad = await pageEvaluate(() =>
		structuredClone((globalThis as ProbeScope).__bootProbe as BootProbe)
	);
	const heldAtLoad = await heldRequestCount();
	await releaseRequests();
	await expect
		.poll(() =>
			stageEvaluate(
				() =>
					(globalThis as Record<string, unknown>).__bootPreSave ===
					undefined
			)
		)
		.toBe(true);
	return { atLoad, heldAtLoad };
}

/** The shell's probe of the reloaded stage document, now. */
function readProbe(): Promise<BootProbe> {
	return pageEvaluate(
		() => (globalThis as ProbeScope).__bootProbe as BootProbe
	);
}

describe.each(cores)("core $version", ({ key }) => {
	/**
	 * Coverage that hooking keeps working when `main.js` runs after `load`.
	 * It is not the regression guard of the observer fix: the observer
	 * before it also found the instance, through the free `MM` identifier,
	 * and the core's assignment left the same descriptor. The disabled test
	 * below is the one that fails without the fix.
	 */
	test("the observer hooks the created instance when js/main.js runs late", async () => {
		await gotoSandbox({ coreKey: key });
		const layout = await readCoreLayout();
		await openSidebarTab("config", "general");
		const { atLoad, heldAtLoad } = await reloadStageHoldingSocketIo();

		expect(heldAtLoad > 0).toBe(layout.awaitsSocketIoImport);
		expect(atLoad.loads).toEqual([
			layout.awaitsSocketIoImport ? "undefined" : "object"
		]);

		await expect
			.poll(() =>
				stageEvaluate(() => {
					const scope = globalThis as typeof globalThis & {
						__moduleSandboxModule?: { identifier?: string };
						__MICROCORE__?: { moduleInstance?: unknown };
					};
					if (globalThis.eval("typeof MM") !== "object") {
						return null;
					}
					const mm = globalThis.eval("MM") as {
						getModules: () => Array<{ identifier?: string }>;
					};
					const hooked = scope.__moduleSandboxModule;
					return {
						hooked:
							hooked !== undefined &&
							mm.getModules().includes(hooked),
						inFacade:
							hooked !== undefined &&
							scope.__MICROCORE__?.moduleInstance === hooked
					};
				})
			)
			.toEqual({ hooked: true, inFacade: true });

		// The capture leaves `window.MM` as the core left it: the data
		// property the 2.37+ assignment creates, or none beside the 2.35-2.36
		// lexical binding.
		const descriptor = await stageEvaluate(() => {
			const own = Object.getOwnPropertyDescriptor(globalThis, "MM");
			if (!own) {
				return null;
			}
			return {
				data: "value" in own,
				enumerable: own.enumerable,
				writable: own.writable,
				configurable: own.configurable,
				isCoreMM: own.value === globalThis.eval("MM")
			};
		});
		expect(descriptor).toEqual(
			layout.assignsGlobalMM
				? {
						data: true,
						enumerable: true,
						writable: true,
						configurable: true,
						isCoreMM: true
					}
				: null
		);
	});

	test("a disabled module completes its boot only once the core provided MM", async () => {
		await gotoSandbox({ coreKey: key });
		const layout = await readCoreLayout();
		await openSidebarTab("config", "general");
		await pageCheck("#config-disabled");
		const { atLoad, heldAtLoad } = await reloadStageHoldingSocketIo();

		expect(heldAtLoad > 0).toBe(layout.awaitsSocketIoImport);
		expect(atLoad.loads).toEqual([
			layout.awaitsSocketIoImport ? "undefined" : "object"
		]);
		// While `main.js` is held, the document has loaded but the boot is
		// not complete.
		if (layout.awaitsSocketIoImport) {
			expect(
				atLoad.readies.filter((ready) => ready.bootComplete)
			).toEqual([]);
		}

		await expect
			.poll(() =>
				pageEvaluate(() =>
					Boolean((globalThis as ProbeScope).__MICROCORE__?.bootComplete)
				)
			)
			.toBe(true);
		const { readies } = await readProbe();
		const completed = readies.filter((ready) => ready.bootComplete);
		expect(completed.length).toBeGreaterThan(0);
		expect(completed.map((ready) => ready.mm)).toEqual(
			completed.map(() => "object")
		);
	});
});
