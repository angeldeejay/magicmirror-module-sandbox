/**
 * Zod validation of the sandbox stage state the server embeds in the stage
 * injection block. The shape is defined in `config/stage-state.ts`, shared
 * with the browser observer.
 */
import { z } from "zod";
import type { StageState } from "../../config/stage-state.ts";

export const stageStateSchema = z.strictObject({
	position: z.string(),
	disabled: z.boolean()
}) satisfies z.ZodType<StageState>;

/**
 * Serializes the state for an inline script element. `<` is escaped so no
 * value can close the element early.
 */
export function serializeStageState(state: StageState): string {
	return JSON.stringify(stageStateSchema.parse(state)).replace(
		/</g,
		"\\u003c"
	);
}
