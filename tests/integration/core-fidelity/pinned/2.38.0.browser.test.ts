/**
 * Version-pinned core-fidelity tests for MagicMirror 2.38.0.
 *
 * PURPOSE
 * -------
 * Each test asserts behaviour whose expected result is fixed for this core
 * version, annotated with the file and line in the 2.38.0 sources
 * (`git show v2.38.0:js/<file>` in the MagicMirror repo). They run on the
 * real-core stage (maintainer flag `--real-core-stage`) with the 2.38.0 core
 * installed in mmvm, selected by `MM_SANDBOX_TEST_CORE_VERSION=2.38.0`
 * (`tests/_helpers/core-matrix.ts`), and only through public behaviour:
 * `MM`, `Module`, the module instance API and the DOM. Without that core the
 * file is skipped.
 *
 * NON-NEGOTIABLE RULE (decided by the owner, per version)
 * -------------------------------------------------------
 * Do NOT alter an assertion in this file to make a failing run pass. A pinned
 * expectation changes only when the 2.38.0 core says otherwise, with the
 * file:line that proves it. If a test fails, fix the sandbox.
 *
 * The behaviour of other versions lives in their own pinned file; observer
 * transparency, which must hold identically on every version, lives in
 * `tests/integration/stage-transparency.browser.test.ts`.
 */
import { afterAll, describe, expect, test } from "vitest";
import {
	closeSandbox,
	consoleMessages,
	stageEvaluate
} from "../../../_helpers/helpers.browser.ts";
import {
	openPinnedStage,
	resolvePinnedCore
} from "../../../_helpers/pinned-core.ts";
import type { CoreMatrixEntry } from "../../../_helpers/core-matrix.ts";

const { core, suiteName } = resolvePinnedCore("2.38.0");

afterAll(async () => {
	await closeSandbox();
});

