const __moduleSandboxCoreNodeHelper = module.exports;

if (
	__moduleSandboxCoreNodeHelper &&
	__moduleSandboxCoreNodeHelper.prototype &&
	!Object.prototype.hasOwnProperty.call(
		__moduleSandboxCoreNodeHelper,
		"__moduleSandboxSocketPatched"
	)
) {
	__moduleSandboxCoreNodeHelper.prototype.sendSocketNotification = function (
		notification,
		payload
	) {
		this.io.of(`/${this.name}`).emit(notification, payload);
	};

	__moduleSandboxCoreNodeHelper.prototype.setSocketIO = function (io) {
		this.io = io;
		Log.log(`Connecting socket for: ${this.name}`);
		const namespace = io.of(`/${this.name}`);
		if (typeof namespace.removeAllListeners === "function") {
			namespace.removeAllListeners("connection");
		}
		namespace.on("connection", (socket) => {
			socket.onAny((notification, payload) => {
				if (
					typeof config !== "undefined" &&
					config.hideConfigSecrets &&
					payload &&
					typeof payload === "object"
				) {
					try {
						const payloadStr = replaceSecretPlaceholder(
							JSON.stringify(payload)
						);
						this.socketNotificationReceived(
							notification,
							JSON.parse(payloadStr)
						);
					} catch (e) {
						Log.error("Error substituting variables in payload: ", e);
						this.socketNotificationReceived(notification, payload);
					}
				} else {
					this.socketNotificationReceived(notification, payload);
				}
			});
		});
	};

	Object.defineProperty(__moduleSandboxCoreNodeHelper, "__moduleSandboxSocketPatched", {
		value: true,
		configurable: false,
		enumerable: false,
		writable: false
	});
}
