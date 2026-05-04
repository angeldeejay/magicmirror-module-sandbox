/**
 * Unit contracts for the sandbox browser runtime core.
 *
 * These tests load the GENERATED runtime files (client/generated/runtime/) into
 * a Node.js vm context with a minimal mock window, then exercise the pure-logic
 * parts of the core that do NOT require a real browser environment.
 *
 * Coverage rationale:
 *   The integration suite (tests/integration/core-fidelity.browser.test.ts)
 *   covers all D1–D9 behaviors end-to-end inside a real Chromium browser.
 *   These unit tests provide fast, offline coverage for the SAME contracts on
 *   the pure-logic paths:
 *
 *   D5 — module.hidden asymmetry (hideModule / showModule)
 *   D7 — emitNotification passes original payload reference, not a clone
 *   D8 — installGlobals creates a Log object with all required methods
 *   D9 — setSelectionMethodsForModules: filter methods, non-enumerable, chaining
 *
 *   deepMerge and compareVersions are also covered because configDeepMerge and
 *   requiresVersion checks depend on them.
 *
 * Source references:
 *   D5 : main.js:721,729-731  (hideModule / showModule hidden-flag semantics)
 *   D7 : main.js:98-101       (notificationReceived receives original reference)
 *   D8 : logger.js            (Log must expose all twelve methods)
 *   D9 : main.js:501-585      (getModules() filter methods non-enumerable)
 *
 * Rule: do NOT weaken or remove assertions to make a failing test pass.
 * If an assertion fails, fix the runtime implementation in client/runtime/.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { beforeAll, describe, expect, test } from "vitest";

// ---------------------------------------------------------------------------
// Runtime loader
// ---------------------------------------------------------------------------

const RUNTIME_DIR = resolve(
	dirname(fileURLToPath(import.meta.url)),
	"../../../client/generated/runtime"
);

function readRuntime(file: string): string {
	return readFileSync(resolve(RUNTIME_DIR, file), "utf-8");
}

/**
 * Minimal mock window that satisfies IIFE init-time surface without any real
 * browser APIs. Functions that call document/DOM are guarded by null returns.
 */
function createMockWindow() {
	return {
		__HARNESS__: {
			language: "en",
			locale: "en-US",
			mmVersion: "2.36.0",
			moduleConfig: {},
			moduleIdentifier: "MMM-Test_sandbox",
			moduleName: "MMM-Test",
			modulePath: "/modules/MMM-Test",
			moduleEntry: ""
		},
		config: {},
		// Prevent shared.js from patching the process console at init time.
		__MODULE_SANDBOX_CONSOLE_CAPTURED__: true,
		dispatchEvent: () => {},
		addEventListener: () => {},
		clearTimeout: (id: ReturnType<typeof setTimeout>) => clearTimeout(id),
		setTimeout: (fn: () => void, delay: number) => setTimeout(fn, delay),
		location: { href: "http://localhost/", search: "" },
		// document mock: querySelector always returns null so DOM-dependent code
		// takes its "no shell" early-return path without throwing.
		document: { querySelector: () => null },
		console
	} as Record<string, unknown>;
}

type SandboxCore = Record<string, unknown>;

let core: SandboxCore;

beforeAll(() => {
	const mockWindow = createMockWindow();

	const ctx = vm.createContext({
		window: mockWindow,
		// CustomEvent is used by dispatchEvent calls inside published functions.
		// The dispatchEvent mock is a no-op, but new CustomEvent() must not throw.
		CustomEvent: class MockCustomEvent {
			type: string;
			detail: unknown;
			constructor(type: string, opts?: { detail?: unknown }) {
				this.type = type;
				this.detail = opts?.detail;
			}
		},
		console,
		document: mockWindow.document
	});

	// Load in dependency order: shared creates __MICROCORE__; the others extend it.
	vm.runInContext(readRuntime("shared.js"), ctx);
	vm.runInContext(readRuntime("notifications.js"), ctx);
	vm.runInContext(readRuntime("lifecycle.js"), ctx);
	vm.runInContext(readRuntime("module.js"), ctx);

	core = (mockWindow.__MICROCORE__ as SandboxCore) ?? {};
});

