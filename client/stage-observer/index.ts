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
 * 3. this body captures `MM` as the core provides it (see `watchCoreMM`:
 *    from 2.38 that can be after the document's `load`), wraps `console`
 *    before `js/logger.js` binds it into `Log`, and hooks the module
 *    instance once the core creates it.
 */
import { observer, scope } from "./setup.ts";
import "../runtime/stage-bridge.ts";
import {
	hookInstance,
	watchCoreMM,
	watchForModuleInstance
} from "./instance-hooks.ts";
import { hookConsole } from "./log-hooks.ts";

/**
 * 2.35-2.36 declare `MM` with a top-level `const` in a classic script: a
 * global lexical binding, not a `window` property. A free identifier read
 * resolves it there.
 */
declare const MM: unknown;

/**
 * Whether the page has loaded and the core has provided `MM`: a disabled
 * module boots once both hold.
 */
let pageLoaded = false;
let coreMMAvailable = false;

/**
 * A disabled module is never created, so DOM_OBJECTS_CREATED is never
 * observed. Its boot is complete once the page has loaded and the core's
 * `js/main.js` has run (it provides `MM` and starts `MM.init`), whichever comes
 * last. A core that never provides `MM` never completes its boot, exactly as
 * an enabled module whose core never sends DOM_OBJECTS_CREATED.
 */
function publishDisabledBootComplete(): void {
	if (
		pageLoaded &&
		coreMMAvailable &&
		!observer.core.moduleInstance &&
		observer.core.lifecycleState.disabled
	) {
		observer.publishBootComplete();
	}
}

/**
 * The core `MM` object: captured from `globalThis.MM = MM` (2.37+, possibly
 * after `load` from 2.38), or the global lexical binding (2.35-2.36).
 */
const resolveMM = watchCoreMM(
	scope,
	document,
	() => (typeof MM === "undefined" ? undefined : MM),
	() => {
		coreMMAvailable = true;
		publishDisabledBootComplete();
	}
);
// Before js/logger.js binds console methods into Log (see log-hooks.ts).
hookConsole(console, observer.recordConsole);

watchForModuleInstance(document, resolveMM, (instance) => {
	const unavailableHooks = hookInstance(instance, observer.instanceCallbacks);
	scope.__moduleSandboxModule = instance;
	observer.attachInstance(instance, unavailableHooks);
});

window.addEventListener("load", () => {
	pageLoaded = true;
	publishDisabledBootComplete();
});
