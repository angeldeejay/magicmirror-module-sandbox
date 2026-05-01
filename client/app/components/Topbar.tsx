/**
 * Topbar navigation for switching between sandbox tool domains.
 */

import type { HarnessState } from "../types";

type TopbarProps = {
	harness: HarnessState;
};

const menuItems = [
	{ id: "runtime", label: "Runtime" },
	{ id: "config", label: "Config" },
	{ id: "notifications", label: "Notifications" },
	{ id: "debug", label: "Debug" },
	{ id: "quality", label: "Quality" },
	{ id: "about", label: "About" }
] as const;

/**
 * Internal helper for topbar.
 */
export function Topbar({ harness }: TopbarProps) {
	return (
		<header class="harness-topbar">
			<div class="harness-product">
				<h1 class="harness-product-name">MagicMirror Module Sandbox</h1>
			</div>
			<nav class="harness-menu" aria-label="Sandbox tools">
				{menuItems.map((item) => (
					<a
						id={`menu-${item.id}`}
						class="harness-menu-link"
						href={`#${item.id}`}
						data-domain={item.id}
						data-active="false"
					>
						{item.label}
					</a>
				))}
			</nav>
			<div class="harness-mounted-module">
				<span class="harness-mounted-module-label">Mounted module</span>
				<code>{harness.moduleName ?? ""}</code>
			</div>
		</header>
	);
}