// ---------------------------------------------------------------------------
// deepMerge — used by configDeepMerge which all modules rely on
// ---------------------------------------------------------------------------

describe("deepMerge — config merge semantics (foundation for configDeepMerge)", () => {
	test("primitives override target", () => {
		const deepMerge = core.deepMerge as (
			t: object,
			...s: object[]
		) => Record<string, unknown>;
		const result = deepMerge({ a: 1, b: 2 }, { b: 99, c: 3 });
		expect(result.a).toBe(1);
		expect(result.b).toBe(99);
		expect(result.c).toBe(3);
	});

	test("nested objects are merged recursively, not replaced", () => {
		const deepMerge = core.deepMerge as (
			t: object,
			...s: object[]
		) => Record<string, unknown>;
		const result = deepMerge(
			{ nested: { a: 1, b: 2 } },
			{ nested: { b: 99, c: 3 } }
		);
		const nested = result.nested as Record<string, number>;
		// 'a' preserved from target
		expect(nested.a).toBe(1);
		// 'b' overridden by source
		expect(nested.b).toBe(99);
		// 'c' added from source
		expect(nested.c).toBe(3);
	});

	test("arrays are replaced wholesale, not element-merged", () => {
		const deepMerge = core.deepMerge as (
			t: object,
			...s: object[]
		) => Record<string, unknown>;
		const result = deepMerge({ items: [1, 2, 3] }, { items: [4, 5] });
		expect(result.items).toEqual([4, 5]);
	});

	test("module defaults + config scenario: nested flag survives partial override", () => {
		const deepMerge = core.deepMerge as (
			t: object,
			...s: object[]
		) => Record<string, unknown>;
		const defaults = {
			operatorName: "Developer",
			nested: { defaultFlag: true, overrideFlag: "from defaults" }
		};
		const userConfig = {
			operatorName: "Reloaded",
			nested: { overrideFlag: "from config" }
		};
		const result = deepMerge({}, defaults, userConfig);
		expect(result.operatorName).toBe("Reloaded");
		const nested = result.nested as Record<string, unknown>;
		// defaultFlag comes from defaults, survives deep merge
		expect(nested.defaultFlag).toBe(true);
		// overrideFlag replaced by userConfig
		expect(nested.overrideFlag).toBe("from config");
	});
});

// ---------------------------------------------------------------------------
// compareVersions — requiresVersion gate for Module.register
// ---------------------------------------------------------------------------

describe("compareVersions — requiresVersion gate (module.js:compareVersions)", () => {
	test("equal versions return 0", () => {
		const compareVersions = core.compareVersions as (
			l: string,
			r: string
		) => number;
		expect(compareVersions("2.36.0", "2.36.0")).toBe(0);
	});

	test("higher major returns 1", () => {
		const compareVersions = core.compareVersions as (
			l: string,
			r: string
		) => number;
		expect(compareVersions("3.0.0", "2.36.0")).toBe(1);
	});

	test("lower major returns -1", () => {
		const compareVersions = core.compareVersions as (
			l: string,
			r: string
		) => number;
		expect(compareVersions("1.0.0", "2.0.0")).toBe(-1);
	});

	test("same major, higher minor returns 1", () => {
		const compareVersions = core.compareVersions as (
			l: string,
			r: string
		) => number;
		expect(compareVersions("2.36.0", "2.0.0")).toBe(1);
	});

	test("same major.minor, higher patch returns 1", () => {
		const compareVersions = core.compareVersions as (
			l: string,
			r: string
		) => number;
		expect(compareVersions("2.36.1", "2.36.0")).toBe(1);
	});

	test("sandbox mmVersion '2.36.0' satisfies requiresVersion '2.0.0'", () => {
		const compareVersions = core.compareVersions as (
			l: string,
			r: string
		) => number;
		// Module.register accepts the module when mmVersion >= requiresVersion.
		// compareVersions("2.36.0", "2.0.0") must be >= 0 (not negative).
		// Source: module.js Module.register gating logic.
		expect(compareVersions("2.36.0", "2.0.0")).toBeGreaterThanOrEqual(0);
	});
});

