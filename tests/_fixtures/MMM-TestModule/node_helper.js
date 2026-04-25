/**
 * Fixture `node_helper.js` used by sandbox integration tests.
 *
 * It provides a tiny ping/pong flow so the test suite can assert helper
 * startup, shutdown, logging, and websocket bridging.
 */
const NodeHelper = require("node_helper");
const Log = require("logger");

module.exports = NodeHelper.create({
	start() {
		Log.info("test module helper started");
	},

	stop() {
		Log.info("test module helper stopped");
	},

	socketNotificationReceived(notification, payload) {
		if (notification !== "TEST_MODULE_PING") {
			return;
		}

		const message =
			payload && typeof payload.message === "string"
				? payload.message
				: "empty";
		Log.info("test module helper received ping", message);
		this.sendSocketNotification("TEST_MODULE_PONG", {
			message
		});
	}
});
