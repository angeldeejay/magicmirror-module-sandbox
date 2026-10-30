/**
 * `globalThis.__MICROCORE__` facade of the stage, which runs the active
 * MagicMirror core itself.
 *
 * `client/runtime/stage-bridge.ts` reads a fixed set of fields. This facade
 * provides exactly those fields, fed by the observer hooks:
 * - logs: `notificationLog`, `consoleLog` (filled here), `websocketLog` and
 *   `helperLog` (owned by the shell, see `mirroredShellLog`);
 * - `lifecycleState`, `moduleInstance`;
 * - `emitNotification`, `suspendModule`, `resumeModule`,
 *   `reloadModuleStyles` (re-fetches the module's own stylesheets, see
 *   `style-refresh.ts`); the bridge adds `publishStageReady`;
 * - observation gaps for the panels: `unobservedNotifications`,
 *   `unavailableHooks`, published as `module-sandbox:observation-gaps-updated`
 *   when the instance is attached.
 *
 * Every control calls the real core API on the created instance: emit is
 * `instance.notificationReceived(notification, payload, undefined)`, as the
 * core delivers its own system notifications.
 */
import type {
	InstanceHookCallbacks,
	ObservedMethod
} from "./instance-hooks.ts";
import { refreshModuleStylesheets } from "./style-refresh.ts";

const MAX_NOTIFICATION_LOG_ENTRIES = 100;
const MAX_CONSOLE_LOG_ENTRIES = 200;

export type LifecycleState = {
	started: boolean;
	domCreated: boolean;
	disabled: boolean;
	hidden: boolean;
	suspended: boolean;
};

export type NotificationLogEntry = {
	timestamp: string;
	notification: string;
	payload: unknown;
	origin: string;
	sender: string | null;
	target: string | null;
	recipients: string[];
};

export type ConsoleLogEntry = {
	timestamp: string;
	method: string;
	args: unknown[];
};

type EmitMeta = { origin?: string; senderLabel?: string };

type ModuleInstance = Record<string, any> & {
	identifier?: string;
	name?: string;
	hidden?: boolean;
};

export type StageFacade = {
	notificationLog: NotificationLogEntry[];
	consoleLog: ConsoleLogEntry[];
	readonly websocketLog: unknown[];
	readonly helperLog: unknown[];
	lifecycleState: LifecycleState;
	moduleInstance: ModuleInstance | null;
	/**
	 * Whether this document's boot completed (`publishBootComplete`), so a
	 * later snapshot request reports it instead of resetting it.
	 */
	bootComplete: boolean;
	emitNotification: (
		notification: string,
		payload: unknown,
		sender?: unknown,
		meta?: EmitMeta
	) => number;
	suspendModule: (instance: ModuleInstance) => boolean;
	resumeModule: (instance: ModuleInstance) => boolean;
	reloadModuleStyles: () => Promise<boolean>;
	publishStageReady?: (bootComplete?: boolean) => void;
	/**
	 * Notifications the core delivered to the instance before the observer
	 * could hook it, so the Notifications panel can name the gap.
	 */
	unobservedNotifications: string[];
	/** Observed instance methods the created instance does not have. */
	unavailableHooks: string[];
};

/** Logged in place of a value that cannot be cloned or stringified. */
export const UNCLONEABLE_PLACEHOLDER = "[uncloneable value]";

/**
 * Notifications every supported core (2.35+) sends before the observer can
 * see the instance: `MM.modulesStarted` sends `ALL_MODULES_STARTED`, then
 * calls `createDomObjects`, whose module wrapper is the earliest point the
 * observer finds the created instance without wrapping core objects.
 */
const NOTIFICATIONS_SENT_BEFORE_DISCOVERY = ["ALL_MODULES_STARTED"];

type FacadeScope = {
	parent: unknown;
	dispatchEvent: (event: Event) => boolean;
};

/**
 * Clone one console value into a JSON-safe shape, the same shape the shell's
 * own log entries use (`client/runtime/shared.ts` `serializeLogValue`).
 */
export function serializeLogValue(value: unknown): unknown {
	try {
		if (value instanceof Error) {
			return {
				name: value.name,
				message: value.message,
				stack: value.stack
			};
		}
		if (value === undefined) {
			return "[undefined]";
		}
		if (typeof value === "function") {
			return `[Function ${value.name || "anonymous"}]`;
		}
		if (typeof Element !== "undefined" && value instanceof Element) {
			return `<${value.tagName.toLowerCase()}>`;
		}
	} catch {
		return UNCLONEABLE_PLACEHOLDER;
	}
	return clonePayload(value);
}

