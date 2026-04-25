/**
 * Unit coverage for the sandbox HTML shell and stage documents.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import htmlModule from "../../../server/html.ts";

const { createHtmlPage, createStagePage } = htmlModule;

test("createHtmlPage renders the host shell, topbar domains, and runtime bootstrap", () => {
	const html = createHtmlPage({
		watchEnabled: true,
		/**
		 * Gets available languages.
		 */
		getAvailableLanguages() {
			return [
				{ code: "en", label: "English" },
				{ code: "es", label: "Spanish" }
			];
		},
		/**
		 * Gets harness config.
		 */
		getHarnessConfig() {
			return {
				moduleName: "MMM-TestModule",
				moduleEntry: "MMM-TestModule.js",
				moduleIdentifier: "MMM-TestModule_sandbox",
				header: false,
				hiddenOnStartup: false,
				language: "en",
				locale: "en-US"
			};
		},
		/**
		 * Gets module config.
		 */
		getModuleConfig() {
			return {
				operatorName: "Fixture Operator"
			};
		},
		/**
		 * Gets contract.
		 */
		getContract() {
			return {
				supported: ["Module.register", "sendNotification"]
			};
		},
		/**
		 * Gets helper log entries.
		 */
		getHelperLogEntries() {
			return [
				{
					timestamp: "2026-01-01T00:00:00.000Z",
					method: "info",
					args: ["helper ready"]
				}
			];
		}
	});

	assert.match(html, /MagicMirror Module Sandbox/);
	assert.match(html, /data-domain="runtime"/);
	assert.match(html, /data-domain="config"/);
	assert.match(html, /data-domain="notifications"/);
	assert.match(html, /data-domain="debug"/);
	assert.match(html, /data-domain="about"/);
	assert.match(html, /window\.__HARNESS__/);
	assert.match(html, /MMM-TestModule/);
	assert.match(html, /id="module-stage-frame"/);
	assert.match(html, /src="\/__harness\/stage\?v=/);
	assert.match(html, /Sandbox URL: <code>http:\/\/127\.0\.0\.1:3010<\/code>/);
	assert.match(html, /"sandboxUrl":"http:\/\/127\.0\.0\.1:3010"/);
	assert.match(html, /"assetVersion":"/);
	assert.match(html, /"locale":"en-US"/);
	assert.match(html, /id="config-language"/);
	assert.match(html, /id="config-position"/);
	assert.match(html, /id="config-header-enabled"/);
	assert.match(html, /id="config-hidden-on-startup"/);
	assert.match(html, /id="config-disabled"/);
	assert.match(html, />Spanish \(es\)</);
	assert.match(html, /watch mode/i);
});

test("createHtmlPage renders the watch-off host state when watch mode is disabled", () => {
	const html = createHtmlPage({
		watchEnabled: false,
		/**
		 * Gets available languages.
		 */
		getAvailableLanguages() {
			return [{ code: "en", label: "English" }];
		},
		/**
		 * Gets harness config.
		 */
		getHarnessConfig() {
			return {
				moduleName: "MMM-TestModule",
				moduleEntry: "MMM-TestModule.js",
				moduleIdentifier: "MMM-TestModule_sandbox",
				header: false,
				hiddenOnStartup: false,
				language: "en",
				locale: "en-US"
			};
		},
		/**
		 * Gets module config.
		 */
		getModuleConfig() {
			return {
				operatorName: "Fixture Operator"
			};
		},
		/**
		 * Gets contract.
		 */
		getContract() {
			return {};
		},
		/**
		 * Gets helper log entries.
		 */
		getHelperLogEntries() {
			return [];
		}
	});

	assert.match(html, /Watch mode: <code>off<\/code>/);
});

