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

/** Loads the bridge against a fake core and a fake parent shell window. */
async function loadBridge(core: Record<string, unknown>) {
	vi.resetModules();
	const scope = globalThis as BridgeScope;
	scope.__MICROCORE__ = core;
	await import("../../../client/runtime/stage-bridge.ts");
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
