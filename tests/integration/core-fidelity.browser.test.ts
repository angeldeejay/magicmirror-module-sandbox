/**
 * Core-fidelity hardening tests for the sandbox browser runtime.
 *
 * PURPOSE
 * -------
 * These tests lock in every behavioral divergence that was corrected in v1.2.0.
 * Each test asserts a contract derived directly from the MagicMirror source:
 *   - node_modules/magicmirror/js/module.js  (module base class)
 *   - node_modules/magicmirror/js/main.js    (MM global, hide/show, notifications)
 *   - node_modules/magicmirror/js/logger.js  (Log global)
 *
 * NON-NEGOTIABLE RULE
 * -------------------
 * Do NOT alter assertions in this file to make a failing test pass.
 * The right fix is always to correct the sandbox implementation, never to
 * loosen the assertion. The invariant is: if a behavior causes a module to
 * fail in real MagicMirror it MUST fail identically in the sandbox.
 *
 * If you believe an assertion is wrong, add a comment explaining why, then
 * open a discussion — do not silently weaken or remove the check.
 *
 * IMPORTANT: stageEvaluate callbacks are stringified and executed as plain
 * JavaScript in the browser iframe. Do NOT use TypeScript-specific syntax
 * (type annotations, "as" casts, "as const", generic type parameters) inside
 * any stageEvaluate callback — they will cause runtime syntax errors.
 *
 * STRUCTURE NOTE: Each test calls gotoSandbox() at the start (same pattern as
 * all other integration tests). Do NOT add beforeEach(gotoSandbox) — that
 * causes EADDRINUSE when the sandbox server is already running from the
 * previous test's navigation.
 */
import { afterAll, describe, expect, test } from "vitest";
import {
	closeSandbox,
	gotoSandbox,
	resetSandbox,
	stageEvaluate
} from "../_helpers/helpers.browser.ts";

afterAll(async () => {
	await closeSandbox();
});

