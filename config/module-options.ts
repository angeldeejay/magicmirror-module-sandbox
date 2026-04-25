/**
 * Supported module-envelope options and normalization helpers for sandbox config editing.
 */

type JsonObject = Record<string, unknown>;
type ModuleOptionValue = string | boolean | JsonObject;
type ModuleConfigOptions = {
	defaultConfigDeepMerge?: boolean;
};
type ModuleConfigEnvelope = {
	position: string;
	classes: string;
	header: string | false;
	animateIn: string;
	animateOut: string;
	hiddenOnStartup: boolean;
	disabled: boolean;
	configDeepMerge: boolean;
	config: JsonObject;
};
type ModuleConfigUiMetadata = {
	positions: string[];
	animateInOptions: string[];
	animateOutOptions: string[];
	editableKeys: string[];
	internalKeys: string[];
};

export const MODULE_POSITION_OPTIONS: string[] = [
	"top_bar",
	"top_left",
	"top_center",
	"top_right",
	"upper_third",
	"middle_center",
	"lower_third",
	"bottom_left",
	"bottom_center",
	"bottom_right",
	"bottom_bar",
	"fullscreen_above",
	"fullscreen_below"
];

export const MODULE_ANIMATE_IN_OPTIONS: string[] = [
	"",
	"bounce",
	"flash",
	"pulse",
	"rubberBand",
	"shakeX",
	"shakeY",
	"headShake",
	"swing",
	"tada",
	"wobble",
	"jello",
	"heartBeat",
	"backInDown",
	"backInLeft",
	"backInRight",
	"backInUp",
	"bounceIn",
	"bounceInDown",
	"bounceInLeft",
	"bounceInRight",
	"bounceInUp",
	"fadeIn",
	"fadeInDown",
	"fadeInDownBig",
	"fadeInLeft",
	"fadeInLeftBig",
	"fadeInRight",
	"fadeInRightBig",
	"fadeInUp",
	"fadeInUpBig",
	"fadeInTopLeft",
	"fadeInTopRight",
	"fadeInBottomLeft",
	"fadeInBottomRight",
	"flip",
	"flipInX",
	"flipInY",
	"lightSpeedInRight",
	"lightSpeedInLeft",
	"rotateIn",
	"rotateInDownLeft",
	"rotateInDownRight",
	"rotateInUpLeft",
	"rotateInUpRight",
	"jackInTheBox",
	"rollIn",
	"zoomIn",
	"zoomInDown",
	"zoomInLeft",
	"zoomInRight",
	"zoomInUp",
	"slideInDown",
	"slideInLeft",
	"slideInRight",
	"slideInUp"
];

export const MODULE_ANIMATE_OUT_OPTIONS: string[] = [
	"",
	"backOutDown",
	"backOutLeft",
	"backOutRight",
	"backOutUp",
	"bounceOut",
	"bounceOutDown",
	"bounceOutLeft",
	"bounceOutRight",
	"bounceOutUp",
	"fadeOut",
	"fadeOutDown",
	"fadeOutDownBig",
	"fadeOutLeft",
	"fadeOutLeftBig",
	"fadeOutRight",
	"fadeOutRightBig",
	"fadeOutUp",
	"fadeOutUpBig",
	"fadeOutTopLeft",
	"fadeOutTopRight",
	"fadeOutBottomRight",
	"fadeOutBottomLeft",
	"flipOutX",
	"flipOutY",
	"lightSpeedOutRight",
	"lightSpeedOutLeft",
	"rotateOut",
	"rotateOutDownLeft",
	"rotateOutDownRight",
	"rotateOutUpLeft",
	"rotateOutUpRight",
	"hinge",
	"rollOut",
	"zoomOut",
	"zoomOutDown",
	"zoomOutLeft",
	"zoomOutRight",
	"zoomOutUp",
	"slideOutDown",
	"slideOutLeft",
	"slideOutRight",
	"slideOutUp"
];

export const EDITABLE_MODULE_OPTION_KEYS: string[] = [
	"position",
	"classes",
	"header",
	"animateIn",
	"animateOut",
	"hiddenOnStartup",
	"disabled",
	"config"
];
export const INTERNAL_MODULE_OPTION_KEYS: string[] = ["configDeepMerge"];
export const SUPPORTED_MODULE_OPTION_KEYS: string[] =
	EDITABLE_MODULE_OPTION_KEYS.concat(INTERNAL_MODULE_OPTION_KEYS);

/**
 * Determines whether plain object.
 */
