/**
 * Shell-side tooling state and log utilities.
 *
 * The stage iframe runs the active MagicMirror core itself; the shell keeps
 * the mirrored logs and lifecycle state its panels render, on
 * `window.__MICROCORE__`. Later shell scripts (`shell-stage.ts`,
 * `debug-panel*.ts`, `quality-panel.ts`) attach their behaviour to the same
 * object.
 */
(function initShellCore(globalScope) {
	const harness = (globalScope.__HARNESS__ || {}) as Record<string, any>;

	/**
	 * Serialized console/helper log entry shown in the Debug sidebar.
	 *
	 * @typedef {object} DebugLogEntry
	 * @property {string} timestamp
	 * @property {string} method
	 * @property {Array<*>} args
	 */

	/**
	 * Serialized websocket traffic entry shown in the Debug sidebar.
	 *
	 * @typedef {object} WebsocketLogEntry
	 * @property {string} timestamp
	 * @property {string} direction
	 * @property {string} notification
	 * @property {*} payload
	 */

	/**
	 * Incremental or full log update payload published to sidebar renderers.
	 *
	 * @typedef {object} LogUpdateDetail
	 * @property {DebugLogEntry|WebsocketLogEntry} [entry] Newly prepended entry, when only one row changed.
	 * @property {Array<DebugLogEntry>|Array<WebsocketLogEntry>} [entries] Full snapshot, usually after clear/reset.
	 * @property {number} [maxEntries] UI retention cap used when prepending incrementally.
	 */

	const core: SandboxCore = {
		harness,
		rootSocket: null,
		notificationLog: [],
		maxNotificationLogEntries: 100,
		websocketLog: [],
		maxWebsocketLogEntries: 100,
		consoleLog: [],
		maxConsoleLogEntries: 200,
		helperLog: Array.isArray(harness.helperLogEntries)
			? harness.helperLogEntries.slice()
			: [],
		maxHelperLogEntries: 200,
		lifecycleState: {
			started: false,
			domCreated: false,
			disabled: false,
			hidden: false,
			suspended: false
		}
	};

	/**
	 * Patch the stored lifecycle state mirrored from the stage and notify
	 * the sidebar controls.
	 *
	 * @param {Partial<typeof core.lifecycleState>} nextState
	 * @returns {void}
	 */
	core.setLifecycleState = function setLifecycleState(nextState) {
		core.lifecycleState = Object.assign(
			{},
			core.lifecycleState,
			nextState || {}
		);
		globalScope.dispatchEvent(
			new CustomEvent("module-sandbox:lifecycle-updated", {
				detail: {
					state: Object.assign({}, core.lifecycleState)
				}
			})
		);
	};

	/**
	 * Broadcast a notification-log update to the Notifications panel.
	 *
	 * @param {LogUpdateDetail} [detail]
	 * @returns {void}
	 */
	core.publishNotificationLog = function publishNotificationLog(detail = {}) {
		globalScope.dispatchEvent(
			new CustomEvent("module-sandbox:notifications-updated", {
				detail
			})
		);
	};

	/**
	 * Clear the notification log and force a full sidebar reset.
	 *
	 * @returns {void}
	 */
	core.clearNotificationLog = function clearNotificationLog() {
		core.notificationLog = [];
		core.publishNotificationLog({
			entries: []
		});
	};

	/**
	 * Clone one console/helper log value into a JSON-safe shape.
	 *
	 * @param {*} value
	 * @returns {*}
	 */
	core.serializeLogValue = function serializeLogValue(value) {
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

		try {
			return JSON.parse(JSON.stringify(value));
		} catch (_error) {
			return String(value);
		}
	};

	/**
	 * Broadcast a console-log update to any sidebar renderer listeners.
	 *
	 * @param {LogUpdateDetail} [detail]
	 * @returns {void}
	 */
	core.publishConsoleLog = function publishConsoleLog(detail = {}) {
		globalScope.dispatchEvent(
			new CustomEvent("module-sandbox:console-log-updated", {
				detail
			})
		);
	};

	/**
	 * Append one browser-side console entry and notify listeners incrementally.
	 *
	 * @param {string} method
	 * @param {Array<*>} args
	 * @returns {void}
	 */
	core.recordConsoleLog = function recordConsoleLog(method, args) {
		const entry = {
			timestamp: new Date().toISOString(),
			method,
			args: Array.isArray(args) ? args.map(core.serializeLogValue) : []
		};
		core.consoleLog.unshift(entry);
		if (core.consoleLog.length > core.maxConsoleLogEntries) {
			core.consoleLog.length = core.maxConsoleLogEntries;
		}
		core.publishConsoleLog({
			entry,
			maxEntries: core.maxConsoleLogEntries
		});
	};

	/**
	 * Broadcast a helper-log update to any sidebar renderer listeners.
	 *
	 * @param {LogUpdateDetail} [detail]
	 * @returns {void}
	 */
	core.publishHelperLog = function publishHelperLog(detail = {}) {
		globalScope.dispatchEvent(
			new CustomEvent("module-sandbox:helper-log-updated", {
				detail
			})
		);
	};

	/**
	 * Broadcast a websocket-log update to any sidebar renderer listeners.
	 *
	 * @param {LogUpdateDetail} [detail]
	 * @returns {void}
	 */
	core.publishWebsocketLog = function publishWebsocketLog(detail = {}) {
		globalScope.dispatchEvent(
			new CustomEvent("module-sandbox:websocket-log-updated", {
				detail
			})
		);
	};

	/**
	 * Drop the stored websocket history and force a full sidebar reset.
	 *
	 * @returns {void}
	 */
	core.clearWebsocketLog = function clearWebsocketLog() {
		core.websocketLog = [];
		core.publishWebsocketLog({
			entries: []
		});
	};

	/**
	 * Drop the stored browser console history and force a full sidebar reset.
	 *
	 * @returns {void}
	 */
	core.clearConsoleLog = function clearConsoleLog() {
		core.consoleLog = [];
		core.publishConsoleLog({
			entries: []
		});
	};

	/**
	 * Drop the stored helper log history and force a full sidebar reset.
	 *
	 * @returns {void}
	 */
	core.clearHelperLog = function clearHelperLog() {
		core.helperLog = [];
		core.publishHelperLog({
			entries: []
		});
	};

	(function installConsoleCapture() {
		if (globalScope.__MODULE_SANDBOX_CONSOLE_CAPTURED__) {
			return;
		}

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
			"timeStamp"
		];
		const nativeConsole = {};

		methods.forEach((method) => {
			nativeConsole[method] = (console[method] || console.log).bind(
				console
			);
		});

		methods.forEach((method) => {
			/**
			 * Internal helper for consolemethod.
			 */
			console[method] = (...args) => {
				nativeConsole[method](...args);
				core.recordConsoleLog(method, args);
			};
		});

		globalScope.__MODULE_SANDBOX_CONSOLE_CAPTURED__ = true;
	})();

	globalScope.__MICROCORE__ = core;
})(window);
