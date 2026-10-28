/**
 * Contract for the sandbox state the server embeds in the stage injection
 * block, read by the stage observer before any core script runs.
 *
 * The observer cannot read the module position from the core's own
 * `/config/` fetch without altering core input, so the server carries the
 * two fields the presentation layer needs in an inline JSON element.
 *
 * The server validates it with Zod when it serializes
 * (`server/stage/stage-state-schema.ts`). The observer bundle is injected
 * into every stage load and Zod would multiply its size, so this file stays
 * dependency-free and the browser side checks the same shape with a guard;
 * the unit tests keep the two in sync.
 */

/** Id of the inline `<script type="application/json">` element. */
export const STAGE_STATE_ELEMENT_ID = "module-sandbox-stage-state";

export type StageState = {
	/** Configured module position, or "" when the module has none. */
	position: string;
	/** Whether the saved module config disables the module. */
	disabled: boolean;
};

/**
 * Parses the inline element text (browser side). Throws when it does not
 * match the contract.
 */
export function parseStageState(text: string): StageState {
	const value: unknown = JSON.parse(text);
	if (
		!value ||
		typeof value !== "object" ||
		Array.isArray(value) ||
		Object.keys(value).sort().join(",") !== "disabled,position" ||
		typeof (value as StageState).position !== "string" ||
		typeof (value as StageState).disabled !== "boolean"
	) {
		throw new TypeError(`Invalid sandbox stage state: ${text}`);
	}
	return value as StageState;
}
