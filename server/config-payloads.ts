/**
 * Zod-backed payload parsers for mutable sandbox config routes.
 */

import { z } from "zod";
import { ValidationError } from "./errors.ts";

type JsonObject = Record<string, unknown>;

const jsonObjectSchema = z.object({}).catchall(z.unknown());
const moduleConfigSaveBodySchema = z.object({
	moduleConfig: jsonObjectSchema,
	runtimeConfig: jsonObjectSchema
});

/**
 * Creates payload error.
 */
function createPayloadError(message: string): ValidationError {
	return new ValidationError(message);
}

/**
 * Parses config save body.
 */
export function parseConfigSaveBody(body: unknown): {
	moduleConfig: JsonObject;
	runtimeConfig: JsonObject;
} {
	const parsed = moduleConfigSaveBodySchema.safeParse(body);
	if (!parsed.success) {
		const firstIssue = parsed.error.issues[0];
		/* v8 ignore next */
		if (firstIssue && Array.isArray(firstIssue.path)) {
			if (firstIssue.path[0] === "moduleConfig") {
				throw createPayloadError(
					"Module config must be a JSON object."
				);
			}
			if (firstIssue.path[0] === "runtimeConfig") {
				throw createPayloadError(
					"Runtime config must be a JSON object."
				);
			}
		}
		throw createPayloadError(
			"Sandbox config payload must be a JSON object."
		);
	}

	return parsed.data;
}

/**
 * Parses module config body.
 */
export function parseModuleConfigBody(body: unknown): JsonObject {
	const parsed = jsonObjectSchema.safeParse(body);
	if (!parsed.success) {
		throw createPayloadError("Module config must be a JSON object.");
	}

	return parsed.data;
}

export default {
	parseConfigSaveBody,
	parseModuleConfigBody
};
