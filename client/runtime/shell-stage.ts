/**
 * Bridge between the persistent sandbox shell and the iframe-backed module stage.
 */
(function initModuleSandboxShellStage(globalScope) {
	const core = globalScope.__MICROCORE__;
	const SHELL_SOURCE = "module-sandbox-shell";
	const STAGE_SOURCE = "module-sandbox-stage";

	/**
	 * Resolve the viewport iframe element.
	 *
	 * @returns {HTMLIFrameElement|null}
	 */
	core.getStageFrame = function getStageFrame() {
		return document.getElementById("module-stage-frame");
	};

	/**
	 * Resolve the iframe window when available.
	 *
	 * @returns {Window|null}
	 */
	core.getStageWindow = function getStageWindow() {
		const frame = core.getStageFrame();
		return frame && frame.contentWindow ? frame.contentWindow : null;
	};

	/**
	 * Post one command into the viewport runtime.
	 *
	 * @param {string} type
	 * @param {object} [detail]
	 * @returns {boolean}
	 */
	core.postStageCommand = function postStageCommand(type, detail = {}) {
		const stageWindow = core.getStageWindow();
		if (!stageWindow) {
			return false;
		}

		stageWindow.postMessage(
			{
				source: SHELL_SOURCE,
				type,
				detail
			},
			globalScope.location.origin
		);
		return true;
	};

	/**
	 * Internal helper for request stage snapshot.
	 */
	core.requestStageSnapshot = function requestStageSnapshot() {
		return core.postStageCommand("request-stage-snapshot");
	};

	/**
	 * Emits stage notification.
	 */
	core.emitStageNotification = function emitStageNotification(
		notification,
		payload
	) {
		return core.postStageCommand("emit-notification", {
			notification,
			payload
		});
	};

	/**
	 * Sets stage visibility.
	 */
	core.setStageVisibility = function setStageVisibility(hidden) {
		return core.postStageCommand("set-visibility", {
			hidden: Boolean(hidden)
		});
	};

	/**
	 * Sets stage activity.
	 */
	core.setStageActivity = function setStageActivity(suspended) {
		return core.postStageCommand("set-activity", {
			suspended: Boolean(suspended)
		});
	};

	/**
	 * Internal helper for refresh stage styles.
	 */
	core.refreshStageStyles = function refreshStageStyles() {
		return core.postStageCommand("refresh-styles");
	};

	/**
	 * Internal helper for reload stage.
	 */
	core.reloadStage = function reloadStage(version) {
		const frame = core.getStageFrame();
		if (!frame) {
			return false;
		}

		const nextUrl = new URL(
			frame.getAttribute("src") || "/__harness/stage",
			globalScope.location.origin
		);
		nextUrl.searchParams.set("v", version || Date.now().toString(36));
		frame.src = `${nextUrl.pathname}${nextUrl.search}`;
		return true;
	};

	/**
	 * Replace one mirrored log collection from a full snapshot.
	 *
	 * @param {string} key
	 * @param {Array<object>} entries
	 * @param {(detail?: object) => void} publisher
	 * @returns {void}
	 */
	function replaceMirroredEntries(key, entries, publisher) {
		core[key] = Array.isArray(entries) ? entries.slice() : [];
		publisher({
			entries: core[key]
		});
	}

	/**
	 * Apply one incremental-or-full mirrored log update from the iframe.
	 *
	 * @param {string} key
	 * @param {string} maxKey
	 * @param {(detail?: object) => void} publisher
	 * @param {{entry?: object, entries?: Array<object>}} detail
	 * @returns {void}
	 */
	function applyMirroredUpdate(key, maxKey, publisher, detail) {
		if (!detail || typeof detail !== "object") {
			return;
		}

		if (Array.isArray(detail.entries)) {
			replaceMirroredEntries(key, detail.entries, publisher);
			return;
		}

		if (!detail.entry) {
			return;
		}

		core[key].unshift(detail.entry);
		if (core[key].length > core[maxKey]) {
			core[key].length = core[maxKey];
		}
		publisher({
			entry: detail.entry,
			maxEntries: core[maxKey]
		});
	}

	/**
	 * Apply the lifecycle snapshot mirrored from the stage.
	 *
	 * @param {object} nextState
	 * @returns {void}
	 */
	function applyLifecycleState(nextState) {
		if (typeof core.setLifecycleState === "function") {
			core.setLifecycleState(nextState || {});
			return;
		}

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
	}

	globalScope.addEventListener("message", (event) => {
		const frame = core.getStageFrame();
		const message = event.data;
		if (
			!frame ||
			event.origin !== globalScope.location.origin ||
			event.source !== frame.contentWindow ||
			!message ||
			message.source !== STAGE_SOURCE
		) {
			return;
		}

		switch (message.type) {
			case "stage-ready":
				core.stageReady = true;
				replaceMirroredEntries(
					"notificationLog",
					message.detail && message.detail.notificationLog,
					core.publishNotificationLog
				);
				replaceMirroredEntries(
					"websocketLog",
					message.detail && message.detail.websocketLog,
					core.publishWebsocketLog
				);
				replaceMirroredEntries(
					"consoleLog",
					message.detail && message.detail.consoleLog,
					core.publishConsoleLog
				);
				replaceMirroredEntries(
					"helperLog",
					message.detail && message.detail.helperLog,
					core.publishHelperLog
				);
				applyLifecycleState(
					message.detail && message.detail.lifecycleState
				);
				globalScope.dispatchEvent(
					new CustomEvent("module-sandbox:stage-ready", {
						detail: message.detail || {}
					})
				);
				return;
			case "notifications-updated":
				applyMirroredUpdate(
					"notificationLog",
					"maxNotificationLogEntries",
					core.publishNotificationLog,
					message.detail
				);
				return;
			case "websocket-log-updated":
				applyMirroredUpdate(
					"websocketLog",
					"maxWebsocketLogEntries",
					core.publishWebsocketLog,
					message.detail
				);
				return;
			case "console-log-updated":
				applyMirroredUpdate(
					"consoleLog",
					"maxConsoleLogEntries",
					core.publishConsoleLog,
					message.detail
				);
				return;
			case "helper-log-updated":
				applyMirroredUpdate(
					"helperLog",
					"maxHelperLogEntries",
					core.publishHelperLog,
					message.detail
				);
				return;
			case "lifecycle-updated":
				applyLifecycleState(message.detail && message.detail.state);
				return;
			case "styles-refreshed":
				globalScope.dispatchEvent(
					new CustomEvent("module-sandbox:styles-refreshed")
				);
				return;
			case "styles-refresh-failed":
				globalScope.dispatchEvent(
					new CustomEvent("module-sandbox:styles-refresh-failed", {
						detail: message.detail || {}
					})
				);
				return;
			default:
		}
	});

	globalScope.addEventListener("DOMContentLoaded", () => {
		const frame = core.getStageFrame();
		core.stageReady = false;

		if (frame && globalScope.io) {
			const rootSocket = globalScope.io({
				path: "/socket.io",
				transports: ["websocket"],
				pingInterval: 120000,
				pingTimeout: 120000
			});

			rootSocket.on("harness:reload", (payload) => {
				const scope =
					payload && typeof payload.scope === "string"
						? payload.scope
						: "shell";
				if (scope === "shell") {
					globalScope.location.reload();
					return;
				}

				core.reloadStage(
					payload && typeof payload.version === "string"
						? payload.version
						: undefined
				);
			});
		}

		if (frame) {
			frame.addEventListener("load", () => {
				core.stageReady = false;
				globalScope.setTimeout(() => {
					core.requestStageSnapshot();
				}, 0);
			});
		}

		core.initializeDebugPanel();
	});
})(window);
