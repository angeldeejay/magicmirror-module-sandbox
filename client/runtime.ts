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
					core.publishStageReady();
				}
			})
			.catch((error) => {
				console.error("[module-sandbox] boot failed", error);
				const contentEl = document.getElementById("module-content");
				if (contentEl) {
					contentEl.textContent = error.message;
				}
			});
	});
})(window);
