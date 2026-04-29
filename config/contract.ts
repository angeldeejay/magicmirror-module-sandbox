/**
 * Static sandbox contract metadata exposed to the shell and browser runtime.
 */

import {
	createMissingMountedModuleError,
	resolveActiveMountedModuleInfo
} from "../server/paths.ts";

/**
 * Creates contract.
 */
export function createContract() {
	const detectedModuleInfo = resolveActiveMountedModuleInfo();
	if (!detectedModuleInfo) {
		throw createMissingMountedModuleError();
	}

	return {
		moduleName: detectedModuleInfo.moduleName,
		supportedFrontendSurface: [
			"Module.register(moduleName, definition)",
			"module defaults + config merge",
			"module setData(data) / setConfig(config, deep)",
			"module configDeepMerge(...) helper",
			"module data.name / data.identifier / data.path / data.header / data.position / data.classes / data.hiddenOnStartup / data.disabled",
			"single-module config envelope: position / classes / header / animateIn / animateOut / hiddenOnStartup / disabled / config",
			"getScripts() sequential loading",
			"getStyles() stylesheet loading",
			"getTranslations() with MagicMirror-like language + fallback loading",
			"getTemplate() / getTemplateData() with browser-side Nunjucks rendering",
			"module nunjucksEnvironment() with MagicMirror-like WebLoader + translate filter",
			"global Translator with module/core/fallback lookup order",
			"translate(key, variables?) returning key when missing",
			"translate(key, defaultValue?) and translate(key, variables, defaultValue?) signatures matching MagicMirror behavior",
			"socket() wrapper with sendNotification() + setNotificationCallback()",
			"requiresVersion gate against sandbox mmVersion",
			"updateDom() number | object options plus no-op DOM reuse when content is unchanged",
			"MagicMirror-like startup order: start() -> ALL_MODULES_STARTED -> MODULE_DOM_CREATED -> DOM_OBJECTS_CREATED",
			"MODULE_DOM_UPDATED targeted notification after updateDom()",
			"sendNotification(notification, payload) frontend bus semantics",
			"notificationReceived(notification, payload, sender)",
			"show(speed, callback, options?) / hide(speed, callback, options?)",
			"suspend() / resume() lifecycle callbacks",
			"MM.getAvailableModulePositions",
			"sendSocketNotification(notification, payload)",
			"socketNotificationReceived(notification, payload)",
			"Log.debug/log/info/warn/error/group/groupCollapsed/groupEnd/time/timeEnd/timeStamp/setLogLevel",
			"global config.language",
			"global config.locale",
			"global config.basePath"
		],
		supportedBackendSurface: [
			"NodeHelper.create(definition)",
			"NodeHelper.checkFetchStatus(response)",
			"NodeHelper.checkFetchError(error)",
			"MagicMirror-compatible global.root_path for helper-side path-based requires into synced core js/http_fetcher.js and js/server_functions.js",
			"setName(name)",
			"setPath(path)",
			"setExpressApp(app)",
			"setSocketIO(io)",
			"sendSocketNotification(notification, payload)",
			"socketNotificationReceived(notification, payload)",
			"start()",
			"stop()",
			"core-coupled logger wrapper via require('logger')"
		],
		unsupportedMagicMirrorSurface: [
			"multi-module layout regions",
			"hide/show animation parity",
			"Electron runtime",
			"generic module compatibility beyond the mounted module under test"
		]
	};
}
