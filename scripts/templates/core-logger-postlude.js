const __moduleSandboxLogTarget = module.exports;
const __moduleSandboxLogMethods = __HELPER_LOG_METHODS__;
const __moduleSandboxWrapLoggerMethods = () => {
	if (!__moduleSandboxLogTarget || typeof __moduleSandboxLogTarget !== "object") {
		return;
	}
	for (const method of __moduleSandboxLogMethods) {
		if (
			typeof __moduleSandboxLogTarget[method] !== "function" ||
			__moduleSandboxLogTarget[method].__moduleSandboxWrappedMethod === true
		) {
			continue;
		}
		const original = __moduleSandboxLogTarget[method].bind(
			__moduleSandboxLogTarget
		);
		const wrapped = (...args) => {
			original(...args);
			globalThis.__MODULE_SANDBOX_LOGGER__?.recordHelperLog(method, args);
		};
		Object.defineProperty(wrapped, "__moduleSandboxWrappedMethod", {
			value: true,
			configurable: false,
			enumerable: false,
			writable: false
		});
		__moduleSandboxLogTarget[method] = wrapped;
	}
};

if (
	__moduleSandboxLogTarget &&
	typeof __moduleSandboxLogTarget === "object" &&
	!Object.prototype.hasOwnProperty.call(
		__moduleSandboxLogTarget,
		"__moduleSandboxSetLogLevelWrapped"
	)
) {
	__moduleSandboxWrapLoggerMethods();
	if (typeof __moduleSandboxLogTarget.setLogLevel === "function") {
		const originalSetLogLevel = __moduleSandboxLogTarget.setLogLevel.bind(
			__moduleSandboxLogTarget
		);
		const wrappedSetLogLevel = (...args) => {
			const result = originalSetLogLevel(...args);
			__moduleSandboxWrapLoggerMethods();
			return result;
		};
		Object.defineProperty(wrappedSetLogLevel, "__moduleSandboxWrappedMethod", {
			value: true,
			configurable: false,
			enumerable: false,
			writable: false
		});
		__moduleSandboxLogTarget.setLogLevel = wrappedSetLogLevel;
	}
	Object.defineProperty(__moduleSandboxLogTarget, "__moduleSandboxSetLogLevelWrapped", {
		value: true,
		configurable: false,
		enumerable: false,
		writable: false
	});
}
