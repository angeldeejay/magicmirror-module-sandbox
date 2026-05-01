/**
 * Sidebar chrome that hosts the sandbox tool domains and active-panel state.
 */

import type { HarnessState } from "../types";
import { AboutDomain } from "./sidebar/AboutDomain";
import { ConfigDomain } from "./sidebar/ConfigDomain";
import { DebugDomain } from "./sidebar/DebugDomain";
import { NotificationsDomain } from "./sidebar/NotificationsDomain";
import { QualityDomain } from "./sidebar/QualityDomain";
import { RuntimeDomain } from "./sidebar/RuntimeDomain";

type SidebarProps = {
	harness: HarnessState;
};

/**
 * Internal helper for sidebar.
 */
export function Sidebar({ harness }: SidebarProps) {
	return (
		<aside id="harness-sidebar" class="harness-sidebar" aria-hidden="true">
			<div class="harness-sidebar-scroll">
				<div class="harness-sidebar-header">
					<div>
						<h2 id="sidebar-title" class="harness-sidebar-title">
							Tools
						</h2>
						<p id="sidebar-copy" class="harness-sidebar-copy">
							Open a domain from the topbar to inspect or control
							the sandbox.
						</p>
					</div>
					<button
						id="sidebar-close"
						class="harness-sidebar-close"
						type="button"
						aria-label="Close panel"
					>
						<i class="fa-solid fa-xmark" aria-hidden="true" />
						Close
					</button>
				</div>

				<RuntimeDomain harness={harness} />
				<ConfigDomain harness={harness} />
				<NotificationsDomain />
				<DebugDomain />
				<QualityDomain />
				<AboutDomain />
			</div>
		</aside>
	);
}
