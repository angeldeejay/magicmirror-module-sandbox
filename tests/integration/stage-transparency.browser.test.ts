/**
 * Cross-version transparency coverage for the real-core stage observer
 * (`client/stage-observer/`, maintainer flag `--real-core-stage`).
 *
 * The observer hooks the created module instance and the global `Log`, and
 * must stay invisible to the core: same arguments, results, exceptions and
 * timing, and no core function replaced on `Module.prototype` or `MM`. Runs
 * once per core in `tests/_helpers/core-matrix.ts` (the built-in core, plus
 * `MM_SANDBOX_TEST_CORE_VERSION` when installed in mmvm).
 */
import { afterAll, beforeAll, describe, expect, inject, test } from "vitest";
import {
	closeSandbox,
	consoleMessages,
	gotoRealCoreStage,
	pageEvaluate,
	stageEvaluate
} from "../_helpers/helpers.browser.ts";

type ProbeModule = {
	identifier: string;
	hidden: boolean;
	lastEcho?: { argumentCount: number; senderIsUndefined: boolean };
	notificationReceived: (
		notification: string,
		payload?: unknown,
		sender?: unknown
	) => unknown;
};
type ObserverCore = {
	notificationLog: Array<{
		notification: string;
		origin: string;
		sender: string | null;
	}>;
	consoleLog: Array<{ method: string; args: unknown[] }>;
	lifecycleState: {
		hidden: boolean;
		suspended: boolean;
		domCreated: boolean;
	};
	unobservedNotifications: string[];
	unavailableHooks: string[];
};
type StageScope = typeof globalThis & {
	__moduleSandboxModule?: ProbeModule;
	__MICROCORE__?: ObserverCore;
	mmVersion?: string;
};

const cores = inject("stageCoreMatrix");

/**
 * Whether a core uses the classic `Class.extend` modules (2.35-2.36), where
 * `this._super()` works.
 */
function isClassicCore(version: string): boolean {
	const [major, minor] = version.split(".").map(Number);
	return major === 2 && minor <= 36;
}

afterAll(async () => {
	await closeSandbox();
});

