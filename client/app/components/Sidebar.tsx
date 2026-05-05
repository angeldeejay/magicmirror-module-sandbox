/**
 * Sidebar chrome that hosts the sandbox tool domains and active-panel state.
 */

import { useState, useEffect, useRef } from "preact/hooks";
import type { HarnessState } from "../types";
import { AboutDomain } from "./sidebar/AboutDomain";
import { ConfigDomain } from "./sidebar/ConfigDomain";
import { DebugDomain } from "./sidebar/DebugDomain";
import { NotificationsDomain } from "./sidebar/NotificationsDomain";
import { QualityDomain } from "./sidebar/QualityDomain";
import { RuntimeDomain } from "./sidebar/RuntimeDomain";

const menuItems = [
	{ id: "runtime", label: "Runtime", icon: "fa-microchip" },
	{ id: "config", label: "Config", icon: "fa-gear" },
	{ id: "notifications", label: "Notifications", icon: "fa-bell" },
	{ id: "debug", label: "Debug", icon: "fa-bug" },
	{ id: "quality", label: "Quality", icon: "fa-shield-halved" },
	{ id: "about", label: "About", icon: "fa-circle-info" }
] as const;

function DomainNav() {
	const [open, setOpen] = useState(false);
	const [activeDomain, setActiveDomain] = useState("runtime");
	const containerRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		function handleClickOutside(e: MouseEvent) {
			if (
				containerRef.current &&
				!containerRef.current.contains(e.target as Node)
			) {
				setOpen(false);
			}
		}
		document.addEventListener("mousedown", handleClickOutside);

		// Track active domain from runtime script's data-active writes
		const observer = new MutationObserver(() => {
			if (!containerRef.current) return;
			const active = containerRef.current.querySelector<HTMLElement>(
				'.harness-menu-link[data-active="true"]'
			);
			setActiveDomain(active?.dataset.domain ?? "");
		});
		if (containerRef.current) {
			observer.observe(containerRef.current, {
				attributeFilter: ["data-active"],
				subtree: true
			});
		}

		return () => {
			document.removeEventListener("mousedown", handleClickOutside);
			observer.disconnect();
		};
	}, []);

	const activeItem = menuItems.find((item) => item.id === activeDomain)!;

	return (
		<div class="harness-domain-nav" ref={containerRef}>
			<button
				class="harness-domain-nav-trigger"
				type="button"
				aria-expanded={open}
				onClick={() => setOpen((v) => !v)}
			>
				<i class={`fa-solid ${activeItem.icon}`} aria-hidden="true" />
				{activeItem.label}
				<i
					class={`fa-solid fa-chevron-${open ? "up" : "down"} harness-domain-nav-chevron`}
					aria-hidden="true"
				/>
			</button>
			{/* Always in DOM so runtime script can find and wire the links */}
			<div
				class={`harness-domain-nav-panel${open ? " harness-domain-nav-panel--open" : ""}`}
			>
				{menuItems.map((item) => (
					<a
						id={`menu-${item.id}`}
						class="harness-menu-link harness-domain-nav-link"
						href={`#${item.id}`}
						data-domain={item.id}
						onClick={() => setOpen(false)}
					>
						<i class={`fa-solid ${item.icon}`} aria-hidden="true" />
						{item.label}
					</a>
				))}
			</div>
		</div>
	);
}

type SidebarProps = {
	harness: HarnessState;
};

/**
 * Internal helper for sidebar.
 */
export function Sidebar({ harness }: SidebarProps) {
	return (
		<aside id="harness-sidebar" class="harness-sidebar" aria-hidden="true">
			<DomainNav />
			<div class="harness-sidebar-scroll">
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
