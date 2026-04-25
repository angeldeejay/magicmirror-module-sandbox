/**
 * Sidebar domain renderer for runtime lifecycle state and quick controls.
 */

import type { HarnessState } from "../../types";

type RuntimeDomainProps = {
	harness: HarnessState;
};

/**
 * Internal helper for runtime domain.
 */
export function RuntimeDomain({ harness }: RuntimeDomainProps) {
	return (
		<section
			id="domain-runtime"
			class="sandbox-domain"
			data-domain="runtime"
			data-active="false"
		>
			<span class="status-pill">
				Runtime state and module lifecycle controls.
			</span>
			<div class="sandbox-section-title">Host</div>
			<ul class="sandbox-hint-list">
				<li>
					Sandbox URL:{" "}
					<code>{harness.sandboxUrl || "http://127.0.0.1:3010"}</code>
				</li>
				<li>
					Config editing: <code>sandbox UI</code>
				</li>
				<li>
					Watch mode:{" "}
					<code>{harness.watchEnabled ? "on" : "off"}</code>
				</li>
			</ul>
			<div
				class="sandbox-tabbar"
				role="tablist"
				aria-label="Runtime panels"
			>
				<button
					class="sandbox-tab"
					type="button"
					data-domain="runtime"
					data-tab="lifecycle"
					data-active="false"
				>
					Lifecycle
				</button>
			</div>
			<section
				class="sandbox-tabpanel"
				data-domain="runtime"
				data-tab-panel="lifecycle"
				data-active="false"
			>
				<div class="sandbox-section-title">Lifecycle</div>
				<div class="sandbox-control-grid">
					<div class="sandbox-control-row">
						<div class="sandbox-control-copy">
							<div class="sandbox-control-label">Visibility</div>
							<div
								id="lifecycle-visibility-status"
								class="sandbox-control-value"
							>
								Visible
							</div>
						</div>
						<button
							id="lifecycle-visibility-action"
							class="sandbox-button"
							type="button"
						>
							Apply
						</button>
					</div>
					<div class="sandbox-control-row">
						<div class="sandbox-control-copy">
							<div class="sandbox-control-label">Activity</div>
							<div
								id="lifecycle-activity-status"
								class="sandbox-control-value"
							>
								Running
							</div>
						</div>
						<button
							id="lifecycle-activity-action"
							class="sandbox-button"
							type="button"
						>
							Apply
						</button>
					</div>
					<div class="sandbox-control-row">
						<div class="sandbox-control-copy">
							<div class="sandbox-control-label">DOM ready</div>
							<div class="sandbox-control-value">
								Viewport hooks available
							</div>
						</div>
						<span
							id="lifecycle-dom-ready"
							class="sandbox-inline-state"
							data-state="off"
						>
							No
						</span>
					</div>
					<div class="sandbox-control-row">
						<div class="sandbox-control-copy">
							<div class="sandbox-control-label">
								Lifecycle started
							</div>
							<div class="sandbox-control-value">
								Module startup sequence finished
							</div>
						</div>
						<span
							id="lifecycle-started"
							class="sandbox-inline-state"
							data-state="off"
						>
							No
						</span>
					</div>
				</div>
			</section>
		</section>
	);
}
