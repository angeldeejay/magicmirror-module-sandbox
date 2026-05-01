/**
 * Unit coverage for the server log store.
 */
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"..",
	"..",
	".."
);

/**
 * Named function fixture used to verify function serialization in helper logs.
 *
 * @returns {void}
 */
function namedHelper() {}

/**
 * Load a fresh copy of the log store so tests do not share in-memory state.
 *
 * @returns {Promise<typeof import("../../../server/log-store.ts")>}
 */
async function loadFreshLogStore() {
	const modulePath = path.join(repoRoot, "server", "log-store.ts");
	return import(`${pathToFileURL(modulePath).href}?t=${Date.now()}`);
}

test("recordHelperLog serializes special values and emits live updates", async () => {
	const emitted = [];
	const logStore = await loadFreshLogStore();

	logStore.attachSocketServer({
		/**
		 * Emits.
		 */
		emit(eventName, entry) {
			emitted.push({ eventName, entry });
		}
	});

	logStore.recordHelperLog("info", [
		new Error("boom"),
		undefined,
		namedHelper,
		{ ok: true }
	]);

	const entries = logStore.getHelperLogEntries();
	assert.equal(entries.length, 1);
	assert.equal(entries[0].method, "info");
	assert.equal(entries[0].args[0].message, "boom");
	assert.equal(entries[0].args[1], "[undefined]");
	assert.equal(entries[0].args[2], "[Function namedHelper]");
	assert.deepEqual(entries[0].args[3], { ok: true });
	assert.equal(emitted.length, 1);
	assert.equal(emitted[0].eventName, "harness:helper-log");
});

test("recordHelperLog stringifies non-serializable values through the fallback branch", async () => {
	const logStore = await loadFreshLogStore();
	const circularValue = {};
	circularValue.self = circularValue;

	logStore.attachSocketServer(null);
	logStore.recordHelperLog("warn", [circularValue]);

	const entries = logStore.getHelperLogEntries();
	assert.equal(entries[0].args[0], "[object Object]");
});

test("recordHelperLog serializes anonymous function with fallback name", async () => {
	const logStore = await loadFreshLogStore();
	logStore.attachSocketServer(null);

	// eslint-disable-next-line func-names
	logStore.recordHelperLog("debug", [function () {}]);

	const entries = logStore.getHelperLogEntries();
	assert.equal(entries[0].args[0], "[Function anonymous]");
});

test("recordHelperLog coerces non-array args to empty array", async () => {
	const logStore = await loadFreshLogStore();
	logStore.attachSocketServer(null);

	logStore.recordHelperLog("info", "not-an-array" as unknown as unknown[]);

	const entries = logStore.getHelperLogEntries();
	assert.deepEqual(entries[0].args, []);
});

test("recordHelperLog keeps only the latest 200 entries", async () => {
	const logStore = await loadFreshLogStore();
	logStore.attachSocketServer(null);

	for (let index = 0; index < 205; index += 1) {
		logStore.recordHelperLog("info", [index]);
	}

	const entries = logStore.getHelperLogEntries();
	assert.equal(entries.length, 200);
	assert.equal(entries[0].args[0], 204);
	assert.equal(entries.at(-1).args[0], 5);
});
