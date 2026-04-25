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

	notificationReceived(notification, payload) {
		if (notification === "ALL_MODULES_STARTED") {
			this.coreNotificationCounts.allModulesStarted += 1;
			return;
		}

		if (notification === "MODULE_DOM_CREATED") {
			this.coreNotificationCounts.moduleDomCreated += 1;
			return;
		}

		if (notification === "DOM_OBJECTS_CREATED") {
			this.coreNotificationCounts.domObjectsCreated += 1;
			return;
		}

		if (notification === "MODULE_DOM_UPDATED") {
			this.coreNotificationCounts.moduleDomUpdated += 1;
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
	},

	getDom() {
		const wrapper = globalThis.document.createElement("div");
		wrapper.id = "test-module-root";
		wrapper.className = "test-module-root";

		const greeting = globalThis.document.createElement("div");
		greeting.id = "test-module-translation";
		greeting.textContent = this.translate("GREETING", {
			operator: this.config.operatorName
		});

		const scriptStatus = globalThis.document.createElement("div");
		scriptStatus.id = "test-module-script-status";
		scriptStatus.textContent = `Script: ${this.scriptStatus}`;

		const styleProbe = globalThis.document.createElement("div");
		styleProbe.id = "test-module-style-probe";
		styleProbe.textContent = this.config.badgeLabel;

		const notice = globalThis.document.createElement("div");
		notice.id = "test-module-notice";
		notice.textContent = `Notice: ${this.noticeMessage}`;

		const helperReply = globalThis.document.createElement("div");
		helperReply.id = "test-module-helper-reply";
		helperReply.textContent = `Helper: ${this.helperReply}`;

		const lifecycle = globalThis.document.createElement("div");
		lifecycle.id = "test-module-lifecycle";
		lifecycle.textContent = `Suspend: ${this.suspendCount} / Resume: ${this.resumeCount}`;

		const configMerge = globalThis.document.createElement("div");
		configMerge.id = "test-module-config-merge";
		configMerge.textContent = `Nested: ${JSON.stringify(this.config.nested)}`;

		const pingButton = globalThis.document.createElement("button");
		pingButton.id = "test-module-helper-ping";
		pingButton.type = "button";
		pingButton.textContent = "Ping helper";
		pingButton.addEventListener("click", () => {
			this.sendSocketNotification("TEST_MODULE_PING", {
				message: this.config.pingMessage
			});
		});

		wrapper.append(
			greeting,
			scriptStatus,
			styleProbe,
			notice,
			helperReply,
			lifecycle,
			configMerge,
			pingButton
		);
		return wrapper;
	}
});