describe.skipIf(!core)(suiteName, () => {
	const open = () => openPinnedStage(core as CoreMatrixEntry);

	// -----------------------------------------------------------------------
	// D1 — base getDom() returns Promise<HTMLElement>; this._super() fails
	//
	// module.js:84-109: the base getDom always returns new Promise(...).
	// module.js:452-476: Module.create builds `class extends Module` and
	// copies the definition onto the instance with Object.assign
	// (module.js:467). Nothing defines _super, so a getDom that calls
	// this._super() throws TypeError: this._super is not a function.
	// main.js:147 awaits module.getDom(), so the rejection propagates through
	// createModuleDom (main.js:78-86), which never sends MODULE_DOM_CREATED,
	// to createDomObjects (main.js:64-69), which logs it with Log.error and
	// never sends DOM_OBJECTS_CREATED. The module content stays empty.
	// -----------------------------------------------------------------------
	describe("D1 — base getDom returns Promise<HTMLElement>; this._super() fails", () => {
		test("the base getDom() of a module without its own getDom returns a Promise of an HTMLElement", async () => {
			await open();

			const result = await stageEvaluate(async () => {
				const ModuleClass = globalThis.eval("Module");
				// A definition without getDom inherits the base getDom.
				ModuleClass.register("FidelityBaseProbe", {});
				const probe = ModuleClass.create("FidelityBaseProbe");
				probe.setData({
					name: "FidelityBaseProbe",
					identifier: "fidelity_base_probe",
					path: "modules/FidelityBaseProbe/",
					config: {}
				});

				const domResult = probe.getDom();
				const isPromise = domResult instanceof Promise;
				const isThenable = typeof domResult.then === "function";
				const resolved = await domResult;
				return {
					isPromise,
					isThenable,
					resolvedIsElement: resolved instanceof HTMLElement
				};
			});

			// DO NOT change these to false — module.js:84-109 always returns
			// new Promise(...).
			expect(result.isPromise).toBe(true);
			expect(result.isThenable).toBe(true);
			expect(result.resolvedIsElement).toBe(true);
		});

		test("getDom calling this._super() fails: TypeError, empty module content, no DOM-created notifications", async () => {
			await open();

			const result = await stageEvaluate(async () => {
				const instance = globalThis.eval("MM").getModules()[0];
				let error: unknown = null;
				try {
					await instance.getDom();
				} catch (caught) {
					error = caught;
				}
				const content = globalThis.document.querySelector(
					`#${instance.identifier} .module-content`
				);
				return {
					hasSuper: typeof instance._super !== "undefined",
					errorName: error instanceof Error ? error.name : null,
					errorMessage: error instanceof Error ? error.message : null,
					snapshotTaken: instance.superAdapterSnapshot !== undefined,
					contentChildren: content ? content.childElementCount : -1,
					moduleDomCreated:
						instance.coreNotificationCounts.moduleDomCreated,
					domObjectsCreated:
						instance.coreNotificationCounts.domObjectsCreated
				};
			});

			expect(result).toEqual({
				hasSuper: false,
				errorName: "TypeError",
				errorMessage: "this._super is not a function",
				snapshotTaken: false,
				contentChildren: 0,
				moduleDomCreated: 0,
				domObjectsCreated: 0
			});
			// main.js:67-68 — the boot's own failure is logged by the core.
			await expect
				.poll(async () =>
					(await consoleMessages()).some((message) =>
						message.includes("this._super is not a function")
					)
				)
				.toBe(true);
		});
	});

	// -----------------------------------------------------------------------
	// D5 — module.hidden is set synchronously on hide and on show; lockStrings
	// gate the show
	//
	//   MM.hideModule (main.js:694-697): module.hidden = true (main.js:695),
	//     then _hideModule, which registers options.lockString once
	//     (main.js:251-255).
	//   MM.showModule (main.js:706-709): leaves hidden alone and calls
	//     _showModule (main.js:333-422):
	//       - removes options.lockString (main.js:335-340);
	//       - a remaining lock without force calls
	//         options.onError(new Error("LOCK_STRING_ACTIVE")) and returns
	//         (main.js:344-350);
	//       - module.hidden = false, synchronously (main.js:363);
	//       - force clears every lockString (main.js:366-369).
	//   module.hide / module.show forward options to MM (module.js:371-417).
	// -----------------------------------------------------------------------
	describe("D5 — module.hidden is synchronous on hide and show; lockStrings veto show", () => {
		test("MM.hideModule and MM.showModule both update module.hidden synchronously", async () => {
			await open();

			const result = await stageEvaluate(async () => {
				const mm = globalThis.eval("MM");
				const instance = mm.getModules()[0];
				const hiddenBefore = instance.hidden;

				mm.hideModule(instance, 0, function () {}, {});
				const hiddenSynchronouslyAfterHide = instance.hidden;

				await new Promise(function (resolve) {
					mm.hideModule(instance, 0, resolve, {});
				});

				let hiddenSynchronouslyAfterShowCall = true;
				let hiddenInsideShowCallback = true;
				await new Promise<void>(function (resolve) {
					mm.showModule(
						instance,
						0,
						function () {
							hiddenInsideShowCallback = instance.hidden;
							resolve();
						},
						{}
					);
					hiddenSynchronouslyAfterShowCall = instance.hidden;
				});

				return {
					hiddenBefore,
					hiddenSynchronouslyAfterHide,
					hiddenSynchronouslyAfterShowCall,
					hiddenInsideShowCallback
				};
			});

			expect(result.hiddenBefore).toBe(false);
			// DO NOT change to false — main.js:695 sets hidden=true first.
			expect(result.hiddenSynchronouslyAfterHide).toBe(true);
			// DO NOT change to true — main.js:363 sets hidden=false
			// synchronously, before the animation.
			expect(result.hiddenSynchronouslyAfterShowCall).toBe(false);
			expect(result.hiddenInsideShowCallback).toBe(false);
		});

		test("an active lockString vetoes MM.showModule: hidden stays true, onError fires, callback never runs; force overrides", async () => {
			await open();

			const result = await stageEvaluate(async () => {
				const mm = globalThis.eval("MM");
				const instance = mm.getModules()[0];

				await new Promise(function (resolve) {
					mm.hideModule(instance, 0, resolve, {
						lockString: "fidelity-lock"
					});
				});
				// main.js:251-255 registers each lockString once.
				mm.hideModule(instance, 0, function () {}, {
					lockString: "fidelity-lock"
				});
				const lockCountAfterDuplicateHide = instance.lockStrings.length;

				let lockedCallbackRan = false;
				let lockedErrorMessage: string | null = null;
				mm.showModule(
					instance,
					0,
					function () {
						lockedCallbackRan = true;
					},
					{
						onError(error: Error) {
							lockedErrorMessage = error.message;
						}
					}
				);
				const hiddenWhileLocked = instance.hidden;
				// Give a speed=0 timer the chance to fire if it was armed.
				await new Promise(function (resolve) {
					setTimeout(resolve, 20);
				});

				let forcedCallbackRan = false;
				await new Promise<void>(function (resolve) {
					mm.showModule(
						instance,
						0,
						function () {
							forcedCallbackRan = true;
							resolve();
						},
						{ force: true }
					);
				});

				return {
					lockCountAfterDuplicateHide,
					hiddenWhileLocked,
					lockedCallbackRan,
					lockedErrorMessage,
					forcedCallbackRan,
					hiddenAfterForce: instance.hidden,
					lockCountAfterForce: instance.lockStrings.length
				};
			});

			expect(result.lockCountAfterDuplicateHide).toBe(1);
			// main.js:344-350 — a locked show returns before touching hidden.
			expect(result.hiddenWhileLocked).toBe(true);
			expect(result.lockedCallbackRan).toBe(false);
			expect(result.lockedErrorMessage).toBe("LOCK_STRING_ACTIVE");
			// main.js:363-369 — force shows and clears every lockString.
			expect(result.forcedCallbackRan).toBe(true);
			expect(result.hiddenAfterForce).toBe(false);
			expect(result.lockCountAfterForce).toBe(0);
		});

		test("module.hide/show forward lockString to MM: a foreign lock keeps the module hidden until its owner releases it", async () => {
			await open();

			const result = await stageEvaluate(async () => {
				const instance = globalThis.eval("MM").getModules()[0];

				await new Promise(function (resolve) {
					instance.hide(0, resolve, { lockString: "owner-a" });
				});

				let wrongOwnerCallbackRan = false;
				instance.show(
					0,
					function () {
						wrongOwnerCallbackRan = true;
					},
					{ lockString: "owner-b" }
				);
				await new Promise(function (resolve) {
					setTimeout(resolve, 20);
				});
				const hiddenAfterWrongOwner = instance.hidden;
				const locksAfterWrongOwner = instance.lockStrings.slice();

				await new Promise(function (resolve) {
					instance.show(0, resolve, { lockString: "owner-a" });
				});

				return {
					wrongOwnerCallbackRan,
					hiddenAfterWrongOwner,
					locksAfterWrongOwner,
					hiddenAfterOwnerShow: instance.hidden,
					locksAfterOwnerShow: instance.lockStrings.length
				};
			});

			expect(result.wrongOwnerCallbackRan).toBe(false);
			expect(result.hiddenAfterWrongOwner).toBe(true);
			expect(result.locksAfterWrongOwner).toEqual(["owner-a"]);
			expect(result.hiddenAfterOwnerShow).toBe(false);
			expect(result.locksAfterOwnerShow).toBe(0);
		});
	});

	// -----------------------------------------------------------------------
	// D3/D4 — suspend fires inside the hide callback, resume inside the show
	// callback
	//
	// module.js:381-389: hide passes MM.hideModule a callback that runs
	//   this.suspend() (module.js:385) and then the caller's callback.
	// module.js:408-416: show does the same with this.resume()
	//   (module.js:412).
	// The fixture's suspend/resume increment counters. (Their updateDom call
	// rejects on 2.38, see D1; the counters are set before it.)
	// -----------------------------------------------------------------------
	describe("D3/D4 — suspend fires in hide callback, resume fires in show callback", () => {
		test("suspend() fires inside hide callback; resume() fires inside show callback", async () => {
			await open();

			const result = await stageEvaluate(async () => {
				const instance = globalThis.eval("MM").getModules()[0];
				const suspendBefore = instance.suspendCount;
				const resumeBefore = instance.resumeCount;

				let suspendCountInsideHideCallback = -1;
				await new Promise<void>(function (resolve) {
					instance.hide(
						0,
						function () {
							suspendCountInsideHideCallback =
								instance.suspendCount;
							resolve();
						},
						{}
					);
				});

				let resumeCountInsideShowCallback = -1;
				await new Promise<void>(function (resolve) {
					instance.show(
						0,
						function () {
							resumeCountInsideShowCallback =
								instance.resumeCount;
							resolve();
						},
						{}
					);
				});

				return {
					suspendBefore,
					resumeBefore,
					suspendCountInsideHideCallback,
					resumeCountInsideShowCallback,
					suspendAfter: instance.suspendCount,
					resumeAfter: instance.resumeCount
				};
			});

			expect(result.suspendBefore).toBe(0);
			expect(result.resumeBefore).toBe(0);
			// MUST be 1 — module.js:385 runs suspend() before the callback.
			expect(result.suspendCountInsideHideCallback).toBe(1);
			// MUST be 1 — module.js:412 runs resume() before the callback.
			expect(result.resumeCountInsideShowCallback).toBe(1);
			expect(result.suspendAfter).toBe(1);
			expect(result.resumeAfter).toBe(1);
		});
	});

	// -----------------------------------------------------------------------
	// D6 — header rendered via innerHTML; display follows the header's
	// truthiness
	//
	// _updateDom reads module.getHeader() (main.js:146; module.js:117-119
	// returns this.data.header) and updateModuleContent (main.js:223-240)
	// writes it:
	//   headerWrapper[0].innerHTML = newHeader;              (main.js:234)
	//   display = newHeader ? "block" : "none";              (main.js:235-239)
	// MM.updateDom sends MODULE_DOM_UPDATED once the update is applied
	// (main.js:673-675); the fixture counts it.
	//
	// The fixture's getDom calls this._super(), which rejects on 2.38 (D1), so
	// no update would ever be applied. These tests give the instance its own
	// getDom that does not use _super, as a 2.38-compatible module does.
	// -----------------------------------------------------------------------
	describe("D6 — header rendered via innerHTML; a falsy header hides the header", () => {
		test("HTML markup in header renders as DOM elements (not escaped text)", async () => {
			await open();

			const result = await stageEvaluate(async () => {
				const instance = globalThis.eval("MM").getModules()[0];
				instance.getDom = function () {
					const div = globalThis.document.createElement("div");
					div.textContent = "header probe";
					return div;
				};
				const before = instance.coreNotificationCounts.moduleDomUpdated;
				instance.data.header = "Title: <strong>Bold Part</strong>";
				instance.updateDom();
				const timeoutAt = Date.now() + 10_000;
				while (
					instance.coreNotificationCounts.moduleDomUpdated === before
				) {
					if (Date.now() > timeoutAt) {
						throw new Error(
							"MODULE_DOM_UPDATED did not arrive within 10 s"
						);
					}
					await new Promise(function (resolve) {
						setTimeout(resolve, 10);
					});
				}
				const headerNode = globalThis.document.querySelector(
					`#${instance.identifier} .module-header`
				);
				const strongEl = headerNode?.querySelector("strong") ?? null;
				return {
					hasStrongElement: Boolean(strongEl),
					strongText: strongEl ? strongEl.textContent : null
				};
			});

			// MUST be true — main.js:234 writes the header with innerHTML.
			expect(result.hasStrongElement).toBe(true);
			expect(result.strongText).toBe("Bold Part");
		});

		test("empty string / false / undefined header hide the header; a whitespace header shows as-is", async () => {
			await open();

			const result = await stageEvaluate(async () => {
				const instance = globalThis.eval("MM").getModules()[0];
				instance.getDom = function () {
					const div = globalThis.document.createElement("div");
					div.textContent = "header probe";
					return div;
				};

				async function render(header: unknown, remove: boolean) {
					const before =
						instance.coreNotificationCounts.moduleDomUpdated;
					if (remove) {
						delete instance.data.header;
					} else {
						instance.data.header = header;
					}
					instance.updateDom();
					const timeoutAt = Date.now() + 10_000;
					while (
						instance.coreNotificationCounts.moduleDomUpdated ===
						before
					) {
						if (Date.now() > timeoutAt) {
							throw new Error(
								"MODULE_DOM_UPDATED did not arrive within 10 s"
							);
						}
						await new Promise(function (resolve) {
							setTimeout(resolve, 10);
						});
					}
					const headerNode = globalThis.document.querySelector(
						`#${instance.identifier} .module-header`
					) as HTMLElement | null;
					return {
						text: headerNode ? headerNode.textContent : null,
						display: headerNode
							? globalThis.getComputedStyle(headerNode).display
							: null
					};
				}

				return {
					emptyString: await render("", false),
					falseValue: await render(false, false),
					whitespace: await render("    ", false),
					undefinedValue: await render(undefined, true)
				};
			});

			// main.js:234-239: innerHTML = "" and a falsy header hides it.
			expect(result.emptyString).toEqual({ text: "", display: "none" });
			// innerHTML = false stringifies to "false"; still hidden.
			expect(result.falseValue).toEqual({
				text: "false",
				display: "none"
			});
			// A whitespace string is truthy: shown as-is.
			expect(result.whitespace).toEqual({
				text: "    ",
				display: "block"
			});
			// innerHTML = undefined stringifies to "undefined"; hidden.
			expect(result.undefinedValue).toEqual({
				text: "undefined",
				display: "none"
			});
		});
	});

	// -----------------------------------------------------------------------
	// D7 — notificationReceived receives the original payload reference
	//
	// MM.sendNotification (main.js:636-654) checks the sender is a Module
	// (main.js:647) and hands over to _sendNotification (main.js:111-118),
	// which calls module.notificationReceived(notification, payload, sender)
	// for every other module (main.js:115) with the payload object as given,
	// never a clone.
	// -----------------------------------------------------------------------
	describe("D7 — notificationReceived receives original payload reference", () => {
		test("MM.sendNotification passes the original object reference to notificationReceived", async () => {
			await open();

			const result = await stageEvaluate(() => {
				const mm = globalThis.eval("MM");
				const ModuleClass = globalThis.eval("Module");
				const instance = mm.getModules()[0];
				ModuleClass.register("FidelitySender", {});
				const sender = ModuleClass.create("FidelitySender");
				sender.setData({
					name: "FidelitySender",
					identifier: "fidelity_sender",
					path: "modules/FidelitySender/",
					config: {}
				});

				const sym = Symbol("identity");
				const originalPayload = {
					message: "__identity_test__",
					_sentinel: sym
				};

				let receivedPayload: { _sentinel?: unknown } | null = null;
				const hadOwn = Object.hasOwn(instance, "notificationReceived");
				const previous = instance.notificationReceived;
				instance.notificationReceived = function (
					n: string,
					p: unknown,
					s: unknown
				) {
					if (n === "__IDENTITY_TEST__") {
						receivedPayload = p as { _sentinel?: unknown };
					}
					return previous.call(this, n, p, s);
				};
				mm.sendNotification(
					"__IDENTITY_TEST__",
					originalPayload,
					sender
				);
				if (hadOwn) {
					instance.notificationReceived = previous;
				} else {
					delete instance.notificationReceived;
				}

				const received = receivedPayload as {
					_sentinel?: unknown;
				} | null;
				return {
					sameReference: received === originalPayload,
					hasSymbolSentinel:
						received !== null &&
						typeof received._sentinel === "symbol" &&
						received._sentinel === sym
				};
			});

			// DO NOT change to false — main.js:115 passes payload directly.
			expect(result.sameReference).toBe(true);
			expect(result.hasSymbolSentinel).toBe(true);
		});
	});

	// -----------------------------------------------------------------------
	// D8 — Log global is complete
	//
	// logger.js:18-28 binds debug, log, info, warn, error, group,
	// groupCollapsed, groupEnd, time, timeEnd and timeStamp to the console;
	// logger.js:33-38 adds setLogLevel.
	// -----------------------------------------------------------------------
	describe("D8 — Log global exposes all methods from logger.js", () => {
		test("all Log methods from logger.js exist and are callable without throwing", async () => {
			await open();

			const result = await stageEvaluate(() => {
				// DO NOT remove methods from this list to make the test pass.
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
				const log = globalThis.eval("Log");
				const existence: Record<string, boolean> = {};
				const callable: Record<string, boolean> = {};
				for (const method of requiredMethods) {
					existence[method] = typeof log[method] === "function";
					try {
						if (method === "groupEnd") {
							log[method]();
						} else if (method === "setLogLevel") {
							// Re-apply the levels the core configured.
							log[method](globalThis.eval("config").logLevel);
						} else if (
							method === "group" ||
							method === "groupCollapsed"
						) {
							log[method]("__fidelity_test__");
							log.groupEnd();
						} else if (method === "time" || method === "timeEnd") {
							log[method]("__fidelity_timer__");
						} else if (method === "timeStamp") {
							log[method]("__fidelity_stamp__");
						} else {
							log[method]("__fidelity_test__");
						}
						callable[method] = true;
					} catch {
						callable[method] = false;
					}
				}
				return { requiredMethods, existence, callable };
			});

			for (const method of result.requiredMethods) {
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

	// -----------------------------------------------------------------------
	// D9 — MM.getModules() returns an array with filter helper methods
	//
	// MM.getModules (main.js:682-685) calls setSelectionMethodsForModules
	// (main.js:484-568), which defines withClass, exceptWithClass,
	// exceptModule and enumerate with enumerable: false (main.js:556-567).
	// modulesByClass (main.js:510-530) filters on module.data.classes, which
	// the loader builds as `${moduleData.classes} ${module}` or the module
	// name alone (loader.js:132), so withClass("<module name>") matches.
	// -----------------------------------------------------------------------
	describe("D9 — MM.getModules() carries withClass/exceptWithClass/exceptModule/enumerate", () => {
		test("result has all filter helpers as non-enumerable properties; withClass and chaining work", async () => {
			await open();

			const result = await stageEvaluate(() => {
				const mm = globalThis.eval("MM");
				const modules = mm.getModules();
				const enumerableKeys = Object.keys(modules);
				const instance = modules[0];
				return {
					length: modules.length,
					hasWithClass: typeof modules.withClass === "function",
					hasExceptWithClass:
						typeof modules.exceptWithClass === "function",
					hasExceptModule: typeof modules.exceptModule === "function",
					hasEnumerate: typeof modules.enumerate === "function",
					withClassEnumerable: enumerableKeys.includes("withClass"),
					exceptWithClassEnumerable:
						enumerableKeys.includes("exceptWithClass"),
					exceptModuleEnumerable:
						enumerableKeys.includes("exceptModule"),
					enumerateEnumerable: enumerableKeys.includes("enumerate"),
					withClassResult: modules.withClass("MMM-TestModule").length,
					exceptModuleResult: modules.exceptModule(instance).length,
					chainedHasWithClass:
						typeof modules.withClass("MMM-TestModule").withClass ===
						"function",
					emptyChainedHasWithClass:
						typeof modules.withClass("no-such-class").withClass ===
						"function"
				};
			});

			expect(result.length).toBe(1);
			expect(result.hasWithClass).toBe(true);
			expect(result.hasExceptWithClass).toBe(true);
			expect(result.hasExceptModule).toBe(true);
			expect(result.hasEnumerate).toBe(true);
			// MUST be non-enumerable (main.js:556-567 defineProperty).
			expect(result.withClassEnumerable).toBe(false);
			expect(result.exceptWithClassEnumerable).toBe(false);
			expect(result.exceptModuleEnumerable).toBe(false);
			expect(result.enumerateEnumerable).toBe(false);
			// loader.js:132 appends the module name to data.classes.
			expect(result.withClassResult).toBe(1);
			// exceptModule(instance) leaves nothing (one module mounted).
			expect(result.exceptModuleResult).toBe(0);
			// Filtered results carry the helpers too (main.js:528).
			expect(result.chainedHasWithClass).toBe(true);
			// Even an empty filtered result carries them (chaining).
			expect(result.emptyChainedHasWithClass).toBe(true);
		});
	});

	// -----------------------------------------------------------------------
	// Script loading — 2.38 loads .mjs dependencies as ES modules
	//
	// loadFile (loader.js:193-249) has an "mjs" case (loader.js:214-229) that
	// appends <script type="module" src=...> to the body.
	// -----------------------------------------------------------------------
	describe("getScripts — .mjs entries load as modules", () => {
		test("the fixture's fixture-esm.mjs runs from a type=module script", async () => {
			await open();

			await expect
				.poll(() =>
					stageEvaluate(() => {
						const scripts = Array.from(
							globalThis.document.querySelectorAll(
								'script[src$="fixture-esm.mjs"]'
							)
						) as HTMLScriptElement[];
						return {
							esmLoaded:
								(
									globalThis as typeof globalThis & {
										__testModuleFixtureEsmLoaded?: boolean;
									}
								).__testModuleFixtureEsmLoaded ?? null,
							types: scripts.map((script) => script.type)
						};
					})
				)
				.toEqual({ esmLoaded: true, types: ["module"] });
		});
	});

	// -----------------------------------------------------------------------
	// configMerge — a user array replaces the array default
	//
	// setData (module.js:212-221) calls setConfig(data.config,
	// data.configDeepMerge) (module.js:220); setConfig (module.js:228-230)
	// runs configMerge({}, this.defaults, config) when deep. configMerge
	// (module.js:432-448) recurses only when both sides are plain objects
	// (module.js:433, 438) and otherwise overwrites (module.js:441-443), so an
	// array is assigned whole.
	// -----------------------------------------------------------------------
	describe("configMerge — arrays are replaced, not merged", () => {
		test("configDeepMerge replaces an array default with the user array and merges nested objects", async () => {
			await open();

			const result = await stageEvaluate(() => {
				const ModuleClass = globalThis.eval("Module");
				ModuleClass.register("FidelityMergeProbe", {
					defaults: {
						list: [1, 2, 3],
						nested: { keep: true, list: ["a", "b"] }
					}
				});
				const probe = ModuleClass.create("FidelityMergeProbe");
				probe.setData({
					name: "FidelityMergeProbe",
					identifier: "fidelity_merge_probe",
					path: "modules/FidelityMergeProbe/",
					config: { list: [9], nested: { list: ["z"] } },
					configDeepMerge: true
				});
				return {
					config: probe.config,
					defaults: probe.defaults
				};
			});

			expect(result.config).toEqual({
				list: [9],
				nested: { keep: true, list: ["z"] }
			});
			// The merge must not write into the defaults.
			expect(result.defaults).toEqual({
				list: [1, 2, 3],
				nested: { keep: true, list: ["a", "b"] }
			});
		});
	});
});
