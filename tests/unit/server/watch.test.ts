/**
 * Unit coverage for the module watcher and sandbox watcher (Correction 4).
 *
 * Two independent watchers with separate responsibilities:
 *   - startModuleWatcher: always-on, scope "stage", restartHelper on all
 *     non-style/non-translation module changes.
 *   - startSandboxWatcher: watch-mode only, scope "shell", triggers rebuilds,
 *     restartHelper only on sandbox config file changes.
 *
 * Internal pure functions are not exported — all assertions are made through
 * observable side-effects captured via the chokidar mock.
 */
import assert from "node:assert/strict";
import path from "node:path";
import { afterEach, beforeEach } from "vitest";
import { harnessRoot, repoRoot } from "../../../server/paths.ts";

// ---------------------------------------------------------------------------
// chokidar mock — intercepts watcher creation and exposes the "all" handler
// ---------------------------------------------------------------------------

/** Captured "all" handlers per chokidar.watch() call order */
const capturedHandlers: Array<
	((event: string, filePath: string) => void) | null
> = [];

/** Stub watcher returned by chokidar.watch */
function makeMockWatcher() {
	const watcher = {
		/**
		 * Captures the "all" event handler so tests can invoke it directly.
		 */
		on(event: string, handler: (event: string, filePath: string) => void) {
			if (event === "all") {
				capturedHandlers.push(handler);
			}
			return watcher;
		}
	};
	return watcher;
}

let mockWatchers: ReturnType<typeof makeMockWatcher>[] = [];

