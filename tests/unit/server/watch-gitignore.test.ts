/**
 * Unit coverage for server/watch.ts — gitignore integration and file classifiers
 * that are not covered by watch.test.ts.
 *
 * Uses vi.resetModules() before each test to get a fresh watch.ts instance
 * with moduleGitignoreMatcher = null, ensuring gitignore state doesn't leak
 * between tests.
 */
import assert from "node:assert/strict";
import path from "node:path";
import { harnessRoot, repoRoot } from "../../../server/paths.ts";
import {
	isModuleWatcherIgnored,
	isSandboxWatcherIgnored
} from "../../../server/watch.ts";

// ---------------------------------------------------------------------------
// chokidar mock — captures the "all" handler per watcher creation
// ---------------------------------------------------------------------------

let capturedHandler: ((event: string, filePath: string) => void) | null = null;

vi.mock("chokidar", () => ({
	default: {
		watch() {
			const w = {
				on(evt: string, h: (e: string, fp: string) => void) {
					if (evt === "all") capturedHandler = h;
					return w;
				}
			};
			return w;
		}
	}
}));

// ---------------------------------------------------------------------------
// node:fs mock — existsSync and readFileSync fully controlled per test
// ---------------------------------------------------------------------------

vi.mock("node:fs", async (importOriginal) => {
	const actual = await importOriginal<typeof import("node:fs")>();
	return {
		...actual,
		existsSync: vi.fn(() => true),
		readFileSync: vi.fn((...args: Parameters<typeof actual.readFileSync>) =>
			actual.readFileSync(...args)
		)
	};
});

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

