/* global Module */
/**
 * Fixture frontend module mounted by the sandbox integration suite.
 *
 * The generated template module is adapted to exercise translations, helper
 * traffic, DOM updates, style loading, lifecycle hooks, and config merge
 * behavior through a realistic third-party module shape.
 *
 * It does not override getDom: the core's base getDom renders
 * MMM-TestModule.njk, so the module renders identically on every supported
 * MagicMirror version. Work on the rendered DOM runs once the core inserted
 * it (MODULE_DOM_CREATED / MODULE_DOM_UPDATED) and leaves the markup as the
 * template rendered it, so an updateDom() with unchanged data keeps the
 * same DOM node (main.js moduleNeedsUpdate compares the markup).
 *
 * The pinned core-fidelity suites mount the MMM-TestModule-super-getdom
 * variant instead, whose getDom calls this._super() (D1).
 */
Module.register("MMM-TestModule", {
	requiresVersion: "2.0.0",

	defaults: {
		operatorName: "Sandbox Developer",
		pingMessage: "fixture ping",
		badgeLabel: "Styled from test module",
		nested: {
			defaultFlag: true,
			overrideFlag: "from defaults"
		}
	},

	start() {
		this.noticeMessage = "No integration notice yet.";
		this.helperReply = "No helper reply yet.";
		this.suspendCount = 0;
		this.resumeCount = 0;
		this.coreNotificationCounts = {
			allModulesStarted: 0,
			moduleDomCreated: 0,
			domObjectsCreated: 0,
			moduleDomUpdated: 0
		};
		this.scriptStatus =
			typeof globalThis !== "undefined" &&
			globalThis.__testModuleFixtureScriptLoaded
				? globalThis.__testModuleFixtureScriptLoaded
				: "missing";
	},

	getScripts() {
		return ["test-script.js", "fixture-esm.mjs"];
	},

	getStyles() {
		return ["MMM-TestModule.css"];
	},

	getTranslations() {
		return {
			en: "translations/en.json",
			es: "translations/es.json"
		};
	},

	getTemplate() {
		return "MMM-TestModule.njk";
	},

	getTemplateData() {
		return {
			operatorName: this.config.operatorName,
			scriptStatus: this.scriptStatus,
			badgeLabel: this.config.badgeLabel,
			noticeMessage: this.noticeMessage,
			helperReply: this.helperReply,
			suspendCount: this.suspendCount,
			resumeCount: this.resumeCount,
			nestedConfigJson: JSON.stringify(this.config.nested)
		};
	},

	/**
	 * Post-render work on the DOM the core just inserted: bind the helper
	 * ping button and record what the module found in the live document.
	 * Only expando properties and instance state change, never the markup.
	 */
	afterRender() {
		const root = globalThis.document.getElementById("test-module-root");
		const button = globalThis.document.getElementById(
			"test-module-helper-ping"
		);
		if (button && button.__sandboxPingBound !== true) {
			button.__sandboxPingBound = true;
			button.addEventListener("click", () => {
				this.sendSocketNotification("TEST_MODULE_PING", {
					message: this.config.pingMessage
				});
			});
		}
		const moduleWrapper = globalThis.document.getElementById(
			this.identifier
		);
		this.renderSnapshot = {
			renderCount: (this.renderSnapshot?.renderCount ?? 0) + 1,
			rootInModuleContent: Boolean(
				root &&
				moduleWrapper &&
				moduleWrapper.querySelector(".module-content")?.contains(root)
			),
			hasHelperButton: Boolean(button),
			helperButtonBound: Boolean(button && button.__sandboxPingBound)
		};
	},

	notificationReceived(notification, payload, sender) {
		// Transparency probes for the real-core stage observer: the echo returns
		// its payload synchronously and records how it was called; the throw
		// rethrows through any wrapper.
		if (notification === "TEST_MODULE_ECHO") {
			this.lastEcho = {
				argumentCount: arguments.length,
				senderIsUndefined: sender === undefined
			};
			return payload;
		}

		if (notification === "TEST_MODULE_THROW") {
			throw new Error(String(payload));
		}

		if (notification === "ALL_MODULES_STARTED") {
			this.coreNotificationCounts.allModulesStarted += 1;
			return;
		}

		if (notification === "MODULE_DOM_CREATED") {
			this.coreNotificationCounts.moduleDomCreated += 1;
			this.afterRender();
			return;
		}

		if (notification === "DOM_OBJECTS_CREATED") {
			this.coreNotificationCounts.domObjectsCreated += 1;
			return;
		}

		if (notification === "MODULE_DOM_UPDATED") {
			this.coreNotificationCounts.moduleDomUpdated += 1;
			this.afterRender();
			return;
		}

		if (notification !== "INTEGRATION_NOTICE") {
			return;
		}

		const message =
			payload &&
			typeof payload === "object" &&
			typeof payload.message === "string"
				? payload.message
				: String(payload || "null");
		this.noticeMessage = message;
		this.updateDom();
	},

	socketNotificationReceived(notification, payload) {
		if (notification !== "TEST_MODULE_PONG") {
			return;
		}

		this.helperReply =
			payload && payload.message ? payload.message : "empty";
		this.updateDom();
	},

	suspend() {
		this.suspendCount += 1;
		this.updateDom();
	},

	resume() {
		this.resumeCount += 1;
		this.updateDom();
	}
});
