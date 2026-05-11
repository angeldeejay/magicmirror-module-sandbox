/**
 * Shared shell-state and component prop types consumed by the Preact operator UI.
 */

import type {
	HarnessLanguageOption,
	HarnessModuleConfig,
	HarnessModuleConfigOptions,
	HarnessState
} from "./harness-state";

export type {
	HarnessLanguageOption,
	HarnessModuleConfig,
	HarnessModuleConfigOptions,
	HarnessState
};

/** Feature flags for the active MM core version — mirrors server MmCapabilities. */
export type MmCapabilities = {
	helperLoadedHook: boolean;
	helperStopHook: boolean;
	classExtendSystem: boolean;
	es6NodeHelper: boolean;
	httpFetcher: boolean;
	corsProxy: boolean;
	corsProxyEnabledByDefault: boolean;
	secretPlaceholder: boolean;
	hideConfigSecrets: boolean;
	getUserAgent: boolean;
	expressVersion: "4" | "5" | "unknown";
	defaultModulesDir: "/modules/default" | "/defaultmodules" | "unknown";
	configLoading: "filesystem" | "endpoint" | "unknown";
	configFunctions: boolean;
	socketNamespace: "name" | "/name";
};

export type MmVersionInfo = {
	key: string;
	displayVersion: string | null;
	installed: boolean;
	shimsBuilt: boolean;
	capabilities: MmCapabilities;
};

export type MmVersionState = {
	active: string | null;
	versions: MmVersionInfo[];
	capabilities: MmCapabilities | null;
	usingBuiltIn: boolean;
};

declare global {
	interface Window {
		__HARNESS__?: HarnessState;
	}
	interface WindowEventMap {
		"module-sandbox:mm-version-changed": CustomEvent<MmVersionState>;
	}
}
