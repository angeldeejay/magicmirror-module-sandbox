/**
 * Shared client-side runtime state and generic utilities.
 *
 * Later runtime modules attach behavior onto `window.__MICROCORE__` instead of
 * carrying one giant browser file.
 */
(function initMicroCoreShared(globalScope) {
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
		availableModulePositions: [
			"top_bar",
			"top_left",
			"top_center",
			"top_right",
			"upper_third",
			"middle_center",
			"lower_third",
			"bottom_left",
			"bottom_center",
			"bottom_right",
			"bottom_bar",
			"fullscreen_above",
			"fullscreen_below"
		],
		moduleDefinitions: {},
		moduleInstances: new Map(),
		loadedScripts: new Set(),
		loadedStyles: new Set(),
		loadedStyleEntries: new Map(),
		moduleInstance: null,
		moduleSocket: null,
		rootSocket: null,
		renderQueue: Promise.resolve(),
		notificationLog: [],
		maxNotificationLogEntries: 100,
		websocketLog: Array.isArray(harness.websocketLogEntries)
			? harness.websocketLogEntries.slice()
			: [],
		maxWebsocketLogEntries: 100,
		consoleLog: Array.isArray(harness.helperConsoleEntries)
			? harness.helperConsoleEntries.slice()
			: [],
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
	 * Merge plain objects recursively while replacing arrays by copy.
	 *
	 * @param {object} target
	 * @param {...object} sources
	 * @returns {object}
	 */
	core.deepMerge = function deepMerge(target, ...sources) {
		const output = target && typeof target === "object" ? target : {};
		sources.forEach((source) => {
			if (!source || typeof source !== "object") {
				return;
			}

			Object.keys(source).forEach((key) => {
				const value = source[key];
				if (Array.isArray(value)) {
					output[key] = value.slice();
					return;
				}
				if (value && typeof value === "object") {
					output[key] = deepMerge(
						output[key] && typeof output[key] === "object"
							? output[key]
							: {},
						value
					);
					return;
				}
				output[key] = value;
			});
		});
		return output;
	};

	/**
	 * Resolve the configured MagicMirror basePath with a stable trailing slash.
	 *
	 * @returns {string}
	 */
	core.getBasePath = function getBasePath() {
		const configuredBasePath =
			globalScope.config &&
			typeof globalScope.config.basePath === "string"
				? globalScope.config.basePath
				: "/";

		return configuredBasePath.endsWith("/")
			? configuredBasePath
			: `${configuredBasePath}/`;
	};

	/**
	 * Replace `{token}` placeholders inside a translated string.
	 *
	 * @param {string} template
	 * @param {object} variables
	 * @returns {string}
	 */
	core.interpolate = function interpolate(template, variables) {
		if (typeof template !== "string") {
			return template;
		}

		const vars =
			variables && typeof variables === "object" ? variables : {};
		return template.replace(/\{([^}]+)\}/g, (_match, token) => {
			return Object.prototype.hasOwnProperty.call(vars, token)
				? String(vars[token])
				: `{${token}}`;
		});
	};

	/**
	 * Forward log calls to the browser console while tolerating missing methods.
	 *
	 * @param {string} method
	 * @param {...*} args
	 * @returns {void}
	 */
	core.log = function log(method, ...args) {
		const fn = console[method] || console.log;
		fn.apply(console, args);
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
	 * Append one helper-side log entry mirrored from the server and notify listeners.
	 *
	 * @param {DebugLogEntry} entry
	 * @returns {void}
	 */
	core.recordHelperLog = function recordHelperLog(entry) {
		core.helperLog.unshift(entry);
		if (core.helperLog.length > core.maxHelperLogEntries) {
			core.helperLog.length = core.maxHelperLogEntries;
		}
		core.publishHelperLog({
			entry,
			maxEntries: core.maxHelperLogEntries
		});
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
	 * Append one websocket traffic entry and notify listeners incrementally.
	 *
	 * @param {string} direction
	 * @param {string} notification
	 * @param {*} payload
	 * @returns {void}
	 */
	core.recordWebsocketEvent = function recordWebsocketEvent(
		direction,
		notification,
		payload
	) {
		const entry = {
			timestamp: new Date().toISOString(),
			direction,
			notification,
			payload: core.serializeLogValue(payload)
		};
		core.websocketLog.unshift(entry);
		if (core.websocketLog.length > core.maxWebsocketLogEntries) {
			core.websocketLog.length = core.maxWebsocketLogEntries;
		}
		core.publishWebsocketLog({
			entry,
			maxEntries: core.maxWebsocketLogEntries
		});
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
