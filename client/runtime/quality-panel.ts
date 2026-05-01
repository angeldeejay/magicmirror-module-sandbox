/**
 * Quality sidebar domain runtime for module analysis results.
 *
 * Fetches the initial analysis on load, subscribes to live Socket.IO updates,
 * and drives all DOM mutations inside the #domain-quality panel through
 * well-known element IDs rendered by the QualityDomain Preact component.
 */
(function initModuleSandboxQualityPanel(globalScope) {
	const core = globalScope.__MICROCORE__ as SandboxCore;

	type AnalysisSeverity = "error" | "warning" | "info";

	interface AnalysisFinding {
		id: string;
		category: string;
		severity: AnalysisSeverity;
		description: string;
		file: string | null;
	}

	interface ModuleAnalysisResult {
		moduleName: string;
		moduleRoot: string;
		analyzedAt: number;
		durationMs: number;
		moduleUrl: string | null;
		findings: AnalysisFinding[];
		findingCounts: {
			total: number;
			errors: number;
			warnings: number;
			info: number;
		};
		error: string | null;
	}

	/**
	 * Resolve an element by ID with type narrowing.
	 */
	function getById<T extends HTMLElement>(id: string): T | null {
		return document.getElementById(id) as T | null;
	}

	/**
	 * Append inline-markdown text into a container element.
	 * Supports: [text](url) links. Plain text nodes otherwise.
	 */
	function renderMarkdownInline(container: HTMLElement, text: string): void {
		const LINK_RE = /\[([^\]]+)\]\(([^)]+)\)/g;
		let lastIndex = 0;
		let match: RegExpExecArray | null;
		LINK_RE.lastIndex = 0;
		while ((match = LINK_RE.exec(text)) !== null) {
			if (match.index > lastIndex) {
				container.appendChild(
					document.createTextNode(text.slice(lastIndex, match.index))
				);
			}
			const a = document.createElement("a");
			a.href = match[2] ?? "";
			a.textContent = match[1] ?? "";
			a.target = "_blank";
			a.rel = "noopener noreferrer";
			a.className = "sandbox-quality-link";
			container.appendChild(a);
			lastIndex = LINK_RE.lastIndex;
		}
		if (lastIndex < text.length) {
			container.appendChild(document.createTextNode(text.slice(lastIndex)));
		}
	}

	/**
	 * Build the severity icon string for a finding row.
	 */
	function severityIcon(): string {
		return "\u25CF";
	}

	/**
	 * Render a single finding row element.
	 */
	function renderFinding(finding: AnalysisFinding): HTMLElement {
		const row = document.createElement("div");
		row.className = `sandbox-quality-finding sandbox-quality-finding--${finding.severity}`;
		row.dataset.severity = finding.severity;

		const icon = document.createElement("span");
		icon.className = "sandbox-quality-finding__severity";
		icon.textContent = severityIcon();
		row.appendChild(icon);

		const category = document.createElement("span");
		category.className = "sandbox-quality-finding__category";
		category.textContent = finding.category;
		row.appendChild(category);

		if (finding.file) {
			const file = document.createElement("code");
			file.className = "sandbox-quality-finding__file";
			file.textContent = finding.file;
			row.appendChild(file);
		}

		const description = document.createElement("span");
		description.className = "sandbox-quality-finding__description";
		renderMarkdownInline(description, finding.description);
		row.appendChild(description);

		return row;
	}

	/**
	 * Read the current state of the three severity filter checkboxes.
	 */
	function readFilters(): { errors: boolean; warnings: boolean; info: boolean } {
		return {
			errors: (getById<HTMLInputElement>("quality-filter-errors") as HTMLInputElement | null)?.checked ?? true,
			warnings: (getById<HTMLInputElement>("quality-filter-warnings") as HTMLInputElement | null)?.checked ?? true,
			info: (getById<HTMLInputElement>("quality-filter-info") as HTMLInputElement | null)?.checked ?? true
		};
	}

	/**
	 * Show/hide finding rows according to the current filter state.
	 * Also manages the all-hidden empty message.
	 */
	function applyFilters(): void {
		const panel = getById("quality-panel-all");
		if (!panel) {
			return;
		}

		const { errors, warnings, info } = readFilters();
		const rows = panel.querySelectorAll<HTMLElement>(".sandbox-quality-finding");
		let visibleCount = 0;

		for (const row of rows) {
			const sev = row.dataset.severity as AnalysisSeverity | undefined;
			let visible = false;
			if (sev === "error") visible = errors;
			else if (sev === "warning") visible = warnings;
			else if (sev === "info") visible = info;
			row.style.display = visible ? "" : "none";
			if (visible) visibleCount++;
		}

		// Empty-state message when no findings are visible.
		let emptyEl = panel.querySelector<HTMLElement>(".sandbox-quality-empty");
		if (visibleCount === 0 && rows.length > 0) {
			if (!emptyEl) {
				emptyEl = document.createElement("p");
				emptyEl.className = "sandbox-quality-empty";
				panel.appendChild(emptyEl);
			}
			emptyEl.textContent = "No findings.";
			emptyEl.style.display = "";
		} else if (emptyEl) {
			emptyEl.style.display = "none";
		}
	}

	/**
	 * Populate the unified findings panel and wire filter checkboxes.
	 */
	function populatePanel(findings: AnalysisFinding[]): void {
		const panel = getById("quality-panel-all");
		if (!panel) {
			return;
		}
		panel.innerHTML = "";

		if (findings.length === 0) {
			const empty = document.createElement("p");
			empty.className = "sandbox-quality-empty";
			empty.textContent = "No findings.";
			panel.appendChild(empty);
			return;
		}

		for (const finding of findings) {
			panel.appendChild(renderFinding(finding));
		}

		// Apply current filter state after (re)populating.
		applyFilters();
	}

	/**
	 * Apply a completed analysis result to the DOM.
	 */
	function applyResult(result: ModuleAnalysisResult): void {
		const filterErrorsCount = getById("quality-filter-errors-count");
		const filterWarningsCount = getById("quality-filter-warnings-count");
		const filterInfoCount = getById("quality-filter-info-count");
		const loadingEl = getById("quality-loading");
		const errorEl = getById("quality-error");
		const footerEl = getById("quality-footer");
		const footerTimeEl = getById("quality-footer-time");

		// Hide loading state.
		if (loadingEl) {
			loadingEl.dataset.visible = "false";
		}

		// Handle analysis-level error.
		if (result.error) {
			if (errorEl) {
				errorEl.textContent = `Analysis failed: ${result.error}`;
				errorEl.dataset.visible = "true";
			}
			return;
		}

		if (errorEl) {
			errorEl.dataset.visible = "false";
		}

		const SEVERITY_ORDER: Record<AnalysisSeverity, number> = { error: 0, warning: 1, info: 2 };
		const findings = (Array.isArray(result.findings) ? result.findings : [])
			.slice()
			.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

		// Update filter counts.
		const counts = result.findingCounts || { total: 0, errors: 0, warnings: 0, info: 0 };
		if (filterErrorsCount) {
			filterErrorsCount.textContent = String(counts.errors);
		}
		if (filterWarningsCount) {
			filterWarningsCount.textContent = String(counts.warnings);
		}
		if (filterInfoCount) {
			filterInfoCount.textContent = String(counts.info);
		}

		// Populate findings.
		populatePanel(findings);

		// Show footer.
		if (footerEl) {
			footerEl.dataset.visible = "true";
		}
		if (footerTimeEl && result.analyzedAt) {
			footerTimeEl.textContent = `Analyzed ${new Date(result.analyzedAt).toLocaleTimeString()}`;
		}
	}

	/**
	 * Show the loading placeholder and reset badges + panel to empty.
	 */
	function showLoading(): void {
		const loadingEl = getById("quality-loading");
		const errorEl = getById("quality-error");
		const footerEl = getById("quality-footer");
		if (loadingEl) {
			loadingEl.dataset.visible = "true";
		}
		if (errorEl) {
			errorEl.dataset.visible = "false";
		}
		if (footerEl) {
			footerEl.dataset.visible = "false";
		}

		// Reset badge counts.
		for (const id of ["quality-filter-errors-count", "quality-filter-warnings-count", "quality-filter-info-count"]) {
			const el = getById(id);
			if (el) {
				el.textContent = "0";
			}
		}

		// Clear findings list.
		const panel = getById("quality-panel-all");
		if (panel) {
			panel.innerHTML = "";
		}
	}

	/**
	 * Fetch the initial analysis result from the harness REST endpoint.
	 */
	async function fetchInitialResult(): Promise<void> {
		showLoading();
		try {
			const response = await fetch("/__harness/analysis");
			if (response.status === 202) {
				showLoading();
				return;
			}
			if (!response.ok) {
				const loadingEl = getById("quality-loading");
				const errorEl = getById("quality-error");
				if (loadingEl) {
					loadingEl.dataset.visible = "false";
				}
				if (errorEl) {
					errorEl.textContent = `Analysis failed: HTTP ${response.status}`;
					errorEl.dataset.visible = "true";
				}
				return;
			}
			const result: ModuleAnalysisResult = await response.json();
			applyResult(result);
		} catch (err) {
			const loadingEl = getById("quality-loading");
			const errorEl = getById("quality-error");
			if (loadingEl) {
				loadingEl.dataset.visible = "false";
			}
			if (errorEl) {
				errorEl.textContent = `Analysis failed: ${err instanceof Error ? err.message : String(err)}`;
				errorEl.dataset.visible = "true";
			}
		}
	}

	/**
	 * Trigger a fresh analysis by POST to the harness endpoint.
	 */
	async function triggerAnalysis(): Promise<void> {
		const btn = getById<HTMLButtonElement>("quality-analyze-btn");
		if (btn) {
			btn.disabled = true;
			btn.textContent = "Analyzing…";
		}
		showLoading();
		try {
			await fetch("/__harness/analysis", { method: "POST" });
			// Result arrives via socket event — nothing more to do here.
		} catch {
			// Network error — restore button, let socket deliver result or user retry.
		} finally {
			if (btn) {
				btn.disabled = false;
				btn.textContent = "Analyze module";
			}
		}
	}

	/**
	 * Wire all quality panel DOM behaviour after Preact has mounted the skeleton.
	 */
	core.initializeQualityPanel = function initializeQualityPanel(): void {
		// Wire filter checkboxes.
		for (const id of ["quality-filter-errors", "quality-filter-warnings", "quality-filter-info"]) {
			const checkbox = getById<HTMLInputElement>(id);
			if (checkbox) {
				checkbox.addEventListener("change", applyFilters);
			}
		}

		// Wire analyze button.
		const analyzeBtn = getById<HTMLButtonElement>("quality-analyze-btn");
		if (analyzeBtn) {
			analyzeBtn.addEventListener("click", () => { void triggerAnalysis(); });
		}

		// Fetch the initial result immediately.
		void fetchInitialResult();

		// Subscribe to live socket updates dispatched via DOM event.
		globalScope.addEventListener(
			"module-sandbox:quality-result",
			(event) => {
				const result = (event as CustomEvent<ModuleAnalysisResult>).detail;
				if (result) {
					applyResult(result);
				}
			}
		);
	};
})(window);