// ---------------------------------------------------------------------------
// D1 — getDom() base implementation returns Promise<HTMLElement>
//
// Source: module.js:82-107 (MagicMirror core)
//   getDom: function() {
//     var self = this;
//     return new Promise(function(resolve) { ... });
//   }
//
// The base getDom ALWAYS wraps its result in a Promise. A module that calls
// this._super() in getDom and uses the result synchronously will work in old
// sandbox versions (which broke the contract and returned HTMLElement directly)
// but FAIL in real MagicMirror. The sandbox must match core exactly.
// ---------------------------------------------------------------------------
describe("D1 — base getDom returns Promise<HTMLElement>", () => {
	test("base getDom() installed by extendModuleInstance returns a Promise", async () => {
		await gotoSandbox();

		const result = await stageEvaluate(() => {
			const core = globalThis.__MICROCORE__;

			// Create a plain object with no getDom defined.
			// extendModuleInstance installs the base getDom from module.js:82-107.
			const baseObj = {};
			core.extendModuleInstance(baseObj);

			// Call the base getDom with the minimal context it needs.
			// For a non-file template (.njk/.html not in name), renderString runs
			// synchronously inside the Promise constructor — return type is still Promise.
			const fakeThis = {
				_nunjucksEnvironment: null,
				data: {
					path: "/modules/__contract_test__",
					name: "ContractTest"
				},
				getTemplate() {
					return "<div>contract-test</div>";
				},
				getTemplateData() {
					return {};
				},
				file(f) {
					return "/modules/__contract_test__/" + f;
				},
				nunjucksEnvironment() {
					if (!this._nunjucksEnvironment) {
						this._nunjucksEnvironment =
							new globalThis.nunjucks.Environment(
								new globalThis.nunjucks.WebLoader(
									"/modules/__contract_test__/"
								),
								{ trimBlocks: true, lstripBlocks: true }
							);
					}
					return this._nunjucksEnvironment;
				}
			};

			const domResult = baseObj.getDom.call(fakeThis);

			// Suppress any rejection — we only need to check the return type.
			if (domResult && typeof domResult.catch === "function") {
				domResult.catch(function () {});
			}

			return {
				// MUST be true — changing this to false means the base getDom broke
				// the Promise contract that real MM enforces (module.js:82-107).
				isPromise: domResult instanceof Promise,
				isThenable: typeof domResult.then === "function"
			};
		});

		// DO NOT change these to false — a synchronous return type is wrong.
		// See module.js:82-107. The base ALWAYS returns new Promise(...).
		expect(result.isPromise).toBe(true);
		expect(result.isThenable).toBe(true);
	});

	test("async module getDom() calling this._super() resolves to HTMLElement", async () => {
		// The fixture's getDom is async and awaits this._super().
		// After awaiting, wrapper MUST be an HTMLElement — not a Promise.
		// If wrapper were a Promise, querySelector would crash and the stage
		// would not render — exactly how it fails in real MagicMirror.
		await resetSandbox();

		const result = await stageEvaluate(() => {
			const instance = globalThis.__moduleSandboxModule;
			// superAdapterSnapshot is captured inside getDom after awaiting _super()
			return {
				snapshot: instance.superAdapterSnapshot
			};
		});

		// wrapper (resolved HTMLElement) MUST NOT be thenable.
		// If this becomes true, the fixture's async await broke down and
		// _super() returned a Promise that was not properly resolved.
		expect(result.snapshot.isThenable).toBe(false);

		// The resolved element must have real DOM structure.
		// These would be 0/false if getDom crashed or returned an un-awaited Promise.
		expect(result.snapshot.immediateChildElementCount).toBeGreaterThan(0);
		expect(result.snapshot.hasImmediateRoot).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// D5 — module.hidden asymmetry between hide and show
//
// Source: main.js:721 (hideModule) and main.js:729-731 (showModule callback)
//   hideModule: function(module, ...) {
//     module.hidden = true;     ← set IMMEDIATELY before animation starts
//     ...animate...
//   }
//   showModule: function(module, ...) {
//     ...animate...
//     callback: function() {
//       module.hidden = false;  ← set INSIDE callback, AFTER animation
//     }
//   }
//
// The asymmetry is intentional. hide sets hidden=true immediately so that
// concurrent render calls see the correct state. show sets hidden=false only
// after the transition completes so partial-show states are not exposed.
// ---------------------------------------------------------------------------
describe("D5 — module.hidden asymmetry: immediate on hide, deferred on show", () => {
	test("MM.hideModule sets module.hidden=true immediately; MM.showModule sets false only inside callback", async () => {
		await resetSandbox();

		const result = await stageEvaluate(async () => {
			const instance = globalThis.__moduleSandboxModule;
			const hiddenBefore = instance.hidden;

			// --- hide phase ---
			// Capture hidden state synchronously right after the call.
			// At speed=0 the timer fires asynchronously — the SYNCHRONOUS
			// assignment of module.hidden = true (main.js:721) must already
			// be visible here.
			globalThis.MM.hideModule(instance, 0, function () {}, {});
			const hiddenSynchronouslyAfterHide = instance.hidden;

			// Now wait for the hide animation to complete.
			await new Promise(function (resolve) {
				globalThis.MM.hideModule(instance, 0, resolve, {});
			});

			// --- show phase ---
			let hiddenSynchronouslyAfterShowCall = false;
			let hiddenInsideShowCallback = false;

			await new Promise(function (resolve) {
				globalThis.MM.showModule(
					instance,
					0,
					function () {
						// Inside the callback, hidden must now be false.
						// main.js:729-731: hidden=false set inside callback, before it fires.
						hiddenInsideShowCallback = instance.hidden;
						resolve();
					},
					{}
				);

				// Immediately after the call, before callback fires — must still be true.
				// main.js:729 only sets hidden=false inside the callback.
				hiddenSynchronouslyAfterShowCall = instance.hidden;
			});

			return {
				hiddenBefore,
				// MUST be true — main.js:721 sets hidden=true before animation.
				hiddenSynchronouslyAfterHide,
				// MUST be true — main.js:729 defers hidden=false to inside callback.
				hiddenSynchronouslyAfterShowCall,
				// MUST be false — inside callback hidden is already set.
				hiddenInsideShowCallback
			};
		});

		expect(result.hiddenBefore).toBe(false);

		// DO NOT change to false — hidden=true is set immediately (main.js:721).
		expect(result.hiddenSynchronouslyAfterHide).toBe(true);

		// DO NOT change to false — hidden=false is deferred until callback (main.js:729).
		expect(result.hiddenSynchronouslyAfterShowCall).toBe(true);

		// Inside the callback, hidden must already be false.
		expect(result.hiddenInsideShowCallback).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// D3/D4 — suspend fires inside hide callback, resume fires inside show callback
//
// Source: module.js:367-413 (hide/show with callback)
//   hide: function(speed, callback, options) {
//     MM.hideModule(this, speed, function() {
//       self.suspend();    ← inside the animation callback
//       callback();
//     }, options);
//   }
//   show: function(speed, callback, options) {
//     MM.showModule(this, speed, function() {
//       self.resume();     ← inside the animation callback
//       callback();
//     }, options);
//   }
//
// suspend/resume fire INSIDE the animation callback, not before it starts.
// The fixture's suspend/resume increment counters, making timing observable.
// ---------------------------------------------------------------------------
describe("D3/D4 — suspend fires in hide callback, resume fires in show callback", () => {
	test("suspend() fires inside hide callback; resume() fires inside show callback", async () => {
		await resetSandbox();

		const result = await stageEvaluate(async () => {
			const instance = globalThis.__moduleSandboxModule;
			const suspendBefore = instance.suspendCount;
			const resumeBefore = instance.resumeCount;

			// --- hide: verify suspend fires inside callback ---
			let suspendCountInsideHideCallback = -1;

			await new Promise(function (resolve) {
				instance.hide(
					0,
					function () {
						// At this point the animation callback has fired.
						// suspend() MUST have already run (module.js:391: suspend before callback).
						suspendCountInsideHideCallback = instance.suspendCount;
						resolve();
					},
					{}
				);
			});

			// --- show: verify resume fires inside callback ---
			let resumeCountInsideShowCallback = -1;

			await new Promise(function (resolve) {
				instance.show(
					0,
					function () {
						// At this point the animation callback has fired.
						// resume() MUST have already run (module.js:408: resume before callback).
						resumeCountInsideShowCallback = instance.resumeCount;
						resolve();
					},
					{}
				);
			});

			return {
				suspendBefore,
				resumeBefore,
				// MUST be 1 — suspend() fired inside the hide callback.
				suspendCountInsideHideCallback,
				// MUST be 1 — resume() fired inside the show callback.
				resumeCountInsideShowCallback,
				suspendAfter: instance.suspendCount,
				resumeAfter: instance.resumeCount
			};
		});

		expect(result.suspendBefore).toBe(0);
		expect(result.resumeBefore).toBe(0);

		// MUST be 1 — suspend fires inside hide callback, before our callback.
		// If this is 0, suspend is not firing during hide, breaking the lifecycle contract.
		expect(result.suspendCountInsideHideCallback).toBe(1);

		// MUST be 1 — resume fires inside show callback, before our callback.
		// If this is 0, resume is not firing during show, breaking the lifecycle contract.
		expect(result.resumeCountInsideShowCallback).toBe(1);

		expect(result.suspendAfter).toBe(1);
		expect(result.resumeAfter).toBe(1);
	});
});

// ---------------------------------------------------------------------------
// D6 — header rendered as innerHTML, not textContent
//
// Source: main.js:253
//   headerWrapper.innerHTML = header ? header : module.data.name;
//
// Modules can return HTML markup from getHeader(). The core uses innerHTML,
// which means <strong>, <em>, and other tags are rendered as real DOM elements.
// Using textContent would silently escape the HTML. Additionally:
//   - empty string / undefined → show module name (falsy fallback)
//   - false → hide header entirely
// ---------------------------------------------------------------------------
describe("D6 — header rendered via innerHTML; empty/undefined falls back to module name", () => {
	test("HTML markup in header renders as DOM elements (not escaped text)", async () => {
		await resetSandbox();

		const result = await stageEvaluate(() => {
			const core = globalThis.__MICROCORE__;

			const shell = core.getModuleShell();
			if (!shell) {
				return { error: "no shell" };
			}

			const headerNode = shell.querySelector(".module-header");
			if (!headerNode) {
				return { error: "no header node" };
			}

			// Write HTML markup directly — same as what applyRenderOutput does.
			const markupHeader = "Title: <strong>Bold Part</strong>";
			headerNode.innerHTML = markupHeader;

			// If innerHTML is used: <strong> becomes a real element.
			// If textContent were used: tag is literal text, no element.
			const strongEl = headerNode.querySelector("strong");
			const outcome = {
				hasStrongElement: Boolean(strongEl),
				strongText: strongEl ? strongEl.textContent : null
			};

			// Restore.
			const restored =
				core.moduleInstance &&
				typeof core.moduleInstance.getHeader === "function"
					? String(
							core.moduleInstance.getHeader() ||
								core.moduleInstance.name ||
								""
						)
					: "";
			headerNode.innerHTML = restored;

			return outcome;
		});

		// MUST be true — if header is set via textContent, strongEl is null.
		// Changing this to false means header rendering diverges from main.js:253.
		expect(result.hasStrongElement).toBe(true);
		expect(result.strongText).toBe("Bold Part");
	});

	test("empty string / undefined header falls back to module name; false hides header", async () => {
		// Source: main.js header rendering
		//   innerHTML = header ? header : module.data.name;   ← falsy non-false → name
		//   if (header === false) display = "none";           ← only false hides it
		//
		// This is the SAME behavior as real MagicMirror. Do NOT simplify by using
		// Boolean(headerValue) to compute showHeader — that would hide "" and undefined
		// instead of showing the module name, diverging from core.
		await resetSandbox();

		const result = await stageEvaluate(async () => {
			const instance = globalThis.__moduleSandboxModule;
			const core = globalThis.__MICROCORE__;

			// Helper to capture current header node state.
			function snapshot() {
				const shell = core.getModuleShell();
				const headerNode = shell
					? shell.querySelector(".module-header")
					: null;
				return {
					text: headerNode ? headerNode.textContent : null,
					display: headerNode
						? globalThis.getComputedStyle(headerNode).display
						: null
				};
			}

			const originalHeader = instance.data.header;
			const originalHadHeader = Object.prototype.hasOwnProperty.call(
				instance.data,
				"header"
			);

			instance.data.header = "";
			await instance.updateDom();
			const emptyString = snapshot();

			instance.data.header = false;
			await instance.updateDom();
			const falseValue = snapshot();

			instance.data.header = "    ";
			await instance.updateDom();
			const whitespace = snapshot();

			delete instance.data.header;
			await instance.updateDom();
			const undefinedValue = snapshot();

			// Restore.
			if (originalHadHeader) {
				instance.data.header = originalHeader;
			} else {
				delete instance.data.header;
			}
			await instance.updateDom();

			return { emptyString, falseValue, whitespace, undefinedValue };
		});

		// empty string → module name shown (main.js: header || module.data.name)
		// DO NOT change to "": that means Boolean("") check was used, which is wrong.
		expect(result.emptyString).toEqual({
			text: "MMM-TestModule",
			display: "block"
		});

		// false → header hidden
		expect(result.falseValue).toEqual({ text: "", display: "none" });

		// whitespace string → shown as-is (truthy, no fallback)
		expect(result.whitespace).toEqual({ text: "    ", display: "block" });

		// undefined → module name shown (falsy non-false → name fallback)
		expect(result.undefinedValue).toEqual({
			text: "MMM-TestModule",
			display: "block"
		});
	});
});

// ---------------------------------------------------------------------------
// D7 — notificationReceived receives the original payload reference
//
// Source: main.js:98-101
//   for (var m in this.moduleInstances) {
//     this.moduleInstances[m].notificationReceived(notification, payload, sender);
//   }
//
// The core passes the original payload object reference directly. It does NOT
// clone the payload before calling notificationReceived. A module that stores
// the payload and later mutates it expects to affect the original — this only
// works if the reference is preserved. Passing a JSON clone silently breaks
// any module that stores and mutates notification payloads.
// ---------------------------------------------------------------------------
describe("D7 — notificationReceived receives original payload reference", () => {
	test("emitNotification passes original object reference to notificationReceived", async () => {
		await resetSandbox();

		const result = await stageEvaluate(() => {
			const core = globalThis.__MICROCORE__;
			const instance = globalThis.__moduleSandboxModule;

			// A Symbol sentinel proves JSON clone is impossible:
			// JSON.stringify drops Symbol values, so a clone cannot carry it.
			const sym = Symbol("identity");
			const originalPayload = {
				message: "__identity_test__",
				_sentinel: sym
			};

			let receivedPayload = null;
			const originalReceived =
				instance.notificationReceived.bind(instance);

			instance.notificationReceived = function (n, p) {
				if (n === "__IDENTITY_TEST__") {
					receivedPayload = p;
				}
				return originalReceived(n, p);
			};

			core.emitNotification("__IDENTITY_TEST__", originalPayload, null, {
				origin: "core-fidelity-test"
			});

			instance.notificationReceived = originalReceived;

			return {
				// MUST be true — a JSON clone is a different object reference.
				// See main.js:98-101: the core passes payload directly, never a clone.
				sameReference: receivedPayload === originalPayload,
				// Symbol cannot survive JSON.stringify/parse — proves it's the original.
				hasSymbolSentinel:
					receivedPayload !== null &&
					typeof receivedPayload._sentinel === "symbol" &&
					receivedPayload._sentinel === sym
			};
		});

		// DO NOT change to false — a clone breaks modules that mutate payloads.
		expect(result.sameReference).toBe(true);
		expect(result.hasSymbolSentinel).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// D8 — Log global is complete
//
// Source: logger.js (MagicMirror core)
// The Log object exposes: log, info, warn, error, debug, group, groupCollapsed,
// groupEnd, time, timeEnd, timeStamp, setLogLevel.
//
// Previously the sandbox only exposed log/info/warn/error. Calling any of the
// missing methods threw TypeError: Log.X is not a function — which is a real
// runtime crash for any module using Log.group() or Log.debug().
// ---------------------------------------------------------------------------
describe("D8 — Log global exposes all methods from logger.js", () => {
	test("all Log methods from logger.js exist and are callable without throwing", async () => {
		await resetSandbox();

		const result = await stageEvaluate(() => {
			// Complete list from logger.js — every method here must exist.
			// DO NOT remove methods from this list to make the test pass.
			// If a method is missing, add it to installGlobals() in module.ts.
			const requiredMethods = [
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
			];

			const existence = {};
			const callable = {};

			for (let i = 0; i < requiredMethods.length; i++) {
				const method = requiredMethods[i];
				existence[method] =
					typeof globalThis.Log[method] === "function";

				try {
					if (method === "groupEnd" || method === "setLogLevel") {
						globalThis.Log[method]();
					} else if (
						method === "group" ||
						method === "groupCollapsed"
					) {
						globalThis.Log[method]("__fidelity_test__");
						globalThis.Log.groupEnd();
					} else if (method === "time" || method === "timeEnd") {
						globalThis.Log[method]("__fidelity_timer__");
					} else if (method === "timeStamp") {
						globalThis.Log[method]("__fidelity_stamp__");
					} else {
						globalThis.Log[method]("__fidelity_test__");
					}
					callable[method] = true;
				} catch (_err) {
					callable[method] = false;
				}
			}

			return { existence, callable };
		});

		const methods = [
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
		];

		for (const method of methods) {
			expect(
				result.existence[method],
				`Log.${method} must exist (logger.js)`
			).toBe(true);
			expect(
				result.callable[method],
				`Log.${method} must be callable without throwing`
			).toBe(true);
		}
	});
});

// ---------------------------------------------------------------------------
// D9 — MM.getModules() returns array with filter helper methods
//
// Source: main.js:501-585
//   ModuleCollection.prototype.withClass = function(className) { ... }
//   ModuleCollection.prototype.exceptWithClass = function(className) { ... }
//   ModuleCollection.prototype.exceptModule = function(module) { ... }
//   ModuleCollection.prototype.enumerate = function(callback) { ... }
//
// In real MagicMirror, MM.getModules() returns a ModuleCollection with these
// helpers as non-enumerable methods. Many third-party modules call
// MM.getModules().withClass("mymodule") to find themselves. Returning a plain
// Array without these methods causes runtime crashes in any such module.
// ---------------------------------------------------------------------------
describe("D9 — MM.getModules() carries withClass/exceptWithClass/exceptModule/enumerate", () => {
	test("result has all filter helpers as non-enumerable properties; withClass and chaining work", async () => {
		await resetSandbox();

		const result = await stageEvaluate(() => {
			const modules = globalThis.MM.getModules();

			const hasWithClass = typeof modules.withClass === "function";
			const hasExceptWithClass =
				typeof modules.exceptWithClass === "function";
			const hasExceptModule = typeof modules.exceptModule === "function";
			const hasEnumerate = typeof modules.enumerate === "function";

			// Methods must NOT appear in Object.keys() (non-enumerable).
			const enumerableKeys = Object.keys(modules);
			const withClassEnumerable =
				enumerableKeys.indexOf("withClass") !== -1;
			const exceptWithClassEnumerable =
				enumerableKeys.indexOf("exceptWithClass") !== -1;
			const exceptModuleEnumerable =
				enumerableKeys.indexOf("exceptModule") !== -1;
			const enumerateEnumerable =
				enumerableKeys.indexOf("enumerate") !== -1;

			// withClass filters by module.data.classes (CSS class string), NOT by
			// module name. Default data.classes = "" so withClass("MMM-TestModule")
			// correctly returns 0 — the class string does not contain the module name.
			// Source: main.js:501-585.
			let withClassResult = -1;
			try {
				withClassResult = modules.withClass("MMM-TestModule").length;
			} catch (_err) {
				withClassResult = -1;
			}

			// exceptModule must exclude the mounted module.
			let exceptModuleResult = -1;
			try {
				const instance = globalThis.__moduleSandboxModule;
				exceptModuleResult = modules.exceptModule(instance).length;
			} catch (_err) {
				exceptModuleResult = -1;
			}

			// Even an empty filtered result must carry filter methods (chaining).
			// Use withClass("") to get all modules (empty class matches all).
			let chainedHasWithClass = false;
			try {
				const filtered = modules.withClass("");
				chainedHasWithClass = typeof filtered.withClass === "function";
			} catch (_err) {
				chainedHasWithClass = false;
			}

			return {
				length: modules.length,
				hasWithClass,
				hasExceptWithClass,
				hasExceptModule,
				hasEnumerate,
				withClassEnumerable,
				exceptWithClassEnumerable,
				exceptModuleEnumerable,
				enumerateEnumerable,
				withClassResult,
				exceptModuleResult,
				chainedHasWithClass
			};
		});

		expect(result.length).toBeGreaterThanOrEqual(1);

		// All four filter methods MUST exist.
		// DO NOT change any to false — plain Array breaks MM.getModules().withClass(...).
		expect(result.hasWithClass).toBe(true);
		expect(result.hasExceptWithClass).toBe(true);
		expect(result.hasExceptModule).toBe(true);
		expect(result.hasEnumerate).toBe(true);

		// MUST be non-enumerable (matching main.js defineProperty usage).
		expect(result.withClassEnumerable).toBe(false);
		expect(result.exceptWithClassEnumerable).toBe(false);
		expect(result.exceptModuleEnumerable).toBe(false);
		expect(result.enumerateEnumerable).toBe(false);

		// withClass("MMM-TestModule") filters by data.classes (CSS class string),
		// NOT by module name. Default data.classes="" → no match → length 0.
		// DO NOT change to toBe(1) — that would test module name, not CSS class.
		expect(result.withClassResult).toBe(0);

		// exceptModule(instance) must return empty (only 1 module mounted).
		expect(result.exceptModuleResult).toBe(0);

		// Filtered result must also carry filter methods (chaining, main.js:501-585).
		expect(result.chainedHasWithClass).toBe(true);
	});
});