function isPlainObject(value: unknown): value is JsonObject {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * Determines whether own.
 */
function hasOwn(target: object, key: string): boolean {
	return Object.prototype.hasOwnProperty.call(target, key);
}

/**
 * Normalizes string.
 */
function normalizeString(value: unknown): string {
	return typeof value === "string" ? value.trim() : "";
}

/**
 * Determines whether envelope candidate.
 */
function isEnvelopeCandidate(value: unknown): value is JsonObject {
	if (!isPlainObject(value)) {
		return false;
	}

	const keys = Object.keys(value);
	return (
		keys.length === 0 ||
		hasOwn(value, "config") ||
		keys.every((key) => {
			return (
				SUPPORTED_MODULE_OPTION_KEYS.includes(key) || key === "module"
			);
		})
	);
}

/**
 * Clones json object.
 */
function cloneJsonObject(value: JsonObject): JsonObject {
	return JSON.parse(JSON.stringify(value)) as JsonObject;
}

/**
 * Creates default module config.
 */
export function createDefaultModuleConfig(
	options: ModuleConfigOptions = {}
): ModuleConfigEnvelope {
	return {
		position: "middle_center",
		classes: "",
		header: "",
		animateIn: "",
		animateOut: "",
		hiddenOnStartup: false,
		disabled: false,
		configDeepMerge: Boolean(options.defaultConfigDeepMerge),
		config: {}
	};
}

/**
 * Normalizes module config.
 */
export function normalizeModuleConfig(
	value: unknown,
	options: ModuleConfigOptions = {}
): ModuleConfigEnvelope {
	if (!isPlainObject(value)) {
		throw new TypeError("Module config must be a JSON object.");
	}

	const source = isEnvelopeCandidate(value) ? value : { config: value };
	const defaults = createDefaultModuleConfig(options);
	const normalized: ModuleConfigEnvelope = { ...defaults };
	const unsupportedKeys = Object.keys(source).filter((key) => {
		return !SUPPORTED_MODULE_OPTION_KEYS.includes(key) && key !== "module";
	});

	if (hasOwn(source, "module")) {
		throw new RangeError(
			"The `module` field is not editable in the sandbox."
		);
	}
	if (unsupportedKeys.length > 0) {
		throw new RangeError(
			`Unsupported module config option(s): ${unsupportedKeys.join(", ")}`
		);
	}

	if (hasOwn(source, "position")) {
		const position = normalizeString(source.position);
		if (!position) {
			throw new TypeError("Module position must be a non-empty string.");
		}
		if (!MODULE_POSITION_OPTIONS.includes(position)) {
			throw new RangeError(`Unsupported module position: ${position}`);
		}
		normalized.position = position;
	}

	if (hasOwn(source, "classes")) {
		if (typeof source.classes !== "string") {
			throw new TypeError("Module classes must be a string.");
		}
		normalized.classes = normalizeString(source.classes);
	}

	if (hasOwn(source, "header")) {
		if (source.header !== false && typeof source.header !== "string") {
			throw new TypeError("Module header must be a string or false.");
		}
		normalized.header = source.header;
	}

	if (hasOwn(source, "animateIn")) {
		if (typeof source.animateIn !== "string") {
			throw new TypeError("Module animateIn must be a string.");
		}
		const animateIn = normalizeString(source.animateIn);
		if (!MODULE_ANIMATE_IN_OPTIONS.includes(animateIn)) {
			throw new RangeError(
				`Unsupported module animateIn value: ${animateIn}`
			);
		}
		normalized.animateIn = animateIn;
	}

	if (hasOwn(source, "animateOut")) {
		if (typeof source.animateOut !== "string") {
			throw new TypeError("Module animateOut must be a string.");
		}
		const animateOut = normalizeString(source.animateOut);
		if (!MODULE_ANIMATE_OUT_OPTIONS.includes(animateOut)) {
			throw new RangeError(
				`Unsupported module animateOut value: ${animateOut}`
			);
		}
		normalized.animateOut = animateOut;
	}

	if (hasOwn(source, "hiddenOnStartup")) {
		if (typeof source.hiddenOnStartup !== "boolean") {
			throw new TypeError("Module hiddenOnStartup must be a boolean.");
		}
		normalized.hiddenOnStartup = source.hiddenOnStartup;
	}

	if (hasOwn(source, "disabled")) {
		if (typeof source.disabled !== "boolean") {
			throw new TypeError("Module disabled must be a boolean.");
		}
		normalized.disabled = source.disabled;
	}

	if (hasOwn(source, "configDeepMerge")) {
		if (typeof source.configDeepMerge !== "boolean") {
			throw new TypeError("Module configDeepMerge must be a boolean.");
		}
		normalized.configDeepMerge = source.configDeepMerge;
	}

	if (hasOwn(source, "config")) {
		if (!isPlainObject(source.config)) {
			throw new TypeError("Module config must be a JSON object.");
		}
		normalized.config = cloneJsonObject(source.config);
	}

	return normalized;
}

/**
 * Gets module config ui metadata.
 */
export function getModuleConfigUiMetadata(): ModuleConfigUiMetadata {
	return {
		positions: MODULE_POSITION_OPTIONS.slice(),
		animateInOptions: MODULE_ANIMATE_IN_OPTIONS.slice(),
		animateOutOptions: MODULE_ANIMATE_OUT_OPTIONS.slice(),
		editableKeys: EDITABLE_MODULE_OPTION_KEYS.slice(),
		internalKeys: INTERNAL_MODULE_OPTION_KEYS.slice()
	};
}

export default {
	EDITABLE_MODULE_OPTION_KEYS,
	INTERNAL_MODULE_OPTION_KEYS,
	MODULE_ANIMATE_IN_OPTIONS,
	MODULE_ANIMATE_OUT_OPTIONS,
	MODULE_POSITION_OPTIONS,
	SUPPORTED_MODULE_OPTION_KEYS,
	createDefaultModuleConfig,
	getModuleConfigUiMetadata,
	normalizeModuleConfig
};
