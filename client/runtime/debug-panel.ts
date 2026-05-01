/**
 * Sidebar debug tools for the sandbox runtime.
 *
 * The first feature shipped here is a notification console that can emit
 * frontend MagicMirror-style notifications and inspect the resulting traffic.
 */
(function initModuleSandboxDebugPanel(globalScope) {
	const core = globalScope.__MICROCORE__ as SandboxCore;
	const harness = core.harness as Record<string, any>;

	/**
	 * Wire the sidebar notification debug controls.
	 *
	 * @returns {void}
	 */
	core.initializeDebugPanel = function initializeDebugPanel() {
		/**
		 * Gets by id.
		 */
		const getById = <T extends HTMLElement>(id: string): T | null =>
			document.getElementById(id) as T | null;
		const sidebarEl = getById<HTMLElement>("harness-sidebar");
		const bodyEl = getById<HTMLElement>("harness-body");
		const sidebarTitleEl = getById<HTMLElement>("sidebar-title");
		const sidebarCopyEl = getById<HTMLElement>("sidebar-copy");
		const sidebarCloseButton = getById<HTMLButtonElement>("sidebar-close");
		const menuButtons = Array.from(
			document.querySelectorAll<HTMLElement>(
				".harness-menu-link[data-domain]"
			)
		);
		const domainPanels = Array.from(
			document.querySelectorAll<HTMLElement>(
				".sandbox-domain[data-domain]"
			)
		);
		const tabButtons = Array.from(
			document.querySelectorAll<HTMLElement>(
				".sandbox-tab[data-domain][data-tab]"
			)
		);
		const tabPanels = Array.from(
			document.querySelectorAll<HTMLElement>(
				".sandbox-tabpanel[data-domain][data-tab-panel]"
			)
		);
		const nameInput = getById<HTMLInputElement>("notification-name");
		const payloadEditor = getById<EditorHostElement>(
			"notification-payload-editor"
		);
		const payloadValidityEl = getById<HTMLElement>(
			"notification-payload-validity"
		);
		const payloadCopyEl = getById<HTMLElement>("notification-payload-copy");
		const moduleConfigEditor = getById<EditorHostElement>(
			"module-config-editor"
		);
		const configLanguageSelect =
			getById<HTMLSelectElement>("config-language");
		const configPositionSelect =
			getById<HTMLSelectElement>("config-position");
		const configHeaderInput = getById<HTMLInputElement>("config-header");
		const configHeaderEnabledToggle = getById<HTMLInputElement>(
			"config-header-enabled"
		);
		const configClassesInput = getById<HTMLInputElement>("config-classes");
		const configAnimateInSelect =
			getById<HTMLSelectElement>("config-animate-in");
		const configAnimateOutSelect =
			getById<HTMLSelectElement>("config-animate-out");
		const configHiddenOnStartupToggle = getById<HTMLInputElement>(
			"config-hidden-on-startup"
		);
		const configDisabledToggle =
			getById<HTMLInputElement>("config-disabled");
		const moduleConfigValidityEl = getById<HTMLElement>(
			"module-config-validity"
		);
		const moduleConfigCopyEl = getById<HTMLElement>("module-config-copy");
		const moduleConfigRefreshStylesButton = getById<HTMLButtonElement>(
			"module-config-refresh-styles"
		);
		const moduleConfigDirtyStateEl = getById<HTMLElement>(
			"module-config-dirty-state"
		);
		const moduleConfigResetButton = getById<HTMLButtonElement>(
			"module-config-reset"
		);
		const moduleConfigFormatButton = getById<HTMLButtonElement>(
			"module-config-format"
		);
		const moduleConfigSaveButton =
			getById<HTMLButtonElement>("module-config-save");
		const moduleConfigStatusEl = getById<HTMLElement>(
			"module-config-status"
		);
		const sendButton = getById<HTMLButtonElement>("notification-send");
		const clearButton = getById<HTMLButtonElement>("notification-clear");
		const websocketClearButton =
			getById<HTMLButtonElement>("websocket-clear");
		const consoleClearButton = getById<HTMLButtonElement>("console-clear");
		const helperClearButton = getById<HTMLButtonElement>("helper-clear");
		const statusEl = getById<HTMLElement>("notification-status");
		const lifecycleVisibilityStatusEl = getById<HTMLElement>(
			"lifecycle-visibility-status"
		);
		const lifecycleVisibilityActionButton = getById<HTMLButtonElement>(
			"lifecycle-visibility-action"
		);
		const lifecycleActivityStatusEl = getById<HTMLElement>(
			"lifecycle-activity-status"
		);
		const lifecycleActivityActionButton = getById<HTMLButtonElement>(
			"lifecycle-activity-action"
		);
		const lifecycleStartedStateEl =
			getById<HTMLElement>("lifecycle-started");
		const lifecycleDomReadyStateEl = getById<HTMLElement>(
			"lifecycle-dom-ready"
		);
		const consoleLogEl = getById<HTMLElement>("console-log");
		const helperLogEl = getById<HTMLElement>("helper-log");
		const websocketLogEl = getById<HTMLElement>("websocket-log");

		if (
			!nameInput ||
			!payloadEditor ||
			!sendButton ||
			!clearButton ||
			!statusEl
		) {
			return;
		}

		const { setActiveDomain, setActiveTab } =
			core.createDebugSidebarController({
				bodyEl,
				sidebarEl,
				sidebarTitleEl,
				sidebarCopyEl,
				menuButtons,
				domainPanels,
				tabButtons,
				tabPanels
			});

		/**
		 * Update the global notification banner shown in the shell toolbar area.
		 *
		 * @param {string} message
		 * @param {boolean} [isError=false]
		 * @returns {void}
		 */
		/**
		 * Sets status.
		 */
		const setStatus = (message, isError = false) => {
			statusEl.textContent = message;
			statusEl.dataset.state = isError ? "error" : "ok";
		};

		/**
		 * Update the config-domain status banner near the module editor actions.
		 *
		 * @param {string} message
		 * @param {boolean} [isError=false]
		 * @returns {void}
		 */
		/**
		 * Sets module config status.
		 */
		const setModuleConfigStatus = (message, isError = false) => {
			if (!moduleConfigStatusEl) {
				return;
			}

			moduleConfigStatusEl.textContent = message;
			moduleConfigStatusEl.dataset.state = isError ? "error" : "ok";
		};

		/**
		 * Sync JSON payload validation UI for the notification emit form.
		 *
		 * @returns {void}
		 */
		/**
		 * Synchronizes payload editor state.
		 */
		const syncPayloadEditorState = () => {
			if (
				!payloadEditor ||
				!payloadValidityEl ||
				!payloadCopyEl ||
				!sendButton
			) {
				return;
			}

			const rawValue = String(payloadEditor.raw_string || "");
			const trimmedValue = rawValue.trim();
			const isEmpty = !trimmedValue;
			const isValid = isEmpty || payloadEditor.is_valid();
			const errorMessage =
				payloadEditor.validation_error || "Invalid JSON payload.";

			payloadValidityEl.textContent = isEmpty
				? "Null"
				: isValid
					? "Valid"
					: "Invalid";
			payloadValidityEl.dataset.state = isValid ? "on" : "off";
			payloadCopyEl.textContent = isEmpty
				? "Empty payload will emit null."
				: isValid
					? "Payload JSON ready to emit."
					: errorMessage;
			sendButton.disabled = !isValid;
		};

		/**
		 * Sync editor validity controls for the mounted module config editor.
		 *
		 * @returns {void}
		 */
		/**
		 * Synchronizes module config editor state.
		 */
		const syncModuleConfigEditorState = () => {
			if (
				!moduleConfigEditor ||
				!moduleConfigValidityEl ||
				!moduleConfigCopyEl ||
				!moduleConfigSaveButton
			) {
				return;
			}

			const rawValue = String(moduleConfigEditor.raw_string || "");
			const trimmedValue = rawValue.trim();
			const isValid = moduleConfigEditor.is_valid();
			const message = !trimmedValue
				? "Config valid. Saving will write an empty config."
				: isValid
					? "Config valid."
					: moduleConfigEditor.validation_error || "Config invalid.";

			moduleConfigValidityEl.textContent = isValid ? "Valid" : "Invalid";
			moduleConfigValidityEl.dataset.state = isValid ? "on" : "off";
			moduleConfigCopyEl.textContent = message;
			moduleConfigSaveButton.disabled = !isValid;
			if (moduleConfigFormatButton) {
				moduleConfigFormatButton.disabled = !isValid;
			}
			syncModuleConfigDraftState();
		};

		/**
		 * Build the general-option draft that wraps the mounted module config object.
		 *
		 * @returns {object}
		 */
		/**
		 * Gets module config draft envelope.
		 */
		const getModuleConfigDraftEnvelope = () => ({
			position: configPositionSelect
				? String(configPositionSelect.value || "").trim() ||
					"middle_center"
				: "middle_center",
			header:
				configHeaderEnabledToggle && !configHeaderEnabledToggle.checked
					? false
					: configHeaderInput
						? String(configHeaderInput.value)
						: "",
			classes: configClassesInput
				? String(configClassesInput.value || "")
				: "",
			animateIn: configAnimateInSelect
				? String(configAnimateInSelect.value || "").trim()
				: "",
			animateOut: configAnimateOutSelect
				? String(configAnimateOutSelect.value || "").trim()
				: "",
			hiddenOnStartup: Boolean(
				configHiddenOnStartupToggle &&
				configHiddenOnStartupToggle.checked
			),
			disabled: Boolean(
				configDisabledToggle && configDisabledToggle.checked
			)
		});

		/**
		 * Serialize the persisted general-option values for draft comparisons.
		 *
		 * @returns {string}
		 */
		/**
		 * Gets saved module config envelope signature.
		 */
		const getSavedModuleConfigEnvelopeSignature = () => {
			const currentConfig: Record<string, any> =
				harness.moduleConfig && typeof harness.moduleConfig === "object"
					? harness.moduleConfig
					: {};

			return JSON.stringify({
				position: currentConfig.position || "middle_center",
				header:
					currentConfig.header === false
						? false
						: typeof currentConfig.header === "string"
							? currentConfig.header
							: "",
				classes: currentConfig.classes || "",
				animateIn: currentConfig.animateIn || "",
				animateOut: currentConfig.animateOut || "",
				hiddenOnStartup: Boolean(currentConfig.hiddenOnStartup),
				disabled: Boolean(currentConfig.disabled)
			});
		};

		let lastSavedModuleConfigEnvelopeSignature =
			getSavedModuleConfigEnvelopeSignature();
		let lastSavedModuleConfigEditorValue = moduleConfigEditor
			? String(moduleConfigEditor.raw_string || "")
			: "";
		let lastSavedLanguage = configLanguageSelect
			? String(configLanguageSelect.value || "")
					.trim()
					.toLowerCase() || "en"
			: String(harness.language || "en");

		/**
		 * Refresh the visible draft status and reset availability for config edits.
		 *
		 * @returns {void}
		 */
		/**
		 * Synchronizes module config draft state.
		 */
		const syncModuleConfigDraftState = () => {
			if (!moduleConfigDirtyStateEl && !moduleConfigResetButton) {
				return;
			}

			const currentLanguage = configLanguageSelect
				? String(configLanguageSelect.value || "")
						.trim()
						.toLowerCase() || "en"
				: String(harness.language || "en");
			const currentEnvelopeSignature = JSON.stringify(
				getModuleConfigDraftEnvelope()
			);
			const currentEditorValue = moduleConfigEditor
				? String(moduleConfigEditor.raw_string || "")
				: "";
			const isDirty =
				currentLanguage !== lastSavedLanguage ||
				currentEnvelopeSignature !==
					lastSavedModuleConfigEnvelopeSignature ||
				currentEditorValue !== lastSavedModuleConfigEditorValue;

			if (moduleConfigDirtyStateEl) {
				moduleConfigDirtyStateEl.textContent = isDirty
					? "Edited locally"
					: "Saved";
				moduleConfigDirtyStateEl.dataset.state = isDirty ? "off" : "on";
			}
			if (moduleConfigResetButton) {
				moduleConfigResetButton.disabled = !isDirty;
			}
		};

		/**
		 * Mark the current form/editor state as the persisted sandbox baseline.
		 *
		 * @returns {void}
		 */
		/**
		 * Internal helper for capture saved module config draft state.
		 */
		const captureSavedModuleConfigDraftState = () => {
			lastSavedModuleConfigEnvelopeSignature =
				getSavedModuleConfigEnvelopeSignature();
			lastSavedModuleConfigEditorValue = moduleConfigEditor
				? String(moduleConfigEditor.raw_string || "")
				: "";
			lastSavedLanguage = configLanguageSelect
				? String(configLanguageSelect.value || "")
						.trim()
						.toLowerCase() || "en"
				: String(harness.language || "en");
			syncModuleConfigDraftState();
		};

		/**
		 * Mirror the simple option controls into the generated config envelope.
		 *
		 * @returns {void}
		 */
		/**
		 * Synchronizes module config editor envelope.
		 */
		const syncModuleConfigEditorEnvelope = () => {
			if (!moduleConfigEditor) {
				return;
			}
			const headerValue =
				configHeaderEnabledToggle && !configHeaderEnabledToggle.checked
					? false
					: configHeaderInput
						? String(configHeaderInput.value)
						: "";

			moduleConfigEditor.setAttribute(
				"language",
				configLanguageSelect
					? String(configLanguageSelect.value || "")
							.trim()
							.toLowerCase() || "en"
					: String(harness.language || "en")
			);
			moduleConfigEditor.setAttribute(
				"position",
				configPositionSelect
					? String(configPositionSelect.value || "").trim() ||
							"middle_center"
					: "middle_center"
			);
			moduleConfigEditor.setAttribute(
				"header",
				headerValue === false ? "false" : headerValue
			);
			moduleConfigEditor.setAttribute(
				"classes",
				configClassesInput ? String(configClassesInput.value || "") : ""
			);
			moduleConfigEditor.setAttribute(
				"animate-in",
				configAnimateInSelect
					? String(configAnimateInSelect.value || "").trim()
					: ""
			);
			moduleConfigEditor.setAttribute(
				"animate-out",
				configAnimateOutSelect
					? String(configAnimateOutSelect.value || "").trim()
					: ""
			);
			moduleConfigEditor.setAttribute(
				"hidden-on-startup",
				String(
					Boolean(
						configHiddenOnStartupToggle &&
						configHiddenOnStartupToggle.checked
					)
				)
			);
			moduleConfigEditor.setAttribute(
				"disabled",
				String(
					Boolean(
						configDisabledToggle && configDisabledToggle.checked
					)
				)
			);
		};

		/**
		 * Refresh lifecycle status labels and action buttons from current state.
		 *
		 * @param {object} state
		 * @returns {void}
		 */
		/**
		 * Sets lifecycle status.
		 */
		const setLifecycleStatus = (state) => {
			if (
				!lifecycleVisibilityStatusEl ||
				!lifecycleActivityStatusEl ||
				!lifecycleStartedStateEl ||
				!lifecycleDomReadyStateEl
			) {
				return;
			}

			const current = state || core.lifecycleState || {};
			const isDisabled = Boolean(current.disabled);
			const isHidden = Boolean(current.hidden);
			const isSuspended = Boolean(current.suspended);
			const isStarted = Boolean(current.started);
			const isDomReady = Boolean(current.domCreated);

			lifecycleVisibilityStatusEl.textContent = isDisabled
				? "Disabled in saved config"
				: isHidden
					? "Hidden from the stage"
					: "Visible in the stage";
			lifecycleActivityStatusEl.textContent = isDisabled
				? "Startup skipped"
				: isSuspended
					? "Suspended and idle"
					: "Running and responsive";
			lifecycleStartedStateEl.textContent = isStarted ? "Yes" : "No";
			lifecycleStartedStateEl.dataset.state = isStarted ? "on" : "off";
			lifecycleDomReadyStateEl.textContent = isDomReady ? "Yes" : "No";
			lifecycleDomReadyStateEl.dataset.state = isDomReady ? "on" : "off";

			if (lifecycleVisibilityActionButton) {
				lifecycleVisibilityActionButton.textContent = isHidden
					? "Show"
					: "Hide";
				lifecycleVisibilityActionButton.disabled = isDisabled;
			}
			if (lifecycleActivityActionButton) {
				lifecycleActivityActionButton.textContent = isSuspended
					? "Resume"
					: "Suspend";
				lifecycleActivityActionButton.disabled = isDisabled;
			}
		};

		/**
		 * Load the persisted module option values into the general config form.
		 *
		 * @returns {void}
		 */
		/**
		 * Synchronizes module option controls.
		 */
		const syncModuleOptionControls = () => {
			const currentConfig: Record<string, any> =
				harness.moduleConfig && typeof harness.moduleConfig === "object"
					? harness.moduleConfig
					: {};
			if (configPositionSelect) {
				configPositionSelect.value =
					currentConfig.position || "middle_center";
			}
			if (configHeaderInput) {
				configHeaderInput.value =
					typeof currentConfig.header === "string"
						? currentConfig.header
						: "";
			}
			if (configHeaderEnabledToggle) {
				configHeaderEnabledToggle.checked =
					currentConfig.header !== false;
			}
			if (configHeaderInput) {
				configHeaderInput.disabled = currentConfig.header === false;
			}
			if (configClassesInput) {
				configClassesInput.value = currentConfig.classes || "";
			}
			if (configAnimateInSelect) {
				configAnimateInSelect.value = currentConfig.animateIn || "";
			}
			if (configAnimateOutSelect) {
				configAnimateOutSelect.value = currentConfig.animateOut || "";
			}
			if (configHiddenOnStartupToggle) {
				configHiddenOnStartupToggle.checked = Boolean(
					currentConfig.hiddenOnStartup
				);
			}
			if (configDisabledToggle) {
				configDisabledToggle.checked = Boolean(currentConfig.disabled);
			}
			syncModuleConfigEditorEnvelope();
			syncModuleConfigDraftState();
		};
		let waitingForViewportReload = false;
		let waitingForStyleRefresh = false;
		const refreshStylesButtonHTML =
			'<i class="fa-solid fa-rotate-right" aria-hidden="true"></i> Refresh styles';
		const saveButtonHTML =
			'<i class="fa-solid fa-rotate-right" aria-hidden="true"></i> Save and reload';

		/**
		 * Ask the iframe runtime to reload mounted module styles without full boot.
		 *
		 * @returns {void}
		 */
		/**
		 * Internal helper for refresh module styles.
		 */
		const refreshModuleStyles = () => {
			if (!moduleConfigRefreshStylesButton) {
				return;
			}
			if (!core.stageReady) {
				setModuleConfigStatus(
					"Viewport runtime is not ready yet.",
					true
				);
				return;
			}
			if (!core.refreshStageStyles()) {
				setModuleConfigStatus(
					"Viewport runtime is not ready yet.",
					true
				);
				return;
			}

			waitingForStyleRefresh = true;
			moduleConfigRefreshStylesButton.disabled = true;
			moduleConfigRefreshStylesButton.innerHTML =
				'<i class="fa-solid fa-rotate-right fa-spin" aria-hidden="true"></i> Refreshing\u2026';
			setModuleConfigStatus("Refreshing mounted module stylesheets...");
		};

		/**
		 * Persist the edited module config and trigger the expected viewport reload.
		 *
		 * @returns {Promise<void>}
		 */
		/**
		 * Saves module config.
		 */
		const saveModuleConfig = async () => {
			if (!moduleConfigEditor || !moduleConfigSaveButton) {
				return;
			}
			if (!moduleConfigEditor.is_valid()) {
				setModuleConfigStatus("Config JavaScript is invalid.", true);
				return;
			}

			let parsedConfig;
			try {
				parsedConfig = moduleConfigEditor.json_value;
			} catch (error) {
				setModuleConfigStatus(
					error && error.message
						? error.message
						: "Config could not be converted to JSON.",
					true
				);
				return;
			}

			if (
				!parsedConfig ||
				typeof parsedConfig !== "object" ||
				Array.isArray(parsedConfig)
			) {
				setModuleConfigStatus("Config must be a JSON object.", true);
				return;
			}

			const selectedLanguage = configLanguageSelect
				? String(configLanguageSelect.value || "")
						.trim()
						.toLowerCase()
				: String(harness.language || "");
			if (!selectedLanguage) {
				setModuleConfigStatus("Runtime language is required.", true);
				return;
			}
			moduleConfigSaveButton.disabled = true;
			moduleConfigSaveButton.innerHTML =
				'<i class="fa-solid fa-rotate-right fa-spin" aria-hidden="true"></i> Saving\u2026';
			core.showBackdrop("Saving and reloading\u2026");
			setModuleConfigStatus("Saving sandbox config to disk...");

			try {
				moduleConfigEditor.json_value = parsedConfig;
				const nextModuleConfig = Object.assign(
					{},
					harness.moduleConfig &&
						typeof harness.moduleConfig === "object"
						? harness.moduleConfig
						: {},
					{
						position: configPositionSelect
							? String(configPositionSelect.value || "").trim()
							: "middle_center",
						header:
							configHeaderEnabledToggle &&
							!configHeaderEnabledToggle.checked
								? false
								: configHeaderInput
									? String(configHeaderInput.value)
									: "",
						classes: configClassesInput
							? String(configClassesInput.value || "")
							: "",
						animateIn: configAnimateInSelect
							? String(configAnimateInSelect.value || "").trim()
							: "",
						animateOut: configAnimateOutSelect
							? String(configAnimateOutSelect.value || "").trim()
							: "",
						hiddenOnStartup: Boolean(
							configHiddenOnStartupToggle &&
							configHiddenOnStartupToggle.checked
						),
						disabled: Boolean(
							configDisabledToggle && configDisabledToggle.checked
						),
						config: parsedConfig
					}
				);
				const response = await fetch("/__harness/config/save", {
					method: "POST",
					headers: {
						"Content-Type": "application/json"
					},
					body: JSON.stringify({
						moduleConfig: nextModuleConfig,
						runtimeConfig: {
							language: selectedLanguage
						}
					})
				});
				const result = await response.json();

				if (!response.ok) {
					throw new Error(
						result && result.error
							? result.error
							: "Failed to save sandbox config."
					);
				}

				harness.moduleConfig = result.moduleConfig || nextModuleConfig;
				harness.language =
					result &&
					result.harnessConfig &&
					typeof result.harnessConfig.language === "string"
						? result.harnessConfig.language
						: selectedLanguage;
				harness.locale =
					result &&
					result.harnessConfig &&
					typeof result.harnessConfig.locale === "string"
						? result.harnessConfig.locale
						: harness.language;
				syncModuleOptionControls();
				if (configLanguageSelect) {
					configLanguageSelect.value = String(
						harness.language || "en"
					);
				}
				syncModuleConfigEditorEnvelope();
				captureSavedModuleConfigDraftState();
				waitingForViewportReload = true;
				setModuleConfigStatus(
					result.reloadMode === "watch"
						? "Sandbox config saved. Waiting for viewport reload..."
						: "Sandbox config saved. Reloading viewport..."
				);
			} catch (error) {
				setModuleConfigStatus(
					error && error.message
						? error.message
						: "Failed to save sandbox config.",
					true
				);
				moduleConfigSaveButton.disabled = false;
				moduleConfigSaveButton.innerHTML = saveButtonHTML;
				syncModuleConfigEditorState();
				return;
			}

			moduleConfigSaveButton.innerHTML = saveButtonHTML;
		};

		/**
		 * Restore the current draft to the persisted sandbox config state.
		 *
		 * @returns {void}
		 */
		/**
		 * Resets module config draft.
		 */
		const resetModuleConfigDraft = () => {
			if (configLanguageSelect) {
				configLanguageSelect.value = String(harness.language || "en");
			}
			syncModuleOptionControls();
			if (moduleConfigEditor) {
				moduleConfigEditor.json_value =
					harness.moduleConfig &&
					typeof harness.moduleConfig === "object" &&
					harness.moduleConfig.config &&
					typeof harness.moduleConfig.config === "object" &&
					!Array.isArray(harness.moduleConfig.config)
						? harness.moduleConfig.config
						: {};
			}
			syncModuleConfigEditorEnvelope();
			syncModuleConfigEditorState();
			captureSavedModuleConfigDraftState();
			setModuleConfigStatus(
				"Reverted local edits to the saved sandbox config."
			);
		};

		/**
		 * Rewrite the current config body using the editor's normalized formatter.
		 *
		 * @returns {void}
		 */
		/**
		 * Formats module config draft.
		 */
		const formatModuleConfigDraft = () => {
			if (!moduleConfigEditor) {
				return;
			}
			if (!moduleConfigEditor.is_valid()) {
				setModuleConfigStatus("Config JavaScript is invalid.", true);
				return;
			}

			const normalizedConfig = moduleConfigEditor.json_value;
			moduleConfigEditor.json_value = normalizedConfig;
			syncModuleConfigEditorState();
			setModuleConfigStatus(
				"Reformatted the mounted module config draft."
			);
		};

		sendButton.addEventListener("click", () => {
			const notification = String(nameInput.value || "").trim();
			if (!notification) {
				setStatus("Notification name is required.", true);
				return;
			}

			try {
				const payload = core.parseDebugPanelPayload(
					payloadEditor.raw_string
				);
				if (payload !== null) {
					payloadEditor.json_value = payload;
					syncPayloadEditorState();
				}
				if (!core.emitStageNotification(notification, payload)) {
					setStatus("Viewport runtime is not ready yet.", true);
					return;
				}
				setStatus("Notification emitted to the viewport runtime.");
			} catch (error) {
				setStatus(`Invalid JSON payload: ${error.message}`, true);
			}
		});

		clearButton.addEventListener("click", () => {
			core.clearNotificationLog();
			setStatus("Notification log cleared.");
		});

		if (moduleConfigEditor) {
			moduleConfigEditor.json_value =
				harness.moduleConfig &&
				harness.moduleConfig.config &&
				typeof harness.moduleConfig.config === "object"
					? harness.moduleConfig.config
					: {};
			moduleConfigEditor.setAttribute(
				"language",
				String(harness.language || "en")
			);
			moduleConfigEditor.addEventListener("input", () => {
				syncModuleConfigEditorState();
			});
			moduleConfigEditor.addEventListener("json-editor:state", () => {
				syncModuleConfigEditorState();
			});
			syncModuleConfigEditorEnvelope();
		}
		syncModuleOptionControls();
		captureSavedModuleConfigDraftState();

		if (configLanguageSelect && moduleConfigEditor) {
			configLanguageSelect.addEventListener("change", () => {
				const nextLanguage = String(configLanguageSelect.value || "")
					.trim()
					.toLowerCase();
				moduleConfigEditor.setAttribute(
					"language",
					nextLanguage || "en"
				);
				syncModuleConfigEditorEnvelope();
				syncModuleConfigDraftState();
				if (
					!moduleConfigSaveButton ||
					moduleConfigSaveButton.disabled
				) {
					return;
				}

				void saveModuleConfig();
			});
		}
		[
			configPositionSelect,
			configAnimateInSelect,
			configAnimateOutSelect
		].forEach((control) => {
			if (!control) {
				return;
			}
			control.addEventListener("change", () => {
				syncModuleConfigEditorEnvelope();
				syncModuleConfigDraftState();
			});
		});
		[configHeaderInput, configClassesInput].forEach((control) => {
			if (!control) {
				return;
			}
			control.addEventListener("input", () => {
				syncModuleConfigEditorEnvelope();
				syncModuleConfigDraftState();
			});
		});
		if (configHeaderEnabledToggle) {
			configHeaderEnabledToggle.addEventListener("change", () => {
				if (configHeaderInput) {
					configHeaderInput.disabled =
						!configHeaderEnabledToggle.checked;
				}
				syncModuleConfigEditorEnvelope();
				syncModuleConfigDraftState();
			});
		}
		[configHiddenOnStartupToggle, configDisabledToggle].forEach(
			(control) => {
				if (!control) {
					return;
				}
				control.addEventListener("change", () => {
					syncModuleConfigEditorEnvelope();
					syncModuleConfigDraftState();
				});
			}
		);

		if (moduleConfigSaveButton && moduleConfigEditor) {
			moduleConfigSaveButton.addEventListener("click", () => {
				void saveModuleConfig();
			});
		}
		if (moduleConfigResetButton) {
			moduleConfigResetButton.addEventListener("click", () => {
				resetModuleConfigDraft();
			});
		}
		if (moduleConfigFormatButton) {
			moduleConfigFormatButton.addEventListener("click", () => {
				formatModuleConfigDraft();
			});
		}
		if (moduleConfigRefreshStylesButton) {
			moduleConfigRefreshStylesButton.addEventListener("click", () => {
				refreshModuleStyles();
			});
		}

		if (websocketClearButton) {
			websocketClearButton.addEventListener("click", () => {
				core.clearWebsocketLog();
				setStatus("Websocket log cleared.");
			});
		}
		if (consoleClearButton) {
			consoleClearButton.addEventListener("click", () => {
				core.clearConsoleLog();
				setStatus("Console log cleared.");
			});
		}
		if (helperClearButton) {
			helperClearButton.addEventListener("click", () => {
				core.clearHelperLog();
				setStatus("Helper log cleared.");
			});
		}

		payloadEditor.addEventListener("input", () => {
			syncPayloadEditorState();
		});
		payloadEditor.addEventListener("json-editor:state", () => {
			syncPayloadEditorState();
		});

		menuButtons.forEach((button) => {
			button.addEventListener("click", (event) => {
				event.preventDefault();
				const nextDomain = button.dataset.domain || "";
				const currentlyActive = button.dataset.active === "true";
				setActiveDomain(currentlyActive ? "" : nextDomain);
			});
		});

		tabButtons.forEach((button) => {
			button.addEventListener("click", () => {
				setActiveTab(
					button.dataset.domain || "",
					button.dataset.tab || ""
				);
			});
		});

		if (sidebarCloseButton) {
			sidebarCloseButton.addEventListener("click", () => {
				setActiveDomain("");
			});
		}

		if (lifecycleVisibilityActionButton) {
			lifecycleVisibilityActionButton.addEventListener("click", () => {
				if (!core.stageReady) {
					setStatus("Viewport runtime is not ready yet.", true);
					return;
				}
				if (core.lifecycleState.hidden) {
					core.setStageVisibility(false);
					setStatus("Visibility applied: show().");
					return;
				}

				core.setStageVisibility(true);
				setStatus("Visibility applied: hide().");
			});
		}

		if (lifecycleActivityActionButton) {
			lifecycleActivityActionButton.addEventListener("click", () => {
				if (!core.stageReady) {
					setStatus("Viewport runtime is not ready yet.", true);
					return;
				}
				if (core.lifecycleState.suspended) {
					core.setStageActivity(false);
					setStatus("Activity applied: resume().");
					return;
				}

				core.setStageActivity(true);
				setStatus("Activity applied: suspend().");
			});
		}

		globalScope.addEventListener(
			"module-sandbox:notifications-updated",
			(event) => {
				core.renderNotificationLog((event as CustomEvent).detail);
			}
		);
		globalScope.addEventListener(
			"module-sandbox:websocket-log-updated",
			(event) => {
				core.renderWebsocketLog((event as CustomEvent).detail);
			}
		);
		globalScope.addEventListener(
			"module-sandbox:console-log-updated",
			(event) => {
				core.renderDebugLog(
					(event as CustomEvent).detail,
					"console-log",
					"No browser console logs yet."
				);
			}
		);
		globalScope.addEventListener(
			"module-sandbox:helper-log-updated",
			(event) => {
				core.renderDebugLog(
					(event as CustomEvent).detail,
					"helper-log",
					"No helper logs yet."
				);
			}
		);
		globalScope.addEventListener(
			"module-sandbox:lifecycle-updated",
			(event) => {
				const detail = (event as CustomEvent<{ state?: unknown }>)
					.detail;
				setLifecycleStatus(detail && detail.state);
			}
		);
		globalScope.addEventListener("module-sandbox:stage-ready", () => {
			core.stageReady = true;
			if (moduleConfigRefreshStylesButton && !waitingForStyleRefresh) {
				moduleConfigRefreshStylesButton.disabled = false;
				moduleConfigRefreshStylesButton.innerHTML = refreshStylesButtonHTML;
			}
			if (!waitingForViewportReload || !moduleConfigSaveButton) {
				return;
			}

			waitingForViewportReload = false;
			moduleConfigSaveButton.disabled = false;
			moduleConfigSaveButton.innerHTML = saveButtonHTML;
			syncModuleConfigEditorState();
			setModuleConfigStatus("Sandbox config saved. Viewport reloaded.");
		});
		globalScope.addEventListener("module-sandbox:styles-refreshed", () => {
			waitingForStyleRefresh = false;
			if (moduleConfigRefreshStylesButton) {
				moduleConfigRefreshStylesButton.disabled = false;
				moduleConfigRefreshStylesButton.innerHTML = refreshStylesButtonHTML;
			}
			setModuleConfigStatus("Mounted module styles refreshed.");
		});
		globalScope.addEventListener(
			"module-sandbox:styles-refresh-failed",
			(event) => {
				const detail = (event as CustomEvent<{ message?: string }>)
					.detail;
				waitingForStyleRefresh = false;
				if (moduleConfigRefreshStylesButton) {
					moduleConfigRefreshStylesButton.disabled = false;
					moduleConfigRefreshStylesButton.innerHTML = refreshStylesButtonHTML;
				}
				setModuleConfigStatus(
					detail &&
						typeof detail.message === "string" &&
						detail.message
						? detail.message
						: "Failed to refresh module styles.",
					true
				);
			}
		);

		core.renderNotificationLog(core.notificationLog);
		if (websocketLogEl) {
			core.renderWebsocketLog(core.websocketLog);
		}
		if (consoleLogEl) {
			core.renderDebugLog(
				core.consoleLog,
				"console-log",
				"No browser console logs yet."
			);
		}
		if (helperLogEl) {
			core.renderDebugLog(
				core.helperLog,
				"helper-log",
				"No helper logs yet."
			);
		}
		setLifecycleStatus(core.lifecycleState);
		syncPayloadEditorState();
		syncModuleConfigEditorState();
		if (moduleConfigRefreshStylesButton) {
			moduleConfigRefreshStylesButton.disabled = !core.stageReady;
		}
		setActiveDomain("runtime");
		setStatus("Notification engine ready.");
	};
})(window);