// ---------------------------------------------------------------------------
// D7 — emitNotification passes original payload reference (main.js:98-101)
// ---------------------------------------------------------------------------

describe("D7 — emitNotification passes original payload reference, not a JSON clone", () => {
	test("notificationReceived receives the EXACT same object passed to emitNotification", () => {
		const emitNotification = core.emitNotification as (
			notification: string,
			payload: unknown,
			sender: unknown,
			meta?: Record<string, unknown>
		) => number;
		const registerModuleInstance = core.registerModuleInstance as (
			instance: Record<string, unknown>
		) => void;

		const originalPayload = { marker: "identity-check", nested: { x: 1 } };
		let receivedPayload: unknown = null;

		const fakeInstance = {
			identifier: "MMM-D7Test_sandbox",
			notificationReceived(_notification: string, payload: unknown) {
				receivedPayload = payload;
			}
		};

		registerModuleInstance(fakeInstance);
		emitNotification("D7_TEST", originalPayload, null, {
			origin: "core",
			senderLabel: "test"
		});

		// MUST be the exact same reference — not a JSON clone.
		// DO NOT change to toEqual (deep equality). Reference identity is the contract.
		// Source: main.js:98-101 passes payload directly without JSON.parse/stringify.
		expect(receivedPayload).toBe(originalPayload);
	});

	test("clonePayload (used for log entries) produces a separate copy, not the original", () => {
		const clonePayload = core.clonePayload as (v: unknown) => unknown;
		const original = { a: 1, b: { c: 2 } };
		const cloned = clonePayload(original);

		// Must NOT be the same reference (it is a clone for safe log storage).
		expect(cloned).not.toBe(original);
		// Clone contents must match.
		expect(cloned).toEqual(original);
	});
});

// ---------------------------------------------------------------------------
// D8 — installGlobals creates Log with all methods from logger.js
// ---------------------------------------------------------------------------