/** Whether serializing a value can run none of its owner's code. */
function isPrimitive(value: unknown): boolean {
	return (
		value === null ||
		(typeof value !== "object" && typeof value !== "function")
	);
}

/**
 * JSON-safe copy of a notification payload for the log.
 *
 * Notification payloads are copied synchronously, inside the delivery, so
 * the log shows the payload as delivered even when the module mutates it.
 * The documented cost (ARCHITECTURE.md, observer rules): `JSON.stringify`
 * runs the payload's own `toJSON` and getters at that point.
 */
export function clonePayload(value: unknown): unknown {
	if (value === undefined) {
		return undefined;
	}
	try {
		return JSON.parse(JSON.stringify(value));
	} catch {
		try {
			return String(value);
		} catch {
			// Never throws into the caller: the clone runs in the core's path.
			return UNCLONEABLE_PLACEHOLDER;
		}
	}
}

/**
 * Reads one log the shell owns. The WebSocket log reaches the shell from the
 * server side, so the stage has none of its own; mirroring the shell's copy
 * keeps the bridge's stage-ready snapshot from clearing it.
 */
function mirroredShellLog(scope: FacadeScope, key: string): unknown[] {
	try {
		if (scope.parent === scope) {
			return [];
		}
		const shellCore = (
			scope.parent as { __MICROCORE__?: Record<string, unknown> }
		).__MICROCORE__;
		const entries = shellCore?.[key];
		return Array.isArray(entries) ? entries : [];
	} catch {
		// Not embedded in a same-origin sandbox shell.
		return [];
	}
}

/**
 * Creates the facade and the observer callbacks that feed it.
 */
