/**
 * Browser entrypoint for mounting the persistent sandbox shell application.
 */

import { hydrate, render } from "preact";
import type { VNode } from "preact";
import { Footer } from "./components/Footer";
import { Sidebar } from "./components/Sidebar";
import { Topbar } from "./components/Topbar";
import { parseHarnessState } from "./harness-state";

const harness = parseHarnessState(window.__HARNESS__);

/**
 * Internal helper for mount.
 */
function mount(component: VNode, containerId: string) {
	const container = document.getElementById(containerId);
	if (!container) {
		return;
	}

	if (container.hasChildNodes()) {
		hydrate(component, container);
		return;
	}

	render(component, container);
}

mount(<Topbar harness={harness} />, "harness-topbar-root");
mount(<Sidebar harness={harness} />, "harness-sidebar-root");
mount(<Footer />, "harness-footer-root");
