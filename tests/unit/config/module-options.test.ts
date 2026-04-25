/**
 * Unit coverage for module config normalization and UI metadata helpers.
 */
import assert from "node:assert/strict";
import moduleOptionsModule from "../../../config/module-options.ts";

const {
	createDefaultModuleConfig,
	getModuleConfigUiMetadata,
	normalizeModuleConfig
} = moduleOptionsModule;

test("normalizeModuleConfig wraps legacy raw config into the supported envelope", () => {
	assert.deepEqual(
		normalizeModuleConfig(
			{
				operatorName: "Fixture Operator",
				pingMessage: "fixture ping"
			},
			{ defaultConfigDeepMerge: true }
		),
		{
			position: "middle_center",
			classes: "",
			header: "",
			animateIn: "",
			animateOut: "",
			hiddenOnStartup: false,
			disabled: false,
			configDeepMerge: true,
			config: {
				operatorName: "Fixture Operator",
				pingMessage: "fixture ping"
			}
		}
	);
});

test("normalizeModuleConfig trims and preserves all supported module options", () => {
	assert.deepEqual(
		normalizeModuleConfig({
			position: "bottom_left",
			classes: "  custom-shell highlight  ",
			header: "  Fixture header  ",
			animateIn: "fadeIn",
			animateOut: "fadeOut",
			hiddenOnStartup: true,
			disabled: true,
			configDeepMerge: false,
			config: {
				operatorName: "Fixture Operator"
			}
		}),
		{
			position: "bottom_left",
			classes: "custom-shell highlight",
			header: "  Fixture header  ",
			animateIn: "fadeIn",
			animateOut: "fadeOut",
			hiddenOnStartup: true,
			disabled: true,
			configDeepMerge: false,
			config: {
				operatorName: "Fixture Operator"
			}
		}
	);
});

test("normalizeModuleConfig preserves exact header semantics for false and whitespace", () => {
	assert.equal(
		normalizeModuleConfig({ header: false, config: {} }).header,
		false
	);
	assert.equal(normalizeModuleConfig({ header: "", config: {} }).header, "");
	assert.equal(
		normalizeModuleConfig({ header: "    ", config: {} }).header,
		"    "
	);
});

test("normalizeModuleConfig rejects unsupported fields and invalid types", () => {
	assert.throws(
		() => normalizeModuleConfig(null),
		/Module config must be a JSON object/
	);
	assert.throws(
		() => normalizeModuleConfig({ unsupported: true, config: {} }),
		/Unsupported module config option/
	);
	assert.throws(
		() => normalizeModuleConfig({ classes: true, config: {} }),
		/Module classes must be a string/
	);
	assert.throws(
		() => normalizeModuleConfig({ header: true, config: {} }),
		/Module header must be a string or false/
	);
	assert.throws(
		() => normalizeModuleConfig({ animateOut: true, config: {} }),
		/Module animateOut must be a string/
	);
	assert.throws(
		() => normalizeModuleConfig({ hiddenOnStartup: "yes", config: {} }),
		/Module hiddenOnStartup must be a boolean/
	);
	assert.throws(
		() => normalizeModuleConfig({ disabled: "yes", config: {} }),
		/Module disabled must be a boolean/
	);
	assert.throws(
		() => normalizeModuleConfig({ configDeepMerge: "yes", config: {} }),
		/Module configDeepMerge must be a boolean/
	);
	assert.throws(
		() => normalizeModuleConfig({ config: [] }),
		/Module config must be a JSON object/
	);
});

test("module-options metadata exposes stable defaults and UI option lists", () => {
	assert.equal(createDefaultModuleConfig().position, "middle_center");
	assert.equal(createDefaultModuleConfig().configDeepMerge, false);
	assert.equal(
		getModuleConfigUiMetadata().positions.includes("middle_center"),
		true
	);
	assert.equal(
		getModuleConfigUiMetadata().animateInOptions.includes("fadeIn"),
		true
	);
	assert.equal(
		getModuleConfigUiMetadata().animateOutOptions.includes("fadeOut"),
		true
	);
});
