/**
 * Topbar navigation for switching between sandbox tool domains.
 */

import type { HarnessState } from "../types";

type TopbarProps = {
	harness: HarnessState;
};

const menuItems = [
	{ id: "runtime", label: "Runtime", icon: "fa-microchip" },
	{ id: "config", label: "Config", icon: "fa-gear" },
	{ id: "notifications", label: "Notifications", icon: "fa-bell" },
	{ id: "debug", label: "Debug", icon: "fa-bug" },
	{ id: "quality", label: "Quality", icon: "fa-shield-halved" },
	{ id: "about", label: "About", icon: "fa-circle-info" }
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
						<i class={`fa-solid ${item.icon}`} aria-hidden="true" />
						{item.label}
					</a>
				))}
				<span class="harness-menu-divider" aria-hidden="true" />
				<button
					id="harness-restart-btn"
					class="harness-restart-btn"
					type="button"
					aria-label="Restart sandbox"
				>
					<i
						class="fa-solid fa-rotate-right harness-restart-icon"
						aria-hidden="true"
					/>
					<span class="harness-restart-label">Restart</span>
				</button>
			</nav>
			<div class="harness-mounted-module">
				<span class="harness-mounted-module-label">
					<i class="fa-solid fa-cube" aria-hidden="true" /> Mounted
					module
				</span>
				<code>{harness.moduleName ?? ""}</code>
				{harness.moduleVersion && (
					<span class="harness-mounted-module-version">
						v{harness.moduleVersion}
					</span>
				)}
			</div>
			<div class="harness-theme-picker" id="harness-theme-picker">
				<button
					class="harness-theme-btn"
					id="harness-theme-btn"
					type="button"
					aria-label="Switch theme"
					aria-expanded="false"
					aria-haspopup="listbox"
				>
					<i class="fa-solid fa-fw fa-brush" aria-hidden="true" />
				</button>
				<ul
					class="harness-theme-menu"
					role="listbox"
					aria-label="Theme"
				>
					<li
						class="harness-theme-item"
						role="option"
						data-theme-value="carbon-slate"
					>
						<span class="harness-theme-item-label">
							<span
								class="harness-theme-preview"
								aria-hidden="true"
							>
								<span style="background:#4ecdc4" />
								<span style="background:#38a89d" />
								<span style="background:#f0a030" />
							</span>
							Carbon Slate
						</span>
						<i
							class="fa-solid fa-check harness-theme-check"
							aria-hidden="true"
						/>
					</li>
					<li
						class="harness-theme-item"
						role="option"
						data-theme-value="obsidian-amber"
					>
						<span class="harness-theme-item-label">
							<span
								class="harness-theme-preview"
								aria-hidden="true"
							>
								<span style="background:#d4a843" />
								<span style="background:#a8832e" />
								<span style="background:#6ba8c8" />
							</span>
							Obsidian Amber
						</span>
						<i
							class="fa-solid fa-check harness-theme-check"
							aria-hidden="true"
						/>
					</li>
					<li
						class="harness-theme-item"
						role="option"
						data-theme-value="violet-circuit"
					>
						<span class="harness-theme-item-label">
							<span
								class="harness-theme-preview"
								aria-hidden="true"
							>
								<span style="background:#a78bfa" />
								<span style="background:#7c5fc2" />
								<span style="background:#fbbf24" />
							</span>
							Violet Circuit
						</span>
						<i
							class="fa-solid fa-check harness-theme-check"
							aria-hidden="true"
						/>
					</li>
					<li
						class="harness-theme-item"
						role="option"
						data-theme-value="phosphor-green"
					>
						<span class="harness-theme-item-label">
							<span
								class="harness-theme-preview"
								aria-hidden="true"
							>
								<span style="background:#39d353" />
								<span style="background:#25a13a" />
								<span style="background:#e09030" />
							</span>
							Phosphor Green
						</span>
						<i
							class="fa-solid fa-check harness-theme-check"
							aria-hidden="true"
						/>
					</li>
				</ul>
			</div>
		</header>
	);
}
