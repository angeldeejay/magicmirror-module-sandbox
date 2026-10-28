/**
 * Bridge between the persistent sandbox shell and the iframe-backed module stage.
 */
(function initModuleSandboxShellStage(globalScope) {
	const core = globalScope.__MICROCORE__;
	const SHELL_SOURCE = "module-sandbox-shell";
	const STAGE_SOURCE = "module-sandbox-stage";
	/**
	 * How long the shell waits for the stage document to reload after the
	 * core took a reload (`reloadedBy: "core"`) before it reloads the frame
	 * itself. Writable for tests.
	 */
	core.coreReloadFallbackMs = 5000;
	/** Pending fallback for a core-driven reload, cleared by the frame load. */
	let coreReloadFallbackTimer = null;

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
	 * Show the shell-level backdrop with an optional label.
	 */
	core.showBackdrop = function showBackdrop(label) {
		const backdrop = document.getElementById("harness-backdrop");
		const labelEl = document.getElementById("harness-backdrop-label");
		if (backdrop) backdrop.dataset.visible = "true";
		if (labelEl) labelEl.textContent = label || "Loading\u2026";
	};

	/**
	 * Hide the shell-level backdrop.
	 */
	core.hideBackdrop = function hideBackdrop() {
		const backdrop = document.getElementById("harness-backdrop");
		if (backdrop) backdrop.dataset.visible = "false";
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
			frame.getAttribute("src") || "/__stage/",
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
		core.setLifecycleState(nextState || {});
	}

	/**
	 * Store the stage's observation gaps and tell the panels. Missing or
	 * malformed lists count as empty.
	 *
	 * @param {{unavailableHooks?: unknown, unobservedNotifications?: unknown}} [detail]
	 * @returns {void}
	 */
	function applyObservationGaps(detail) {
		const readNames = (value) =>
			Array.isArray(value)
				? value.filter((name) => typeof name === "string")
				: [];
		core.observationGaps = {
			unavailableHooks: readNames(detail && detail.unavailableHooks),
			unobservedNotifications: readNames(
				detail && detail.unobservedNotifications
			)
		};
		globalScope.dispatchEvent(
			new CustomEvent("module-sandbox:observation-gaps-updated", {
				detail: {
					unavailableHooks:
						core.observationGaps.unavailableHooks.slice(),
					unobservedNotifications:
						core.observationGaps.unobservedNotifications.slice()
				}
			})
		);
	}

	/**
	 * Whether the stage iframe already finished loading its own document (not
	 * the initial `about:blank`, which is also "complete").
	 *
	 * @param {HTMLIFrameElement} frame
	 * @returns {boolean}
	 */
	function isStageDocumentLoaded(frame) {
		try {
			const stageDocument = frame.contentDocument;
			return Boolean(
				stageDocument &&
				stageDocument.readyState === "complete" &&
				stageDocument.URL !== "about:blank"
			);
		} catch {
			// Not same-origin; the load listener is the only signal then.
			return false;
		}
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
				core.bootComplete = Boolean(
					message.detail && message.detail.bootComplete
				);
				// Kept for the badge, which may mount after this event.
				core.stageMmVersion =
					message.detail && typeof message.detail.mmVersion === "string"
						? message.detail.mmVersion
						: undefined;
				core.hideBackdrop();
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
				applyObservationGaps(
					message.detail && message.detail.observationGaps
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
			case "observation-gaps-updated":
				applyObservationGaps(message.detail);
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
		core.bootComplete = false;

		if (frame && globalScope.io) {
			const rootSocket = globalScope.io({
				path: "/socket.io",
				transports: ["websocket"],
				pingInterval: 120000,
				pingTimeout: 120000
			});

			core.rootSocket = rootSocket;

			// Server-side stage traffic log. Zod validates the entry on the server
			// before emitting; the runtime scripts are not bundled, so only the
			// shape needed for rendering is checked here.
			rootSocket.on("harness:websocket-log", (entry) => {
				if (
					!entry ||
					(entry.direction !== "sent" &&
						entry.direction !== "received") ||
					typeof entry.notification !== "string" ||
					typeof entry.at !== "number"
				) {
					return;
				}
				applyMirroredUpdate(
					"websocketLog",
					"maxWebsocketLogEntries",
					core.publishWebsocketLog,
					{
						entry: {
							timestamp: new Date(entry.at).toISOString(),
							direction: entry.direction,
							notification: entry.notification,
							payload: core.serializeLogValue(entry.payload)
						}
					}
				);
			});

			// The core page has no listener for helper logs, so the shell records
			// them itself; the stage facade reads them back from this copy (see
			// `mirroredShellLog`).
			rootSocket.on("harness:helper-log", (entry) => {
				if (!entry || typeof entry !== "object") {
					return;
				}
				applyMirroredUpdate(
					"helperLog",
					"maxHelperLogEntries",
					core.publishHelperLog,
					{ entry }
				);
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

				core.showBackdrop("Loading\u2026");
				// The core's own root-socket RELOAD already reloads the stage,
				// as on a mirror. Navigating the frame too
				// would boot it twice (server/stage/stage-socket.ts
				// `emitStageHarnessReload`).
				// If no document loads in time, the RELOAD reached no listener of
				// this stage (another tab's core took it, or the socket belonged
				// to a document that was already unloading): reload the frame so
				// the stage never stays stuck behind the backdrop.
				if (payload && payload.reloadedBy === "core") {
					globalScope.clearTimeout(coreReloadFallbackTimer);
					coreReloadFallbackTimer = globalScope.setTimeout(() => {
						coreReloadFallbackTimer = null;
						core.reloadStage(
							typeof payload.version === "string"
								? payload.version
								: undefined
						);
					}, core.coreReloadFallbackMs);
					return;
				}
				core.reloadStage(
					payload && typeof payload.version === "string"
						? payload.version
						: undefined
				);
			});

			rootSocket.on("harness:quality-result", (result) => {
				globalScope.dispatchEvent(
					new CustomEvent("module-sandbox:quality-result", {
						detail: result
					})
				);
			});

			rootSocket.on("mm:version-changed", (payload) => {
				globalScope.dispatchEvent(
					new CustomEvent("module-sandbox:mm-version-changed", {
						detail: payload
					})
				);
			});
		}

		if (frame) {
			frame.addEventListener("load", () => {
				// The stage reloaded, whoever drove it: no fallback needed.
				globalScope.clearTimeout(coreReloadFallbackTimer);
				coreReloadFallbackTimer = null;
				core.stageReady = false;
				core.bootComplete = false;
				// The reloaded stage reports its own version again; until it
				// does, the badge must not keep the previous document's.
				core.stageMmVersion = undefined;
				globalScope.dispatchEvent(
					new CustomEvent("module-sandbox:stage-reloaded")
				);
				globalScope.setTimeout(() => {
					core.requestStageSnapshot();
				}, 0);
			});
			// The stage document can finish loading before this listener
			// exists: the shell's deferred scripts delay DOMContentLoaded, and
			// the small core page loads first. Its `load` event is then gone,
			// so ask for the snapshot now. Without this, only the core's
			// DOM_OBJECTS_CREATED clears the backdrop, and a module whose
			// getDom fails never sends it. Same task as the listener above, so
			// no load can fall between the two.
			if (isStageDocumentLoaded(frame)) {
				globalScope.setTimeout(() => {
					core.requestStageSnapshot();
				}, 0);
			}
		}

		core.initializeDebugPanel();
		if (typeof core.initializeQualityPanel === "function") {
			core.initializeQualityPanel();
		}

		const restartBtn = document.getElementById("harness-restart-btn");
		if (restartBtn instanceof HTMLButtonElement) {
			const restartLabel = restartBtn.querySelector(
				".harness-restart-label"
			);
			const restartIcon = restartBtn.querySelector(
				".harness-restart-icon"
			);
			const originalLabel = restartLabel
				? restartLabel.textContent
				: "Restart";

			restartBtn.addEventListener("click", () => {
				if (restartBtn.disabled) {
					return;
				}
				restartBtn.disabled = true;
				if (restartIcon) {
					restartIcon.classList.add("fa-spin");
				}
				if (restartLabel) {
					restartLabel.textContent = "Restarting…";
				}
				core.showBackdrop("Restarting sandbox\u2026");
				fetch("/__harness/restart", { method: "POST" })
					.catch(() => {})
					.finally(() => {
						restartBtn.disabled = false;
						if (restartIcon) {
							restartIcon.classList.remove("fa-spin");
						}
						if (restartLabel) {
							restartLabel.textContent = originalLabel;
						}
					});
			});
		}

		(function initThemePicker() {
			const LS_KEY = "harness-theme";
			const THEMES = [
				"carbon-slate",
				"obsidian-amber",
				"violet-circuit",
				"phosphor-green"
			];

			const saved = globalScope.localStorage.getItem(LS_KEY);
			if (saved && THEMES.includes(saved)) {
				document.documentElement.dataset.theme = saved;
			}

			const picker = document.getElementById("harness-theme-picker");
			const btn = document.getElementById("harness-theme-btn");
			if (!picker || !btn) {
				return;
			}

			const items = picker.querySelectorAll("[data-theme-value]");

			function syncActive() {
				const current =
					document.documentElement.dataset.theme || THEMES[0];
				items.forEach((item) => {
					if (item instanceof HTMLElement) {
						item.setAttribute(
							"aria-selected",
							item.dataset.themeValue === current
								? "true"
								: "false"
						);
					}
				});
			}

			function closeMenu() {
				picker.dataset.open = "false";
				btn.setAttribute("aria-expanded", "false");
			}

			btn.addEventListener("click", (e) => {
				e.stopPropagation();
				const isOpen = picker.dataset.open === "true";
				picker.dataset.open = isOpen ? "false" : "true";
				btn.setAttribute("aria-expanded", String(!isOpen));
				if (!isOpen) {
					syncActive();
				}
			});

			items.forEach((item) => {
				item.addEventListener("click", () => {
					if (!(item instanceof HTMLElement)) {
						return;
					}
					const value = item.dataset.themeValue;
					if (value) {
						document.documentElement.dataset.theme = value;
						globalScope.localStorage.setItem(LS_KEY, value);
					}
					closeMenu();
					syncActive();
				});
			});

			globalScope.addEventListener("click", closeMenu);

			syncActive();
		})();
	});
})(window);
