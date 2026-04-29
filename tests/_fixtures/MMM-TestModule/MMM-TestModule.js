/* global Module */
/**
 * Fixture frontend module mounted by the sandbox integration suite.
 *
 * The generated template module is adapted to exercise translations, helper
 * traffic, DOM updates, style loading, lifecycle hooks, and config merge
 * behavior through a realistic third-party module shape.
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
		return ["test-script.js"];
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

	getDom() {
		const wrapper = this._super();
		const root = wrapper.querySelector("#test-module-root");
		const dynamicSlot = wrapper.querySelector("#test-module-dynamic-slot");
		const helperButton = wrapper.querySelector("#test-module-helper-ping");
		this.superAdapterSnapshot = {
			immediateChildElementCount: wrapper.children.length,
			immediateTextContent: wrapper.textContent,
			isThenable: typeof wrapper.then === "function",
			hasImmediateRoot: Boolean(root),
			hasImmediateDynamicSlot: Boolean(dynamicSlot),
			hasImmediateHelperButton: Boolean(helperButton)
		};
		wrapper.classList.add("test-module-super-wrapper");
		if (dynamicSlot) {
			dynamicSlot.textContent = "Injected from getDom";
		}
		if (root) {
			const adapterMarker = globalThis.document.createElement("div");
			adapterMarker.id = "test-module-super-adapter";
			adapterMarker.textContent = "Super adapter active";
			root.appendChild(adapterMarker);
		}
		if (helperButton && helperButton.__sandboxPingBound !== true) {
			helperButton.__sandboxPingBound = true;
			helperButton.dataset.boundInGetDom = "true";
			helperButton.addEventListener("click", () => {
				this.sendSocketNotification("TEST_MODULE_PING", {
					message: this.config.pingMessage
				});
			});
		}
		return wrapper;
	},

	attachPingHandler() {
		const button = globalThis.document.getElementById(
			"test-module-helper-ping"
		);
		if (!button || button.__sandboxPingBound === true) {
			return;
		}

		button.__sandboxPingBound = true;
		button.addEventListener("click", () => {
			this.sendSocketNotification("TEST_MODULE_PING", {
				message: this.config.pingMessage
			});
		});
	},

	notificationReceived(notification, payload) {
		if (notification === "ALL_MODULES_STARTED") {
			this.coreNotificationCounts.allModulesStarted += 1;
			return;
		}

		if (notification === "MODULE_DOM_CREATED") {
			this.coreNotificationCounts.moduleDomCreated += 1;
			this.attachPingHandler();
			return;
		}

		if (notification === "DOM_OBJECTS_CREATED") {
			this.coreNotificationCounts.domObjectsCreated += 1;
			return;
		}

		if (notification === "MODULE_DOM_UPDATED") {
			this.coreNotificationCounts.moduleDomUpdated += 1;
			this.attachPingHandler();
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
