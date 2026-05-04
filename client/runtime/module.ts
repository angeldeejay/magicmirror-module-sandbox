/**
 * Module runtime and MagicMirror-like globals.
 */
(function initModuleSandboxRuntime(globalScope) {
	const core = globalScope.__MICROCORE__ as SandboxCore;
	const harness = core.harness as Record<string, any>;

	/**
	 * Compare two semver-like version strings.
	 *
	 * @param {string} left
	 * @param {string} right
	 * @returns {number}
	 */
	core.compareVersions = function compareVersions(left, right) {
		const leftParts = String(left || "0")
			.split(".")
			.map((part) => Number.parseInt(part, 10) || 0);
		const rightParts = String(right || "0")
			.split(".")
			.map((part) => Number.parseInt(part, 10) || 0);
		const length = Math.max(leftParts.length, rightParts.length);

		for (let index = 0; index < length; index += 1) {
			const leftPart = leftParts[index] || 0;
			const rightPart = rightParts[index] || 0;
			if (leftPart !== rightPart) {
				return leftPart > rightPart ? 1 : -1;
			}
		}

		return 0;
	};

	/**
	 * Resolve the socket.io path under the configured basePath.
	 *
	 * @returns {string}
	 */
	core.getSocketPath = function getSocketPath() {
		return `${core.getBasePath()}socket.io`.replace(/\/{2,}/g, "/");
	};

	/**
	 * Merge config objects the same way MagicMirror treats deep config updates.
	 *
	 * @param {object} target
	 * @param {...object} sources
	 * @returns {object}
	 */
	core.configDeepMerge = function configDeepMerge(target, ...sources) {
		return core.deepMerge(target, ...sources);
	};

	/**
	 * Clone MagicMirror-like module definitions so nested defaults/state do not
	 * get shared across instances while leaving functions callable.
	 *
	 * @param {*} value
	 * @returns {*}
	 */
	core.cloneModuleValue = function cloneModuleValue(value) {
		if (value === null || typeof value !== "object") {
			return value;
		}

		if (Array.isArray(value)) {
			return value.map((entry) => core.cloneModuleValue(entry));
		}

		if (value.constructor && value.constructor.name === "RegExp") {
			return new RegExp(value);
		}

		const cloned =
			value.constructor && typeof value.constructor === "function"
				? value.constructor()
				: {};
		for (const key in value) {
			cloned[key] = core.cloneModuleValue(value[key]);
		}

		return cloned;
	};

	/**
	 * Wrap overriding methods so `this._super()` behaves like MagicMirror's
	 * `Class.extend` for the single Module base layer.
	 *
	 * @param {object} instance
	 * @param {object} baseInstance
	 * @returns {void}
	 */
	core.installSuperWrappers = function installSuperWrappers(
		instance,
		baseInstance
	) {
		const fnTest = /\b_super\b/;
		for (const name of Object.keys(instance)) {
			const fn = instance[name];
			const superFn = baseInstance[name];
			if (
				typeof fn !== "function" ||
				typeof superFn !== "function" ||
				!fnTest.test(fn.toString())
			) {
				continue;
			}

			instance[name] = function wrappedSuperMethod(...args) {
				const previousSuper = this._super;
				this._super = (...superArgs) => {
					const previousSuperMethodName =
						this.__sandboxActiveSuperMethodName;
					this.__sandboxActiveSuperMethodName = name;
					try {
						return superFn.apply(this, superArgs);
					} finally {
						this.__sandboxActiveSuperMethodName =
							previousSuperMethodName;
					}
				};
				try {
					return fn.apply(this, args);
				} finally {
					this._super = previousSuper;
				}
			};
		}
	};

	/**
	 * Determine whether a template reference points to a template file.
	 *
	 * @param {string} template
	 * @returns {boolean}
	 */
	core.isTemplateFile = function isTemplateFile(template) {
		return (
			typeof template === "string" &&
			/^.*((\.html)|(\.njk))$/.test(template)
		);
	};

	/**
	 * Create a narrow MMSocket-like wrapper for one module namespace.
	 *
	 * @param {string} name
	 * @returns {{name: string, socket: *, setNotificationCallback: Function, sendNotification: Function}}
	 */
	core.createModuleSocket = function createModuleSocket(name) {
		const socket = (globalScope.io as (...args: unknown[]) => any)(
			`/${name}`,
			{
				path: core.getSocketPath(),
				transports: ["websocket"],
				pingInterval: 120000,
				pingTimeout: 120000
			}
		);
		let callback: (notification: string, payload: any) => void =
			/**
			 * Internal helper for callback.
			 */
			function noop() {};

		socket.onAny((notification, payload) => {
			core.recordWebsocketEvent("received", notification, payload);
			callback(notification, payload);
		});

		return {
			name,
			socket,
			/**
			 * Sets notification callback.
			 */
			setNotificationCallback(nextCallback) {
				callback =
					typeof nextCallback === "function"
						? nextCallback
						: function noop() {};
			},
			/**
			 * Internal helper for send notification.
			 */
			sendNotification(notification, payload = {}) {
				core.recordWebsocketEvent("sent", notification, payload);
				socket.emit(notification, payload);
			}
		};
	};

	/**
	 * Build the MagicMirror-like data object exposed on the mounted module.
	 *
	 * @param {string} name
	 * @returns {object}
	 */
	core.buildModuleData = function buildModuleData(name) {
		const moduleConfig =
			harness.moduleConfig && typeof harness.moduleConfig === "object"
				? harness.moduleConfig
				: {};
		const hasOwnHeader = Object.prototype.hasOwnProperty.call(
			moduleConfig,
			"header"
		);
		return {
			name,
			identifier: harness.moduleIdentifier || `${name}_sandbox`,
			path: harness.modulePath || `modules/${name}/`,
			file: `${name}.js`,
			position: moduleConfig.position || "middle_center",
			header: hasOwnHeader ? moduleConfig.header : undefined,
			classes: moduleConfig.classes || "",
			animateIn: moduleConfig.animateIn || "",
			animateOut: moduleConfig.animateOut || "",
			hiddenOnStartup: Boolean(moduleConfig.hiddenOnStartup),
			disabled: Boolean(moduleConfig.disabled),
			configDeepMerge: Boolean(moduleConfig.configDeepMerge),
			config: core.deepMerge({}, moduleConfig.config || {})
		};
	};

	/**
	 * Attach the supported MagicMirror instance helpers to one module definition.
	 *
	 * @param {object} instance
	 * @returns {object}
	 */
	core.extendModuleInstance = function extendModuleInstance(instance) {
		instance.defaults = instance.defaults || {};
		instance.requiresVersion = instance.requiresVersion || "2.0.0";
		instance._nunjucksEnvironment =
			instance._nunjucksEnvironment === undefined
				? null
				: instance._nunjucksEnvironment;
		instance.getHeader =
			typeof instance.getHeader === "function"
				? instance.getHeader
				: function getHeader() {
						return this.data.header;
					};

		/**
		 * Internal helper for config deep merge.
		 */
		instance.configDeepMerge = function moduleConfigDeepMerge(...sources) {
			return core.configDeepMerge({}, ...sources);
		};

		/**
		 * Sets data.
		 */
		instance.setData = function setData(data) {
			const nextData = data && typeof data === "object" ? data : {};
			this.data = core.deepMerge({}, nextData);
			this.name = this.data.name || this.name;
			this.identifier = this.data.identifier || this.identifier;
			this.path = this.data.path || this.path;
			this.position =
				this.data.position || this.position || "middle_center";
			this.classes = this.data.classes || "";
			this.hidden = Boolean(this.data.hiddenOnStartup);
			this.showHideTimer = null;
			this.lockStrings = [];
			this.setConfig(this.data.config, this.data.configDeepMerge);
			core.syncModuleShellState(this);
		};

		/**
		 * Sets config.
		 */
		instance.setConfig = function setConfig(config, deep) {
			const nextConfig =
				config && typeof config === "object" ? config : {};
			this.config = deep
				? core.configDeepMerge({}, this.defaults || {}, nextConfig)
				: Object.assign({}, this.defaults || {}, nextConfig);
			return this.config;
		};

		/**
		 * Internal helper for file.
		 */
		instance.file = function file(filename) {
			return ("/" + this.data.path + filename).replace(/\/\//g, "/");
		};

		/**
		 * Internal helper for socket.
		 */
		instance.socket = function socket() {
			if (!this._socket) {
				this._socket = core.createModuleSocket(this.name);
				this._socket.setNotificationCallback(
					(notification, payload) => {
						if (
							typeof this.socketNotificationReceived ===
							"function"
						) {
							this.socketNotificationReceived(
								notification,
								payload
							);
						}
					}
				);
			}
			return this._socket;
		};

		/**
		 * Translates.
		 */
		instance.translate = function translate(
			key,
			defaultValueOrVariables,
			defaultValue
		) {
			if (
				defaultValueOrVariables &&
				typeof defaultValueOrVariables === "object"
			) {
				return (
					globalScope.Translator.translate(
						this,
						key,
						defaultValueOrVariables
					) ||
					defaultValue ||
					""
				);
			}

			return (
				globalScope.Translator.translate(this, key) ||
				defaultValueOrVariables ||
				""
			);
		};

		/**
		 * Updates dom.
		 */
		instance.updateDom = function updateDom(updateOptions) {
			return globalScope.MM.updateDom(this, updateOptions);
		};

		/**
		 * Internal helper for send notification.
		 */
		instance.sendNotification = function sendNotification(
			notification,
			payload
		) {
			return globalScope.MM.sendNotification(notification, payload, this);
		};

		/**
		 * Internal helper for send socket notification.
		 */
		instance.sendSocketNotification = function sendSocketNotification(
			notification,
			payload
		) {
			return this.socket().sendNotification(notification, payload);
		};

		instance.hide = function hide(speed = 0, callback, options) {
			let usedCallback =
				typeof callback === "function" ? callback : function () {};
			let usedOptions = typeof options === "object" ? options : {};
			if (typeof callback === "object") {
				globalScope.Log.error(
					"Parameter mismatch in module.hide: callback is not an optional parameter!"
				);
				usedOptions = callback;
				usedCallback = function () {};
			}
			if (usedOptions.lockString) {
				this.lockStrings.push(usedOptions.lockString);
			}
			const self = this;
			return globalScope.MM.hideModule(
				this,
				speed,
				() => {
					core.suspendModule(self);
					usedCallback();
				},
				usedOptions
			);
		};

		instance.show = function show(speed = 0, callback, options) {
			let usedCallback =
				typeof callback === "function" ? callback : function () {};
			let usedOptions = typeof options === "object" ? options : {};
			if (typeof callback === "object") {
				globalScope.Log.error(
					"Parameter mismatch in module.show: callback is not an optional parameter!"
				);
				usedOptions = callback;
				usedCallback = function () {};
			}
			if (usedOptions.lockString) {
				const index = this.lockStrings.indexOf(usedOptions.lockString);
				if (index !== -1) {
					this.lockStrings.splice(index, 1);
				}
			}
			if (this.lockStrings.length !== 0) {
				return;
			}
			const self = this;
			return globalScope.MM.showModule(
				this,
				speed,
				() => {
					core.resumeModule(self);
					usedCallback();
				},
				usedOptions
			);
		};

		/**
		 * Loads dependencies.
		 */
		instance.loadDependencies = async function loadDependencies(
			methodName,
			loader
		) {
			const dependencies =
				typeof this[methodName] === "function"
					? this[methodName]()
					: [];

			for (const dependency of Array.isArray(dependencies)
				? dependencies
				: []) {
				// MagicMirror loads dependencies serially; keep that contract here.
				await loader(dependency);
			}
		};

		/**
		 * Loads scripts.
		 */
		instance.loadScripts = function loadScripts() {
			return this.loadDependencies("getScripts", core.loadScript);
		};

		/**
		 * Loads styles.
		 */
		instance.loadStyles = function loadStyles() {
			return this.loadDependencies("getStyles", core.loadStyle);
		};

		/**
		 * Loads translations.
		 */
		instance.loadTranslations = function loadTranslations() {
			return core.loadTranslations(this);
		};

		instance.loadTemplates =
			typeof instance.loadTemplates === "function"
				? instance.loadTemplates
				: function loadTemplates() {
						const template =
							typeof this.getTemplate === "function"
								? this.getTemplate()
								: null;
						if (!core.isTemplateFile(template)) {
							return Promise.resolve();
						}
						return new Promise((resolve) => {
							this.nunjucksEnvironment().render(
								template,
								{},
								(err) => {
									if (err) {
										globalScope.Log?.error?.(err);
									}
									resolve();
								}
							);
						});
					};

		instance.getTemplate =
			typeof instance.getTemplate === "function"
				? instance.getTemplate
				: function getTemplate() {
						return `<div class="normal">${this.name}</div><div class="small dimmed">${this.identifier}</div>`;
					};

		instance.getTemplateData =
			typeof instance.getTemplateData === "function"
				? instance.getTemplateData
				: function getTemplateData() {
						return {};
					};

		instance.nunjucksEnvironment =
			typeof instance.nunjucksEnvironment === "function"
				? instance.nunjucksEnvironment
				: function nunjucksEnvironment() {
						if (this._nunjucksEnvironment !== null) {
							return this._nunjucksEnvironment;
						}

						if (!globalScope.nunjucks) {
							throw new Error(
								"Nunjucks browser runtime is unavailable in the sandbox stage."
							);
						}

						this._nunjucksEnvironment =
							new globalScope.nunjucks.Environment(
								new globalScope.nunjucks.WebLoader(
									("/" + this.data.path).replace(/\/+$/, ""),
									{
										async: true
									}
								),
								{
									trimBlocks: true,
									lstripBlocks: true
								}
							);
						this._nunjucksEnvironment.addFilter(
							"translate",
							(str, variables) => {
								return globalScope.nunjucks.runtime.markSafe(
									this.translate(str, variables)
								);
							}
						);

						return this._nunjucksEnvironment;
					};

		instance.getDom =
			typeof instance.getDom === "function"
				? instance.getDom
				: function getDom() {
						return new Promise((resolve) => {
							const div = document.createElement("div");
							const template = this.getTemplate();
							const templateData = this.getTemplateData();

							if (core.isTemplateFile(template)) {
								this.nunjucksEnvironment().render(
									template,
									templateData,
									(err, res) => {
										if (err) {
											globalScope.Log.error(err);
										}
										div.innerHTML = res;
										resolve(div);
									}
								);
							} else {
								div.innerHTML =
									this.nunjucksEnvironment().renderString(
										template,
										templateData
									);
								resolve(div);
							}
						});
					};

		return instance;
	};

	/**
	 * Instantiate one registered module definition.
	 *
	 * @param {string} name
	 * @param {object} definition
	 * @returns {object}
	 */
	core.buildModuleInstance = function buildModuleInstance(name, definition) {
		const baseInstance = {};
		core.extendModuleInstance(baseInstance);
		const instance = core.cloneModuleValue(definition || {});
		core.extendModuleInstance(instance);
		core.installSuperWrappers(instance, baseInstance);
		instance.setData(core.buildModuleData(name));
		return instance;
	};

	/**
	 * Synchronizes module shell state.
	 */
	core.syncModuleShellState = function syncModuleShellState(instance) {
		const shell = core.getModuleShell();
		const stage = document.querySelector(
			".module-stage"
		) as HTMLElement | null;
		if (!shell || !instance || !instance.data) {
			return;
		}

		const classNames = ["module-shell", "module", instance.name];
		const extraClasses = String(instance.data.classes || "")
			.trim()
			.split(/\s+/)
			.filter(Boolean);
		classNames.push(...extraClasses);
		shell.className = classNames.join(" ");
		shell.dataset.position = instance.data.position || "middle_center";
		if (stage) {
			stage.dataset.position = shell.dataset.position;
		}
	};

	/**
	 * Resolve the next header + DOM content for one render pass.
	 *
	 * @param {object} instance
	 * @returns {Promise<{header: string, content: HTMLElement}>}
	 */
	core.resolveRenderOutput = async function resolveRenderOutput(instance) {
		const headerValue =
			typeof instance.getHeader === "function"
				? instance.getHeader()
				: undefined;

		// Match main.js header rendering semantics exactly:
		//   - headerValue === false  → hide the header (showHeader = false)
		//   - headerValue is falsy but not false (undefined, "") → show module name
		//   - headerValue is truthy → show as-is
		// Source: main.js header rendering: innerHTML = header ? header : module.data.name
		const showHeader = headerValue !== false;
		const headerText = showHeader
			? String(headerValue || instance.name || "")
			: "";

		let content =
			typeof instance.getDom === "function"
				? await Promise.resolve(instance.getDom())
				: document.createElement("div");

		if (!(content instanceof HTMLElement)) {
			const wrapper = document.createElement("div");
			if (content !== undefined && content !== null) {
				wrapper.textContent = String(content);
			}
			content = wrapper;
		}

		return {
			header: headerText,
			showHeader,
			content
		};
	};

	/**
	 * Detect whether the wrapper really needs DOM replacement.
	 *
	 * @param {object} instance
	 * @param {{header: string, content: HTMLElement}} renderOutput
	 * @returns {boolean}
	 */
	core.moduleNeedsUpdate = function moduleNeedsUpdate(
		instance,
		renderOutput
	) {
		const shell = core.getModuleShell(instance);
		if (!shell) {
			return false;
		}

		const headerNode = shell.querySelector(".module-header");
		const contentNode = shell.querySelector(".module-content");
		const comparisonNode = document.createElement("div");
		comparisonNode.appendChild(renderOutput.content);

		return (
			(headerNode ? headerNode.innerHTML : "") !== renderOutput.header ||
			(headerNode ? headerNode.style.display : "none") !==
				(renderOutput.showHeader ? "block" : "none") ||
			(contentNode ? contentNode.innerHTML : "") !==
				comparisonNode.innerHTML
		);
	};

	/**
	 * Replace the current wrapper contents with the latest module render.
	 *
	 * @param {object} instance
	 * @param {{header: string, content: HTMLElement}} renderOutput
	 * @returns {void}
	 */
	core.applyRenderOutput = function applyRenderOutput(
		instance,
		renderOutput
	) {
		const shell = core.getModuleShell(instance);
		if (!shell) {
			return;
		}

		const headerNode = shell.querySelector(".module-header");
		const contentNode = shell.querySelector(".module-content");
		if (!headerNode || !contentNode) {
			return;
		}

		headerNode.innerHTML = renderOutput.header;
		headerNode.style.display = renderOutput.showHeader ? "block" : "none";

		contentNode.replaceChildren();
		contentNode.appendChild(renderOutput.content);
	};

	/**
	 * Render one module instance.
	 *
	 * @param {object} instance
	 * @param {{updateOptions?: *}} [options]
	 * @returns {Promise<boolean>}
	 */
	core.render = async function render(
		instance,
		options: { updateOptions?: unknown } = {}
	) {
		const renderOutput = await core.resolveRenderOutput(instance);
		const needsUpdate = core.moduleNeedsUpdate(instance, renderOutput);
		if (!needsUpdate) {
			return false;
		}

		await core.commitModuleRender(
			instance,
			() => {
				core.applyRenderOutput(instance, renderOutput);
			},
			options.updateOptions
		);
		return true;
	};

	/**
	 * Queue a DOM render so multiple updateDom() calls stay ordered.
	 *
	 * @param {object} instance
	 * @param {{updateOptions?: *, notifyDomUpdated?: boolean}} [options]
	 * @returns {Promise<void>}
	 */
	core.scheduleRender = function scheduleRender(
		instance,
		options: { updateOptions?: unknown; notifyDomUpdated?: boolean } = {}
	) {
		core.renderQueue = core.renderQueue.then(() => {
			return core.render(instance, options).then(() => {
				if (options.notifyDomUpdated) {
					core.emitCoreNotification(
						"MODULE_DOM_UPDATED",
						null,
						instance
					);
				}
			});
		});
		return core.renderQueue;
	};

	/**
	 * Install browser globals expected by the mounted module.
	 *
	 * @returns {void}
	 */
	core.installGlobals = function installGlobals() {
		globalScope.config = {
			language: harness.language || "en",
			locale: harness.locale || harness.language || "en-US",
			basePath: core.getBasePath()
		};
		globalScope.mmVersion = harness.mmVersion || "2.36.0";

		globalScope.Log = {
			/**
			 * Internal helper for info.
			 */
			info(...args) {
				core.log("info", ...args);
			},
			/**
			 * Internal helper for log.
			 */
			log(...args) {
				core.log("log", ...args);
			},
			/**
			 * Internal helper for error.
			 */
			error(...args) {
				core.log("error", ...args);
			},
			warn(...args) {
				core.log("warn", ...args);
			},
			debug(...args) {
				core.log("debug", ...args);
			},
			group(...args) {
				console.group(...args);
			},
			groupCollapsed(...args) {
				console.groupCollapsed(...args);
			},
			groupEnd() {
				console.groupEnd();
			},
			time(label) {
				console.time(label);
			},
			timeEnd(label) {
				console.timeEnd(label);
			},
			timeStamp(label) {
				if (typeof console.timeStamp === "function") {
					console.timeStamp(label);
				}
			},
			setLogLevel() {}
		};

		globalScope.Module = {
			definitions: core.moduleDefinitions,
			/**
			 * Registers.
			 */
			register(name, definition) {
				const requiredVersion =
					definition && definition.requiresVersion
						? definition.requiresVersion
						: "2.0.0";
				if (
					core.compareVersions(
						globalScope.mmVersion,
						requiredVersion
					) < 0
				) {
					core.log(
						"error",
						`Mounted module requires MagicMirror ${requiredVersion}, sandbox runtime is ${globalScope.mmVersion}.`
					);
					return;
				}

				core.moduleDefinitions[name] = definition;
			}
		};
	};

	/**
	 * Boot the mounted module into the sandbox runtime.
	 *
	 * @returns {Promise<void>}
	 */
	core.boot = async function boot() {
		core.installGlobals();
		core.installMMGlobals();
		if (
			harness.moduleConfig &&
			typeof harness.moduleConfig === "object" &&
			harness.moduleConfig.disabled
		) {
			core.setLifecycleState({
				started: false,
				domCreated: false,
				disabled: true,
				hidden: false,
				suspended: false
			});
			return;
		}

		await core.loadScript(harness.moduleEntry);
		const definition = core.moduleDefinitions[harness.moduleName];
		if (!definition) {
			throw new Error(
				`Mounted module "${harness.moduleName}" did not call Module.register().`
			);
		}

		const instance = core.buildModuleInstance(
			harness.moduleName,
			definition
		);
		core.moduleInstance = instance;
		core.registerModuleInstance(instance);
		globalScope.__moduleSandboxModule = instance;

		await Promise.all([
			instance.loadTranslations(),
			instance.loadTemplates(),
			instance.loadScripts(),
			instance.loadStyles()
		]);

		await core.runStartupLifecycle(instance);

		core.rootSocket = globalScope.io({
			path: core.getSocketPath(),
			transports: ["websocket"],
			pingInterval: 120000,
			pingTimeout: 120000
		});

		core.rootSocket.on("connect", () => {
			core.log("info", "Sandbox connected");
		});

		core.rootSocket.on("disconnect", (reason) => {
			core.log("warn", `Sandbox disconnected: ${reason}`);
		});

		core.rootSocket.on("harness:helper-log", (entry) => {
			core.recordHelperLog(entry);
		});

		core.rootSocket.on("harness:reload", (payload) => {
			const scope =
				payload && typeof payload.scope === "string"
					? payload.scope
					: "stage";
			if (scope === "shell") {
				return;
			}
			if (globalScope.parent !== globalScope) {
				return;
			}

			const nextUrl = new URL(globalScope.location.href);
			nextUrl.searchParams.set(
				"v",
				payload && typeof payload.version === "string"
					? payload.version
					: Date.now().toString(36)
			);
			globalScope.location.replace(nextUrl.toString());
		});
	};
})(window);
