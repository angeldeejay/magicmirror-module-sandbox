/**
 * Sidebar domain renderer for module quality analysis against MagicMirror
 * 3rd-party criteria.
 *
 * This component renders a static skeleton. All dynamic content (fetch,
 * socket updates, filter toggling) is driven by the quality-panel runtime
 * module via well-known DOM IDs.
 */

/**
 * Internal helper for quality domain.
 */
export function QualityDomain() {
	return (
		<section
			id="domain-quality"
			class="sandbox-domain sandbox-quality-domain"
			data-domain="quality"
			data-active="false"
		>
			<span class="status-pill">
				Module quality analysis against MagicMirror 3rd-party criteria.
			</span>

			{/* Severity filter checkboxes */}
			<div class="sandbox-quality-filters">
				<label class="sandbox-quality-filter sandbox-quality-filter--errors">
					<input
						type="checkbox"
						id="quality-filter-errors"
						class="sandbox-quality-filter__checkbox"
						checked
					/>
					<span class="sandbox-quality-filter__label">Errors</span>
					<span
						id="quality-filter-errors-count"
						class="sandbox-quality-filter__count"
					>
						0
					</span>
				</label>
				<label class="sandbox-quality-filter sandbox-quality-filter--warnings">
					<input
						type="checkbox"
						id="quality-filter-warnings"
						class="sandbox-quality-filter__checkbox"
						checked
					/>
					<span class="sandbox-quality-filter__label">Warnings</span>
					<span
						id="quality-filter-warnings-count"
						class="sandbox-quality-filter__count"
					>
						0
					</span>
				</label>
				<label class="sandbox-quality-filter sandbox-quality-filter--info">
					<input
						type="checkbox"
						id="quality-filter-info"
						class="sandbox-quality-filter__checkbox"
						checked
					/>
					<span class="sandbox-quality-filter__label">Recommendations</span>
					<span
						id="quality-filter-info-count"
						class="sandbox-quality-filter__count"
					>
						0
					</span>
				</label>
			</div>

			{/* Unified findings list */}
			<div
				id="quality-panel-all"
				class="sandbox-quality-panel"
			></div>

			{/* Loading / error / footer states — runtime toggles visibility */}
			<div
				id="quality-loading"
				class="sandbox-quality-loading"
				data-visible="true"
			>
				Analyzing module…
			</div>
			<div
				id="quality-error"
				class="sandbox-quality-error"
				data-visible="false"
			></div>
			<div
				id="quality-footer"
				class="sandbox-quality-footer"
				data-visible="false"
			>
				<span class="sandbox-quality-stale-note">
					Results may be momentarily stale during helper restart.
				</span>
				<span id="quality-footer-time"></span>
			</div>
			<div class="sandbox-button-row sandbox-button-row--full">
				<button
					id="quality-analyze-btn"
					class="sandbox-button sandbox-button--full"
					type="button"
				>
					<i class="fa-solid fa-magnifying-glass" aria-hidden="true" />
					Analyze module
				</button>
			</div>
		</section>
	);
}
