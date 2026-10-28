/**
 * Topbar navigation for switching between sandbox tool domains.
 */

import { useState, useEffect } from "preact/hooks";
import type { HarnessState, MmVersionState } from "../types";

type TopbarProps = {
	harness: HarnessState;
};

type BadgeState = {
	usingBuiltIn: boolean;
	displayVersion: string;
};

/**
 * Normalise a version the stage reported; anything but a non-empty string
 * counts as "the stage reported none".
 */
function readStageVersion(value: unknown): string | null {
	return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

/** Compare versions without the `-develop` suffix the server label drops. */
function normalizeVersion(version: string): string {
	return version.replace(/-develop$/i, "");
}

function MmVersionBadge() {
	const [badge, setBadge] = useState<BadgeState>({ usingBuiltIn: true, displayVersion: "—" });
	// The core the stage actually runs, as the stage itself reports it. Only
	// the real-core stage reports one; without it the server state decides.
	const [stageVersion, setStageVersion] = useState<string | null>(
		() => readStageVersion((globalThis as { __MICROCORE__?: { stageMmVersion?: unknown } }).__MICROCORE__?.stageMmVersion)
	);

	useEffect(() => {
		function refresh() {
			fetch("/__harness/mm-versions", { cache: "no-store" })
				.then((r) => r.json())
				.then((data: {
					active?: string | null;
					usingBuiltIn?: boolean;
					builtInVersion?: string | null;
					versions?: Array<{ key: string; displayVersion?: string }>;
				}) => {
					const builtIn = data.usingBuiltIn ?? true;
					let display = "—";
					if (builtIn) {
						display = data.builtInVersion ?? "—";
					} else if (data.active) {
						const info = (data.versions ?? []).find((v) => v.key === data.active);
						display = (info?.displayVersion ?? data.active).replace(/-develop$/i, "");
					}
					setBadge({ usingBuiltIn: builtIn, displayVersion: display });
				})
				.catch(() => {});
		}

		function onStageReady(event: Event) {
			// The latest stage-ready decides: a reported version or none.
			setStageVersion(readStageVersion((event as CustomEvent).detail?.mmVersion));
		}

		function onVersionChanged() {
			// The stage reloads on a version switch; until it reports again
			// the old value no longer describes what runs.
			setStageVersion(null);
			refresh();
		}

		refresh();
		window.addEventListener("module-sandbox:mm-version-changed", onVersionChanged);
		window.addEventListener("module-sandbox:stage-ready", onStageReady);
		return () => {
			window.removeEventListener("module-sandbox:mm-version-changed", onVersionChanged);
			window.removeEventListener("module-sandbox:stage-ready", onStageReady);
		};
	}, []);

	const { usingBuiltIn } = badge;
	const serverVersion = badge.displayVersion;
	// What actually runs wins over what the server believes is active.
	const displayVersion =
		stageVersion === null ? serverVersion : normalizeVersion(stageVersion);
	const mismatch =
		stageVersion !== null &&
		serverVersion !== "—" &&
		normalizeVersion(stageVersion) !== normalizeVersion(serverVersion);
	const baseTitle = usingBuiltIn
		? `Built-in shims (MM ${displayVersion})`
		: `MM core: ${displayVersion}`;
	const title = mismatch
		? `MM core running in the stage: ${displayVersion}. Version mismatch: the server reports ${serverVersion}${usingBuiltIn ? " (built-in)" : ""}`
		: baseTitle;

	return (
		<button
			class={`mmv-topbar-badge${usingBuiltIn ? " mmv-topbar-badge--builtin" : ""}`}
			type="button"
			aria-label="MagicMirror core version"
			title={title}
			onClick={() => {
				location.hash = "#mmversion";
			}}
		>
			<i class="fa-solid fa-code-branch" aria-hidden="true" />
			<span class="mmv-topbar-badge__label">{displayVersion}</span>
		</button>
	);
}

/**
 * Internal helper for topbar.
 */
export function Topbar({ harness }: TopbarProps) {
	return (
		<header class="harness-topbar">
			<div class="harness-product">
				<h1 class="harness-product-name">MagicMirror Module Sandbox</h1>
			</div>
			<MmVersionBadge />
			<nav class="harness-menu" aria-label="Sandbox tools">
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
