/**
 * Default persisted module and runtime config payloads for test fixtures.
 */
/**
 * Default persisted module and runtime config payloads for test fixtures.
 */
export const defaultPersistedModuleConfig = {
	position: "middle_center",
	classes: "",
	header: "",
	animateIn: "pulse",
	animateOut: "bounceOutRight",
	hiddenOnStartup: false,
	disabled: false,
	configDeepMerge: true,
	config: {
		operatorName: "Sandbox Developer",
		pingMessage: "fixture ping",
		badgeLabel: "Styled from test module",
		nested: {
			overrideFlag: "from config"
		}
	}
};

export const defaultPersistedRuntimeConfig = {
	language: "es",
	locale: "es"
};

/**
 * Deep-clone JSON-compatible fixture data.
 *
 * @template T
 * @param {T} value
 * @returns {T}
 */
export function cloneJson(value) {
	return JSON.parse(JSON.stringify(value));
}
