/**
 * Zod schemas for the sandbox shell bootstrap and mutable harness state.
 */
import { z } from "zod";

const harnessLanguageOptionSchema = z.object({
	code: z.string(),
	label: z.string()
});

const harnessModuleConfigOptionsSchema = z.object({
	positions: z.array(z.string()).default([]),
	animateInOptions: z.array(z.string()).default([]),
	animateOutOptions: z.array(z.string()).default([])
});

const harnessModuleConfigSchema = z
	.object({
		position: z.string().optional(),
		header: z.union([z.string(), z.literal(false)]).optional(),
		classes: z.string().optional(),
		animateIn: z.string().optional(),
		animateOut: z.string().optional(),
		hiddenOnStartup: z.boolean().optional(),
		disabled: z.boolean().optional()
	})
	.passthrough();

export const harnessStateSchema = z
	.object({
		moduleName: z.string().optional(),
		language: z.string().optional(),
		locale: z.string().optional(),
		sandboxUrl: z.string().optional(),
		watchEnabled: z.boolean().optional(),
		sandboxVersion: z.string().optional(),
		moduleVersion: z.string().optional(),
		mmVersion: z.string().optional(),
		availableLanguages: z.array(harnessLanguageOptionSchema).default([]),
		moduleConfigOptions: harnessModuleConfigOptionsSchema.default({
			positions: [],
			animateInOptions: [],
			animateOutOptions: []
		}),
		moduleConfig: harnessModuleConfigSchema.default({})
	})
	.passthrough();

export type HarnessLanguageOption = z.infer<typeof harnessLanguageOptionSchema>;
export type HarnessModuleConfigOptions = z.infer<
	typeof harnessModuleConfigOptionsSchema
>;
export type HarnessModuleConfig = z.infer<typeof harnessModuleConfigSchema>;
export type HarnessState = z.infer<typeof harnessStateSchema>;

/**
 * Parse the server-bootstrapped shell state at the new Preact boundary.
 *
 * This keeps the V2 shell migration honest without forcing the legacy runtime
 * modules to move to TypeScript all at once.
 *
 * @param {unknown} rawHarnessState
 * @returns {HarnessState}
 */
export function parseHarnessState(rawHarnessState: unknown): HarnessState {
	return harnessStateSchema.parse(rawHarnessState ?? {});
}
