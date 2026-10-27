// @vitest-environment happy-dom
/**
 * Unit tests for the real-core stage observer (`client/stage-observer/`):
 * transparent instance and `Log` hooks, global capture, instance discovery,
 * the `__MICROCORE__` facade and the stage state contract.
 *
 * The cross-version behaviour against real cores lives in
 * `tests/integration/stage-transparency.browser.test.ts`.
 */
import { afterEach, describe, expect, test, vi } from "vitest";
import {
	parseStageState,
	type StageState
} from "../../../config/stage-state.ts";
import {
	clonePayload,
	createStageFacade,
	serializeLogValue,
	STYLE_REFRESH_UNAVAILABLE,
	UNCLONEABLE_PLACEHOLDER
} from "../../../client/stage-observer/facade.ts";
import {
	captureGlobalAssignment,
	hookInstance,
	watchForModuleInstance
} from "../../../client/stage-observer/instance-hooks.ts";
import {
	hookConsole,
	RECORDED_CONSOLE_METHODS
} from "../../../client/stage-observer/log-hooks.ts";
import {
	serializeStageState,
	stageStateSchema
} from "../../../server/stage/stage-state-schema.ts";

afterEach(() => {
	vi.restoreAllMocks();
});

describe("hookInstance", () => {
	test("calls through with the same this, arguments, result and exception, then records", () => {
		const calls: string[] = [];
		const instance: Record<string, any> = {
			name: "probe",
			notificationReceived(this: { name: string }, ...args: unknown[]) {
				calls.push(`original:${this.name}:${args.length}`);
				if (args[0] === "THROW") {
					throw new Error("boom");
				}
				return args[1];
			}
		};
		const after = vi.fn(() => calls.push("after"));
		hookInstance(instance, { after }, ["notificationReceived"]);

		const token = {};
		expect(instance.notificationReceived("ECHO", token, undefined)).toBe(
			token
		);
		expect(calls).toEqual(["original:probe:3", "after"]);
		expect(after).toHaveBeenCalledWith(
			"notificationReceived",
			instance,
			["ECHO", token, undefined],
			token,
			undefined
		);

		expect(() => instance.notificationReceived("THROW")).toThrow("boom");
		expect(after).toHaveBeenCalledTimes(1);
	});

	test("stays synchronous and leaves the prototype and missing methods alone", () => {
		const proto = {
			hide() {
				return "hidden";
			}
		};
		const instance = Object.create(proto) as Record<string, any>;
		const unavailable = hookInstance(instance, { after: () => {} });

		expect(unavailable).toEqual([
			"notificationReceived",
			"show",
			"suspend",
			"resume"
		]);
		expect(instance.hide()).toBe("hidden");
		expect(Object.hasOwn(instance, "hide")).toBe(true);
		expect(proto.hide()).toBe("hidden");
		expect(Object.hasOwn(instance, "show")).toBe(false);
	});

	test("passes the before token to after and survives observer failures", () => {
		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		const instance: Record<string, any> = { suspend: () => 1 };
		hookInstance(instance, {
			before: () => {
				throw new Error("before failed");
			},
			after: () => {
				throw new Error("after failed");
			}
		});
		expect(instance.suspend()).toBe(1);
		expect(error).toHaveBeenCalledTimes(2);

		const after = vi.fn();
		const other: Record<string, any> = { resume: () => 2 };
		hookInstance(other, { before: () => "token", after });
		other.resume();
		expect(after.mock.calls[0][4]).toBe("token");
	});
});

describe("captureGlobalAssignment", () => {
	test("captures the first assignment and leaves a plain data property", () => {
		const scope: Record<string, unknown> = {};
		const onAssign = vi.fn();
		captureGlobalAssignment(scope, "MM", onAssign);
		expect(scope.MM).toBeUndefined();

		const mm = { name: "core" };
		scope.MM = mm;
		expect(onAssign).toHaveBeenCalledWith(mm);
		expect(Object.getOwnPropertyDescriptor(scope, "MM")).toEqual({
			configurable: true,
			enumerable: true,
			writable: true,
			value: mm
		});
		scope.MM = "next";
		expect(onAssign).toHaveBeenCalledTimes(1);
	});

	test("release removes an accessor nobody assigned and keeps an assigned value", () => {
		const scope: Record<string, unknown> = {};
		captureGlobalAssignment(scope, "MM", () => {})();
		expect(Object.hasOwn(scope, "MM")).toBe(false);

		const assigned: Record<string, unknown> = {};
		const release = captureGlobalAssignment(assigned, "Log", () => {});
		assigned.Log = 1;
		release();
		expect(assigned.Log).toBe(1);
	});

	test("hands over an existing value immediately and reports callback failures", () => {
		const onAssign = vi.fn();
		captureGlobalAssignment({ Log: "present" }, "Log", onAssign);
		expect(onAssign).toHaveBeenCalledWith("present");

		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		const scope: Record<string, unknown> = {};
		captureGlobalAssignment(scope, "MM", () => {
			throw new Error("observer failed");
		});
		scope.MM = 1;
		expect(scope.MM).toBe(1);
		expect(error).toHaveBeenCalledTimes(1);
	});
});

