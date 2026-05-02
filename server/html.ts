/**
 * Eta-backed host and stage page rendering for the sandbox shell.
 */

import fs from "node:fs";
import * as path from "pathe";
import { fileURLToPath } from "node:url";
import { Eta } from "eta";
import {
	getModuleConfigUiMetadata,
	normalizeModuleConfig
} from "../config/module-options.ts";
import { fromOS } from "./paths.ts";

const currentFilePath = fromOS(
	/* v8 ignore next 3 */
	typeof __filename === "string"
		? __filename
		: fileURLToPath(import.meta.url)
);
const currentDirPath =
	/* v8 ignore next */
	typeof __dirname === "string" ? fromOS(__dirname) : path.dirname(currentFilePath);

export type HtmlPageOptions = {
	watchEnabled?: boolean;
	getAvailableLanguages: () => Array<Record<string, unknown>>;
	getHarnessConfig: () => {
		host?: string;
		port?: number;
		moduleName: string;
		moduleEntry: string;
		moduleIdentifier: string;
		configDeepMerge?: boolean;
		mmVersion?: string;
		header?: string | boolean;
		hiddenOnStartup?: boolean;
		language: string;
		locale?: string;
	};
	getModuleConfig: () => Record<string, unknown>;
	getContract: () => Record<string, unknown>;
	getHelperLogEntries: () => Array<Record<string, unknown>>;
};

const templateEngine = new Eta({
	cache: false,
	views: path.join(currentDirPath, "templates")
});

/**
 * Appends asset version.
 */
function appendAssetVersion(url: string, assetVersion: string): string {
	if (typeof url !== "string" || !url.trim()) {
		return url;
	}
	if (/^(https?:)?\/\//.test(url)) {
		return url;
	}
	if (!assetVersion) {
		return url;
	}

	return `${url}${url.includes("?") ? "&" : "?"}v=${encodeURIComponent(assetVersion)}`;
}

/**
 * Resolves shell app script url.
 */
function resolveShellAppScriptUrl(assetVersion: string): string | null {
	const shellBundlePath = path.join(
		currentDirPath,
		"..",
		"client",
		"generated",
		"shell-app.js"
	);
	if (!fs.existsSync(shellBundlePath)) {
		return null;
	}

	return appendAssetVersion(
		"/__harness/generated/shell-app.js",
		assetVersion
	);
}

/**
 * Builds runtime state.
 */
function buildRuntimeState({
	getAvailableLanguages,
	getHarnessConfig,
	getModuleConfig,
	getContract,
	getHelperLogEntries
}: Omit<HtmlPageOptions, "watchEnabled">) {
	const harnessConfig = getHarnessConfig();
	const moduleConfig = normalizeModuleConfig(getModuleConfig(), {
		defaultConfigDeepMerge: harnessConfig.configDeepMerge
	});
	const sandboxHost = harnessConfig.host || "127.0.0.1";
	const sandboxPort = Number(harnessConfig.port) || 3010;
	const sandboxUrl = `http://${sandboxHost}:${sandboxPort}`;
	const assetVersion = Date.now().toString(36);
	const runtimeState = {
		moduleName: harnessConfig.moduleName,
		moduleEntry: harnessConfig.moduleEntry,
		moduleIdentifier: harnessConfig.moduleIdentifier,
		modulePath: `modules/${harnessConfig.moduleName}/`,
		sandboxUrl,
		assetVersion,
		configDeepMerge: Boolean(harnessConfig.configDeepMerge),
		mmVersion: harnessConfig.mmVersion || "2.35.0",
		header: harnessConfig.header,
		hiddenOnStartup: Boolean(harnessConfig.hiddenOnStartup),
		language: harnessConfig.language,
		locale: harnessConfig.locale || harnessConfig.language,
		availableLanguages: getAvailableLanguages(),
		moduleConfig,
		moduleConfigOptions: getModuleConfigUiMetadata(),
		contract: getContract(),
		helperLogEntries: getHelperLogEntries()
	};

	return {
		runtimeState,
		sandboxUrl,
		assetVersion
	};
}