describe("D8 — installGlobals creates Log with all required methods (logger.js)", () => {
	// All twelve methods that MagicMirror's logger.js exposes.
	// Source: logger.js — Log object in the MagicMirror core.
	// DO NOT remove any method from this list.
	const REQUIRED_LOG_METHODS = [
		"log",
		"info",
		"warn",
		"error",
		"debug",
		"group",
		"groupCollapsed",
		"groupEnd",
		"time",
		"timeEnd",
		"timeStamp",
		"setLogLevel"
	] as const;

	let logObject: Record<string, unknown>;

	beforeAll(() => {
		// installGlobals sets globalScope.Log — capture it via the mock window.
		// We invoke it on a separate mock to avoid mutating the shared core state.
		const mockWindow = createMockWindow();
		const noop = () => {};
		const silentConsole = {
			log: noop,
			info: noop,
			warn: noop,
			error: noop,
			debug: noop,
			group: noop,
			groupCollapsed: noop,
			groupEnd: noop,
			time: noop,
			timeEnd: noop,
			timeStamp: noop
		};
		const ctx = vm.createContext({
			window: mockWindow,
			CustomEvent: class MockCustomEvent {
				type: string;
				detail: unknown;
				constructor(type: string, opts?: { detail?: unknown }) {
					this.type = type;
					this.detail = opts?.detail;
				}
			},
			console: silentConsole,
			document: mockWindow.document
		});
		vm.runInContext(readRuntime("shared.js"), ctx);
		vm.runInContext(readRuntime("notifications.js"), ctx);
		vm.runInContext(readRuntime("lifecycle.js"), ctx);
		vm.runInContext(readRuntime("module.js"), ctx);

		const isolatedCore = (mockWindow.__MICROCORE__ as SandboxCore) ?? {};
		const installGlobals = isolatedCore.installGlobals as () => void;
		installGlobals.call(isolatedCore);
		logObject = (mockWindow.Log as Record<string, unknown>) ?? {};
	});

	for (const method of [
		"log",
		"info",
		"warn",
		"error",
		"debug",
		"group",
		"groupCollapsed",
		"groupEnd",
		"time",
		"timeEnd",
		"timeStamp",
		"setLogLevel"
	]) {
		test(`Log.${method} is a function`, () => {
			// DO NOT change typeof check to a weaker assertion.
			// All twelve methods MUST be present as callable functions.
			expect(typeof logObject[method]).toBe("function");
		});
	}

	test("all required methods are present — no method missing from REQUIRED_LOG_METHODS", () => {
		// This guards against adding methods to REQUIRED_LOG_METHODS without
		// implementing them, and vice versa.
		for (const method of REQUIRED_LOG_METHODS) {
			expect(typeof logObject[method]).toBe(
				"function",
				`Log.${method} must be a function`
			);
		}
	});

	test("calling each Log method does not throw", () => {
		// The methods delegate to console.* — they must not throw on any input.
		expect(() =>
			(logObject.log as (...a: unknown[]) => void)("test")
		).not.toThrow();
		expect(() =>
			(logObject.info as (...a: unknown[]) => void)("test")
		).not.toThrow();
		expect(() =>
			(logObject.warn as (...a: unknown[]) => void)("test")
		).not.toThrow();
		expect(() =>
			(logObject.error as (...a: unknown[]) => void)("test")
		).not.toThrow();
		expect(() =>
			(logObject.debug as (...a: unknown[]) => void)("test")
		).not.toThrow();
		expect(() =>
			(logObject.group as (...a: unknown[]) => void)("grp")
		).not.toThrow();
		expect(() =>
			(logObject.groupCollapsed as (...a: unknown[]) => void)("grp")
		).not.toThrow();
		expect(() => (logObject.groupEnd as () => void)()).not.toThrow();
		expect(() => (logObject.time as (l: string) => void)("t")).not.toThrow();
		expect(() => (logObject.timeEnd as (l: string) => void)("t")).not.toThrow();
		expect(() =>
			(logObject.timeStamp as (l: string) => void)("ts")
		).not.toThrow();
		expect(() =>
			(logObject.setLogLevel as (l: string[]) => void)(["DEBUG"])
		).not.toThrow();
	});
});

// ---------------------------------------------------------------------------
// D9 — setSelectionMethodsForModules (main.js:501-585)
// ---------------------------------------------------------------------------