test("createStagePage renders the iframe runtime viewport and module bootstrap", () => {
	const html = createStagePage({
		/**
		 * Gets available languages.
		 */
		getAvailableLanguages() {
			return [{ code: "en", label: "English" }];
		},
		/**
		 * Gets harness config.
		 */
		getHarnessConfig() {
			return {
				moduleName: "MMM-TestModule",
				moduleEntry: "MMM-TestModule.js",
				moduleIdentifier: "MMM-TestModule_sandbox",
				header: false,
				hiddenOnStartup: false,
				language: "en",
				locale: "en-US"
			};
		},
		/**
		 * Gets module config.
		 */
		getModuleConfig() {
			return {
				operatorName: "Fixture Operator"
			};
		},
		/**
		 * Gets contract.
		 */
		getContract() {
			return {};
		},
		/**
		 * Gets helper log entries.
		 */
		getHelperLogEntries() {
			return [];
		}
	});

	assert.match(html, /socket\.io\/socket\.io\.js/);
	assert.match(html, /href="\/animate\.css\?v=/);
	assert.match(html, /href="\/__harness\/styles\/magicmirror-stage\.css\?v=/);
	assert.match(html, /class="harness-stage-page"/);
	assert.match(html, /data-module-shell="true"/);
	assert.match(html, /data-position="middle_center"/);
	assert.match(html, /id="module-content"/);
	assert.match(html, /generated\/runtime\/stage-bridge\.js/);
	assert.match(
		html,
		/<script src="\/modules\/MMM-TestModule\/MMM-TestModule\.js\?v=/
	);
});

test("createStagePage renders the disabled viewport state without loading the module entry", () => {
	const html = createStagePage({
		/**
		 * Gets available languages.
		 */
		getAvailableLanguages() {
			return [{ code: "en", label: "English" }];
		},
		/**
		 * Gets harness config.
		 */
		getHarnessConfig() {
			return {
				moduleName: "MMM-TestModule",
				moduleEntry: "MMM-TestModule.js",
				moduleIdentifier: "MMM-TestModule_sandbox",
				header: false,
				hiddenOnStartup: false,
				language: "en",
				locale: "en-US"
			};
		},
		/**
		 * Gets module config.
		 */
		getModuleConfig() {
			return {
				disabled: true,
				config: {
					operatorName: "Fixture Operator"
				}
			};
		},
		/**
		 * Gets contract.
		 */
		getContract() {
			return {};
		},
		/**
		 * Gets helper log entries.
		 */
		getHelperLogEntries() {
			return [];
		}
	});

	assert.match(html, /Module disabled/);
	assert.doesNotMatch(
		html,
		/<script src="\/modules\/MMM-TestModule\/MMM-TestModule\.js"/
	);
});

test("createHtmlPage skips the optional shell bundle when it is not built yet", () => {
	const originalExistsSync = fs.existsSync;
	const shellBundleSuffix = path.join("client", "generated", "shell-app.js");

	/**
	 * Internal helper for exists sync.
	 */
	fs.existsSync = (targetPath) => {
		if (String(targetPath).endsWith(shellBundleSuffix)) {
			return false;
		}
		return originalExistsSync(targetPath);
	};

	try {
		const html = createHtmlPage({
			watchEnabled: true,
			/**
			 * Gets available languages.
			 */
			getAvailableLanguages() {
				return [{ code: "en", label: "English" }];
			},
			/**
			 * Gets harness config.
			 */
			getHarnessConfig() {
				return {
					moduleName: "MMM-TestModule",
					moduleEntry: "MMM-TestModule.js",
					moduleIdentifier: "MMM-TestModule_sandbox",
					header: false,
					hiddenOnStartup: false,
					language: "en",
					locale: "en-US"
				};
			},
			/**
			 * Gets module config.
			 */
			getModuleConfig() {
				return {
					operatorName: "Fixture Operator"
				};
			},
			/**
			 * Gets contract.
			 */
			getContract() {
				return {};
			},
			/**
			 * Gets helper log entries.
			 */
			getHelperLogEntries() {
				return [];
			}
		});

		assert.doesNotMatch(html, /\/__harness\/generated\/shell-app\.js/);
	} finally {
		fs.existsSync = originalExistsSync;
	}
});
