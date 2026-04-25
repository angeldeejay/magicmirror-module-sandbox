/**
 * Shared renderers used by the sandbox debug panel.
 */
(function initModuleSandboxDebugPanelRenderers(globalScope) {
	const core = globalScope.__MICROCORE__;

	/**
	 * Parse the payload textarea from the notification form.
	 *
	 * @param {string} rawValue
	 * @returns {*}
	 */
	core.parseDebugPanelPayload = function parseDebugPanelPayload(rawValue) {
		const value = String(rawValue || "").trim();
		if (!value) {
			return null;
		}

		return JSON.parse(value);
	};

	/**
	 * Render an empty-state placeholder for one debug-panel log list.
	 *
	 * @param {HTMLElement} list
	 * @param {string} emptyMessage
	 * @returns {void}
	 */
	function renderEmptyState(list, emptyMessage) {
		const empty = document.createElement("div");
		empty.className = "notification-log-empty";
		empty.textContent = emptyMessage;
		list.appendChild(empty);
	}

	/**
	 * Build one reusable sidebar log item.
	 *
	 * @param {{
	 *  entry: object,
	 *  getTitle: Function,
	 *  getMeta: Function,
	 *  getPayload: Function,
	 *  metaClassName?: string
	 * }} options
	 * @returns {HTMLElement}
	 */
	core.createDebugPanelListItem = function createDebugPanelListItem({
		entry,
		getTitle,
		getMeta,
		getPayload,
		metaClassName
	}) {
		const item = document.createElement("div");
		item.className = "notification-log-item";

		const title = document.createElement("div");
		title.className = "notification-log-title";
		title.textContent = getTitle(entry);

		const meta = document.createElement("div");
		meta.className = metaClassName
			? `notification-log-meta ${metaClassName}`
			: "notification-log-meta";
		meta.textContent = getMeta(entry);

		const payload = document.createElement("pre");
		payload.className = "notification-log-payload";
		payload.textContent = getPayload(entry);

		item.appendChild(title);
		item.appendChild(meta);
		item.appendChild(payload);
		return item;
	};

	/**
	 * Replace a shared sidebar log list from a full entries snapshot.
	 *
	 * @param {{
	 *  listId: string,
	 *  entries: Array<object>,
	 *  emptyMessage: string,
	 *  getTitle: Function,
	 *  getMeta: Function,
	 *  getPayload: Function,
	 *  metaClassName?: string
	 * }} options
	 * @returns {void}
	 */
	core.renderDebugPanelList = function renderDebugPanelList({
		listId,
		entries,
		emptyMessage,
		getTitle,
		getMeta,
		getPayload,
		metaClassName
	}) {
		const list = document.getElementById(listId);
		if (!list) {
			return;
		}

		list.replaceChildren();

		if (!Array.isArray(entries) || entries.length === 0) {
			renderEmptyState(list, emptyMessage);
			return;
		}

		const fragment = document.createDocumentFragment();
		entries.forEach((entry) => {
			fragment.appendChild(
				core.createDebugPanelListItem({
					entry,
					getTitle,
					getMeta,
					getPayload,
					metaClassName
				})
			);
		});
		list.appendChild(fragment);
	};

	/**
	 * Prepend one new sidebar log item without re-rendering the full list.
	 *
	 * @param {{
	 *  listId: string,
	 *  entry: object,
	 *  emptyMessage: string,
	 *  maxEntries: number,
	 *  getTitle: Function,
	 *  getMeta: Function,
	 *  getPayload: Function,
	 *  metaClassName?: string
	 * }} options
	 * @returns {void}
	 */
	core.prependDebugPanelListItem = function prependDebugPanelListItem({
		listId,
		entry,
		emptyMessage,
		maxEntries,
		getTitle,
		getMeta,
		getPayload,
		metaClassName
	}) {
		const list = document.getElementById(listId);
		if (!list) {
			return;
		}

		if (!entry) {
			list.replaceChildren();
			renderEmptyState(list, emptyMessage);
			return;
		}

		if (
			list.firstElementChild &&
			list.firstElementChild.classList.contains("notification-log-empty")
		) {
			list.replaceChildren();
		}

		list.prepend(
			core.createDebugPanelListItem({
				entry,
				getTitle,
				getMeta,
				getPayload,
				metaClassName
			})
		);

		while (list.children.length > maxEntries) {
			list.removeChild(list.lastElementChild);
		}
	};

	/**
	 * Render the notification log into the sidebar debug panel.
	 *
	 * @param {Array<object>|object|undefined} detailOrEntries
	 * @returns {void}
	 */
	core.renderNotificationLog = function renderNotificationLog(
		detailOrEntries
	) {
		const detail =
			Array.isArray(detailOrEntries) || detailOrEntries == null
				? { entries: detailOrEntries }
				: detailOrEntries;
		const sharedOptions = {
			listId: "notification-log",
			emptyMessage: "No notifications yet.",
			maxEntries: core.maxNotificationLogEntries,
			/**
			 * Gets title.
			 */
			getTitle(entry) {
				return `${entry.notification} (${entry.origin})`;
			},
			/**
			 * Gets meta.
			 */
			getMeta(entry) {
				return `sender=${entry.sender || "none"} target=${
					entry.target || "broadcast"
				} recipients=${Array.isArray(entry.recipients) ? entry.recipients.length : 0}`;
			},
			/**
			 * Gets payload.
			 */
			getPayload(entry) {
				return entry.payload == null
					? "null"
					: JSON.stringify(entry.payload, null, 2);
			}
		};

		if (detail.entry) {
			core.prependDebugPanelListItem({
				entry: detail.entry,
				...sharedOptions
			});
			return;
		}

		core.renderDebugPanelList({
			entries: detail.entries,
			...sharedOptions
		});
	};

	/**
	 * Render the websocket traffic log into the sidebar.
	 *
	 * @param {Array<object>|object|undefined} detailOrEntries
	 * @returns {void}
	 */
	core.renderWebsocketLog = function renderWebsocketLog(detailOrEntries) {
		const detail =
			Array.isArray(detailOrEntries) || detailOrEntries == null
				? { entries: detailOrEntries }
				: detailOrEntries;
		const sharedOptions = {
			listId: "websocket-log",
			emptyMessage: "No websocket traffic yet.",
			maxEntries: core.maxWebsocketLogEntries,
			/**
			 * Gets title.
			 */
			getTitle(entry) {
				return `${entry.notification} (${entry.direction})`;
			},
			/**
			 * Gets meta.
			 */
			getMeta(entry) {
				return entry.timestamp || "unknown time";
			},
			/**
			 * Gets payload.
			 */
			getPayload(entry) {
				return entry.payload == null
					? "null"
					: JSON.stringify(entry.payload, null, 2);
			}
		};

		if (detail.entry) {
			core.prependDebugPanelListItem({
				entry: detail.entry,
				...sharedOptions
			});
			return;
		}

		core.renderDebugPanelList({
			entries: detail.entries,
			...sharedOptions
		});
	};

	/**
	 * Render one generic log stream into the sidebar.
	 *
	 * @param {Array<object>|object|undefined} detailOrEntries
	 * @param {string} listId
	 * @param {string} emptyMessage
	 * @returns {void}
	 */
	core.renderDebugLog = function renderDebugLog(
		detailOrEntries,
		listId,
		emptyMessage
	) {
		const detail =
			Array.isArray(detailOrEntries) || detailOrEntries == null
				? { entries: detailOrEntries }
				: detailOrEntries;
		const sharedOptions = {
			listId,
			emptyMessage,
			maxEntries: detail.maxEntries || 200,
			metaClassName: "debug-log-meta",
			/**
			 * Gets title.
			 */
			getTitle(entry) {
				return String(entry.method || "log").toUpperCase();
			},
			/**
			 * Gets meta.
			 */
			getMeta(entry) {
				return entry.timestamp || "unknown time";
			},
			/**
			 * Gets payload.
			 */
			getPayload(entry) {
				return Array.isArray(entry.args)
					? entry.args
							.map((value) =>
								typeof value === "string"
									? value
									: JSON.stringify(value, null, 2)
							)
							.join("\n")
					: "";
			}
		};

		if (detail.entry) {
			core.prependDebugPanelListItem({
				entry: detail.entry,
				...sharedOptions
			});
			return;
		}

		core.renderDebugPanelList({
			entries: detail.entries,
			...sharedOptions
		});
	};
})(window);
