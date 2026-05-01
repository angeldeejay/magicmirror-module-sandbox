/**
 * Unit coverage for the file watcher startup and debounced reload-event dispatch.
 *
 * Internal pure functions (isSandboxPersistedConfigFile, shouldRestartBackend,
 * isHarnessClientSourceFile, isHarnessNodeCompatSourceFile, getReloadScope) are
 * not exported — all assertions are made through the observable side-effects of
 * the "all" event handler captured via the chokidar mock.
 */
import assert from "node:assert/strict";
import path from "node:path";
import { afterEach, beforeEach } from "vitest";
import { harnessRoot, repoRoot } from "../../../server/paths.ts";

// ---------------------------------------------------------------------------
// chokidar mock — intercepts watcher creation and exposes the "all" handler
// ---------------------------------------------------------------------------

/** Captured "all" handler registered by startWatcher */
let capturedAllHandler: ((event: string, filePath: string) => void) | null =
	null;

/** Stub watcher returned by chokidar.watch */
const mockWatcher = {
	/**
	 * Captures the "all" event handler so tests can invoke it directly.
	 *
	 * @param {string} event
	 * @param {Function} handler
	 * @returns {typeof mockWatcher}
	 */
	on(event: string, handler: (event: string, filePath: string) => void) {
		if (event === "all") {
			capturedAllHandler = handler;
		}
		return mockWatcher;
	}
};

vi.mock("chokidar", () => ({
	default: {
		/**
		 * Returns the stub watcher and records invocation details.
		 *
		 * @param {string[]} _paths
		 * @param {object} _options
		 * @returns {typeof mockWatcher}
		 */
		watch(_paths: string[], _options: object) {
			return mockWatcher;
		}
	}
}));

// ---------------------------------------------------------------------------
// node:fs mock — controls existsSync per-test
// ---------------------------------------------------------------------------

