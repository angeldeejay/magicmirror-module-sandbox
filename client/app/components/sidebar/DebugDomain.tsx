/**
 * Sidebar domain renderer for helper and console log inspection.
 */

export function DebugDomain() {
	return (
		<section
			id="domain-debug"
			class="sandbox-domain"
			data-domain="debug"
			data-active="false"
		>
			<span class="status-pill">
				Browser and helper log streams for sandbox diagnostics.
			</span>
			<div
				class="sandbox-tabbar"
				role="tablist"
				aria-label="Debug panels"
			>
				<button
					class="sandbox-tab"
					type="button"
					data-domain="debug"
					data-tab="helper-log"
					data-active="false"
				>
					<i class="fa-solid fa-server" aria-hidden="true" />
					Helper Log
				</button>
				<button
					class="sandbox-tab"
					type="button"
					data-domain="debug"
					data-tab="console-log"
					data-active="false"
				>
					<i class="fa-solid fa-terminal" aria-hidden="true" />
					Console Log
				</button>
			</div>
			<section
				class="sandbox-tabpanel sandbox-tabpanel--stack"
				data-domain="debug"
				data-tab-panel="helper-log"
				data-active="false"
			>
				<div class="sandbox-section-title">Helper log</div>
				<div id="helper-log" class="notification-log"></div>
				<div class="sandbox-button-row sandbox-button-row--full">
					<button
						id="helper-clear"
						class="sandbox-button sandbox-button--full"
						type="button"
					>
						<i class="fa-solid fa-trash" aria-hidden="true" />
						Clear helper log
					</button>
				</div>
			</section>
			<section
				class="sandbox-tabpanel sandbox-tabpanel--stack"
				data-domain="debug"
				data-tab-panel="console-log"
				data-active="false"
			>
				<div class="sandbox-section-title">Console log</div>
				<div id="console-log" class="notification-log"></div>
				<div class="sandbox-button-row sandbox-button-row--full">
					<button
						id="console-clear"
						class="sandbox-button sandbox-button--full"
						type="button"
					>
						<i class="fa-solid fa-trash" aria-hidden="true" />
						Clear console log
					</button>
				</div>
			</section>
		</section>
	);
}