describe("watchForModuleInstance", () => {
	test("hands the created instance whose wrapper the core appended", async () => {
		const instance = { identifier: "module_0_MMM-Probe" };
		const onInstance = vi.fn();
		let mm: unknown;
		watchForModuleInstance(document.body, () => mm, onInstance);

		const unrelated = document.createElement("div");
		unrelated.id = "other";
		document.body.appendChild(unrelated);
		const early = document.createElement("div");
		early.id = "module_9_Early";
		document.body.appendChild(early);
		await Promise.resolve();
		expect(onInstance).not.toHaveBeenCalled();

		mm = { getModules: () => [instance] };
		const wrapper = document.createElement("div");
		wrapper.id = instance.identifier;
		document.body.appendChild(wrapper);
		await vi.waitFor(() =>
			expect(onInstance).toHaveBeenCalledWith(instance)
		);

		const again = document.createElement("div");
		again.id = instance.identifier;
		document.body.appendChild(again);
		await Promise.resolve();
		expect(onInstance).toHaveBeenCalledTimes(1);
	});
});

describe("hookConsole", () => {
	/**
	 * A console stand-in whose methods print into `printed`.
	 */
	function createFakeConsole(printed: unknown[][]) {
		const fake: Record<string, unknown> = {};
		for (const method of RECORDED_CONSOLE_METHODS) {
			fake[method] = (...args: unknown[]) => {
				printed.push([method, ...args]);
				return method === "time" ? "native-result" : undefined;
			};
		}
		return fake as unknown as Console;
	}

	test("prints first, records after, returns the native result, and records what a bound logger prints", () => {
		const printed: unknown[][] = [];
		const order: string[] = [];
		const fake = createFakeConsole(printed);
		const record = vi.fn((method: string) =>
			order.push(`record:${method}`)
		);
		hookConsole(fake, record);

		expect(fake.time("t")).toBe("native-result");
		fake.warn("direct", 1);
		expect(printed).toEqual([
			["time", "t"],
			["warn", "direct", 1]
		]);
		expect(record).toHaveBeenNthCalledWith(2, "warn", ["direct", 1]);

		// js/logger.js binds console methods after the observer wrapped them;
		// a level setLogLevel disables becomes a no-op and never prints.
		const log = {
			info: fake.info.bind(fake),
			debug: () => {}
		};
		log.info("through Log");
		log.debug("disabled level");
		expect(record).toHaveBeenCalledTimes(3);
		expect(record).toHaveBeenLastCalledWith("info", ["through Log"]);
		expect(order).toEqual(["record:time", "record:warn", "record:info"]);
	});

	test("leaves missing methods alone, does not re-record while recording, and survives a failing recorder", () => {
		const printed: unknown[][] = [];
		const fake = createFakeConsole(printed) as unknown as Record<
			string,
			any
		>;
		delete fake.timeStamp;
		const nativeError = fake.error;
		const record = vi.fn(() => {
			fake.log("from the recorder");
		});
		hookConsole(fake as unknown as Console, record);
		expect(fake.timeStamp).toBeUndefined();

		fake.info("outer");
		expect(record).toHaveBeenCalledTimes(1);
		expect(printed).toEqual([
			["info", "outer"],
			["log", "from the recorder"]
		]);

		const failing: Record<string, any> = createFakeConsole([]);
		const reported = vi.fn();
		failing.error = reported;
		hookConsole(failing as unknown as Console, () => {
			throw new Error("record failed");
		});
		expect(() => failing.warn("x")).not.toThrow();
		expect(reported).toHaveBeenCalledWith(
			"[module-sandbox] console hook failed",
			expect.any(Error)
		);
		expect(nativeError).toBeTypeOf("function");

		const noError = createFakeConsole([]) as unknown as Record<string, any>;
		delete noError.error;
		hookConsole(noError as unknown as Console, () => {
			throw new Error("record failed");
		});
		expect(() => noError.log("y")).not.toThrow();
	});
});