describe("D9 — setSelectionMethodsForModules: filter methods non-enumerable, withClass by data.classes", () => {
	const setSelectionMethods = () =>
		core.setSelectionMethodsForModules as (
			modules: Array<Record<string, unknown>>
		) => void;

	function makeModules(
		...specs: Array<{ name: string; classes: string }>
	): Array<Record<string, unknown>> {
		return specs.map(({ name, classes }) => ({
			name,
			identifier: `${name}_sandbox`,
			data: { classes }
		}));
	}

	test("withClass, exceptWithClass, exceptModule, enumerate are all non-enumerable on the returned array", () => {
		const modules = makeModules({ name: "MMM-A", classes: "" });
		setSelectionMethods()(modules);

		// Object.keys must NOT include the filter methods.
		// Source: main.js defineProperty({ enumerable: false }).
		// DO NOT change to be(true) — these methods must never appear in for...in loops.
		const keys = Object.keys(modules);
		expect(keys).not.toContain("withClass");
		expect(keys).not.toContain("exceptWithClass");
		expect(keys).not.toContain("exceptModule");
		expect(keys).not.toContain("enumerate");
	});

	test("all four filter methods exist as functions on the array", () => {
		const modules = makeModules({ name: "MMM-A", classes: "" });
		setSelectionMethods()(modules);

		expect(
			typeof (modules as unknown as Record<string, unknown>).withClass
		).toBe("function");
		expect(
			typeof (modules as unknown as Record<string, unknown>).exceptWithClass
		).toBe("function");
		expect(
			typeof (modules as unknown as Record<string, unknown>).exceptModule
		).toBe("function");
		expect(
			typeof (modules as unknown as Record<string, unknown>).enumerate
		).toBe("function");
	});

	test("withClass filters by data.classes (CSS class string), NOT by module name", () => {
		// This is the D9 contract: withClass("highlight") matches a module whose
		// data.classes contains "highlight", not one named "highlight".
		// The class string is space-split, lowercased, and compared.
		// Source: main.js:501-585 modulesByClass implementation.
		const modules = makeModules(
			{ name: "MMM-Clock", classes: "highlight large" },
			{ name: "MMM-Weather", classes: "compact" },
			{ name: "MMM-TestModule", classes: "" } // no classes — must NOT match
		);
		setSelectionMethods()(modules);

		const withClass = (
			modules as unknown as Record<string, (c: string) => unknown[]>
		).withClass;

		// "highlight" → matches MMM-Clock (has class "highlight"), NOT MMM-TestModule by name.
		expect(withClass("highlight")).toHaveLength(1);
		expect((withClass("highlight")[0] as Record<string, string>).name).toBe(
			"MMM-Clock"
		);

		// "compact" → matches MMM-Weather.
		expect(withClass("compact")).toHaveLength(1);

		// Module name used as class argument → returns 0 (not a class match).
		// DO NOT change to toHaveLength(1) — that would test module name, not CSS class.
		expect(withClass("MMM-TestModule")).toHaveLength(0);

		// Empty class string: split("") → [""], only matches modules whose own
		// data.classes splits to include "" — i.e. modules with classes="".
		// "highlight large".split(" ") → ["highlight","large"], indexOf("") === -1 → no match.
		// Only MMM-TestModule has classes="" which splits to [""] → indexOf("") === 0 → match.
		expect(withClass("")).toHaveLength(1);
		expect((withClass("")[0] as Record<string, string>).name).toBe(
			"MMM-TestModule"
		);
	});

	test("exceptWithClass excludes modules that have the given class", () => {
		const modules = makeModules(
			{ name: "MMM-A", classes: "sidebar" },
			{ name: "MMM-B", classes: "main-content" },
			{ name: "MMM-C", classes: "" }
		);
		setSelectionMethods()(modules);

		const exceptWithClass = (
			modules as unknown as Record<string, (c: string) => unknown[]>
		).exceptWithClass;

		// "sidebar" → all except MMM-A.
		expect(exceptWithClass("sidebar")).toHaveLength(2);
	});

	test("exceptModule excludes by identifier, not by name", () => {
		const modules = makeModules(
			{ name: "MMM-A", classes: "" },
			{ name: "MMM-B", classes: "" }
		);
		setSelectionMethods()(modules);

		const exceptModule = (
			modules as unknown as Record<
				string,
				(m: Record<string, unknown>) => unknown[]
			>
		).exceptModule;

		// Pass the instance object with the identifier to exclude.
		const result = exceptModule({ identifier: "MMM-A_sandbox" });
		expect(result).toHaveLength(1);
		expect((result[0] as Record<string, string>).name).toBe("MMM-B");
	});

	test("enumerate calls the callback for each module", () => {
		const modules = makeModules(
			{ name: "MMM-A", classes: "" },
			{ name: "MMM-B", classes: "" },
			{ name: "MMM-C", classes: "" }
		);
		setSelectionMethods()(modules);

		const enumerate = (
			modules as unknown as Record<string, (cb: (m: unknown) => void) => void>
		).enumerate;

		const visited: unknown[] = [];
		enumerate((m) => visited.push(m));
		expect(visited).toHaveLength(3);
	});

	test("filtered result (withClass return value) also carries filter methods (chaining)", () => {
		const modules = makeModules(
			{ name: "MMM-A", classes: "panel" },
			{ name: "MMM-B", classes: "panel sidebar" }
		);
		setSelectionMethods()(modules);

		const withClass = (
			modules as unknown as Record<string, (c: string) => unknown[]>
		).withClass;

		const filtered = withClass("panel");

		// Filtered result must also have filter methods for chaining.
		// Source: main.js:501-585 setSelectionMethodsForModules applied recursively.
		expect(
			typeof (filtered as unknown as Record<string, unknown>).withClass
		).toBe("function");
		expect(
			typeof (filtered as unknown as Record<string, unknown>).exceptWithClass
		).toBe("function");
		expect(
			typeof (filtered as unknown as Record<string, unknown>).exceptModule
		).toBe("function");
		expect(
			typeof (filtered as unknown as Record<string, unknown>).enumerate
		).toBe("function");

		// And those chained methods must also be non-enumerable.
		const chainedKeys = Object.keys(filtered);
		expect(chainedKeys).not.toContain("withClass");
		expect(chainedKeys).not.toContain("exceptWithClass");
	});
});

