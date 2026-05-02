/**
 * Frontend lifecycle engine for the sandbox runtime.
 *
 * The goal here is not full MagicMirror parity. It is to preserve the startup
 * order and lifecycle semantics this sandbox claims to support:
 * - start() before initial DOM creation
 * - ALL_MODULES_STARTED before DOM_OBJECTS_CREATED
 * - targeted MODULE_DOM_CREATED / MODULE_DOM_UPDATED
 * - show()/hide() wrapping resume()/suspend()
 */
(function initModuleSandboxLifecycle(globalScope) {
	const core = globalScope.__MICROCORE__;

	core.lifecycleState = {
		started: false,
		domCreated: false,
		disabled: false,
		hidden: false,
		suspended: false
	};

	/**
	 * Broadcast the current lifecycle state to the sidebar controls.
	 *
	 * @returns {void}
	 */
	core.publishLifecycleState = function publishLifecycleState() {
		globalScope.dispatchEvent(
			new CustomEvent("module-sandbox:lifecycle-updated", {
				detail: {
					state: Object.assign({}, core.lifecycleState)
				}
			})
		);
	};

	/**
	 * Patch the stored lifecycle state and notify listeners.
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
		core.publishLifecycleState();
	};

	/**
	 * Normalize animation speed parameters into a non-negative millisecond value.
	 *
	 * @param {*} speed
	 * @returns {number}
	 */
	core.normalizeLifecycleSpeed = function normalizeLifecycleSpeed(speed) {
		return Number.isFinite(speed) && speed > 0 ? speed : 0;
	};

	/**
	 * Normalize MagicMirror-style updateDom inputs.
	 *
	 * Supports `updateDom(1000)`, `updateDom({ speed: 1000 })`, and the core-like
	 * `updateDom({ options: { speed, animate } })` shape.
	 *
	 * @param {*} updateOptions
	 * @returns {{speed: number, animateIn: string, animateOut: string}}
	 */
	core.normalizeRenderOptions = function normalizeRenderOptions(
		updateOptions,
		module
	) {
		const defaultAnimateIn =
			module && module.data && typeof module.data.animateIn === "string"
				? module.data.animateIn
				: "";
		const defaultAnimateOut =
			module && module.data && typeof module.data.animateOut === "string"
				? module.data.animateOut
				: "";
		if (typeof updateOptions === "number") {
			return {
				speed: core.normalizeLifecycleSpeed(updateOptions),
				animateIn: defaultAnimateIn,
				animateOut: defaultAnimateOut
			};
		}

		const source =
			updateOptions && typeof updateOptions === "object"
				? updateOptions.options &&
					typeof updateOptions.options === "object"
					? Object.assign({}, updateOptions, updateOptions.options)
					: updateOptions
				: {};
		const animate =
			source.animate && typeof source.animate === "object"
				? source.animate
				: {};

		return {
			speed: core.normalizeLifecycleSpeed(source.speed),
			animateIn:
				typeof animate.in === "string" && animate.in.trim()
					? animate.in.trim()
					: defaultAnimateIn,
			animateOut:
				typeof animate.out === "string" && animate.out.trim()
					? animate.out.trim()
					: defaultAnimateOut
		};
	};

	/**
	 * Resolve the single mounted module shell element.
	 *
	 * @returns {HTMLElement|null}
	 */
	core.getModuleShell = function getModuleShell() {
		return document.querySelector('[data-module-shell="true"]');
	};

	/**
	 * Clears shell animation.
	 */
	core.clearShellAnimation = function clearShellAnimation(shell) {
		if (!shell) {
			return;
		}

		const activeAnimation = shell.dataset.activeAnimationClass || "";
		if (activeAnimation) {
			shell.classList.remove("animate__animated", activeAnimation);
			delete shell.dataset.activeAnimationClass;
		}
		shell.style.removeProperty("--animate-duration");
	};

	/**
	 * Internal helper for apply shell animation.
	 */
	core.applyShellAnimation = function applyShellAnimation(
		shell,
		animationName,
		duration
	) {
		if (
			!shell ||
			typeof animationName !== "string" ||
			!animationName.trim()
		) {
			core.clearShellAnimation(shell);
			return "";
		}

		const animationClass = `animate__${animationName.trim()}`;
		core.clearShellAnimation(shell);
		shell.style.setProperty(
			"--animate-duration",
			`${Math.max(core.normalizeLifecycleSpeed(duration), 1)}ms`
		);
		void shell.offsetHeight;
		shell.classList.add("animate__animated", animationClass);
		shell.dataset.activeAnimationClass = animationClass;
		return animationClass;
	};

	/**
	 * Emit one core-origin notification, optionally targeted to a single module.
	 *
	 * @param {string} notification
	 * @param {*} payload
	 * @param {object|null} target
	 * @returns {number}
	 */
	core.emitCoreNotification = function emitCoreNotification(
		notification,
		payload,
		target = null
	) {
		return core.emitNotification(notification, payload, null, {
			origin: "core",
			senderLabel: "MagicMirror",
			targetId: target && target.identifier ? target.identifier : null
		});
	};

	/**
	 * Apply one transient or stateful module visibility transition.
	 *
	 * @param {object} module
	 * @param {boolean} hidden
	 * @param {number} speed
	 * @param {Function} [callback]
	 * @param {{collapseOnHide?: boolean, updateLifecycle?: boolean}} [options]
	 * @returns {void}
	 */
	core.transitionModuleVisibility = function transitionModuleVisibility(
		module,
		hidden,
		speed,
		callback,
		options: {
			collapseOnHide?: boolean;
			updateLifecycle?: boolean;
			animateIn?: string;
			animateOut?: string;
		} = {}
	) {
		const shell = core.getModuleShell();
		const duration = core.normalizeLifecycleSpeed(speed);
		const collapseOnHide = options.collapseOnHide !== false;
		const updateLifecycle = options.updateLifecycle !== false;

		if (updateLifecycle) {
			module.hidden = hidden;
			core.setLifecycleState({ hidden });
		}

		if (!shell) {
			if (typeof callback === "function") {
				callback();
			}
			return;
		}

		globalScope.clearTimeout(module.showHideTimer);
		core.clearShellAnimation(shell);

		if (hidden) {
			shell.style.display = "block";
			shell.dataset.animateOut = options.animateOut || "";
			if (options.animateOut) {
				shell.style.transition = "";
				shell.classList.remove("module-shell-hidden");
				core.applyShellAnimation(shell, options.animateOut, duration);
			} else {
				shell.style.transition = `opacity ${duration / 1000}s`;
				shell.classList.add("module-shell-hidden");
			}

			module.showHideTimer = globalScope.setTimeout(() => {
				core.clearShellAnimation(shell);
				delete shell.dataset.animateOut;
				shell.classList.add("module-shell-hidden");
				if (collapseOnHide) {
					shell.style.display = "none";
					shell.classList.add("module-shell-collapsed");
				}
				if (typeof callback === "function") {
					callback();
				}
			}, duration);
			return;
		}

		shell.style.display = "block";
		shell.classList.remove("module-shell-collapsed");
		shell.dataset.animateIn = options.animateIn || "";
		if (options.animateIn) {
			shell.style.transition = "";
			shell.classList.remove("module-shell-hidden");
			core.applyShellAnimation(shell, options.animateIn, duration);
		} else {
			shell.style.transition = `opacity ${duration / 1000}s`;
			shell.classList.add("module-shell-hidden");

			// Force layout so the following opacity change animates predictably.
			void shell.offsetHeight;

			shell.classList.remove("module-shell-hidden");
		}

		module.showHideTimer = globalScope.setTimeout(() => {
			core.clearShellAnimation(shell);
			delete shell.dataset.animateIn;
			if (typeof callback === "function") {
				callback();
			}
		}, duration);
	};

	/**
	 * Commit one DOM update with a more core-like animate-out/replace/animate-in flow.
	 *
	 * @param {object} module
	 * @param {Function} applyContent
	 * @param {*} updateOptions
	 * @returns {Promise<void>}
	 */
	core.commitModuleRender = function commitModuleRender(
		module,
		applyContent,
		updateOptions
	) {
		const { speed, animateIn, animateOut } = core.normalizeRenderOptions(
			updateOptions,
			module
		);
		if (module.hidden || speed === 0) {
			applyContent();
			return Promise.resolve();
		}

		return new Promise<void>((resolve) => {
			core.transitionModuleVisibility(
				module,
				true,
				speed / 2,
				() => {
					applyContent();
					if (module.hidden) {
						resolve();
						return;
					}

					core.transitionModuleVisibility(
						module,
						false,
						speed / 2,
						() => {
							resolve();
						},
						{
							collapseOnHide: false,
							updateLifecycle: false,
							animateIn
						}
					);
				},
				{
					collapseOnHide: false,
					updateLifecycle: false,
					animateOut
				}
			);
		});
	};

	/**
	 * Hide the mounted module shell with the narrow semantics this sandbox claims
	 * to support.
	 *
	 * @param {object} module
	 * @param {number} speed
	 * @param {Function} [callback]
	 * @returns {void}
	 */
	core.hideModule = function hideModule(
		module,
		speed,
		callback,
		options: { animateOut?: string } = {}
	) {
		module.hidden = true;
		core.setLifecycleState({ hidden: true });
		core.transitionModuleVisibility(module, true, speed, callback, {
			animateOut:
				typeof options.animateOut === "string" &&
				options.animateOut.trim()
					? options.animateOut.trim()
					: module &&
						  module.data &&
						  typeof module.data.animateOut === "string"
						? module.data.animateOut
						: "",
			updateLifecycle: false
		});
	};

	/**
	 * Show the mounted module shell with the narrow semantics this sandbox claims
	 * to support.
	 *
	 * @param {object} module
	 * @param {number} speed
	 * @param {Function} [callback]
	 * @returns {void}
	 */
	core.showModule = function showModule(
		module,
		speed,
		callback,
		options: { animateIn?: string } = {}
	) {
		core.transitionModuleVisibility(
			module,
			false,
			speed,
			() => {
				module.hidden = false;
				core.setLifecycleState({ hidden: false });
				if (typeof callback === "function") {
					callback();
				}
			},
			{
				animateIn:
					typeof options.animateIn === "string" &&
					options.animateIn.trim()
						? options.animateIn.trim()
						: module &&
							  module.data &&
							  typeof module.data.animateIn === "string"
							? module.data.animateIn
							: "",
				updateLifecycle: false
			}
		);
	};

	/**
	 * Invoke the module suspend hook once per suspended state.
	 *
	 * @param {object} module
	 * @returns {boolean}
	 */
	core.suspendModule = function suspendModule(module) {
		if (core.lifecycleState.suspended) {
			return false;
		}

		core.setLifecycleState({ suspended: true });
		if (typeof module.suspend === "function") {
			module.suspend();
		}
		return true;
	};

	/**
	 * Invoke the module resume hook once per resumed state.
	 *
	 * @param {object} module
	 * @returns {boolean}
	 */
	core.resumeModule = function resumeModule(module) {
		if (!core.lifecycleState.suspended) {
			return false;
		}

		core.setLifecycleState({ suspended: false });
		if (typeof module.resume === "function") {
			module.resume();
		}
		return true;
	};

	core.setSelectionMethodsForModules = function setSelectionMethodsForModules(
		modules
	) {
		const modulesByClass = (className, include) => {
			let searchClasses =
				typeof className === "string"
					? className.split(" ")
					: className;
			const newModules = modules.filter((module) => {
				const classes = (
					module.data && module.data.classes
						? module.data.classes
						: ""
				)
					.toLowerCase()
					.split(" ");
				for (const searchClass of searchClasses) {
					if (classes.indexOf(searchClass.toLowerCase()) !== -1) {
						return include;
					}
				}
				return !include;
			});
			core.setSelectionMethodsForModules(newModules);
			return newModules;
		};

		if (typeof modules.withClass === "undefined") {
			Object.defineProperty(modules, "withClass", {
				value: (className) => {
					const result = modulesByClass(className, true);
					if (result.length === 0 && globalScope.Log?.warn) {
						globalScope.Log.warn(
							`[Sandbox] MM.getModules().withClass("${className}") returned an empty collection. ` +
								`The sandbox is a single-module environment — sibling-module coordination is out of scope. ` +
								`Your module is correctly attempting this operation; it just cannot be simulated here.`
						);
					}
					return result;
				},
				enumerable: false
			});
		}
		if (typeof modules.exceptWithClass === "undefined") {
			Object.defineProperty(modules, "exceptWithClass", {
				value: (className) => {
					const result = modulesByClass(className, false);
					if (result.length === 0 && globalScope.Log?.warn) {
						globalScope.Log.warn(
							`[Sandbox] MM.getModules().exceptWithClass("${className}") returned an empty collection. ` +
								`The sandbox is a single-module environment — sibling-module coordination is out of scope. ` +
								`Your module is correctly attempting this operation; it just cannot be simulated here.`
						);
					}
					return result;
				},
				enumerable: false
			});
		}
		if (typeof modules.exceptModule === "undefined") {
			Object.defineProperty(modules, "exceptModule", {
				value: (module) => {
					const newModules = modules.filter(
						(mod) => mod.identifier !== module.identifier
					);
					core.setSelectionMethodsForModules(newModules);
					if (newModules.length === 0 && globalScope.Log?.warn) {
						globalScope.Log.warn(
							`[Sandbox] MM.getModules().exceptModule() returned an empty collection. ` +
								`The sandbox is a single-module environment — sibling-module coordination is out of scope. ` +
								`Your module is correctly attempting this operation; it just cannot be simulated here.`
						);
					}
					return newModules;
				},
				enumerable: false
			});
		}
		if (typeof modules.enumerate === "undefined") {
			Object.defineProperty(modules, "enumerate", {
				value: (callback) => {
					modules.map((module) => callback(module));
				},
				enumerable: false
			});
		}
	};

	/**
	 * Expose the narrow MM surface needed by the supported lifecycle helpers.
	 *
	 * @returns {void}
	 */
	core.installMMGlobals = function installMMGlobals() {
		globalScope.MM = {
			/**
			 * Internal helper for send notification.
			 */
			sendNotification(notification, payload, sender) {
				return core.emitNotification(notification, payload, sender, {
					origin: "module",
					senderLabel:
						sender && (sender.identifier || sender.name)
							? sender.identifier || sender.name
							: "module"
				});
			},
			/**
			 * Updates dom.
			 */
			updateDom(module, updateOptions) {
				return core.scheduleRender(module, {
					updateOptions,
					notifyDomUpdated: core.lifecycleState.domCreated
				});
			},
			hideModule(module, speed, callback, options) {
				module.hidden = true;
				return core.hideModule(module, speed, callback, options);
			},
			/**
			 * Shows module.
			 */
			showModule(module, speed, callback, options) {
				return core.showModule(module, speed, callback, options);
			},
			getModules() {
				const modules = Array.from(core.moduleInstances.values());
				core.setSelectionMethodsForModules(modules);
				return modules;
			},
			getAvailableModulePositions: core.availableModulePositions.slice()
		};
	};

	/**
	 * Run the supported startup lifecycle in MagicMirror-like order.
	 *
	 * @param {object} instance
	 * @returns {Promise<void>}
	 */
	core.runStartupLifecycle = async function runStartupLifecycle(instance) {
		if (typeof instance.start === "function") {
			await Promise.resolve(instance.start());
		}

		core.setLifecycleState({ started: true, disabled: false });
		core.emitCoreNotification("ALL_MODULES_STARTED");

		await core.scheduleRender(instance, {
			notifyDomUpdated: false
		});

		core.setLifecycleState({ domCreated: true, disabled: false });
		core.emitCoreNotification("MODULE_DOM_CREATED", null, instance);
		core.emitCoreNotification("DOM_OBJECTS_CREATED");

		if (instance.data.hiddenOnStartup) {
			instance.hide(0);
		}
	};
})(window);