/**
 * Builds a facade on a scope that records dispatched events.
 */
function createFacadeFixture(parent?: unknown) {
	const events: Array<{ type: string; detail: any }> = [];
	const scope = {
		parent: undefined as unknown,
		dispatchEvent(event: Event) {
			events.push({
				type: event.type,
				detail: (event as CustomEvent).detail
			});
			return true;
		}
	};
	scope.parent = parent ?? scope;
	return { scope, events, ...createStageFacade(scope) };
}

describe("createStageFacade", () => {
	test("emit calls notificationReceived with sender undefined and logs the panel origin", () => {
		const { core, instanceCallbacks, attachInstance, events } =
			createFacadeFixture();
		const received: unknown[][] = [];
		const instance: Record<string, any> = {
			identifier: "module_0_Probe",
			notificationReceived(...args: unknown[]) {
				received.push(args);
			}
		};
		hookInstance(instance, instanceCallbacks);
		attachInstance(instance);

		expect(
			core.emitNotification("PING", { a: 1 }, null, {
				origin: "debug-panel",
				senderLabel: "sandbox-ui"
			})
		).toBe(1);
		expect(received).toEqual([["PING", { a: 1 }, undefined]]);
		expect(core.notificationLog[0]).toMatchObject({
			notification: "PING",
			payload: { a: 1 },
			origin: "debug-panel",
			sender: "sandbox-ui",
			target: "module_0_Probe",
			recipients: ["module_0_Probe"]
		});
		expect(events.at(-1)?.type).toBe(
			"module-sandbox:notifications-updated"
		);
	});

	test("core and module deliveries are labelled by their sender", () => {
		const { core, instanceCallbacks, attachInstance } =
			createFacadeFixture();
		const instance: Record<string, any> = {
			name: "Probe",
			notificationReceived() {}
		};
		hookInstance(instance, instanceCallbacks);
		attachInstance(instance);

		instance.notificationReceived(
			"ALL_MODULES_STARTED",
			undefined,
			undefined
		);
		instance.notificationReceived("NEWS", 1, {
			identifier: "module_1_Other"
		});
		instance.notificationReceived("NEWS", 2, { name: "Named" });
		instance.notificationReceived("NEWS", 3, {});
		expect(
			core.notificationLog.map((entry) => [entry.origin, entry.sender])
		).toEqual([
			["module", "unknown"],
			["module", "Named"],
			["module", "module_1_Other"],
			["core", "MagicMirror"]
		]);
		expect(core.notificationLog[0].recipients).toEqual(["Probe"]);
		expect(core.notificationLog[0].target).toBeNull();
	});

	test("emit without an instance is logged with no recipients", () => {
		const { core } = createFacadeFixture();
		expect(core.emitNotification("PING", undefined)).toBe(0);
		expect(core.notificationLog[0]).toMatchObject({
			origin: "unknown",
			sender: null,
			recipients: []
		});
	});

	test("lifecycle follows the core calls and DOM_OBJECTS_CREATED completes the boot", () => {
		const { core, instanceCallbacks, attachInstance, events } =
			createFacadeFixture();
		const instance: Record<string, any> = {
			hidden: true,
			notificationReceived() {},
			hide() {
				instance.hidden = true;
			},
			show() {
				instance.hidden = false;
			},
			suspend() {},
			resume() {}
		};
		hookInstance(instance, instanceCallbacks);
		attachInstance(instance);
		expect(core.lifecycleState).toMatchObject({
			started: true,
			hidden: true
		});

		instance.show();
		expect(core.lifecycleState.hidden).toBe(false);
		instance.hide();
		expect(core.lifecycleState.hidden).toBe(true);

		expect(core.suspendModule(instance)).toBe(true);
		expect(core.lifecycleState.suspended).toBe(true);
		expect(core.suspendModule(instance)).toBe(false);
		expect(core.resumeModule(instance)).toBe(true);
		expect(core.lifecycleState.suspended).toBe(false);
		expect(core.resumeModule(instance)).toBe(false);
		expect(events.at(-1)).toEqual({
			type: "module-sandbox:lifecycle-updated",
			detail: { state: core.lifecycleState }
		});

		instance.notificationReceived("MODULE_DOM_CREATED");
		expect(core.lifecycleState.domCreated).toBe(true);

		const publishStageReady = vi.fn();
		instance.notificationReceived("DOM_OBJECTS_CREATED");
		core.publishStageReady = publishStageReady;
		instance.notificationReceived("DOM_OBJECTS_CREATED");
		expect(publishStageReady).toHaveBeenCalledWith(true);
	});

	test("console entries are serialized, capped and published", () => {
		const { core, recordConsole, events } = createFacadeFixture();
		for (let index = 0; index < 205; index += 1) {
			recordConsole("info", [index]);
		}
		expect(core.consoleLog).toHaveLength(200);
		expect(core.consoleLog[0].args).toEqual([204]);
		expect(events.at(-1)?.detail.maxEntries).toBe(200);
	});

	test("the notification log is capped", () => {
		const { core } = createFacadeFixture();
		for (let index = 0; index < 105; index += 1) {
			core.emitNotification(`N${index}`, null);
		}
		expect(core.notificationLog).toHaveLength(100);
	});

	test("websocket and helper logs mirror the shell's", () => {
		const shellLog = [{ notification: "PING" }];
		const { core } = createFacadeFixture({
			__MICROCORE__: { websocketLog: shellLog, helperLog: "invalid" }
		});
		expect(core.websocketLog).toBe(shellLog);
		expect(core.helperLog).toEqual([]);

		expect(createFacadeFixture().core.websocketLog).toEqual([]);
		const crossOrigin = createFacadeFixture(
			new Proxy(
				{},
				{
					get() {
						throw new Error("cross-origin");
					}
				}
			)
		);
		expect(crossOrigin.core.helperLog).toEqual([]);
	});

	test("style refresh rejects with a clear message", async () => {
		await expect(
			createFacadeFixture().core.reloadModuleStyles()
		).rejects.toThrow(STYLE_REFRESH_UNAVAILABLE);
	});

	test("observation gaps are exposed once the instance is attached", () => {
		const { core, instanceCallbacks, attachInstance } =
			createFacadeFixture();
		expect(core.unobservedNotifications).toEqual([]);
		expect(core.unavailableHooks).toEqual([]);

		const instance: Record<string, any> = { notificationReceived() {} };
		attachInstance(instance, hookInstance(instance, instanceCallbacks));
		expect(core.unobservedNotifications).toEqual(["ALL_MODULES_STARTED"]);
		expect(core.unavailableHooks).toEqual([
			"hide",
			"show",
			"suspend",
			"resume"
		]);

		const other = createFacadeFixture();
		other.attachInstance({});
		expect(other.core.unavailableHooks).toEqual([]);
	});

	test("attaching the instance publishes the observation gaps for the panels", () => {
		const { instanceCallbacks, attachInstance, events } =
			createFacadeFixture();
		const instance: Record<string, any> = { notificationReceived() {} };
		attachInstance(instance, hookInstance(instance, instanceCallbacks));

		const published = events.filter(
			(event) => event.type === "module-sandbox:observation-gaps-updated"
		);
		expect(published).toEqual([
			{
				type: "module-sandbox:observation-gaps-updated",
				detail: {
					unavailableHooks: ["hide", "show", "suspend", "resume"],
					unobservedNotifications: ["ALL_MODULES_STARTED"]
				}
			}
		]);
	});

	test("the payload is logged as delivered, even when the module mutates it", () => {
		const { core, instanceCallbacks, attachInstance } =
			createFacadeFixture();
		const instance: Record<string, any> = {
			notificationReceived(_notification: string, payload: any) {
				payload.count += 1;
				payload.added = true;
			}
		};
		hookInstance(instance, instanceCallbacks);
		attachInstance(instance);

		const payload = { count: 1 };
		core.emitNotification("MUTATE", payload);
		expect(payload).toEqual({ count: 2, added: true });
		expect(core.notificationLog[0].payload).toEqual({ count: 1 });

		instance.notificationReceived("CORE_MUTATE", { count: 5 });
		expect(core.notificationLog[0].payload).toEqual({ count: 5 });
	});

	test("an uncloneable payload is delivered untouched and logged as a placeholder", () => {
		const { core, instanceCallbacks, attachInstance } =
			createFacadeFixture();
		const received: unknown[] = [];
		const instance: Record<string, any> = {
			notificationReceived(_notification: string, payload: unknown) {
				received.push(payload);
			}
		};
		hookInstance(instance, instanceCallbacks);
		attachInstance(instance);

		// JSON.stringify and String() both throw on it.
		const hostile = Object.create(null);
		hostile.toJSON = () => {
			throw new Error("no JSON");
		};
		expect(() =>
			instance.notificationReceived("HOSTILE", hostile, undefined)
		).not.toThrow();
		expect(received).toEqual([hostile]);
		expect(core.notificationLog[0].payload).toBe(UNCLONEABLE_PLACEHOLDER);
	});

	test("a delivery whose before hook failed is still logged, with a placeholder payload", () => {
		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		const { core, instanceCallbacks, attachInstance } =
			createFacadeFixture();
		const instance: Record<string, any> = { notificationReceived() {} };
		hookInstance(instance, {
			before: () => {
				throw new Error("before failed");
			},
			after: instanceCallbacks.after
		});
		attachInstance(instance);
		instance.notificationReceived("NO_TOKEN", { a: 1 });
		expect(core.notificationLog[0]).toMatchObject({
			notification: "NO_TOKEN",
			payload: UNCLONEABLE_PLACEHOLDER,
			origin: "core"
		});
		expect(error).toHaveBeenCalledTimes(1);
	});

	test("the disabled state comes from the stage state", () => {
		const scope = { parent: null, dispatchEvent: () => true };
		expect(
			createStageFacade(scope, { disabled: true }).core.lifecycleState
				.disabled
		).toBe(true);
	});
});

