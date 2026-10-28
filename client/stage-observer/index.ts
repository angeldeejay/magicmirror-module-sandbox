/**
 * Browser observer injected into the real MagicMirror core page served at
 * `/__stage/`. It loads as one classic script before any core script, so it
 * works for the classic (2.35-2.36), hybrid (2.37) and ESM (2.38+) cores.
 *
 * Boot order (ES module evaluation order, preserved by the bundle):
 * 1. `./setup.ts` sets the `data-sandbox-*` attributes and installs the
 *    `globalThis.__MICROCORE__` facade;
 * 2. `client/runtime/stage-bridge.ts` connects that facade to the shell over
 *    postMessage (it publishes stage-ready, which clears the shell loading
 *    overlay);
 * 3. this body wraps `console` before `js/logger.js` binds it into `Log`,
 *    captures `MM` as the core assigns it, and hooks the module instance
 *    once the core creates it.
 */
import { observer, scope } from "./setup.ts";
import "../runtime/stage-bridge.ts";
import {
	captureGlobalAssignment,
	hookInstance,
	watchForModuleInstance
} from "./instance-hooks.ts";
import { hookConsole } from "./log-hooks.ts";

/**
 * 2.35-2.36 declare `MM` with a top-level `const` in a classic script: a
 * global lexical binding, not a `window` property. A free identifier read
 * resolves it there.
 */
declare const MM: unknown;

let capturedMM: unknown;
const releaseMMCapture = captureGlobalAssignment(scope, "MM", (value) => {
	capturedMM = value;
});
// Before js/logger.js binds console methods into Log (see log-hooks.ts).
hookConsole(console, observer.recordConsole);

/**
 * The core `MM` object: captured from `globalThis.MM = MM` (2.37+), or the
 * global lexical binding (2.35-2.36).
 */
function resolveMM(): unknown {
	if (capturedMM) {
		return capturedMM;
	}
	return typeof MM === "undefined" ? undefined : MM;
}

watchForModuleInstance(document, resolveMM, (instance) => {
	const unavailableHooks = hookInstance(instance, observer.instanceCallbacks);
	scope.__moduleSandboxModule = instance;
	observer.attachInstance(instance, unavailableHooks);
});

document.addEventListener("DOMContentLoaded", () => {
	// Every core script has run by now. Drop the MM accessor when no version
	// assigned the property, so `window.MM` reads as it natively would.
	releaseMMCapture();
});

window.addEventListener("load", () => {
	// A disabled module is never created, so DOM_OBJECTS_CREATED is never
	// observed; the boot is complete once the page is.
	if (
		!observer.core.moduleInstance &&
		observer.core.lifecycleState.disabled
	) {
		observer.publishBootComplete();
	}
});