/**
 * Creates html page.
 */
function createHtmlPage({
	watchEnabled,
	getAvailableLanguages,
	getHarnessConfig,
	getModuleConfig,
	getContract,
	getHelperLogEntries
}: HtmlPageOptions): string {
	const { runtimeState, sandboxUrl, assetVersion } = buildRuntimeState({
		getAvailableLanguages,
		getHarnessConfig,
		getModuleConfig,
		getContract,
		getHelperLogEntries
	});
	const shellRuntimeState = Object.assign({}, runtimeState, {
		watchEnabled: Boolean(watchEnabled)
	});
	const runtimeScripts = [
		"/__harness/generated/runtime/shared.js",
		"/__harness/generated/runtime/notifications.js",
		"/__harness/generated/runtime/lifecycle.js",
		"/__harness/generated/runtime/debug-panel-renderers.js",
		"/__harness/generated/runtime/debug-panel-sidebar.js",
		"/__harness/generated/vendor/json-editor.js",
		"/__harness/generated/vendor/module-config-editor.js",
		"/__harness/generated/runtime/debug-panel.js",
		"/__harness/generated/runtime/quality-panel.js",
		"/__harness/generated/runtime/shell-stage.js"
	].map((src) => appendAssetVersion(src, assetVersion));
	const shellAppScriptUrl = resolveShellAppScriptUrl(assetVersion);

	return templateEngine.render("page.eta", {
		sandboxUrl,
		stageUrl: appendAssetVersion("/__harness/stage", assetVersion),
		runtimeStylesheetUrl: appendAssetVersion(
			"/__harness/styles/harness.css",
			assetVersion
		),
		runtimeScripts,
		shellAppScriptUrl,
		runtimeState: shellRuntimeState,
		runtimeStateJson: JSON.stringify(shellRuntimeState),
		socketScriptUrl: appendAssetVersion(
			"/socket.io/socket.io.js",
			assetVersion
		),
		watchEnabledLabel: watchEnabled ? "on" : "off"
	});
}

/**
 * Creates stage page.
 */
function createStagePage({
	getAvailableLanguages,
	getHarnessConfig,
	getModuleConfig,
	getContract,
	getHelperLogEntries
}: Omit<HtmlPageOptions, "watchEnabled">): string {
	const { runtimeState, assetVersion } = buildRuntimeState({
		getAvailableLanguages,
		getHarnessConfig,
		getModuleConfig,
		getContract,
		getHelperLogEntries
	});
	const runtimeScripts = [
		"/__harness/generated/runtime/shared.js",
		"/__harness/generated/runtime/notifications.js",
		"/__harness/generated/runtime/lifecycle.js",
		"/__harness/generated/runtime/assets.js",
		"/__harness/generated/runtime/translations.js",
		"/__harness/generated/vendor/nunjucks.js",
		"/__harness/generated/runtime/module.js",
		"/__harness/generated/runtime/stage-bridge.js",
		"/__harness/generated/runtime.js"
	].map((src) => appendAssetVersion(src, assetVersion));

	return templateEngine.render("stage-page.eta", {
		animationStylesheetUrl: appendAssetVersion(
			"/animate.css",
			assetVersion
		),
		magicMirrorStageStylesheetUrl: appendAssetVersion(
			"/__harness/styles/magicmirror-stage.css",
			assetVersion
		),
		runtimeStylesheetUrl: appendAssetVersion(
			"/__harness/styles/harness.css",
			assetVersion
		),
		runtimeScripts,
		runtimeState,
		runtimeStateJson: JSON.stringify(runtimeState),
		socketScriptUrl: appendAssetVersion(
			"/socket.io/socket.io.js",
			assetVersion
		)
	});
}

export { appendAssetVersion, createHtmlPage, createStagePage };

export default {
	appendAssetVersion,
	createHtmlPage,
	createStagePage
};