beforeEach(() => {
	capturedHandler = null;
	vi.resetModules();
	vi.useFakeTimers();
	vi.spyOn(console, "log").mockImplementation(() => {});
	vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
	vi.useRealTimers();
	vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function makeModuleWatcher(overrides: Record<string, unknown> = {}) {
	const { startModuleWatcher } = await import("../../../server/watch.ts");
	const io = { emit: vi.fn() };
	const restartHelper = vi.fn(async () => {});
	startModuleWatcher({ io, restartHelper, ...overrides } as any);
	return { io, restartHelper };
}

async function trigger(event: string, filePath: string) {
	assert.ok(capturedHandler, "handler not registered");
	capturedHandler(event, filePath);
	await vi.advanceTimersByTimeAsync(200);
}

// ---------------------------------------------------------------------------
// isRelevantFile — irrelevant extensions are silently dropped
// ---------------------------------------------------------------------------

test("module watcher ignores image files (no io.emit)", async () => {
	const { io } = await makeModuleWatcher();
	await trigger("change", path.join(repoRoot, "screenshot.png"));
	assert.equal(io.emit.mock.calls.length, 0);
});

test("module watcher ignores lock files (no io.emit)", async () => {
	const { io } = await makeModuleWatcher();
	await trigger("change", path.join(repoRoot, "package-lock.json.bak"));
	assert.equal(io.emit.mock.calls.length, 0);
});

test("module watcher processes .md files (io.emit called)", async () => {
	const { io } = await makeModuleWatcher();
	await trigger("change", path.join(repoRoot, "README.md"));
	assert.equal(io.emit.mock.calls.length, 1);
});

// ---------------------------------------------------------------------------
// .gitignore file itself — reloads patterns, does NOT emit reload
// ---------------------------------------------------------------------------

test("module watcher reloads .gitignore patterns when .gitignore changes (no io.emit)", async () => {
	const { io } = await makeModuleWatcher();
	const gitignorePath = path.join(repoRoot, ".gitignore");
	await trigger("change", gitignorePath);
	assert.equal(io.emit.mock.calls.length, 0);
});

// ---------------------------------------------------------------------------
// isIgnoredByModuleGitignore — no .gitignore present
// ---------------------------------------------------------------------------

test("module watcher emits reload for all relevant files when .gitignore does not exist", async () => {
	const fs = await import("node:fs");
	vi.mocked(fs.existsSync).mockImplementation((p) => {
		if (String(p).endsWith(".gitignore")) return false;
		return true;
	});

	const { io } = await makeModuleWatcher();
	await trigger("change", path.join(repoRoot, "dist", "output.js"));
	assert.equal(io.emit.mock.calls.length, 1);
});

// ---------------------------------------------------------------------------
// isIgnoredByModuleGitignore — .gitignore present, patterns applied
// ---------------------------------------------------------------------------

test("module watcher skips files matched by .gitignore patterns", async () => {
	const fs = await import("node:fs");
	const gitignorePath = path.join(repoRoot, ".gitignore").replace(/\\/g, "/");

	vi.mocked(fs.existsSync).mockImplementation(() => true);
	vi.mocked(fs.readFileSync).mockImplementation((p: any) => {
		if (String(p).replace(/\\/g, "/") === gitignorePath) {
			return "dist/\n";
		}
		return (require("node:fs") as typeof import("node:fs")).readFileSync(
			p
		) as any;
	});

	const { io } = await makeModuleWatcher();
	// File inside dist/ — should be ignored
	await trigger("change", path.join(repoRoot, "dist", "output.js"));
	assert.equal(io.emit.mock.calls.length, 0);
});

test("module watcher does NOT skip files outside repoRoot even if gitignore is set", async () => {
	const fs = await import("node:fs");
	const gitignorePath = path.join(repoRoot, ".gitignore").replace(/\\/g, "/");

	vi.mocked(fs.existsSync).mockImplementation(() => true);
	vi.mocked(fs.readFileSync).mockImplementation((p: any) => {
		if (String(p).replace(/\\/g, "/") === gitignorePath) {
			return "**/*.js\n"; // ignores all JS files
		}
		return (require("node:fs") as typeof import("node:fs")).readFileSync(
			p
		) as any;
	});

	const { io } = await makeModuleWatcher();
	// File outside repoRoot — should NOT be filtered by gitignore
	await trigger("change", path.join(harnessRoot, "server", "index.ts"));
	assert.equal(io.emit.mock.calls.length, 1);
});

test("module watcher always watches config.sandbox.json even when gitignore excludes it", async () => {
	const fs = await import("node:fs");
	const gitignorePath = path.join(repoRoot, ".gitignore").replace(/\\/g, "/");

	vi.mocked(fs.existsSync).mockImplementation(() => true);
	vi.mocked(fs.readFileSync).mockImplementation((p: any) => {
		if (String(p).replace(/\\/g, "/") === gitignorePath) {
			return "config.sandbox.json\n"; // tries to ignore it
		}
		return (require("node:fs") as typeof import("node:fs")).readFileSync(
			p
		) as any;
	});

	const { io } = await makeModuleWatcher();
	await trigger("change", path.join(repoRoot, "config.sandbox.json"));
	assert.equal(io.emit.mock.calls.length, 1);
});

test("module watcher treats matcher as null when readFileSync throws for .gitignore", async () => {
	const fs = await import("node:fs");
	const gitignorePath = path.join(repoRoot, ".gitignore").replace(/\\/g, "/");

	vi.mocked(fs.existsSync).mockImplementation(() => true);
	vi.mocked(fs.readFileSync).mockImplementation((p: any) => {
		if (String(p).replace(/\\/g, "/") === gitignorePath) {
			throw new Error("permission denied");
		}
		return (require("node:fs") as typeof import("node:fs")).readFileSync(
			p
		) as any;
	});

	const { io } = await makeModuleWatcher();
	// Without matcher, nothing is ignored
	await trigger("change", path.join(repoRoot, "anything.js"));
	assert.equal(io.emit.mock.calls.length, 1);
});

// ---------------------------------------------------------------------------
// isSandboxPersistedConfigFile — hash-keyed variant names
// ---------------------------------------------------------------------------

test("sandbox watcher calls restartHelper for module.config.<hash>.json", async () => {
	const { startSandboxWatcher } = await import("../../../server/watch.ts");
	const restartHelper = vi.fn(async () => {});
	const io = { emit: vi.fn() };
	startSandboxWatcher({
		enabled: true,
		io,
		restartHelper,
		getModuleConfigPath: () =>
			path.join(repoRoot, "config", "module.config.json"),
		getRuntimeConfigPath: () =>
			path.join(repoRoot, "config", "runtime.config.json")
	} as any);

	capturedHandler!(
		"change",
		path.join(repoRoot, "module.config.abc123def456.json")
	);
	await vi.advanceTimersByTimeAsync(200);
	assert.equal(restartHelper.mock.calls.length, 1);
});

test("sandbox watcher calls restartHelper for runtime.config.<hash>.json", async () => {
	const { startSandboxWatcher } = await import("../../../server/watch.ts");
	const restartHelper = vi.fn(async () => {});
	const io = { emit: vi.fn() };
	startSandboxWatcher({
		enabled: true,
		io,
		restartHelper,
		getModuleConfigPath: () =>
			path.join(repoRoot, "config", "module.config.json"),
		getRuntimeConfigPath: () =>
			path.join(repoRoot, "config", "runtime.config.json")
	} as any);

	capturedHandler!(
		"change",
		path.join(repoRoot, "runtime.config.abc123def456.json")
	);
	await vi.advanceTimersByTimeAsync(200);
	assert.equal(restartHelper.mock.calls.length, 1);
});

// ---------------------------------------------------------------------------
// isSandboxConfigFile — harness.config.ts variant
// ---------------------------------------------------------------------------

test("sandbox watcher calls restartHelper for harness.config.ts", async () => {
	const { startSandboxWatcher } = await import("../../../server/watch.ts");
	const restartHelper = vi.fn(async () => {});
	const io = { emit: vi.fn() };
	startSandboxWatcher({
		enabled: true,
		io,
		restartHelper,
		getModuleConfigPath: () =>
			path.join(repoRoot, "config", "module.config.json"),
		getRuntimeConfigPath: () =>
			path.join(repoRoot, "config", "runtime.config.json")
	} as any);

	capturedHandler!(
		"change",
		path.join(repoRoot, "config", "harness.config.ts")
	);
	await vi.advanceTimersByTimeAsync(200);
	assert.equal(restartHelper.mock.calls.length, 1);
});

// ---------------------------------------------------------------------------
// isHarnessClientSourceFile — exclusion paths
// ---------------------------------------------------------------------------

test("sandbox watcher does NOT call rebuildClientAssets for files in client/styles/", async () => {
	const { startSandboxWatcher } = await import("../../../server/watch.ts");
	const rebuildClientAssets = vi.fn(async () => {});
	const io = { emit: vi.fn() };
	startSandboxWatcher({
		enabled: true,
		io,
		restartHelper: vi.fn(async () => {}),
		getModuleConfigPath: () =>
			path.join(repoRoot, "config", "module.config.json"),
		getRuntimeConfigPath: () =>
			path.join(repoRoot, "config", "runtime.config.json"),
		rebuildClientAssets
	} as any);

	capturedHandler!(
		"change",
		path.join(harnessRoot, "client", "styles", "harness.css")
	);
	await vi.advanceTimersByTimeAsync(200);
	assert.equal(rebuildClientAssets.mock.calls.length, 0);
});

test("sandbox watcher does NOT call rebuildClientAssets for files in client/fonts/", async () => {
	const { startSandboxWatcher } = await import("../../../server/watch.ts");
	const rebuildClientAssets = vi.fn(async () => {});
	const io = { emit: vi.fn() };
	startSandboxWatcher({
		enabled: true,
		io,
		restartHelper: vi.fn(async () => {}),
		getModuleConfigPath: () =>
			path.join(repoRoot, "config", "module.config.json"),
		getRuntimeConfigPath: () =>
			path.join(repoRoot, "config", "runtime.config.json"),
		rebuildClientAssets
	} as any);

	capturedHandler!(
		"change",
		path.join(harnessRoot, "client", "fonts", "fa-solid-900.woff2")
	);
	await vi.advanceTimersByTimeAsync(200);
	assert.equal(rebuildClientAssets.mock.calls.length, 0);
});

// ---------------------------------------------------------------------------
// isHarnessNodeCompatSourceFile — only .ts files in shims/ (not generated/)
// ---------------------------------------------------------------------------

test("sandbox watcher does NOT call rebuildNodeCompat for .js files in shims/", async () => {
	const { startSandboxWatcher } = await import("../../../server/watch.ts");
	const rebuildNodeCompat = vi.fn(async () => {});
	const io = { emit: vi.fn() };
	startSandboxWatcher({
		enabled: true,
		io,
		restartHelper: vi.fn(async () => {}),
		getModuleConfigPath: () =>
			path.join(repoRoot, "config", "module.config.json"),
		getRuntimeConfigPath: () =>
			path.join(repoRoot, "config", "runtime.config.json"),
		rebuildNodeCompat
	} as any);

	capturedHandler!(
		"change",
		path.join(harnessRoot, "shims", "node-compat.js")
	);
	await vi.advanceTimersByTimeAsync(200);
	assert.equal(rebuildNodeCompat.mock.calls.length, 0);
});

// ---------------------------------------------------------------------------
// isModuleWatcherIgnored — chokidar ignored predicate for module watcher
// ---------------------------------------------------------------------------

test("isModuleWatcherIgnored returns true for node_modules paths", () => {
	assert.equal(
		isModuleWatcherIgnored("/project/node_modules/lodash/index.js"),
		true
	);
});

test("isModuleWatcherIgnored returns true for .git paths", () => {
	assert.equal(isModuleWatcherIgnored("/project/.git/HEAD"), true);
});

test("isModuleWatcherIgnored returns false for regular source files", () => {
	assert.equal(isModuleWatcherIgnored("/project/src/index.ts"), false);
	assert.equal(isModuleWatcherIgnored("/project/README.md"), false);
});

// ---------------------------------------------------------------------------
// isSandboxWatcherIgnored — chokidar ignored predicate for sandbox watcher
// ---------------------------------------------------------------------------

test("isSandboxWatcherIgnored returns true for node_modules paths", () => {
	assert.equal(
		isSandboxWatcherIgnored("/project/node_modules/pkg/index.js"),
		true
	);
});

test("isSandboxWatcherIgnored returns true for .git paths", () => {
	assert.equal(isSandboxWatcherIgnored("/project/.git/config"), true);
});

test("isSandboxWatcherIgnored returns true for client/generated paths", () => {
	assert.equal(
		isSandboxWatcherIgnored("/project/client/generated/shell-app.js"),
		true
	);
});

test("isSandboxWatcherIgnored returns true for shims/generated paths", () => {
	assert.equal(
		isSandboxWatcherIgnored("/project/shims/generated/node-compat.js"),
		true
	);
});

test("isSandboxWatcherIgnored returns false for regular harness source files", () => {
	assert.equal(
		isSandboxWatcherIgnored("/project/client/app/components/Sidebar.tsx"),
		false
	);
	assert.equal(
		isSandboxWatcherIgnored("/project/shims/node-compat.ts"),
		false
	);
});