describe("log value serialization", () => {
	test("serializeLogValue matches the hand-port runtime shapes", () => {
		const error = new Error("boom");
		expect(serializeLogValue(error)).toEqual({
			name: "Error",
			message: "boom",
			stack: error.stack
		});
		expect(serializeLogValue(undefined)).toBe("[undefined]");
		expect(serializeLogValue(function named() {})).toBe("[Function named]");
		expect(serializeLogValue(() => {})).toBe("[Function anonymous]");
		expect(serializeLogValue(document.createElement("section"))).toBe(
			"<section>"
		);
		expect(serializeLogValue({ a: [1] })).toEqual({ a: [1] });
		const circular: Record<string, unknown> = {};
		circular.self = circular;
		expect(serializeLogValue(circular)).toBe("[object Object]");
	});

	test("serializers never throw on hostile values", () => {
		const hostile = new Proxy(
			{},
			{
				getPrototypeOf() {
					throw new Error("trap");
				}
			}
		);
		expect(serializeLogValue(hostile)).toBe(UNCLONEABLE_PLACEHOLDER);
		expect(clonePayload(Object.create(null))).toEqual({});
	});

	test("clonePayload copies JSON values and stringifies the rest", () => {
		expect(clonePayload(undefined)).toBeUndefined();
		expect(clonePayload({ a: 1 })).toEqual({ a: 1 });
		expect(clonePayload(10n)).toBe("10");
	});
});

describe("stage state contract", () => {
	const valid: StageState = { position: "top_left", disabled: false };

	test("the browser guard accepts exactly what the server schema accepts", () => {
		const candidates: unknown[] = [
			valid,
			{ position: "", disabled: true },
			{ position: 1, disabled: false },
			{ position: "top_left", disabled: "false" },
			{ position: "top_left" },
			{ position: "top_left", disabled: false, extra: 1 },
			[],
			null,
			"text"
		];
		for (const candidate of candidates) {
			const serverAccepts = stageStateSchema.safeParse(candidate).success;
			let browserAccepts = true;
			try {
				parseStageState(JSON.stringify(candidate));
			} catch {
				browserAccepts = false;
			}
			expect(browserAccepts, JSON.stringify(candidate)).toBe(
				serverAccepts
			);
		}
	});

	test("serialized state round-trips and escapes element-closing text", () => {
		const hostile = { position: "</script>", disabled: true };
		const text = serializeStageState(hostile);
		expect(text).not.toContain("<");
		expect(parseStageState(text)).toEqual(hostile);
		expect(parseStageState(serializeStageState(valid))).toEqual(valid);
		expect(() =>
			serializeStageState({ position: 1 } as unknown as StageState)
		).toThrow();
	});
});
