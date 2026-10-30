// @vitest-environment happy-dom
/**
 * The stage bridge's `stage-ready` payload reports the core's own
 * `window.mmVersion` once the core page set it.
 */
import { afterEach, beforeEach, expect, test, vi } from "vitest";

type Posted = { type: string; detail: Record<string, unknown> };
type BridgeScope = typeof globalThis & {
	__MICROCORE__?: Record<string, unknown>;
	mmVersion?: string;
};

let posted: Posted[];
/** The window listeners each loaded bridge added, removed after each test. */
const bridgeListeners: Array<[string, EventListenerOrEventListenerObject]> =
	[];

/** Loads the bridge against a fake core and a fake parent shell window. */
async function loadBridge(core: Record<string, unknown>) {
	vi.resetModules();
	const scope = globalThis as BridgeScope;
	scope.__MICROCORE__ = core;
	const addEventListener = globalThis.addEventListener.bind(globalThis);
	const spy = vi
		.spyOn(globalThis, "addEventListener")
		.mockImplementation((type, listener, options) => {
			if (listener) {
				bridgeListeners.push([type, listener]);
			}
			addEventListener(type, listener, options);
		});
	try {
		await import("../../../client/runtime/stage-bridge.ts");
	} finally {
		spy.mockRestore();
	}
	return core as { publishStageReady: (bootComplete?: boolean) => void };
}

beforeEach(() => {
	posted = [];
	Object.defineProperty(window, "parent", {
		configurable: true,
		value: {
			postMessage: (message: Posted) => {
				posted.push(message);
			}
		}
	});
});

afterEach(() => {
	for (const [type, listener] of bridgeListeners.splice(0)) {
		globalThis.removeEventListener(type, listener);
	}
	Reflect.deleteProperty(window, "parent");
	delete (globalThis as BridgeScope).__MICROCORE__;
	delete (globalThis as BridgeScope).mmVersion;
});

test("stage-ready reports the core's mmVersion", async () => {
	(globalThis as BridgeScope).mmVersion = "2.38.0";
	const core = await loadBridge({ unavailableHooks: [] });

	core.publishStageReady(true);

	expect(posted).toHaveLength(1);
	expect(posted[0].type).toBe("stage-ready");
	expect(posted[0].detail.mmVersion).toBe("2.38.0");
});

test("stage-ready omits mmVersion when the core set none", async () => {
	const core = await loadBridge({});

	core.publishStageReady();

	expect("mmVersion" in posted[0].detail).toBe(false);
});

test("stage-ready omits an empty mmVersion", async () => {
	(globalThis as BridgeScope).mmVersion = "";
	const core = await loadBridge({});

	core.publishStageReady();

	expect("mmVersion" in posted[0].detail).toBe(false);
});

test.each([
	{ booted: false, domCreated: false, expected: false },
	{ booted: false, domCreated: true, expected: true },
	{ booted: true, domCreated: false, expected: true }
])(
	"a snapshot request reports the boot as complete=$expected (booted=$booted, domCreated=$domCreated)",
	async ({ booted, domCreated, expected }) => {
		// A disabled module creates no DOM: its completed boot must survive
		// the snapshot the shell requests on every frame load.
		await loadBridge({
			bootComplete: booted,
			lifecycleState: { domCreated }
		});

		globalThis.dispatchEvent(
			new MessageEvent("message", {
				data: {
					source: "module-sandbox-shell",
					type: "request-stage-snapshot",
					detail: {}
				},
				origin: globalThis.location.origin,
				source: window.parent as unknown as Window
			})
		);

		const ready = posted.filter((message) => message.type === "stage-ready");
		expect(ready.map((message) => message.detail.bootComplete)).toEqual([
			expected
		]);
	}
);