// ---------------------------------------------------------------------------
// D5 — module.hidden asymmetry (main.js:721,729-731)
// ---------------------------------------------------------------------------

describe("D5 — module.hidden: true set immediately on hide; false only inside show callback", () => {
	/**
	 * Override transitionModuleVisibility on the core to capture the callback
	 * without invoking it, so we can observe module.hidden state BEFORE the
	 * callback fires (matching the timer-based behavior in the real browser).
	 */
	function captureTransition(): {
		capturedCallback: (() => void) | null;
		restore: () => void;
	} {
		const original = core.transitionModuleVisibility;
		let capturedCallback: (() => void) | null = null;

		core.transitionModuleVisibility = (
			_module: unknown,
			_hidden: boolean,
			_speed: number,
			callback: () => void
		) => {
			capturedCallback = callback;
		};

		return {
			get capturedCallback() {
				return capturedCallback;
			},
			restore() {
				core.transitionModuleVisibility = original;
			}
		};
	}

	test("hideModule sets module.hidden=true BEFORE the animation callback fires", () => {
		const tracker = captureTransition();
		const hideModule = core.hideModule as (
			module: Record<string, unknown>,
			speed: number,
			callback: () => void
		) => void;

		const mockModule: Record<string, unknown> = { hidden: false };

		// hidden must be false before hide.
		expect(mockModule.hidden).toBe(false);

		hideModule(mockModule, 0, () => {});

		// hidden=true is set IMMEDIATELY — before the callback fires.
		// Source: lifecycle.js hideModule sets module.hidden = true before
		// calling transitionModuleVisibility (which schedules the callback).
		// DO NOT change to check hidden inside capturedCallback only.
		expect(mockModule.hidden).toBe(true);

		// Even after firing the callback, hidden must still be true.
		tracker.capturedCallback?.();
		expect(mockModule.hidden).toBe(true);

		tracker.restore();
	});

	test("showModule does NOT set module.hidden=false before the callback fires", () => {
		const { restore } = captureTransition();
		const showModule = core.showModule as (
			module: Record<string, unknown>,
			speed: number,
			callback: () => void
		) => void;

		const mockModule: Record<string, unknown> = { hidden: true };

		showModule(mockModule, 0, () => {});

		// hidden must still be true here — showModule must NOT eagerly set hidden=false.
		// Source: main.js:729-731 sets module.hidden = false only inside the show callback.
		// DO NOT change to toBe(false) — that would break the D5 contract.
		expect(mockModule.hidden).toBe(true);

		restore();
	});

	test("showModule sets module.hidden=false INSIDE the callback (when it fires)", () => {
		// Do NOT destructure capturedCallback — the getter would be evaluated at
		// destructuring time (returning null). Use the tracker object directly so
		// the getter is read AFTER showModule has assigned the captured callback.
		const tracker = captureTransition();
		const showModule = core.showModule as (
			module: Record<string, unknown>,
			speed: number,
			callback: () => void
		) => void;

		const mockModule: Record<string, unknown> = { hidden: true };

		showModule(mockModule, 0, () => {});

		// Verify hidden is still true before callback fires.
		expect(mockModule.hidden).toBe(true);

		// Read capturedCallback AFTER showModule has run — tracker getter is fresh.
		// This is when hidden transitions to false.
		tracker.capturedCallback?.();

		// Only NOW should hidden be false.
		expect(mockModule.hidden).toBe(false);

		tracker.restore();
	});
});
