/**
 * Unit coverage for Fastify/Zod request payload parsing at the sandbox config API boundary.
 */
import assert from "node:assert/strict";
import configPayloadsModule from "../../../server/config-payloads.ts";

const { parseConfigSaveBody, parseModuleConfigBody } = configPayloadsModule;

test("parseConfigSaveBody accepts the combined config save payload", () => {
	assert.deepEqual(
		parseConfigSaveBody({
			moduleConfig: {
				position: "middle_center"
			},
			runtimeConfig: {
				language: "en"
			}
		}),
		{
			moduleConfig: {
				position: "middle_center"
			},
			runtimeConfig: {
				language: "en"
			}
		}
	);
});

test("parseConfigSaveBody rejects non-object nested payloads with route-safe messages", () => {
	assert.throws(
		() =>
			parseConfigSaveBody({
				moduleConfig: [],
				runtimeConfig: {
					language: "en"
				}
			}),
		/Module config must be a JSON object/
	);
	assert.throws(
		() =>
			parseConfigSaveBody({
				moduleConfig: {},
				runtimeConfig: []
			}),
		/Runtime config must be a JSON object/
	);
});

test("parseModuleConfigBody rejects invalid module-only payloads", () => {
	assert.deepEqual(parseModuleConfigBody({ header: "hello" }), {
		header: "hello"
	});
	assert.throws(
		() => parseModuleConfigBody([]),
		/Module config must be a JSON object/
	);
});