describe.each(cores)("core $version", ({ version, key }) => {
	beforeAll(async () => {
		await gotoRealCoreStage({ coreKey: key });
		// expect.poll is unavailable in hooks; wait for the hooked instance.
		const timeoutAt = Date.now() + 20_000;
		while (
			!(await stageEvaluate(() =>
				Boolean((globalThis as StageScope).__moduleSandboxModule)
			))
		) {
			if (Date.now() > timeoutAt) {
				throw new Error(
					"The stage observer never exposed the created module instance."
				);
			}
			await new Promise((resolve) => setTimeout(resolve, 100));
		}
	});

	test("the stage runs the requested core", async () => {
		const mmVersion = await stageEvaluate(
			() => (globalThis as StageScope).mmVersion ?? ""
		);
		expect(mmVersion).toBe(version);
	});

	test("the observer marks the document and publishes stage-ready to the shell", async () => {
		const attributes = await stageEvaluate(() => {
			const { dataset } = globalThis.document.documentElement;
			return {
				stage: dataset.sandboxStage,
				position: dataset.sandboxPosition,
				disabled: dataset.sandboxDisabled
			};
		});
		// The fixture runs with the default module config.
		expect(attributes).toEqual({
			stage: "core",
			position: "middle_center",
			disabled: "false"
		});
		await expect
			.poll(() =>
				pageEvaluate(() => ({
					stageReady: Boolean(
						(
							globalThis as typeof globalThis & {
								__MICROCORE__: { stageReady?: boolean };
							}
						).__MICROCORE__.stageReady
					),
					backdrop:
						globalThis.document.getElementById("harness-backdrop")
							?.dataset.visible
				}))
			)
			.toEqual({ stageReady: true, backdrop: "false" });
	});

	// 2.37+ reject the fixture's `this._super()` in getDom, as a real mirror
	// does, so only the classic cores deliver MODULE_DOM_CREATED and
	// DOM_OBJECTS_CREATED to it.
	test.runIf(isClassicCore(version))(
		"the classic core completes the boot through DOM_OBJECTS_CREATED",
		async () => {
			await expect
				.poll(() =>
					stageEvaluate(() => {
						const core = (globalThis as StageScope)
							.__MICROCORE__ as ObserverCore;
						return {
							domCreated: core.lifecycleState.domCreated,
							observed: core.notificationLog
								.filter((entry) =>
									[
										"MODULE_DOM_CREATED",
										"DOM_OBJECTS_CREATED"
									].includes(entry.notification)
								)
								.map((entry) => [
									entry.notification,
									entry.origin
								])
						};
					})
				)
				.toEqual({
					domCreated: true,
					observed: [
						["DOM_OBJECTS_CREATED", "core"],
						["MODULE_DOM_CREATED", "core"]
					]
				});
			// The DOM_OBJECTS_CREATED hook publishes stage-ready with
			// bootComplete, which the shell mirrors.
			await expect
				.poll(() =>
					pageEvaluate(() =>
						Boolean(
							(
								globalThis as typeof globalThis & {
									__MICROCORE__: { bootComplete?: boolean };
								}
							).__MICROCORE__.bootComplete
						)
					)
				)
				.toBe(true);
		}
	);

	test("wrapped notificationReceived returns what the original returns and rethrows what it throws", async () => {
		const result = await stageEvaluate(() => {
			const scope = globalThis as StageScope;
			const instance = scope.__moduleSandboxModule as ProbeModule;
			const token = { probe: "echo" };
			const returned = instance.notificationReceived(
				"TEST_MODULE_ECHO",
				token,
				undefined
			);
			let thrown: unknown = null;
			try {
				instance.notificationReceived(
					"TEST_MODULE_THROW",
					"probe failure",
					undefined
				);
			} catch (error) {
				thrown = error;
			}
			const log = scope.__MICROCORE__?.notificationLog ?? [];
			return {
				hooked: Object.hasOwn(instance, "notificationReceived"),
				sameObject: returned === token,
				thrownIsError: thrown instanceof Error,
				thrownMessage: thrown instanceof Error ? thrown.message : "",
				// Record-after: the call that threw is not logged.
				lastLogged: log[0]?.notification ?? ""
			};
		});
		expect(result).toEqual({
			hooked: true,
			sameObject: true,
			thrownIsError: true,
			thrownMessage: "probe failure",
			lastLogged: "TEST_MODULE_ECHO"
		});
	});

	test("wrapped methods stay synchronous", async () => {
		const result = await stageEvaluate(() => {
			const scope = globalThis as StageScope;
			const instance = scope.__moduleSandboxModule as ProbeModule;
			const returned = instance.notificationReceived(
				"TEST_MODULE_ECHO",
				42,
				undefined
			);
			// Read in the same tick, with no await in between.
			const entry = scope.__MICROCORE__?.notificationLog[0];
			return {
				returned,
				isPromise: returned instanceof Promise,
				recordedInSameTick: entry?.notification === "TEST_MODULE_ECHO"
			};
		});
		expect(result).toEqual({
			returned: 42,
			isPromise: false,
			recordedInSameTick: true
		});
	});

	test("emit delivers with sender undefined", async () => {
		await stageEvaluate(() => {
			const instance = (globalThis as StageScope)
				.__moduleSandboxModule as ProbeModule;
			delete instance.lastEcho;
		});
		await pageEvaluate(() => {
			(
				globalThis as typeof globalThis & {
					__MICROCORE__: {
						emitStageNotification: (n: string, p: unknown) => void;
					};
				}
			).__MICROCORE__.emitStageNotification("TEST_MODULE_ECHO", {
				from: "panel"
			});
		});

		await expect
			.poll(() =>
				stageEvaluate(
					() =>
						(globalThis as StageScope).__moduleSandboxModule
							?.lastEcho ?? null
				)
			)
			.toEqual({ argumentCount: 3, senderIsUndefined: true });
		const stageEntry = await stageEvaluate(() => {
			const entry = (globalThis as StageScope).__MICROCORE__
				?.notificationLog[0];
			return entry
				? {
						notification: entry.notification,
						origin: entry.origin,
						sender: entry.sender
					}
				: null;
		});
		expect(stageEntry).toEqual({
			notification: "TEST_MODULE_ECHO",
			origin: "debug-panel",
			sender: "sandbox-ui"
		});
		// The bridge mirrors the entry into the shell's Notifications panel.
		await expect
			.poll(() =>
				pageEvaluate(
					() =>
						(
							globalThis as typeof globalThis & {
								__MICROCORE__: ObserverCore;
							}
						).__MICROCORE__.notificationLog[0]?.notification ?? ""
				)
			)
			.toBe("TEST_MODULE_ECHO");
	});

	test("hide/show from lifecycle controls call MM.hideModule/MM.showModule and lifecycleState follows", async () => {
		const readStage = () =>
			stageEvaluate(() => {
				const scope = globalThis as StageScope;
				const instance = scope.__moduleSandboxModule as ProbeModule;
				const wrapper = globalThis.document.getElementById(
					instance.identifier
				);
				const state = scope.__MICROCORE__?.lifecycleState;
				return {
					instanceHidden: instance.hidden,
					// Only the core's hideModule/showModule toggle this class.
					wrapperHidden: Boolean(
						wrapper?.classList.contains("hidden")
					),
					hidden: state?.hidden,
					suspended: state?.suspended
				};
			});
		const readShell = () =>
			pageEvaluate(() => {
				const state = (
					globalThis as typeof globalThis & {
						__MICROCORE__: ObserverCore;
					}
				).__MICROCORE__.lifecycleState;
				return { hidden: state.hidden, suspended: state.suspended };
			});
		const setVisibility = (hidden: boolean) =>
			pageEvaluate((value) => {
				(
					globalThis as typeof globalThis & {
						__MICROCORE__: {
							setStageVisibility: (hidden: boolean) => void;
						};
					}
				).__MICROCORE__.setStageVisibility(value);
			}, hidden);

		await setVisibility(true);
		// module.hide() suspends in the core's hide callback.
		await expect.poll(readStage).toEqual({
			instanceHidden: true,
			wrapperHidden: true,
			hidden: true,
			suspended: true
		});
		await expect.poll(readShell).toEqual({ hidden: true, suspended: true });

		await setVisibility(false);
		await expect.poll(readStage).toEqual({
			instanceHidden: false,
			wrapperHidden: false,
			hidden: false,
			suspended: false
		});
		await expect
			.poll(readShell)
			.toEqual({ hidden: false, suspended: false });
	});

	test("the Console panel records what the browser prints: Log output and direct console calls, not disabled levels", async () => {
		const marker = `transparency-probe-${version}-${Date.now()}`;
		const recorded = await stageEvaluate((text) => {
			const scope = globalThis as StageScope & {
				Log: Record<string, (...args: unknown[]) => unknown>;
			};
			const core = scope.__MICROCORE__ as ObserverCore;
			const before = core.consoleLog.length;
			const logReturned = scope.Log.warn(`${text}-log`, 7);
			// DEBUG is not in the default logLevel, so setLogLevel made it a
			// no-op: nothing is printed and nothing must be recorded.
			scope.Log.debug(`${text}-disabled`);
			// A module calling the console directly.
			const consoleReturned = globalThis.console.warn(`${text}-direct`);
			return {
				returned: [logReturned, consoleReturned].map(
					(value) => value === undefined
				),
				added: core.consoleLog
					.slice(0, core.consoleLog.length - before)
					.map((entry) => [entry.method, ...entry.args])
			};
		}, marker);
		expect(recorded).toEqual({
			returned: [true, true],
			added: [
				["warn", `${marker}-direct`],
				["warn", `${marker}-log`, 7]
			]
		});
		await expect
			.poll(async () => {
				const printed = await consoleMessages();
				return ["log", "direct"].every((suffix) =>
					printed.some((message) =>
						message.includes(`${marker}-${suffix}`)
					)
				);
			})
			.toBe(true);
		expect(
			(await consoleMessages()).some((message) =>
				message.includes(`${marker}-disabled`)
			)
		).toBe(false);
	});

	test("observation gaps are exposed on the facade", async () => {
		const gaps = await stageEvaluate(() => {
			const core = (globalThis as StageScope)
				.__MICROCORE__ as ObserverCore;
			return {
				unobserved: core.unobservedNotifications,
				unavailable: core.unavailableHooks
			};
		});
		expect(gaps).toEqual({
			unobserved: ["ALL_MODULES_STARTED"],
			unavailable: []
		});
	});

	test("no core function is replaced on Module.prototype or MM", async () => {
		const readIdentities = () =>
			stageEvaluate(async () => {
				const scope = globalThis as StageScope;
				// Free identifiers: 2.35–2.36 declare MM/Module as global
				// lexical bindings, 2.37+ assign them to globalThis.
				const mm = globalThis.eval("MM") as Record<string, unknown>;
				const moduleClass = globalThis.eval("Module") as {
					prototype: Record<string, unknown>;
				};
				const sources = await Promise.all(
					["js/main.js", "js/module.js", "js/class.js"].map(
						async (file) => {
							const response = await fetch(
								new URL(file, globalThis.document.baseURI)
							);
							return response.ok ? response.text() : "";
						}
					)
				);
				const coreSource = sources.join("\n");
				const describe = (target: Record<string, unknown>) =>
					Object.getOwnPropertyNames(target)
						.filter((name) => {
							const descriptor = Object.getOwnPropertyDescriptor(
								target,
								name
							);
							return typeof descriptor?.value === "function";
						})
						.map((name) => {
							const fn = target[name] as () => unknown;
							return {
								name,
								fromCoreSource: coreSource.includes(
									Function.prototype.toString.call(fn)
								)
							};
						});
				const holder = scope as StageScope & {
					__transparencyIdentities?: Map<string, unknown>;
				};
				const snapshot = new Map<string, unknown>();
				for (const name of Object.getOwnPropertyNames(mm)) {
					snapshot.set(`MM.${name}`, mm[name]);
				}
				for (const name of Object.getOwnPropertyNames(
					moduleClass.prototype
				)) {
					snapshot.set(
						`Module.prototype.${name}`,
						moduleClass.prototype[name]
					);
				}
				const previous = holder.__transparencyIdentities;
				holder.__transparencyIdentities = snapshot;
				const changed = previous
					? Array.from(snapshot.keys()).filter(
							(name) => previous.get(name) !== snapshot.get(name)
						)
					: [];
				return {
					mm: describe(mm),
					prototype: describe(moduleClass.prototype),
					changed
				};
			});

		const before = await readIdentities();
		expect(before.mm.length).toBeGreaterThan(0);
		expect(before.prototype.length).toBeGreaterThan(0);
		for (const entry of [...before.mm, ...before.prototype]) {
			expect(entry, entry.name).toEqual({
				name: entry.name,
				fromCoreSource: true
			});
		}

		// Exercise every observer path, then check nothing was swapped.
		await pageEvaluate(() => {
			const core = (
				globalThis as typeof globalThis & {
					__MICROCORE__: {
						emitStageNotification: (n: string, p: unknown) => void;
						setStageVisibility: (hidden: boolean) => void;
						setStageActivity: (suspended: boolean) => void;
					};
				}
			).__MICROCORE__;
			core.emitStageNotification("TEST_MODULE_ECHO", null);
			core.setStageVisibility(true);
			core.setStageVisibility(false);
			core.setStageActivity(true);
			core.setStageActivity(false);
		});
		await expect
			.poll(() =>
				stageEvaluate(
					() =>
						(globalThis as StageScope).__MICROCORE__?.lifecycleState
							.suspended
				)
			)
			.toBe(false);

		const after = await readIdentities();
		expect(after.changed).toEqual([]);
		expect(after.mm).toEqual(before.mm);
		expect(after.prototype).toEqual(before.prototype);
	});
});
