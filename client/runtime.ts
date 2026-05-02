/**
 * Final browser bootstrap for the module sandbox runtime.
 *
 * The heavier logic lives in `client/runtime/*.js`; this file stays intentionally
 * tiny so it is obvious where the boot sequence starts.
 */
(function startHarnessRuntime(globalScope) {
	const core = globalScope.__MICROCORE__;

	globalScope.addEventListener("DOMContentLoaded", () => {
		core.boot()
			.then(() => {
				if (typeof core.publishStageReady === "function") {
					// bootComplete: true — the full boot() promise resolved.
					core.publishStageReady(true);
				}
			})
			.catch((error) => {
				console.error("[module-sandbox] boot failed", error);
				const contentEl = document.getElementById("module-content");
				if (contentEl) {
					contentEl.textContent = error.message;
				}
				// Notify the shell even on failure so waitForStageFrame never
				// hangs waiting for a stage that will never be ready.
				// bootComplete: true signals that the boot sequence finished
				// (even though it failed) so the shell can stop waiting.
				if (typeof core.publishStageReady === "function") {
					core.publishStageReady(true);
				}
			});
	});
})(window);
