/**
 * Frontend notification bus for the sandbox runtime.
 *
 * This implements the most important piece of MagicMirror frontend semantics
 * still missing from the sandbox: `sendNotification(...)` and
 * `notificationReceived(...)` routing between mounted module instances.
 */
(function initModuleSandboxNotifications(globalScope) {
	const core = globalScope.__MICROCORE__;

	core.moduleInstances = new Map();
	core.notificationLog = [];
	core.maxNotificationLogEntries = 100;

	/**
	 * One frontend-notification event recorded for the Notifications sidebar.
	 *
	 * @typedef {object} NotificationLogEntry
	 * @property {string} timestamp
	 * @property {string} notification
	 * @property {*} payload
	 * @property {string} origin
	 * @property {string|null} sender
	 * @property {string|null} target
	 * @property {Array<string>} recipients
	 */

	/**
	 * Incremental or full notification-log update payload sent to the sidebar.
	 *
	 * @typedef {object} NotificationLogUpdateDetail
	 * @property {NotificationLogEntry} [entry] Newly prepended entry, when only one event changed.
	 * @property {Array<NotificationLogEntry>} [entries] Full snapshot, usually after clear/reset.
	 */

	/**
	 * Create a JSON-safe clone for notification payload logging and re-dispatch.
	 *
	 * @param {*} value
	 * @returns {*}
	 */
	core.clonePayload = function clonePayload(value) {
		if (value === undefined) {
			return undefined;
		}

		try {
			return JSON.parse(JSON.stringify(value));
		} catch (_error) {
			return String(value);
		}
	};

	/**
	 * Broadcast the current notification log to the debug panel.
	 *
	 * @param {NotificationLogUpdateDetail} [detail]
	 * @returns {void}
	 */
	core.publishNotificationLog = function publishNotificationLog(detail = {}) {
		globalScope.dispatchEvent(
			new CustomEvent("module-sandbox:notifications-updated", {
				detail
			})
		);
	};

	/**
	 * Append one notification event to the in-browser debug log.
	 *
	 * @param {NotificationLogEntry} entry
	 * @returns {void}
	 */
	core.recordNotification = function recordNotification(entry) {
		core.notificationLog.unshift(entry);
		if (core.notificationLog.length > core.maxNotificationLogEntries) {
			core.notificationLog.length = core.maxNotificationLogEntries;
		}
		core.publishNotificationLog({
			entry
		});
	};

	/**
	 * Register a mounted module instance as a notification recipient.
	 *
	 * @param {object} instance
	 * @returns {void}
	 */
	core.registerModuleInstance = function registerModuleInstance(instance) {
		if (!instance || !instance.identifier) {
			return;
		}

		core.moduleInstances.set(instance.identifier, instance);
	};

	/**
	 * Emit one frontend notification through the sandbox notification bus.
	 *
	 * @param {string} notification
	 * @param {*} payload
	 * @param {object|null} sender
	 * @param {{ origin?: string, senderLabel?: string, targetId?: string|null }} [meta]
	 * @returns {number}
	 */
	core.emitNotification = function emitNotification(
		notification,
		payload,
		sender,
		meta: {
			origin?: string;
			senderLabel?: string;
			targetId?: string | null;
		} = {}
	) {
		const recipients = [];
		const senderId = sender && sender.identifier ? sender.identifier : null;
		const safePayload = core.clonePayload(payload);
		const targetId = meta.targetId || null;

		core.moduleInstances.forEach((instance) => {
			if (
				!instance ||
				typeof instance.notificationReceived !== "function"
			) {
				return;
			}

			if (targetId && instance.identifier !== targetId) {
				return;
			}

			if (senderId && instance.identifier === senderId) {
				return;
			}

			instance.notificationReceived(
				notification,
				payload,
				sender || null
			);
			recipients.push(instance.identifier || instance.name || "unknown");
		});

		core.recordNotification({
			timestamp: new Date().toISOString(),
			notification,
			payload: safePayload,
			origin: meta.origin || "unknown",
			sender: meta.senderLabel || senderId || null,
			target: targetId,
			recipients
		});

		return recipients.length;
	};

	/**
	 * Clear the debug notification log.
	 *
	 * @returns {void}
	 */
	core.clearNotificationLog = function clearNotificationLog() {
		core.notificationLog = [];
		core.publishNotificationLog({
			entries: []
		});
	};
})(window);
