/**
 * Sidebar domain and tab controller used by the sandbox debug panel.
 */
(function initModuleSandboxDebugPanelSidebar(globalScope) {
	const core = globalScope.__MICROCORE__;

	const sidebarDomains = {
		runtime: {
			title: "Runtime",
			copy: "Lifecycle controls and current module state."
		},
		config: {
			title: "Config",
			copy: "Tune general sandbox/module options or edit the mounted module config block."
		},
		quality: {
			title: "Quality",
			copy: "Module quality analysis against MagicMirror 3rd-party criteria."
		},
		notifications: {
			title: "Notifications",
			copy: "Emit and inspect frontend MagicMirror notifications."
		},
		debug: {
			title: "Debug",
			copy: "Host diagnostics, browser console output, and helper logs."
		},
		about: {
			title: "About",
			copy: "Product context, credits, and identity."
		}
	};

	const defaultTabs = {
		config: "general",
		runtime: "lifecycle",
		notifications: "emit",
		debug: "helper-log"
	};

	/**
	 * Create the sidebar open/close + tab state controller.
	 *
	 * @param {{
	 *  bodyEl: HTMLElement|null,
	 *  sidebarEl: HTMLElement|null,
	 *  sidebarTitleEl: HTMLElement|null,
	 *  sidebarCopyEl: HTMLElement|null,
	 *  menuButtons: Array<HTMLElement>,
	 *  domainPanels: Array<HTMLElement>,
	 *  tabButtons: Array<HTMLElement>,
	 *  tabPanels: Array<HTMLElement>
	 * }} elements
	 * @returns {{setActiveDomain: Function, setActiveTab: Function}}
	 */
	core.createDebugSidebarController = function createDebugSidebarController(
		elements
	) {
		const activeTabs = Object.assign({}, defaultTabs);

		/**
		 * Activate one tab inside the currently selected sidebar domain.
		 *
		 * @param {string} domain
		 * @param {string} tab
		 * @returns {void}
		 */
		function setActiveTab(domain, tab) {
			if (!domain) {
				return;
			}

			const nextTab =
				tab || activeTabs[domain] || defaultTabs[domain] || "";
			activeTabs[domain] = nextTab;

			elements.tabButtons.forEach((button) => {
				if (button.dataset.domain !== domain) {
					return;
				}

				const active = button.dataset.tab === nextTab;
				button.dataset.active = active ? "true" : "false";
				button.setAttribute("aria-selected", active ? "true" : "false");
			});

			elements.tabPanels.forEach((panel) => {
				if (panel.dataset.domain !== domain) {
					return;
				}

				panel.dataset.active =
					panel.dataset.tabPanel === nextTab ? "true" : "false";
			});
		}

		/**
		 * Open or close the sidebar for one top-level domain.
		 *
		 * @param {string|null} domain
		 * @returns {void}
		 */
		function setActiveDomain(domain) {
			const domainMeta = domain ? sidebarDomains[domain] : null;
			const isOpen = Boolean(domainMeta);

			if (elements.bodyEl) {
				elements.bodyEl.dataset.sidebarOpen = isOpen ? "true" : "false";
			}
			if (elements.sidebarEl) {
				elements.sidebarEl.setAttribute(
					"aria-hidden",
					isOpen ? "false" : "true"
				);
			}
			if (elements.sidebarTitleEl) {
				elements.sidebarTitleEl.textContent = domainMeta
					? domainMeta.title
					: "Tools";
			}
			if (elements.sidebarCopyEl) {
				elements.sidebarCopyEl.textContent = domainMeta
					? domainMeta.copy
					: "Open a domain from the topbar to inspect or control the sandbox.";
			}

			elements.menuButtons.forEach((button) => {
				const active = button.dataset.domain === domain;
				button.dataset.active = active ? "true" : "false";
				button.setAttribute("aria-expanded", active ? "true" : "false");
			});

			elements.domainPanels.forEach((panel) => {
				panel.dataset.active =
					panel.dataset.domain === domain ? "true" : "false";
			});

			if (domainMeta) {
				setActiveTab(domain, activeTabs[domain]);
			}
		}

		return {
			setActiveDomain,
			setActiveTab
		};
	};
})(window);