vi.mock("chokidar", () => ({
	default: {
		/**
		 * Returns a new stub watcher on each call.
		 */
		watch(_paths: string[], _options: object) {
			const w = makeMockWatcher();
			mockWatchers.push(w);
			return w;
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
 * Returns the most recently captured "all" handler (last watcher created).
 */
function lastHandler(): (event: string, filePath: string) => void {
	const h = capturedHandlers.at(-1);
	assert.ok(h, "chokidar 'all' handler was not registered");
	return h;
}

/**
 * Returns the handler captured at position i (0-indexed creation order).
 */
function handlerAt(i: number): (event: string, filePath: string) => void {
	const h = capturedHandlers[i];
	assert.ok(h, `chokidar 'all' handler at index ${i} was not registered`);
	return h;
}

/**
 * Fires a handler and advances fake timers past the 150 ms debounce.
 */
async function triggerEvent(
	handler: (event: string, filePath: string) => void,
	event: string,
	filePath: string
) {
	handler(event, filePath);
	await vi.advanceTimersByTimeAsync(200);
}

/**
 * Builds the minimal options for startModuleWatcher.
 */
function makeModuleWatcherOptions(overrides: Record<string, unknown> = {}) {
	return {
		io: { emit: vi.fn() },
		restartHelper: vi.fn(async () => {}),
		...overrides
	};
}

/**
 * Builds the minimal options for startSandboxWatcher.
 */
function makeSandboxWatcherOptions(overrides: Record<string, unknown> = {}) {
	return {
		enabled: true,
		io: { emit: vi.fn() },
		restartHelper: vi.fn(async () => {}),
		getModuleConfigPath: () =>
			path.join(repoRoot, "config", "module.config.json"),
		getRuntimeConfigPath: () =>
			path.join(repoRoot, "config", "runtime.config.json"),
		rebuildClientAssets: vi.fn(async () => {}),
		rebuildNodeCompat: vi.fn(async () => {}),
		...overrides
	};
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

beforeEach(async () => {
	capturedHandlers.length = 0;
	mockWatchers.length = 0;
	vi.useFakeTimers();
	vi.spyOn(console, "log").mockImplementation(() => {});
	const fs = await import("node:fs");
	vi.mocked(fs.existsSync).mockImplementation(() => true);
});

afterEach(() => {
	vi.useRealTimers();
	vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// startModuleWatcher — enabled / watcher creation
// ---------------------------------------------------------------------------

test("startModuleWatcher returns a watcher object (always-on, no enabled flag)", async () => {
	const { startModuleWatcher } = await import("../../../server/watch.ts");
	const result = startModuleWatcher(makeModuleWatcherOptions() as any);
	assert.ok(result !== null, "startModuleWatcher must return a watcher");
});

test("startModuleWatcher registers an 'all' event handler on the watcher", async () => {
	const { startModuleWatcher } = await import("../../../server/watch.ts");
	startModuleWatcher(makeModuleWatcherOptions() as any);
	assert.ok(
		capturedHandlers.length > 0,
		"expected chokidar 'all' handler to be registered"
	);
});

// ---------------------------------------------------------------------------
// startModuleWatcher — scope is always "stage"
// ---------------------------------------------------------------------------

test("startModuleWatcher: io.emit scope is always 'stage' for any module file change", async () => {
	const { startModuleWatcher } = await import("../../../server/watch.ts");
	const io = { emit: vi.fn() };
	startModuleWatcher({ ...makeModuleWatcherOptions(), io } as any);

	await triggerEvent(
		lastHandler(),
		"change",
		path.join(repoRoot, "MMM-TestModule.js")
	);

	const [, payload] = io.emit.mock.calls[0];
	assert.equal(payload.scope, "stage");
});

test("startModuleWatcher: io.emit scope is 'stage' for node_helper.js", async () => {
	const { startModuleWatcher } = await import("../../../server/watch.ts");
	const io = { emit: vi.fn() };
	startModuleWatcher({ ...makeModuleWatcherOptions(), io } as any);

	await triggerEvent(
		lastHandler(),
		"change",
		path.join(repoRoot, "node_helper.js")
	);

	const [, payload] = io.emit.mock.calls[0];
	assert.equal(payload.scope, "stage");
});

test("startModuleWatcher: io.emit scope is 'stage' for a CSS file", async () => {
	const { startModuleWatcher } = await import("../../../server/watch.ts");
	const io = { emit: vi.fn() };
	startModuleWatcher({ ...makeModuleWatcherOptions(), io } as any);

	await triggerEvent(
		lastHandler(),
		"change",
		path.join(repoRoot, "MMM-TestModule.css")
	);

	const [, payload] = io.emit.mock.calls[0];
	assert.equal(payload.scope, "stage");
});

test("startModuleWatcher: io.emit payload carries event name, file, scope, and version", async () => {
	const { startModuleWatcher } = await import("../../../server/watch.ts");
	const io = { emit: vi.fn() };
	startModuleWatcher({ ...makeModuleWatcherOptions(), io } as any);

	await triggerEvent(
		lastHandler(),
		"add",
		path.join(repoRoot, "MMM-TestModule.js")
	);

	assert.equal(io.emit.mock.calls.length, 1);
	const [eventName, payload] = io.emit.mock.calls[0];
	assert.equal(eventName, "harness:reload");
	assert.equal(payload.event, "add");
	assert.ok(typeof payload.file === "string");
	assert.equal(payload.scope, "stage");
	assert.ok(typeof payload.version === "string");
});

// ---------------------------------------------------------------------------
// startModuleWatcher — restartHelper logic
// ---------------------------------------------------------------------------

test("startModuleWatcher: restartHelper IS called for node_helper.js", async () => {
	const { startModuleWatcher } = await import("../../../server/watch.ts");
	const restartHelper = vi.fn(async () => {});
	startModuleWatcher({
		...makeModuleWatcherOptions(),
		restartHelper
	} as any);

	await triggerEvent(
		lastHandler(),
		"change",
		path.join(repoRoot, "node_helper.js")
	);

	assert.equal(restartHelper.mock.calls.length, 1);
});

test("startModuleWatcher: restartHelper IS called for plain module JS files", async () => {
	const { startModuleWatcher } = await import("../../../server/watch.ts");
	const restartHelper = vi.fn(async () => {});
	startModuleWatcher({
		...makeModuleWatcherOptions(),
		restartHelper
	} as any);

	// Any JS file in the module triggers restartHelper (stateful node_helper requirement)
	await triggerEvent(
		lastHandler(),
		"change",
		path.join(repoRoot, "MMM-TestModule.js")
	);

	assert.equal(restartHelper.mock.calls.length, 1);
});

test("startModuleWatcher: restartHelper is NOT called for CSS files", async () => {
	const { startModuleWatcher } = await import("../../../server/watch.ts");
	const restartHelper = vi.fn(async () => {});
	startModuleWatcher({
		...makeModuleWatcherOptions(),
		restartHelper
	} as any);

	await triggerEvent(
		lastHandler(),
		"change",
		path.join(repoRoot, "MMM-TestModule.css")
	);

	assert.equal(restartHelper.mock.calls.length, 0);
});

test("startModuleWatcher: restartHelper is NOT called for SCSS files", async () => {
	const { startModuleWatcher } = await import("../../../server/watch.ts");
	const restartHelper = vi.fn(async () => {});
	startModuleWatcher({
		...makeModuleWatcherOptions(),
		restartHelper
	} as any);

	await triggerEvent(
		lastHandler(),
		"change",
		path.join(repoRoot, "MMM-TestModule.scss")
	);

	assert.equal(restartHelper.mock.calls.length, 0);
});

test("startModuleWatcher: restartHelper is NOT called for translation files", async () => {
	const { startModuleWatcher } = await import("../../../server/watch.ts");
	const restartHelper = vi.fn(async () => {});
	startModuleWatcher({
		...makeModuleWatcherOptions(),
		restartHelper
	} as any);

	await triggerEvent(
		lastHandler(),
		"change",
		path.join(repoRoot, "translations", "en.json")
	);

	assert.equal(restartHelper.mock.calls.length, 0);
});

// ---------------------------------------------------------------------------
// startModuleWatcher — debounce coalescing
// ---------------------------------------------------------------------------

test("startModuleWatcher: rapid successive events are coalesced into one handler invocation", async () => {
	const { startModuleWatcher } = await import("../../../server/watch.ts");
	const io = { emit: vi.fn() };
	startModuleWatcher({ ...makeModuleWatcherOptions(), io } as any);

	const handler = lastHandler();
	const filePath = path.join(repoRoot, "node_helper.js");
	handler("change", filePath);
	handler("change", filePath);
	handler("change", filePath);
	await vi.advanceTimersByTimeAsync(200);

	assert.equal(io.emit.mock.calls.length, 1);
});

// ---------------------------------------------------------------------------
// startSandboxWatcher — enabled / disabled
// ---------------------------------------------------------------------------

test("startSandboxWatcher returns null when enabled is false", async () => {
	const { startSandboxWatcher } = await import("../../../server/watch.ts");
	const result = startSandboxWatcher({
		...makeSandboxWatcherOptions(),
		enabled: false
	} as any);
	assert.equal(result, null);
});

test("startSandboxWatcher returns a watcher object when enabled is true", async () => {
	const { startSandboxWatcher } = await import("../../../server/watch.ts");
	const result = startSandboxWatcher(makeSandboxWatcherOptions() as any);
	assert.ok(result !== null, "startSandboxWatcher must return a watcher");
});

test("startSandboxWatcher registers an 'all' event handler", async () => {
	const { startSandboxWatcher } = await import("../../../server/watch.ts");
	startSandboxWatcher(makeSandboxWatcherOptions() as any);
	assert.ok(capturedHandlers.length > 0);
});

// ---------------------------------------------------------------------------
// startSandboxWatcher — scope is always "shell"
// ---------------------------------------------------------------------------

test("startSandboxWatcher: io.emit scope is always 'shell' for harness client changes", async () => {
	const { startSandboxWatcher } = await import("../../../server/watch.ts");
	const io = { emit: vi.fn() };
	startSandboxWatcher({ ...makeSandboxWatcherOptions(), io } as any);

	await triggerEvent(
		lastHandler(),
		"change",
		path.join(harnessRoot, "client", "app.ts")
	);

	const [, payload] = io.emit.mock.calls[0];
	assert.equal(payload.scope, "shell");
});

test("startSandboxWatcher: io.emit scope is 'shell' for config file changes", async () => {
	const { startSandboxWatcher } = await import("../../../server/watch.ts");
	const io = { emit: vi.fn() };
	startSandboxWatcher({ ...makeSandboxWatcherOptions(), io } as any);

	await triggerEvent(
		lastHandler(),
		"change",
		path.join(repoRoot, "config", "module.config.json")
	);

	const [, payload] = io.emit.mock.calls[0];
	assert.equal(payload.scope, "shell");
});

// ---------------------------------------------------------------------------
// startSandboxWatcher — restartHelper logic
// ---------------------------------------------------------------------------

test("startSandboxWatcher: restartHelper is called when harness.config.js changes", async () => {
	const { startSandboxWatcher } = await import("../../../server/watch.ts");
	const restartHelper = vi.fn(async () => {});
	startSandboxWatcher({
		...makeSandboxWatcherOptions(),
		restartHelper
	} as any);

	await triggerEvent(
		lastHandler(),
		"change",
		path.join(repoRoot, "config", "harness.config.js")
	);

	assert.equal(restartHelper.mock.calls.length, 1);
});

test("startSandboxWatcher: restartHelper is called when a persisted module config file changes", async () => {
	const { startSandboxWatcher } = await import("../../../server/watch.ts");
	const restartHelper = vi.fn(async () => {});
	startSandboxWatcher({
		...makeSandboxWatcherOptions(),
		restartHelper
	} as any);

	await triggerEvent(
		lastHandler(),
		"change",
		path.join(repoRoot, "config", "module.config.json")
	);

	assert.equal(restartHelper.mock.calls.length, 1);
});

test("startSandboxWatcher: restartHelper is called when a persisted runtime config file changes", async () => {
	const { startSandboxWatcher } = await import("../../../server/watch.ts");
	const restartHelper = vi.fn(async () => {});
	startSandboxWatcher({
		...makeSandboxWatcherOptions(),
		restartHelper
	} as any);

	await triggerEvent(
		lastHandler(),
		"change",
		path.join(repoRoot, "config", "runtime.config.json")
	);

	assert.equal(restartHelper.mock.calls.length, 1);
});

test("startSandboxWatcher: restartHelper is NOT called for a harness client .ts file", async () => {
	const { startSandboxWatcher } = await import("../../../server/watch.ts");
	const restartHelper = vi.fn(async () => {});
	startSandboxWatcher({
		...makeSandboxWatcherOptions(),
		restartHelper
	} as any);

	await triggerEvent(
		lastHandler(),
		"change",
		path.join(harnessRoot, "client", "app.ts")
	);

	assert.equal(restartHelper.mock.calls.length, 0);
});

// ---------------------------------------------------------------------------
// startSandboxWatcher — rebuildClientAssets
// ---------------------------------------------------------------------------

test("startSandboxWatcher: rebuildClientAssets is called for a harness client .ts file", async () => {
	const { startSandboxWatcher } = await import("../../../server/watch.ts");
	const rebuildClientAssets = vi.fn(async () => {});
	startSandboxWatcher({
		...makeSandboxWatcherOptions(),
		rebuildClientAssets
	} as any);

	await triggerEvent(
		lastHandler(),
		"change",
		path.join(harnessRoot, "client", "app.ts")
	);

	assert.equal(rebuildClientAssets.mock.calls.length, 1);
});

test("startSandboxWatcher: rebuildClientAssets is called for a harness client .tsx file", async () => {
	const { startSandboxWatcher } = await import("../../../server/watch.ts");
	const rebuildClientAssets = vi.fn(async () => {});
	startSandboxWatcher({
		...makeSandboxWatcherOptions(),
		rebuildClientAssets
	} as any);

	await triggerEvent(
		lastHandler(),
		"change",
		path.join(harnessRoot, "client", "components", "Widget.tsx")
	);

	assert.equal(rebuildClientAssets.mock.calls.length, 1);
});

test("startSandboxWatcher: rebuildClientAssets is called for a harness client .scss file", async () => {
	const { startSandboxWatcher } = await import("../../../server/watch.ts");
	const rebuildClientAssets = vi.fn(async () => {});
	startSandboxWatcher({
		...makeSandboxWatcherOptions(),
		rebuildClientAssets
	} as any);

	await triggerEvent(
		lastHandler(),
		"change",
		path.join(harnessRoot, "client", "styles-source", "theme.scss")
	);

	assert.equal(rebuildClientAssets.mock.calls.length, 1);
});

test("startSandboxWatcher: rebuildClientAssets is NOT called for generated/ files", async () => {
	const { startSandboxWatcher } = await import("../../../server/watch.ts");
	const rebuildClientAssets = vi.fn(async () => {});
	startSandboxWatcher({
		...makeSandboxWatcherOptions(),
		rebuildClientAssets
	} as any);

	await triggerEvent(
		lastHandler(),
		"change",
		path.join(
			harnessRoot,
			"client",
			"generated",
			"runtime",
			"stage-bridge.ts"
		)
	);

	assert.equal(rebuildClientAssets.mock.calls.length, 0);
});

test("startSandboxWatcher: rebuildClientAssets is NOT called on unlink events", async () => {
	const { startSandboxWatcher } = await import("../../../server/watch.ts");
	const rebuildClientAssets = vi.fn(async () => {});
	startSandboxWatcher({
		...makeSandboxWatcherOptions(),
		rebuildClientAssets
	} as any);

	await triggerEvent(
		lastHandler(),
		"unlink",
		path.join(harnessRoot, "client", "app.ts")
	);

	assert.equal(rebuildClientAssets.mock.calls.length, 0);
});

test("startSandboxWatcher: rebuildClientAssets is NOT called when existsSync returns false", async () => {
	const { startSandboxWatcher } = await import("../../../server/watch.ts");
	const fs = await import("node:fs");
	vi.mocked(fs.existsSync).mockReturnValue(false);

	const rebuildClientAssets = vi.fn(async () => {});
	startSandboxWatcher({
		...makeSandboxWatcherOptions(),
		rebuildClientAssets
	} as any);

	await triggerEvent(
		lastHandler(),
		"change",
		path.join(harnessRoot, "client", "app.ts")
	);

	assert.equal(rebuildClientAssets.mock.calls.length, 0);
});

// ---------------------------------------------------------------------------
// startSandboxWatcher — rebuildNodeCompat
// ---------------------------------------------------------------------------

test("startSandboxWatcher: rebuildNodeCompat is called for a harness shim .ts file", async () => {
	const { startSandboxWatcher } = await import("../../../server/watch.ts");
	const rebuildNodeCompat = vi.fn(async () => {});
	startSandboxWatcher({
		...makeSandboxWatcherOptions(),
		rebuildNodeCompat
	} as any);

	await triggerEvent(
		lastHandler(),
		"change",
		path.join(harnessRoot, "shims", "node-compat.ts")
	);

	assert.equal(rebuildNodeCompat.mock.calls.length, 1);
});

test("startSandboxWatcher: rebuildNodeCompat is NOT called for generated/ shim files", async () => {
	const { startSandboxWatcher } = await import("../../../server/watch.ts");
	const rebuildNodeCompat = vi.fn(async () => {});
	startSandboxWatcher({
		...makeSandboxWatcherOptions(),
		rebuildNodeCompat
	} as any);

	await triggerEvent(
		lastHandler(),
		"change",
		path.join(harnessRoot, "shims", "generated", "node-compat.ts")
	);

	assert.equal(rebuildNodeCompat.mock.calls.length, 0);
});

test("startSandboxWatcher: rebuildNodeCompat is NOT called on unlink events", async () => {
	const { startSandboxWatcher } = await import("../../../server/watch.ts");
	const rebuildNodeCompat = vi.fn(async () => {});
	startSandboxWatcher({
		...makeSandboxWatcherOptions(),
		rebuildNodeCompat
	} as any);

	await triggerEvent(
		lastHandler(),
		"unlink",
		path.join(harnessRoot, "shims", "node-compat.ts")
	);

	assert.equal(rebuildNodeCompat.mock.calls.length, 0);
});

// ---------------------------------------------------------------------------
// startSandboxWatcher — debounce coalescing
// ---------------------------------------------------------------------------

test("startSandboxWatcher: rapid successive events are coalesced into one handler invocation", async () => {
	const { startSandboxWatcher } = await import("../../../server/watch.ts");
	const io = { emit: vi.fn() };
	startSandboxWatcher({ ...makeSandboxWatcherOptions(), io } as any);

	const handler = lastHandler();
	const filePath = path.join(harnessRoot, "client", "app.ts");
	handler("change", filePath);
	handler("change", filePath);
	handler("change", filePath);
	await vi.advanceTimersByTimeAsync(200);

	assert.equal(io.emit.mock.calls.length, 1);
});
