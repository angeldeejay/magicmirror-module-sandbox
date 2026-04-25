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

declare global {
	interface Window {
		__HARNESS__?: HarnessState;
	}
}
