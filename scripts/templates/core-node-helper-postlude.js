const __moduleSandboxCoreNodeHelper = module.exports;

if (
	__moduleSandboxCoreNodeHelper &&
	__moduleSandboxCoreNodeHelper.prototype &&
	!Object.prototype.hasOwnProperty.call(
		__moduleSandboxCoreNodeHelper,
		"__moduleSandboxSocketPatched"
	)
) {
	// The sandbox restarts helpers in-process against the same socket.io
	// server, so the module namespace outlives each helper instance. Drop the
	// previous instance's connection listener, then defer to the core
	// setSocketIO so socket semantics (including secret restoration) always
	// match the active MagicMirror version.
	const __moduleSandboxCoreSetSocketIO =
		__moduleSandboxCoreNodeHelper.prototype.setSocketIO;

	__moduleSandboxCoreNodeHelper.prototype.setSocketIO = function (io) {
		const namespace = io.of(`/${this.name}`);
		if (namespace && typeof namespace.removeAllListeners === "function") {
			namespace.removeAllListeners("connection");
		}
		return __moduleSandboxCoreSetSocketIO.call(this, io);
	};

	Object.defineProperty(
		__moduleSandboxCoreNodeHelper,
		"__moduleSandboxSocketPatched",
		{
			value: true,
			configurable: false,
			enumerable: false,
			writable: false
		}
	);
}
