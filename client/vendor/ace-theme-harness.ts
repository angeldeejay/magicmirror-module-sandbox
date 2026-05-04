/**
 * Ace Editor theme for the harness sandbox.
 *
 * Uses CSS custom properties (--hns-*) so it adapts to all 4 sandbox themes
 * (carbon-slate, obsidian-amber, violet-circuit, phosphor-green) automatically.
 * Syntax token colors are fixed across themes (same palette as the former
 * hand-rolled token renderer).
 */
declare const ace: {
	define: (
		name: string,
		deps: string[],
		factory: (
			acequire: (dep: string) => { importCssString: (css: string, id: string, defer: boolean) => void },
			exports: Record<string, unknown>
		) => void
	) => void;
};

ace.define(
	"ace/theme/harness",
	["require", "exports", "module", "ace/lib/dom"],
	function (acequire, exports) {
		exports.isDark = true;
		exports.cssClass = "ace-harness";
		exports.cssText = `
.ace-harness {
	background-color: var(--hns-bg-surface, #16161a);
	color: var(--hns-text-primary, #e8e8ec);
	font-family: Consolas, "Courier New", monospace;
	font-size: 12px;
	line-height: 18px;
}
.ace-harness .ace_line {
	line-height: 18px !important;
}
.ace-harness .ace_gutter {
	width: 3ch !important;
	min-width: 3ch !important;
	background: var(--hns-bg-elevated, #252530);
	color: var(--hns-text-dim, #565664);
	border-right: 1px solid var(--hns-border, #28282f);
}
.ace-harness .ace_gutter-layer {
	overflow: visible !important;
	min-width: 3ch !important;
}
.ace-harness .ace_gutter-cell {
	padding: 0 !important;
	width: 3ch !important;
	text-align: right !important;
	box-sizing: border-box !important;
}
.ace-harness .ace_scroller {
	left: calc(3ch + 1px) !important;
	padding: 0 !important;
}
.ace-harness .ace_content {
	left: 4px !important;
}
.ace-harness .ace_text-layer {
	margin: 0;
}
.ace-harness .ace_gutter-active-line {
	background: var(--hns-bg-hover, #22222c);
}
.ace-harness .ace_print-margin {
	background: var(--hns-border, #28282f);
}
.ace-harness .ace_cursor {
	color: var(--hns-text-primary, #e8e8ec);
}
.ace-harness .ace_marker-layer .ace_selection {
	background: var(--hns-bg-active, #1a1a26);
}
.ace-harness.ace_multiselect .ace_selection.ace_start {
	box-shadow: 0 0 3px 0px var(--hns-bg-input, #09090c);
}
.ace-harness .ace_marker-layer .ace_step {
	background: rgb(102, 82, 0);
}
.ace-harness .ace_marker-layer .ace_bracket {
	margin: -1px 0 0 -1px;
	border: 1px solid var(--hns-border-active, #38384a);
}
.ace-harness .ace_marker-layer .ace_active-line {
	background: var(--hns-bg-hover, #22222c);
}
.ace-harness .ace_gutter-active-line {
	background: var(--hns-bg-hover, #22222c);
}
.ace-harness .ace_marker-layer .ace_selected-word {
	border: 1px solid var(--hns-border-active, #38384a);
}
.ace-harness .ace_fold {
	background-color: #a78bfa;
	border-color: var(--hns-text-primary, #e8e8ec);
}
.ace-harness .ace_scrollbar-v,
.ace-harness .ace_scrollbar-h {
	background: var(--hns-bg-input, #09090c);
}
.ace-harness .ace_scrollbar-v {
	width: 15px !important;
}
.ace-harness .ace_scrollbar-v .ace_scrollbar-inner {
	width: 15px !important;
}
.ace-harness .ace_indent-guide {
	background: linear-gradient(rgba(255, 255, 255, 0.175) 0%, rgba(255, 255, 255, 0.175) 100%);
	background-size: 1px 100%;
	background-repeat: no-repeat;
	background-position: right center;
}

/* ── Syntax tokens — base (Carbon Slate defaults) ───────────────────────────── */
/* Dynamic tokens via CSS vars — auto-adapt to all themes */
.ace-harness .ace_variable,
.ace-harness .ace_variable.ace_other,
.ace-harness .ace_identifier,
.ace-harness .ace_entity.ace_name.ace_tag { color: var(--hns-text-primary, #e8e8ec); }
.ace-harness .ace_constant.ace_language,
.ace-harness .ace_constant.ace_language.ace_null { color: var(--hns-text-muted, #707080); }
.ace-harness .ace_comment { color: var(--hns-text-dim, #565664); font-style: italic; }
.ace-harness .ace_constant.ace_numeric,
.ace-harness .ace_support.ace_constant { color: var(--hns-status-green, #52c97a); }
.ace-harness .ace_invalid { color: var(--hns-status-red, #f05e5e); background-color: rgba(var(--hns-status-red-rgb, 240, 94, 94), 0.15); }
.ace-harness .ace_invalid.ace_deprecated { background-color: rgba(var(--hns-status-red-rgb, 240, 94, 94), 0.1); }

/* Fixed tokens — Carbon Slate (#09090c, teal-cyan accent) */
.ace-harness .ace_keyword,
.ace-harness .ace_storage,
.ace-harness .ace_storage.ace_type { color: #c792ea; }
.ace-harness .ace_string { color: #f0c674; }
.ace-harness .ace_string.ace_regexp,
.ace-harness .ace_entity.ace_other.ace_attribute-name { color: #f0809a; }
.ace-harness .ace_constant.ace_language.ace_boolean { color: #4ecdc4; }
.ace-harness .ace_keyword.ace_operator,
.ace-harness .ace_paren,
.ace-harness .ace_punctuation,
.ace-harness .ace_punctuation.ace_operator { color: #8ba8c0; }
.ace-harness .ace_entity.ace_name.ace_function,
.ace-harness .ace_support.ace_function,
.ace-harness .ace_support.ace_type,
.ace-harness .ace_support.ace_class { color: #38a89d; }

/* ── Obsidian Amber (#080705, golden accent) ────────────────────────────────── */
[data-theme="obsidian-amber"] .ace-harness .ace_keyword,
[data-theme="obsidian-amber"] .ace-harness .ace_storage,
[data-theme="obsidian-amber"] .ace-harness .ace_storage.ace_type { color: #c49fd0; }
[data-theme="obsidian-amber"] .ace-harness .ace_string { color: #d4a843; }
[data-theme="obsidian-amber"] .ace-harness .ace_string.ace_regexp,
[data-theme="obsidian-amber"] .ace-harness .ace_entity.ace_other.ace_attribute-name { color: #e0908a; }
[data-theme="obsidian-amber"] .ace-harness .ace_constant.ace_language.ace_boolean { color: #7ec8b8; }
[data-theme="obsidian-amber"] .ace-harness .ace_keyword.ace_operator,
[data-theme="obsidian-amber"] .ace-harness .ace_paren,
[data-theme="obsidian-amber"] .ace-harness .ace_punctuation,
[data-theme="obsidian-amber"] .ace-harness .ace_punctuation.ace_operator { color: #a89878; }
[data-theme="obsidian-amber"] .ace-harness .ace_entity.ace_name.ace_function,
[data-theme="obsidian-amber"] .ace-harness .ace_support.ace_function,
[data-theme="obsidian-amber"] .ace-harness .ace_support.ace_type,
[data-theme="obsidian-amber"] .ace-harness .ace_support.ace_class { color: #a8832e; }

/* ── Violet Circuit (#09080e, lavender accent) ──────────────────────────────── */
[data-theme="violet-circuit"] .ace-harness .ace_keyword,
[data-theme="violet-circuit"] .ace-harness .ace_storage,
[data-theme="violet-circuit"] .ace-harness .ace_storage.ace_type { color: #f472b6; }
[data-theme="violet-circuit"] .ace-harness .ace_string { color: #34d399; }
[data-theme="violet-circuit"] .ace-harness .ace_string.ace_regexp,
[data-theme="violet-circuit"] .ace-harness .ace_entity.ace_other.ace_attribute-name { color: #fb7185; }
[data-theme="violet-circuit"] .ace-harness .ace_constant.ace_language.ace_boolean { color: #a78bfa; }
[data-theme="violet-circuit"] .ace-harness .ace_keyword.ace_operator,
[data-theme="violet-circuit"] .ace-harness .ace_paren,
[data-theme="violet-circuit"] .ace-harness .ace_punctuation,
[data-theme="violet-circuit"] .ace-harness .ace_punctuation.ace_operator { color: #7c7a9e; }
[data-theme="violet-circuit"] .ace-harness .ace_entity.ace_name.ace_function,
[data-theme="violet-circuit"] .ace-harness .ace_support.ace_function,
[data-theme="violet-circuit"] .ace-harness .ace_support.ace_type,
[data-theme="violet-circuit"] .ace-harness .ace_support.ace_class { color: #60a5fa; }

/* ── Phosphor Green (#0a0a0a, terminal accent) ──────────────────────────────── */
[data-theme="phosphor-green"] .ace-harness .ace_keyword,
[data-theme="phosphor-green"] .ace-harness .ace_storage,
[data-theme="phosphor-green"] .ace-harness .ace_storage.ace_type { color: #8878d8; }
[data-theme="phosphor-green"] .ace-harness .ace_string { color: #e090b0; }
[data-theme="phosphor-green"] .ace-harness .ace_string.ace_regexp,
[data-theme="phosphor-green"] .ace-harness .ace_entity.ace_other.ace_attribute-name { color: #d4709c; }
[data-theme="phosphor-green"] .ace-harness .ace_constant.ace_language.ace_boolean { color: #2ec090; }
[data-theme="phosphor-green"] .ace-harness .ace_keyword.ace_operator,
[data-theme="phosphor-green"] .ace-harness .ace_paren,
[data-theme="phosphor-green"] .ace-harness .ace_punctuation,
[data-theme="phosphor-green"] .ace-harness .ace_punctuation.ace_operator { color: #787878; }
[data-theme="phosphor-green"] .ace-harness .ace_entity.ace_name.ace_function,
[data-theme="phosphor-green"] .ace-harness .ace_support.ace_function,
[data-theme="phosphor-green"] .ace-harness .ace_support.ace_type,
[data-theme="phosphor-green"] .ace-harness .ace_support.ace_class { color: #25a13a; }
`;

		const dom = acequire("ace/lib/dom");
		dom.importCssString(exports.cssText as string, exports.cssClass as string, false);
	}
);
