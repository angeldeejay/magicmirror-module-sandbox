/**
 * Sidebar domain renderer for wrapper controls and the embedded module config editor.
 */

import { h } from "preact";
import type {
	HarnessLanguageOption,
	HarnessModuleConfig,
	HarnessModuleConfigOptions,
	HarnessState
} from "../../types";

type ConfigDomainProps = {
	harness: HarnessState;
};

/**
 * Gets module config.
 */
function getModuleConfig(harness: HarnessState): HarnessModuleConfig {
	return harness.moduleConfig || {};
}

/**
 * Gets module config options.
 */
function getModuleConfigOptions(
	harness: HarnessState
): HarnessModuleConfigOptions {
	return harness.moduleConfigOptions || {};
}

/**
 * Renders language option.
 */
function renderLanguageOption(
	languageOption: HarnessLanguageOption,
	selectedLanguage: string
) {
	return (
		<option
			value={languageOption.code}
			selected={languageOption.code === selectedLanguage}
		>
			{languageOption.label} ({languageOption.code})
		</option>
	);
}

/**
 * Internal helper for config domain.
 */
export function ConfigDomain({ harness }: ConfigDomainProps) {
	const moduleConfig = getModuleConfig(harness);
	const moduleConfigOptions = getModuleConfigOptions(harness);
	const moduleConfigEditor = h("module-config-editor", {
		id: "module-config-editor",
		class: "sandbox-json-editor sandbox-json-editor--fill sandbox-json-editor--embedded",
		indent: "2",
		"module-name": harness.moduleName || "",
		language: harness.language || "",
		locale: harness.locale || ""
	});

	return (
		<section
			id="domain-config"
			class="sandbox-domain sandbox-config-domain"
			data-domain="config"
			data-active="false"
		>
			<span class="status-pill">
				Edit the mounted module config envelope and save it back to
				disk.
			</span>
			<div
				class="sandbox-tabbar"
				role="tablist"
				aria-label="Config sections"
			>
				<button
					class="sandbox-tab"
					type="button"
					data-domain="config"
					data-tab="general"
					data-active="false"
					aria-selected="false"
				>
					<i class="fa-solid fa-sliders" aria-hidden="true" />
					General
				</button>
				<button
					class="sandbox-tab"
					type="button"
					data-domain="config"
					data-tab="module"
					data-active="false"
					aria-selected="false"
				>
					<i class="fa-solid fa-code" aria-hidden="true" />
					Module
				</button>
			</div>
			<section
				class="sandbox-tabpanel"
				data-domain="config"
				data-tab-panel="general"
				data-active="false"
			>
				<div class="sandbox-section-title">Sandbox runtime</div>
				<label class="sandbox-field-label" for="config-language">
					Sandbox language
				</label>
				<select id="config-language" class="sandbox-input">
					{(harness.availableLanguages || []).map((languageOption) =>
						renderLanguageOption(
							languageOption,
							harness.language || ""
						)
					)}
				</select>
				<div class="sandbox-section-title">General module options</div>
				<label class="sandbox-field-label" for="config-position">
					Position
				</label>
				<select id="config-position" class="sandbox-input">
					{(moduleConfigOptions.positions || []).map((position) => (
						<option
							value={position}
							selected={position === moduleConfig.position}
						>
							{position}
						</option>
					))}
				</select>
				<label class="sandbox-field-label" for="config-header">
					Header
				</label>
				<div class="sandbox-input-toggle-group">
					<input
						id="config-header"
						class="sandbox-input sandbox-input-toggle-group__field"
						type="text"
						value={
							typeof moduleConfig.header === "string"
								? moduleConfig.header
								: ""
						}
						placeholder="Header text"
						disabled={moduleConfig.header === false}
					/>
					<label
						class="sandbox-input-toggle-group__toggle"
						for="config-header-enabled"
						aria-label="Enable header"
					>
						<input
							id="config-header-enabled"
							class="sandbox-toggle-input"
							type="checkbox"
							checked={moduleConfig.header !== false}
						/>
					</label>
				</div>
				<label class="sandbox-field-label" for="config-classes">
					Classes
				</label>
				<input
					id="config-classes"
					class="sandbox-input"
					type="text"
					value={moduleConfig.classes || ""}
					placeholder="Space-separated CSS classes"
				/>
				<label class="sandbox-field-label" for="config-animate-in">
					Animate in
				</label>
				<select id="config-animate-in" class="sandbox-input">
					{(moduleConfigOptions.animateInOptions || []).map(
						(animation) => (
							<option
								value={animation}
								selected={animation === moduleConfig.animateIn}
							>
								{animation || "None"}
							</option>
						)
					)}
				</select>
				<label class="sandbox-field-label" for="config-animate-out">
					Animate out
				</label>
				<select id="config-animate-out" class="sandbox-input">
					{(moduleConfigOptions.animateOutOptions || []).map(
						(animation) => (
							<option
								value={animation}
								selected={animation === moduleConfig.animateOut}
							>
								{animation || "None"}
							</option>
						)
					)}
				</select>
				<div class="sandbox-toggle-grid">
					<label
						class="sandbox-toggle-row"
						for="config-hidden-on-startup"
					>
						<span class="sandbox-toggle-copy">
							<span class="sandbox-toggle-label">
								Hidden on startup
							</span>
							<span class="sandbox-toggle-help">
								Saved initial state only. Debug show/hide stays
								separate.
							</span>
						</span>
						<input
							id="config-hidden-on-startup"
							class="sandbox-toggle-input"
							type="checkbox"
							checked={Boolean(moduleConfig.hiddenOnStartup)}
						/>
					</label>
					<label class="sandbox-toggle-row" for="config-disabled">
						<span class="sandbox-toggle-copy">
							<span class="sandbox-toggle-label">Disabled</span>
							<span class="sandbox-toggle-help">
								Skip normal startup/render and show an explicit
								disabled viewport state.
							</span>
						</span>
						<input
							id="config-disabled"
							class="sandbox-toggle-input"
							type="checkbox"
							checked={Boolean(moduleConfig.disabled)}
						/>
					</label>
				</div>
			</section>
			<section
				class="sandbox-tabpanel sandbox-tabpanel--stack"
				data-domain="config"
				data-tab-panel="module"
				data-active="false"
			>
				<div class="sandbox-editor-toolbar">
					<div class="sandbox-editor-copy">
						<strong>MagicMirror-style config block</strong>
						<span id="module-config-copy">
							Config valid. General options save alongside this
							block.
						</span>
					</div>
					<div class="sandbox-editor-state-group">
						<span
							id="module-config-dirty-state"
							class="sandbox-inline-state"
							data-state="on"
						>
							Saved
						</span>
						<span
							id="module-config-validity"
							class="sandbox-inline-state"
							data-state="on"
						>
							Valid
						</span>
					</div>
				</div>
				{moduleConfigEditor}
				<div class="sandbox-button-row sandbox-button-row--full">
					<button
						id="module-config-format"
						class="sandbox-button sandbox-button--full"
						type="button"
					>
						<i
							class="fa-solid fa-wand-magic-sparkles"
							aria-hidden="true"
						/>
						Format config
					</button>
				</div>
			</section>
			<div
				id="module-config-status"
				class="sandbox-status"
				data-state="ok"
			></div>
			<div class="sandbox-button-row" style={{ width: "100%" }}>
				<button
					id="module-config-reset"
					class="sandbox-button sandbox-button--grow"
					type="button"
					disabled
					style={{ flex: 1 }}
				>
					<i
						class="fa-solid fa-arrow-rotate-left"
						aria-hidden="true"
					/>
					Revert draft
				</button>
				<button
					id="module-config-refresh-styles"
					class="sandbox-button sandbox-button--grow"
					type="button"
					style={{ flex: 1 }}
				>
					<i class="fa-solid fa-rotate-right" aria-hidden="true" />
					Refresh styles
				</button>
			</div>
			<div class="sandbox-button-row" style={{ width: "100%" }}>
				<button
					id="module-config-save"
					class="sandbox-button sandbox-button--grow"
					type="button"
					style={{ flex: 1 }}
				>
					<i class="fa-solid fa-rotate-right" aria-hidden="true" />
					Save and reload
				</button>
			</div>
		</section>
	);
}
