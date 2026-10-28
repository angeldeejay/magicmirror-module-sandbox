/**
 * Transparent hooks on the browser `console` for the Console panel, so the
 * panel shows what the browser actually prints.
 *
 * The observer runs before the core's `js/logger.js`, whose `makeLogger`
 * binds `console.<method>.bind(console)`. Wrapping the console first means:
 * - `Log.*` calls flow through these wrappers;
 * - levels `Log.setLogLevel` disabled are replaced by no-ops in the logger
 *   and never reach the console, so they are not recorded;
 * - a module's direct `console.*` calls are recorded too, as the shell
 *   records its own (`client/runtime/shared.ts` `installConsoleCapture`).
 *
 * Each wrapper calls the native method first, with the same arguments and
 * `this`, then records; it returns the native result and stays synchronous.
 */

/** Console methods recorded, the same list as the shell records. */
export const RECORDED_CONSOLE_METHODS = [
	"log",
	"info",
	"warn",
	"error",
	"debug",
	"group",
	"groupCollapsed",
	"groupEnd",
	"time",
	"timeEnd",
	"timeStamp"
] as const;

/**
 * Wraps the recorded methods of `target` in place. Methods it lacks are left
 * alone. A failing recorder is reported through the native `console.error`
 * and never reaches the caller; calls made while recording are not recorded
 * again.
 */
export function hookConsole(
	target: Console,
	record: (method: string, args: unknown[]) => void
): void {
	const methods = target as unknown as Record<string, unknown>;
	const nativeError = methods.error;
	let recording = false;

	for (const method of RECORDED_CONSOLE_METHODS) {
		const original = methods[method];
		if (typeof original !== "function") {
			continue;
		}

		methods[method] = function observedConsoleMethod(
			this: unknown,
			...args: unknown[]
		) {
			const result = original.apply(this, args);
			if (!recording) {
				recording = true;
				try {
					record(method, args);
				} catch (error) {
					if (typeof nativeError === "function") {
						nativeError.call(
							target,
							"[module-sandbox] console hook failed",
							error
						);
					}
				} finally {
					recording = false;
				}
			}
			return result;
		};
	}
}