export function createStageFacade(
	scope: FacadeScope,
	{
		disabled = false,
		refreshStyles = (moduleName) =>
			refreshModuleStylesheets(document, moduleName)
	}: {
		disabled?: boolean;
		/** Re-fetches the module's stylesheets (`style-refresh.ts`). */
		refreshStyles?: (moduleName: string) => Promise<boolean>;
	} = {}
) {
	let pendingEmitMeta: EmitMeta | null = null;

	/** Per-call data `before` hands to `after` for notificationReceived. */
	type DeliveryToken = { meta: EmitMeta | null; payload: unknown };

	const dispatch = (type: string, detail: object) => {
		scope.dispatchEvent(new CustomEvent(type, { detail }));
	};

	const core: StageFacade = {
		notificationLog: [],
		consoleLog: [],
		get websocketLog() {
			return mirroredShellLog(scope, "websocketLog");
		},
		get helperLog() {
			return mirroredShellLog(scope, "helperLog");
		},
		lifecycleState: {
			started: false,
			domCreated: false,
			disabled,
			hidden: false,
			suspended: false
		},
		moduleInstance: null,
		bootComplete: false,
		emitNotification(notification, payload, _sender, meta = {}) {
			const instance = core.moduleInstance;
			if (
				!instance ||
				typeof instance.notificationReceived !== "function"
			) {
				recordNotification({
					notification,
					payload: clonePayload(payload),
					origin: meta.origin || "unknown",
					sender: meta.senderLabel || null,
					target: null,
					recipients: []
				});
				return 0;
			}
			pendingEmitMeta = meta;
			try {
				instance.notificationReceived(notification, payload, undefined);
			} finally {
				pendingEmitMeta = null;
			}
			return 1;
		},
		suspendModule(instance) {
			if (core.lifecycleState.suspended) {
				return false;
			}
			instance.suspend();
			return true;
		},
		resumeModule(instance) {
			if (!core.lifecycleState.suspended) {
				return false;
			}
			instance.resume();
			return true;
		},
		reloadModuleStyles() {
			const name = core.moduleInstance?.name;
			// Before the core created the module there is nothing to refresh.
			if (typeof name !== "string" || name === "") {
				return Promise.resolve(false);
			}
			return refreshStyles(name);
		},
		unobservedNotifications: [],
		unavailableHooks: []
	};

	/** Logs one delivery; `entry.payload` is already a log-safe clone. */
	function recordNotification(
		entry: Omit<NotificationLogEntry, "timestamp">
	): void {
		const logged: NotificationLogEntry = {
			timestamp: new Date().toISOString(),
			...entry
		};
		core.notificationLog.unshift(logged);
		if (core.notificationLog.length > MAX_NOTIFICATION_LOG_ENTRIES) {
			core.notificationLog.length = MAX_NOTIFICATION_LOG_ENTRIES;
		}
		dispatch("module-sandbox:notifications-updated", { entry: logged });
	}

	/** Console calls whose arguments are not serialized yet, oldest first. */
	const pendingConsole: Array<{
		timestamp: string;
		method: string;
		args: unknown[];
	}> = [];

	/**
	 * Records one console call. Primitive arguments are serialized at once:
	 * that runs no code of the caller. Any object argument defers the
	 * serialization (and every later call, to keep the order) to a separate
	 * task, so its `toJSON`, getters or Proxy traps never run inside the
	 * module's own `console.*` / `Log.*` call, as a browser console reads
	 * logged objects lazily too.
	 */
	function recordConsole(method: string, args: unknown[]): void {
		const timestamp = new Date().toISOString();
		if (pendingConsole.length === 0 && args.every(isPrimitive)) {
			publishConsole({
				timestamp,
				method,
				args: args.map(serializeLogValue)
			});
			return;
		}
		pendingConsole.push({ timestamp, method, args: [...args] });
		if (pendingConsole.length === 1) {
			setTimeout(flushPendingConsole, 0);
		}
	}

	function flushPendingConsole(): void {
		for (const pending of pendingConsole.splice(0)) {
			publishConsole({
				timestamp: pending.timestamp,
				method: pending.method,
				args: pending.args.map(serializeLogValue)
			});
		}
	}

	function publishConsole(entry: ConsoleLogEntry): void {
		core.consoleLog.unshift(entry);
		if (core.consoleLog.length > MAX_CONSOLE_LOG_ENTRIES) {
			core.consoleLog.length = MAX_CONSOLE_LOG_ENTRIES;
		}
		dispatch("module-sandbox:console-log-updated", {
			entry,
			maxEntries: MAX_CONSOLE_LOG_ENTRIES
		});
	}

	function setLifecycleState(next: Partial<LifecycleState>): void {
		core.lifecycleState = { ...core.lifecycleState, ...next };
		dispatch("module-sandbox:lifecycle-updated", {
			state: { ...core.lifecycleState }
		});
	}

	function publishBootComplete(): void {
		core.bootComplete = true;
		if (typeof core.publishStageReady === "function") {
			core.publishStageReady(true);
		}
	}

	/** Hook callbacks for the created instance. */
	const instanceCallbacks: InstanceHookCallbacks = {
		before(method: ObservedMethod, args) {
			if (method !== "notificationReceived") {
				return null;
			}
			const meta = pendingEmitMeta;
			pendingEmitMeta = null;
			// Cloned before the call, so a module mutating the payload does not
			// rewrite the log.
			const token: DeliveryToken = {
				meta,
				payload: clonePayload(args[1])
			};
			return token;
		},
		after(method, instance, args, _result, token) {
			const module = (instance ?? {}) as ModuleInstance;
			switch (method) {
				case "notificationReceived": {
					const [notification, , sender] = args as [
						string,
						unknown,
						ModuleInstance | undefined
					];
					const delivery = token as DeliveryToken | undefined;
					const meta = delivery?.meta ?? null;
					const senderLabel = sender
						? String(sender.identifier || sender.name || "unknown")
						: null;
					recordNotification({
						notification,
						payload: delivery
							? delivery.payload
							: UNCLONEABLE_PLACEHOLDER,
						origin: meta?.origin || (sender ? "module" : "core"),
						sender: meta
							? meta.senderLabel || null
							: senderLabel || "MagicMirror",
						target: module.identifier ?? null,
						recipients: [
							String(
								module.identifier || module.name || "unknown"
							)
						]
					});
					if (notification === "MODULE_DOM_CREATED") {
						setLifecycleState({ domCreated: true });
					} else if (notification === "DOM_OBJECTS_CREATED") {
						publishBootComplete();
					}
					return;
				}
				case "hide":
				case "show":
					setLifecycleState({ hidden: Boolean(module.hidden) });
					return;
				case "suspend":
					setLifecycleState({ suspended: true });
					return;
				case "resume":
					setLifecycleState({ suspended: false });
					return;
				default:
			}
		}
	};

	/**
	 * Adopts the instance the core created, once hooked, with the observed
	 * methods `hookInstance` could not find on it.
	 */
	function attachInstance(
		instance: ModuleInstance,
		unavailableHooks: readonly string[] = []
	): void {
		core.moduleInstance = instance;
		core.unavailableHooks = [...unavailableHooks];
		core.unobservedNotifications = [...NOTIFICATIONS_SENT_BEFORE_DISCOVERY];
		// The panels live in the shell; the bridge forwards this event and the
		// stage-ready snapshot carries the same lists.
		dispatch("module-sandbox:observation-gaps-updated", {
			unavailableHooks: [...core.unavailableHooks],
			unobservedNotifications: [...core.unobservedNotifications]
		});
		setLifecycleState({ started: true, hidden: Boolean(instance.hidden) });
	}

	return {
		core,
		instanceCallbacks,
		attachInstance,
		recordConsole,
		publishBootComplete
	};
}
