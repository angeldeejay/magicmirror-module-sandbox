/**
 * Bridge between the iframe-backed module stage and the persistent sandbox shell.
 */
(function initModuleSandboxStageBridge(globalScope) {
	const core = globalScope.__MICROCORE__;
	const SHELL_SOURCE = "module-sandbox-shell";
	const STAGE_SOURCE = "module-sandbox-stage";

	/**
	 * Post one message to the parent shell when embedded in an iframe.
	 *
	 * @param {string} type
	 * @param {object} [detail]
	 * @returns {void}
	 */
	function postToShell(type, detail = {}) {
		if (globalScope.parent === globalScope) {
			return;
		}

		globalScope.parent.postMessage(
			{
				source: STAGE_SOURCE,
				type,
				detail
			},
			globalScope.location.origin
		);
	}

	/**
	 * Publish one full snapshot to the shell after boot or reload.
	 *
	 * @returns {void}
	 */
	core.publishStageReady = function publishStageReady() {
		postToShell("stage-ready", {
			notificationLog: Array.isArray(core.notificationLog)
				? core.notificationLog.slice()
				: [],
			websocketLog: Array.isArray(core.websocketLog)
				? core.websocketLog.slice()
				: [],
			consoleLog: Array.isArray(core.consoleLog)
				? core.consoleLog.slice()
				: [],
			helperLog: Array.isArray(core.helperLog)
				? core.helperLog.slice()
				: [],
			lifecycleState: Object.assign({}, core.lifecycleState || {})
		});
	};

	globalScope.addEventListener(
		"module-sandbox:notifications-updated",
		(event) => {
			postToShell(
				"notifications-updated",
				(event as CustomEvent).detail || {}
			);
		}
	);
	globalScope.addEventListener(
		"module-sandbox:websocket-log-updated",
		(event) => {
			postToShell(
				"websocket-log-updated",
				(event as CustomEvent).detail || {}
			);
		}
	);
	globalScope.addEventListener(
		"module-sandbox:console-log-updated",
		(event) => {
			postToShell(
				"console-log-updated",
				(event as CustomEvent).detail || {}
			);
		}
	);
	globalScope.addEventListener(
		"module-sandbox:helper-log-updated",
		(event) => {
			postToShell(
				"helper-log-updated",
				(event as CustomEvent).detail || {}
			);
		}
	);
	globalScope.addEventListener(
		"module-sandbox:lifecycle-updated",
		(event) => {
			postToShell(
				"lifecycle-updated",
				(event as CustomEvent).detail || {}
			);
		}
	);

	globalScope.addEventListener("message", (event) => {
		const message = event.data;
		if (
			event.origin !== globalScope.location.origin ||
			event.source !== globalScope.parent ||
			!message ||
			message.source !== SHELL_SOURCE
		) {
			return;
		}

		switch (message.type) {
			case "request-stage-snapshot":
				core.publishStageReady();
				return;
			case "emit-notification":
				if (
					message.detail &&
					typeof message.detail.notification === "string" &&
					message.detail.notification.trim()
				) {
					core.emitNotification(
						message.detail.notification.trim(),
						Object.prototype.hasOwnProperty.call(
							message.detail,
							"payload"
						)
							? message.detail.payload
							: null,
						null,
						{
							origin: "debug-panel",
							senderLabel: "sandbox-ui"
						}
					);
				}
				return;
			case "set-visibility":
				if (!core.moduleInstance) {
					return;
				}
				if (message.detail && message.detail.hidden) {
					core.moduleInstance.hide(0);
					return;
				}
				core.moduleInstance.show(0);
				return;
			case "set-activity":
				if (!core.moduleInstance) {
					return;
				}
				if (message.detail && message.detail.suspended) {
					core.suspendModule(core.moduleInstance);
					return;
				}
				core.resumeModule(core.moduleInstance);
				return;
			case "refresh-styles":
				void core
					.reloadModuleStyles()
					.then((reloaded) => {
						if (!reloaded) {
							postToShell("styles-refresh-failed", {
								message:
									"Viewport runtime has no module styles to refresh yet."
							});
							return;
						}
						postToShell("styles-refreshed");
					})
					.catch((error) => {
						postToShell("styles-refresh-failed", {
							message:
								error && error.message
									? error.message
									: "Failed to refresh module styles."
						});
					});
				return;
			default:
		}
	});
})(window);