vi.mock("node:fs", async (importOriginal) => {
	const actual = await importOriginal<typeof import("node:fs")>();
	return {
		...actual,
		existsSync: vi.fn(() => true)
	};
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Builds a minimal harness-config stub for startWatcher.
 *
 * @param {Partial<{ moduleEntry: string; moduleName: string }>} [overrides]
 * @returns {{ moduleEntry: string; moduleName: string }}
 */
function makeHarnessConfig(
	overrides: Partial<{ moduleEntry: string; moduleName: string }> = {}
) {
	return {
		moduleEntry: "MMM-TestModule.js",
		moduleName: "MMM-TestModule",
		...overrides
	};
}

/**
 * Builds a complete options bag for startWatcher with sensible defaults for
 * all injectable callbacks.
 *
 * @param {object} [overrides]
 * @returns {object}
 */
function makeWatcherOptions(overrides: Record<string, unknown> = {}) {
	return {
		enabled: true,
		io: { emit: vi.fn() },
		restartHelper: vi.fn(async () => {}),
		getHarnessConfig: () => makeHarnessConfig(),
		getModuleConfigPath: () =>
			path.join(repoRoot, "config", "module.config.json"),
		getRuntimeConfigPath: () =>
			path.join(repoRoot, "config", "runtime.config.json"),
		rebuildClientAssets: vi.fn(async () => {}),
		rebuildNodeCompat: vi.fn(async () => {}),
		...overrides
	};
}

/**
 * Fires the captured "all" handler and advances fake timers past the 150 ms
 * debounce, returning after the async callback has settled.
 *
 * @param {string} event
 * @param {string} filePath
 * @returns {Promise<void>}
 */
async function triggerWatchEvent(event: string, filePath: string) {
	assert.ok(capturedAllHandler, "chokidar 'all' handler was not registered");
	capturedAllHandler(event, filePath);
	await vi.advanceTimersByTimeAsync(200);
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

beforeEach(async () => {
	capturedAllHandler = null;
	vi.useFakeTimers();
	vi.spyOn(console, "log").mockImplementation(() => {});
	// Re-apply the default existsSync stub so that any per-test override made
	// via mockReturnValue (e.g. the "existsSync returns false" test) does not
	// bleed into subsequent tests after clearAllMocks resets implementations.
	const fs = await import("node:fs");
	vi.mocked(fs.existsSync).mockImplementation(() => true);
});

afterEach(() => {
	vi.useRealTimers();
	vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tests — startWatcher enabled/disabled
// ---------------------------------------------------------------------------

test("startWatcher returns null immediately when enabled is false", async () => {
	const { startWatcher } = await import("../../../server/watch.ts");
	const result = startWatcher({
		...makeWatcherOptions(),
		enabled: false
	} as any);
	assert.equal(result, null);
});

test("startWatcher returns a watcher object when enabled is true", async () => {
	const { startWatcher } = await import("../../../server/watch.ts");
	const result = startWatcher(makeWatcherOptions() as any);
	assert.equal(result, mockWatcher);
});

test("startWatcher registers an 'all' event handler on the watcher", async () => {
	const { startWatcher } = await import("../../../server/watch.ts");
	startWatcher(makeWatcherOptions() as any);
	assert.ok(
		capturedAllHandler !== null,
		"expected chokidar 'all' handler to be registered"
	);
});

// ---------------------------------------------------------------------------
// Tests — io.emit is always called
// ---------------------------------------------------------------------------

test("io.emit('harness:reload') is called with event, file, scope, and version on any change", async () => {
	const { startWatcher } = await import("../../../server/watch.ts");
	const io = { emit: vi.fn() };
	startWatcher({ ...makeWatcherOptions(), io } as any);

	const filePath = path.join(repoRoot, "MMM-TestModule.js");
	await triggerWatchEvent("change", filePath);

	assert.equal(io.emit.mock.calls.length, 1);
	const [eventName, payload] = io.emit.mock.calls[0];
	assert.equal(eventName, "harness:reload");
	assert.ok(typeof payload.event === "string", "payload.event must be set");
	assert.ok(typeof payload.file === "string", "payload.file must be set");
	assert.ok(typeof payload.scope === "string", "payload.scope must be set");
	assert.ok(typeof payload.version === "string", "payload.version must be set");
});

test("io.emit payload carries the original event name from the watcher", async () => {
	const { startWatcher } = await import("../../../server/watch.ts");
	const io = { emit: vi.fn() };
	startWatcher({ ...makeWatcherOptions(), io } as any);

	const filePath = path.join(repoRoot, "MMM-TestModule.js");
	await triggerWatchEvent("add", filePath);

	const [, payload] = io.emit.mock.calls[0];
	assert.equal(payload.event, "add");
});

// ---------------------------------------------------------------------------
// Tests — restartHelper decision logic (shouldRestartBackend)
// ---------------------------------------------------------------------------

test("restartHelper is called when node_helper.js changes", async () => {
	const { startWatcher } = await import("../../../server/watch.ts");
	const restartHelper = vi.fn(async () => {});
	startWatcher({ ...makeWatcherOptions(), restartHelper } as any);

	await triggerWatchEvent(
		"change",
		path.join(repoRoot, "node_helper.js")
	);

	assert.equal(restartHelper.mock.calls.length, 1);
});

test("restartHelper is called when harness.config.js changes", async () => {
	const { startWatcher } = await import("../../../server/watch.ts");
	const restartHelper = vi.fn(async () => {});
	startWatcher({ ...makeWatcherOptions(), restartHelper } as any);

	await triggerWatchEvent(
		"change",
		path.join(repoRoot, "config", "harness.config.js")
	);

	assert.equal(restartHelper.mock.calls.length, 1);
});

test("restartHelper is called when a persisted module config file changes", async () => {
	const { startWatcher } = await import("../../../server/watch.ts");
	const restartHelper = vi.fn(async () => {});
	startWatcher({ ...makeWatcherOptions(), restartHelper } as any);

	await triggerWatchEvent(
		"change",
		path.join(repoRoot, "config", "module.config.json")
	);

	assert.equal(restartHelper.mock.calls.length, 1);
});

test("restartHelper is called when a persisted runtime config file changes", async () => {
	const { startWatcher } = await import("../../../server/watch.ts");
	const restartHelper = vi.fn(async () => {});
	startWatcher({ ...makeWatcherOptions(), restartHelper } as any);

	await triggerWatchEvent(
		"change",
		path.join(repoRoot, "config", "runtime.config.json")
	);

	assert.equal(restartHelper.mock.calls.length, 1);
});

test("restartHelper is NOT called when a plain module JS file changes", async () => {
	const { startWatcher } = await import("../../../server/watch.ts");
	const restartHelper = vi.fn(async () => {});
	startWatcher({ ...makeWatcherOptions(), restartHelper } as any);

	// A root-level JS file that is not node_helper, cache-manager, or harness.config
	await triggerWatchEvent(
		"change",
		path.join(repoRoot, "MMM-TestModule.js")
	);

	assert.equal(restartHelper.mock.calls.length, 0);
});

// ---------------------------------------------------------------------------
// Tests — getReloadScope
// ---------------------------------------------------------------------------

test("scope is 'stage' for the module entry file", async () => {
	const { startWatcher } = await import("../../../server/watch.ts");
	const io = { emit: vi.fn() };
	startWatcher({
		...makeWatcherOptions({
			io,
			getHarnessConfig: () =>
				makeHarnessConfig({ moduleEntry: "MMM-TestModule.js" })
		})
	} as any);

	await triggerWatchEvent(
		"change",
		path.join(repoRoot, "MMM-TestModule.js")
	);

	const [, payload] = io.emit.mock.calls[0];
	assert.equal(payload.scope, "stage");
});

test("scope is 'stage' for node_helper.js", async () => {
	const { startWatcher } = await import("../../../server/watch.ts");
	const io = { emit: vi.fn() };
	startWatcher({ ...makeWatcherOptions({ io }) } as any);

	await triggerWatchEvent(
		"change",
		path.join(repoRoot, "node_helper.js")
	);

	const [, payload] = io.emit.mock.calls[0];
	assert.equal(payload.scope, "stage");
});

test("scope is 'stage' for a persisted config file", async () => {
	const { startWatcher } = await import("../../../server/watch.ts");
	const io = { emit: vi.fn() };
	startWatcher({ ...makeWatcherOptions({ io }) } as any);

	await triggerWatchEvent(
		"change",
		path.join(repoRoot, "config", "module.config.json")
	);

	const [, payload] = io.emit.mock.calls[0];
	assert.equal(payload.scope, "stage");
});

test("scope is 'shell' for a file not matching any stage path", async () => {
	const { startWatcher } = await import("../../../server/watch.ts");
	const io = { emit: vi.fn() };
	startWatcher({ ...makeWatcherOptions({ io }) } as any);

	// A file outside all known stage paths
	await triggerWatchEvent(
		"change",
		path.join(repoRoot, "some-unknown-file.css")
	);

	const [, payload] = io.emit.mock.calls[0];
	assert.equal(payload.scope, "shell");
});

// ---------------------------------------------------------------------------
// Tests — rebuildClientAssets
// ---------------------------------------------------------------------------

test("rebuildClientAssets is called for a harness client .ts source file", async () => {
	const { startWatcher } = await import("../../../server/watch.ts");
	const rebuildClientAssets = vi.fn(async () => {});
	startWatcher({ ...makeWatcherOptions({ rebuildClientAssets }) } as any);

	const clientTsFile = path.join(harnessRoot, "client", "app.ts");
	await triggerWatchEvent("change", clientTsFile);

	assert.equal(rebuildClientAssets.mock.calls.length, 1);
});

test("rebuildClientAssets is called for a harness client .tsx source file", async () => {
	const { startWatcher } = await import("../../../server/watch.ts");
	const rebuildClientAssets = vi.fn(async () => {});
	startWatcher({ ...makeWatcherOptions({ rebuildClientAssets }) } as any);

	const clientTsxFile = path.join(
		harnessRoot,
		"client",
		"components",
		"Widget.tsx"
	);
	await triggerWatchEvent("change", clientTsxFile);

	assert.equal(rebuildClientAssets.mock.calls.length, 1);
});

test("rebuildClientAssets is called for a harness client .scss source file", async () => {
	const { startWatcher } = await import("../../../server/watch.ts");
	const rebuildClientAssets = vi.fn(async () => {});
	startWatcher({ ...makeWatcherOptions({ rebuildClientAssets }) } as any);

	const clientScssFile = path.join(
		harnessRoot,
		"client",
		"styles-source",
		"theme.scss"
	);
	await triggerWatchEvent("change", clientScssFile);

	assert.equal(rebuildClientAssets.mock.calls.length, 1);
});

test("rebuildClientAssets is NOT called for a file inside the generated/ subdirectory", async () => {
	const { startWatcher } = await import("../../../server/watch.ts");
	const rebuildClientAssets = vi.fn(async () => {});
	startWatcher({ ...makeWatcherOptions({ rebuildClientAssets }) } as any);

	const generatedFile = path.join(
		harnessRoot,
		"client",
		"generated",
		"runtime",
		"stage-bridge.ts"
	);
	await triggerWatchEvent("change", generatedFile);

	assert.equal(rebuildClientAssets.mock.calls.length, 0);
});

test("rebuildClientAssets is NOT called on unlink events", async () => {
	const { startWatcher } = await import("../../../server/watch.ts");
	const rebuildClientAssets = vi.fn(async () => {});
	startWatcher({ ...makeWatcherOptions({ rebuildClientAssets }) } as any);

	const clientTsFile = path.join(harnessRoot, "client", "app.ts");
	await triggerWatchEvent("unlink", clientTsFile);

	assert.equal(rebuildClientAssets.mock.calls.length, 0);
});

test("rebuildClientAssets is NOT called when existsSync returns false", async () => {
	const { startWatcher } = await import("../../../server/watch.ts");
	const fs = await import("node:fs");
	vi.mocked(fs.existsSync).mockReturnValue(false);

	const rebuildClientAssets = vi.fn(async () => {});
	startWatcher({ ...makeWatcherOptions({ rebuildClientAssets }) } as any);

	const clientTsFile = path.join(harnessRoot, "client", "app.ts");
	await triggerWatchEvent("change", clientTsFile);

	assert.equal(rebuildClientAssets.mock.calls.length, 0);
});

// ---------------------------------------------------------------------------
// Tests — rebuildNodeCompat
// ---------------------------------------------------------------------------

test("rebuildNodeCompat is called for a harness shim .ts file", async () => {
	const { startWatcher } = await import("../../../server/watch.ts");
	const rebuildNodeCompat = vi.fn(async () => {});
	startWatcher({ ...makeWatcherOptions({ rebuildNodeCompat }) } as any);

	const shimFile = path.join(harnessRoot, "shims", "node-compat.ts");
	await triggerWatchEvent("change", shimFile);

	assert.equal(rebuildNodeCompat.mock.calls.length, 1);
});

test("rebuildNodeCompat is NOT called for a shim file inside generated/", async () => {
	const { startWatcher } = await import("../../../server/watch.ts");
	const rebuildNodeCompat = vi.fn(async () => {});
	startWatcher({ ...makeWatcherOptions({ rebuildNodeCompat }) } as any);

	const generatedShim = path.join(
		harnessRoot,
		"shims",
		"generated",
		"node-compat.ts"
	);
	await triggerWatchEvent("change", generatedShim);

	assert.equal(rebuildNodeCompat.mock.calls.length, 0);
});

test("rebuildNodeCompat is NOT called on unlink events", async () => {
	const { startWatcher } = await import("../../../server/watch.ts");
	const rebuildNodeCompat = vi.fn(async () => {});
	startWatcher({ ...makeWatcherOptions({ rebuildNodeCompat }) } as any);

	const shimFile = path.join(harnessRoot, "shims", "node-compat.ts");
	await triggerWatchEvent("unlink", shimFile);

	assert.equal(rebuildNodeCompat.mock.calls.length, 0);
});

// ---------------------------------------------------------------------------
// Tests — debounce coalescing
// ---------------------------------------------------------------------------

test("rapid successive change events are coalesced into a single handler invocation", async () => {
	const { startWatcher } = await import("../../../server/watch.ts");
	const io = { emit: vi.fn() };
	startWatcher({ ...makeWatcherOptions({ io }) } as any);

	const filePath = path.join(repoRoot, "node_helper.js");
	assert.ok(capturedAllHandler, "handler must be registered");
	// Fire three events quickly before the 150 ms debounce expires
	capturedAllHandler("change", filePath);
	capturedAllHandler("change", filePath);
	capturedAllHandler("change", filePath);
	await vi.advanceTimersByTimeAsync(200);

	// Only one io.emit should fire despite three rapid events
	assert.equal(io.emit.mock.calls.length, 1);
});
