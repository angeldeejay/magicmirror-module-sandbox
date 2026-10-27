/**
 * First step of the stage observer: reads the sandbox stage state, sets the
 * document attributes the isolation stylesheet keys on, and installs the
 * `globalThis.__MICROCORE__` facade.
 *
 * It is a separate module so `index.ts` can import it before
 * `client/runtime/stage-bridge.ts`, which reads the facade when it evaluates.
 */
import {
	parseStageState,
	STAGE_STATE_ELEMENT_ID,
	type StageState
} from "../../config/stage-state.ts";
import { createStageFacade } from "./facade.ts";

export type ObserverScope = Window & {
	__MICROCORE__?: unknown;
	__moduleSandboxModule?: unknown;
};

/**
 * Reads the stage state the server embedded right before the observer.
 */
function readStageState(): StageState | null {
	const element = document.getElementById(STAGE_STATE_ELEMENT_ID);
	if (!element) {
		console.error(
			`[module-sandbox] stage state element #${STAGE_STATE_ELEMENT_ID} is missing`
		);
		return null;
	}
	try {
		return parseStageState(element.textContent ?? "");
	} catch (error) {
		console.error("[module-sandbox] invalid stage state", error);
		return null;
	}
}

export const scope = window as ObserverScope;

const root = document.documentElement;
root.dataset.sandboxStage = "core";

const stageState = readStageState();
if (stageState) {
	root.dataset.sandboxPosition = stageState.position;
	root.dataset.sandboxDisabled = String(stageState.disabled);
}

export const observer = createStageFacade(scope, {
	disabled: stageState?.disabled ?? false
});
scope.__MICROCORE__ = observer.core as unknown as SandboxCore;
