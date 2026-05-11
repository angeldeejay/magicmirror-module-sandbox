/**
 * Journey coverage model for browser-backed sandbox suites.
 */

import { test } from "vitest";
import type { TestFunction, TaskMeta } from "@vitest/runner";

/**
 * Browser-backed suite names that participate in journey coverage.
 */
export type JourneySuiteName = "integration" | "ui";

/**
 * Stable identifiers for every modeled browser journey in the catalog.
 */
export type JourneyId =
	| "integration-header-semantics"
	| "integration-language-autosave"
	| "integration-module-mount"
	| "integration-module-options"
	| "integration-module-reload"
	| "integration-notifications-helper"
	| "integration-styles-refresh"
	| "integration-update-dom-stability"
	| "ui-about-domain"
	| "ui-bootstrap"
	| "ui-config-sidebar"
	| "ui-debug-sidebar"
	| "ui-config-comment-support"
	| "ui-config-editor-validation"
	| "ui-domain-nav-about"
	| "ui-domain-nav-config"
	| "ui-domain-nav-debug"
	| "ui-domain-nav-dropdown-closes-on-outside-click"
	| "ui-domain-nav-dropdown-closes-on-selection"
	| "ui-domain-nav-dropdown-opens"
	| "ui-domain-nav-notifications"
	| "ui-domain-nav-mmversion"
	| "ui-domain-nav-quality"
	| "ui-domain-nav-runtime"
	| "ui-domain-nav-trigger-reflects-active-domain"
	| "ui-domain-navigation-order"
	| "ui-mmversion-activate-button-disabled-when-empty"
	| "ui-mmversion-activate-button-enabled-when-filled"
	| "ui-mmversion-activate-button-present"
	| "ui-mmversion-active-row-shows-builtin"
	| "ui-mmversion-active-core-version-only"
	| "ui-mmversion-dropdown-bleeding-edge-first"
	| "ui-mmversion-dropdown-includes-builtin-version"
	| "ui-mmversion-switch-version-select-present"
	| "ui-mmversion-domain-activates"
	| "ui-mmversion-domain-renders"
	| "ui-mmversion-sidebar-stays-open"
	| "ui-mmversion-topbar-badge-opens-domain"
	| "ui-mmversion-topbar-badge-renders"
	| "ui-mmversion-topbar-badge-shows-builtin"
	| "ui-mmversion-version-input-present"
	| "ui-notifications-sidebar"
	| "ui-runtime-controls"
	| "ui-sidebar-toggle-closes"
	| "ui-sidebar-toggle-opens";

/**
 * Canonical definition for one modeled product journey.
 */
export type JourneyDefinition = {
	id: JourneyId;
	suite: JourneySuiteName;
	label: string;
	description: string;
	transitions: readonly string[];
	outcomes: readonly string[];
};

/**
 * Metadata attached to a Vitest task so the reporter can expand one test into
 * covered journeys, transitions, and outcomes.
 */
export type JourneyCoverageMeta = {
	suite: JourneySuiteName;
	journeys: JourneyId[];
	transitions: string[];
	outcomes: string[];
};

/**
 * Executed test record consumed by summary generation and JSON reporting.
 */
export type JourneyCoverageRecord = JourneyCoverageMeta & {
	moduleId: string;
	testName: string;
	status: string;
};

/**
 * Coverage summary for one browser-backed suite.
 */
type JourneySuiteSummary = {
	suite: JourneySuiteName;
	journeys: {
		covered: number;
		total: number;
		percent: number;
		missed: JourneyId[];
	};
	transitions: {
		covered: number;
		total: number;
		percent: number;
		missed: string[];
	};
	outcomes: {
		covered: number;
		total: number;
		percent: number;
		missed: string[];
	};
	score: number;
};

/**
 * Full journey coverage summary emitted to the reporter JSON artifacts.
 */
export type JourneyCoverageSummary = {
	suites: JourneySuiteSummary[];
	overall: {
		suites: JourneySuiteName[];
		journeys: {
			covered: number;
			total: number;
			percent: number;
			missed: JourneyId[];
		};
		transitions: {
			covered: number;
			total: number;
			percent: number;
			missed: string[];
		};
		outcomes: {
			covered: number;
			total: number;
			percent: number;
			missed: string[];
		};
		score: number;
	};
	records: JourneyCoverageRecord[];
};

declare module "@vitest/runner" {
	interface TaskMeta {
		journeyCoverage?: JourneyCoverageMeta;
	}
}

/**
 * Canonical catalog of product flows covered by browser-backed suites.
 */
const journeyCatalog: readonly JourneyDefinition[] = [
	{
		id: "ui-bootstrap",
		suite: "ui",
		label: "Bootstrap shell",
		description: "Boot the shell and mount the real module iframe/runtime.",
		transitions: [
			"shell:boot",
			"shell:runtime-domain-active",
			"stage:iframe-mounted",
			"module:instance-ready"
		],
		outcomes: [
			"shell product name visible",
			"mounted module identity shown",
			"lifecycle started visible",
			"stage module instance exists"
		]
	},
	{
		id: "ui-about-domain",
		suite: "ui",
		label: "About domain",
		description:
			"Expose product context and reference links in the About domain.",
		transitions: ["domain:about-opened", "domain:about-links-rendered"],
		outcomes: [
			"about copy visible",
			"reference links visible",
			"package identity visible"
		]
	},
	{
		id: "ui-config-sidebar",
		suite: "ui",
		label: "Config sidebar",
		description:
			"Browse config tabs, inspect editor state, and manage local draft/reset flow.",
		transitions: [
			"domain:config-opened",
			"config:general-tab-opened",
			"config:module-tab-opened",
			"config:draft-marked-dirty",
			"config:draft-reset"
		],
		outcomes: [
			"general controls visible",
			"module editor valid",
			"draft state changes visible",
			"reset restores saved state"
		]
	},
	{
		id: "ui-config-editor-validation",
		suite: "ui",
		label: "Config editor validation",
		description:
			"Verify editor validity feedback, header-false boolean rendering, and module-tab revert.",
		transitions: [
			"config:header-false-in-preview",
			"config:invalid-config-shown",
			"config:module-tab-reverted"
		],
		outcomes: [
			"header false renders as boolean",
			"invalid config disables save",
			"module tab revert restores json"
		]
	},
	{
		id: "ui-config-comment-support",
		suite: "ui",
		label: "Config editor comment support",
		description:
			"JS comments in the config editor stay valid but are stripped on explicit format (JSON-backed storage).",
		transitions: [
			"config:comment-input-valid",
			"config:format-strips-comments"
		],
		outcomes: [
			"comment text preserved in editor",
			"format button strips comments"
		]
	},
	{
		id: "ui-debug-sidebar",
		suite: "ui",
		label: "Debug sidebar",
		description: "Inspect console/helper log surfaces in the Debug domain.",
		transitions: ["domain:debug-opened", "debug:console-tab-opened"],
		outcomes: [
			"debug copy visible",
			"helper log visible",
			"console log visible"
		]
	},
	{
		id: "ui-notifications-sidebar",
		suite: "ui",
		label: "Notifications sidebar",
		description:
			"Emit a frontend notification and confirm it lands in the shell log.",
		transitions: [
			"domain:notifications-opened",
			"notifications:payload-submitted",
			"notifications:frontend-log-updated"
		],
		outcomes: [
			"notification emitted status visible",
			"frontend notification log updated"
		]
	},
	{
		id: "ui-runtime-controls",
		suite: "ui",
		label: "Runtime controls",
		description:
			"Toggle runtime visibility/activity controls and preserve lifecycle state.",
		transitions: [
			"domain:runtime-opened",
			"runtime:hide",
			"runtime:show",
			"runtime:suspend",
			"runtime:resume"
		],
		outcomes: [
			"runtime diagnostics visible",
			"visibility state updates",
			"activity state updates",
			"started state preserved"
		]
	},
	{
		id: "integration-module-mount",
		suite: "integration",
		label: "Module mount",
		description:
			"Mount the generated test module with scripts, styles, translations, and config helpers.",
		transitions: [
			"stage:module-mounted",
			"module:scripts-loaded",
			"module:translations-loaded",
			"module:socket-api-ready",
			"config:editor-reflects-mounted-config"
		],
		outcomes: [
			"stage root visible",
			"translated text visible",
			"script status visible",
			"style probe applied",
			"runtime contract helpers available"
		]
	},
	{
		id: "integration-module-options",
		suite: "integration",
		label: "Module options save",
		description:
			"Persist supported module envelope options and surface disabled-state handling.",
		transitions: [
			"config:module-options-edited",
			"config:module-options-saved",
			"stage:visibility-reflects-hidden-on-startup",
			"stage:header-semantics-updated",
			"stage:disabled-state-rendered"
		],
		outcomes: [
			"saved options visible on module data",
			"animation markers updated",
			"header disabled state visible",
			"disabled stage shell visible"
		]
	},
	{
		id: "integration-module-reload",
		suite: "integration",
		label: "Module reload",
		description:
			"Reload the module from config changes while preserving lifecycle and helper behavior.",
		transitions: [
			"runtime:suspend",
			"runtime:resume",
			"config:language-changed",
			"config:module-config-saved",
			"stage:module-reloaded",
			"helper:websocket-after-reload"
		],
		outcomes: [
			"reloaded translation visible",
			"reloaded badge visible",
			"lifecycle counters reset",
			"helper reply uses reloaded config"
		]
	},
	{
		id: "integration-notifications-helper",
		suite: "integration",
		label: "Notifications and helper traffic",
		description:
			"Send frontend notifications and exercise helper websocket ping/pong traffic.",
		transitions: [
			"domain:notifications-opened",
			"notifications:frontend-message-sent",
			"stage:notification-received",
			"notifications:websocket-tab-opened",
			"helper:ping",
			"helper:pong"
		],
		outcomes: [
			"stage notice visible",
			"notification log updated",
			"websocket log updated",
			"helper log updated"
		]
	},
	{
		id: "integration-styles-refresh",
		suite: "integration",
		label: "Styles refresh",
		description:
			"Refresh mounted-module styles from config without reloading the module runtime.",
		transitions: [
			"styles:baseline-read",
			"styles:fixture-updated",
			"config:styles-refresh-clicked",
			"styles:stage-refreshed"
		],
		outcomes: [
			"refresh status visible",
			"style probe color changes",
			"runtime marker preserved"
		]
	},
	{
		id: "integration-update-dom-stability",
		suite: "integration",
		label: "updateDom stability",
		description:
			"Call updateDom with unchanged output and keep DOM reuse/core notifications stable.",
		transitions: [
			"module:updateDom-called",
			"module:dom-reused",
			"core:module-dom-updated-notified"
		],
		outcomes: [
			"same DOM node preserved",
			"core notification counts remain coherent"
		]
	},
	{
		id: "integration-language-autosave",
		suite: "integration",
		label: "Language autosave",
		description:
			"Autosave runtime language changes and reload the viewport into the new locale.",
		transitions: [
			"config:language-selector-opened",
			"config:language-changed",
			"viewport:reloaded",
			"config:editor-reflects-language"
		],
		outcomes: [
			"reloaded translation visible",
			"language selector persists value",
			"module editor reflects runtime language"
		]
	},
	{
		id: "integration-header-semantics",
		suite: "integration",
		label: "Header semantics",
		description:
			"Match MagicMirror header behavior for false, empty, whitespace, and undefined values.",
		transitions: [
			"header:empty-string",
			"header:false",
			"header:whitespace",
			"header:undefined"
		],
		outcomes: [
			"empty string falls back to module name",
			"false hides header",
			"whitespace remains visible",
			"undefined falls back to module name"
		]
	},
	{
		id: "ui-domain-navigation-order",
		suite: "ui",
		label: "Domain navigation order",
		description:
			"Topbar link order and sidebar panel order match the canonical domain sequence.",
		transitions: [
			"navigation:topbar-rendered",
			"navigation:sidebar-rendered"
		],
		outcomes: [
			"topbar links in canonical order",
			"sidebar panels in canonical order",
			"topbar and sidebar orders match"
		]
	},
	{
		id: "ui-domain-nav-runtime",
		suite: "ui",
		label: "Runtime domain navigation",
		description:
			"Clicking Runtime in topbar activates only the Runtime panel.",
		transitions: ["navigation:runtime-opened"],
		outcomes: ["runtime panel active", "other panels inactive"]
	},
	{
		id: "ui-domain-nav-config",
		suite: "ui",
		label: "Config domain navigation",
		description:
			"Clicking Config in topbar activates only the Config panel.",
		transitions: ["navigation:config-opened"],
		outcomes: ["config panel active", "other panels inactive"]
	},
	{
		id: "ui-domain-nav-notifications",
		suite: "ui",
		label: "Notifications domain navigation",
		description:
			"Clicking Notifications in topbar activates only the Notifications panel.",
		transitions: ["navigation:notifications-opened"],
		outcomes: ["notifications panel active", "other panels inactive"]
	},
	{
		id: "ui-domain-nav-debug",
		suite: "ui",
		label: "Debug domain navigation",
		description: "Clicking Debug in topbar activates only the Debug panel.",
		transitions: ["navigation:debug-opened"],
		outcomes: ["debug panel active", "other panels inactive"]
	},
	{
		id: "ui-domain-nav-quality",
		suite: "ui",
		label: "Quality domain navigation",
		description:
			"Clicking Quality in topbar activates only the Quality panel.",
		transitions: ["navigation:quality-opened"],
		outcomes: ["quality panel active", "other panels inactive"]
	},
	{
		id: "ui-domain-nav-mmversion",
		suite: "ui",
		label: "MM Version domain navigation",
		description:
			"Clicking MM Version in sidebar activates only the MM Version panel.",
		transitions: ["navigation:mmversion-opened"],
		outcomes: ["mmversion panel active", "other panels inactive"]
	},
	{
		id: "ui-domain-nav-about",
		suite: "ui",
		label: "About domain navigation",
		description: "Clicking About in topbar activates only the About panel.",
		transitions: ["navigation:about-opened"],
		outcomes: ["about panel active", "other panels inactive"]
	},
	{
		id: "ui-mmversion-domain-renders",
		suite: "ui",
		label: "MM Version domain renders",
		description: "MM Version domain section exists in the sidebar DOM.",
		transitions: ["mmversion:domain-mounted"],
		outcomes: ["mmversion section present in DOM"]
	},
	{
		id: "ui-mmversion-domain-activates",
		suite: "ui",
		label: "MM Version domain activates",
		description: "Opening mmversion domain sets its panel to data-active=true.",
		transitions: ["mmversion:domain-opened"],
		outcomes: ["mmversion panel active"]
	},
	{
		id: "ui-mmversion-sidebar-stays-open",
		suite: "ui",
		label: "Sidebar stays open on mmversion navigation",
		description: "Sidebar stays open and panel is active after opening mmversion.",
		transitions: ["mmversion:domain-opened"],
		outcomes: ["sidebar remains open", "mmversion panel active"]
	},
	{
		id: "ui-mmversion-topbar-badge-renders",
		suite: "ui",
		label: "MM Version topbar badge renders",
		description: "Topbar MM version badge is present in the DOM.",
		transitions: ["mmversion:badge-mounted"],
		outcomes: ["badge element present"]
	},
	{
		id: "ui-mmversion-topbar-badge-shows-builtin",
		suite: "ui",
		label: "MM Version badge shows built-in",
		description: "Topbar badge shows 'built-in' when no mmvm version is active.",
		transitions: ["mmversion:badge-loaded"],
		outcomes: ["badge label is built-in"]
	},
	{
		id: "ui-mmversion-topbar-badge-opens-domain",
		suite: "ui",
		label: "MM Version badge opens domain",
		description:
			"Clicking topbar badge opens the mmversion domain without closing sidebar.",
		transitions: ["mmversion:badge-clicked"],
		outcomes: ["sidebar open", "mmversion panel active"]
	},
	{
		id: "ui-mmversion-active-row-shows-builtin",
		suite: "ui",
		label: "MM Version active core shows version without suffix",
		description: "Active core input shows version number only — no '(built-in)' suffix appended.",
		transitions: ["mmversion:domain-opened", "mmversion:active-core-loaded"],
		outcomes: ["active core input has no built-in suffix", "active core input is non-empty"]
	},
	{
		id: "ui-mmversion-version-input-present",
		suite: "ui",
		label: "MM Version input present",
		description: "Version text input is rendered inside the domain.",
		transitions: ["mmversion:domain-opened"],
		outcomes: ["version input present"]
	},
	{
		id: "ui-mmversion-activate-button-present",
		suite: "ui",
		label: "MM Version activate button present",
		description: "Activate button is rendered inside the domain.",
		transitions: ["mmversion:domain-opened"],
		outcomes: ["activate button present"]
	},
	{
		id: "ui-mmversion-activate-button-disabled-when-empty",
		suite: "ui",
		label: "MM Version reset button disabled when using built-in",
		description: "Reset button is disabled when the active core is already the built-in version.",
		transitions: ["mmversion:builtin-active"],
		outcomes: ["reset button disabled"]
	},
	{
		id: "ui-mmversion-activate-button-enabled-when-filled",
		suite: "ui",
		label: "MM Version switch version select has bleeding-edge option",
		description: "Switch version select always contains bleeding-edge (develop) as the first option.",
		transitions: ["mmversion:domain-opened"],
		outcomes: ["bleeding-edge option present as first item"]
	},
	{
		id: "ui-mmversion-active-core-version-only",
		suite: "ui",
		label: "MM Version active core shows version only",
		description: "Active core input reflects the version number returned by the server without any UI suffix.",
		transitions: ["mmversion:active-core-loaded"],
		outcomes: ["active core value equals raw version string"]
	},
	{
		id: "ui-mmversion-dropdown-bleeding-edge-first",
		suite: "ui",
		label: "MM Version dropdown bleeding-edge is first",
		description: "Switch version dropdown always renders bleeding-edge (develop) as the first option.",
		transitions: ["mmversion:domain-opened", "mmversion:dropdown-rendered"],
		outcomes: ["first dropdown option is develop"]
	},
	{
		id: "ui-mmversion-dropdown-includes-builtin-version",
		suite: "ui",
		label: "MM Version dropdown includes built-in version",
		description: "Once releases load, the built-in version appears in the dropdown without '(built-in)' label.",
		transitions: ["mmversion:releases-loaded"],
		outcomes: ["builtin version present in dropdown options", "builtin option has no text suffix"]
	},
	{
		id: "ui-mmversion-switch-version-select-present",
		suite: "ui",
		label: "MM Version switch version select present",
		description: "Switch version select element is rendered inside the domain.",
		transitions: ["mmversion:domain-opened"],
		outcomes: ["version select present"]
	},
	{
		id: "ui-domain-nav-dropdown-opens",
		suite: "ui",
		label: "DomainNav dropdown opens",
		description: "DomainNav trigger opens the dropdown panel on click.",
		transitions: ["domain-nav:trigger-clicked"],
		outcomes: ["dropdown panel visible"]
	},
	{
		id: "ui-domain-nav-dropdown-closes-on-outside-click",
		suite: "ui",
		label: "DomainNav dropdown closes on outside click",
		description:
			"DomainNav dropdown closes when clicking outside the panel.",
		transitions: ["domain-nav:outside-mousedown"],
		outcomes: ["dropdown panel hidden"]
	},
	{
		id: "ui-domain-nav-trigger-reflects-active-domain",
		suite: "ui",
		label: "DomainNav trigger reflects active domain",
		description:
			"DomainNav trigger label updates to reflect the selected domain.",
		transitions: ["domain-nav:domain-selected"],
		outcomes: ["trigger label matches active domain"]
	},
	{
		id: "ui-domain-nav-dropdown-closes-on-selection",
		suite: "ui",
		label: "DomainNav dropdown closes on selection",
		description: "DomainNav dropdown closes after selecting a domain.",
		transitions: ["domain-nav:link-clicked"],
		outcomes: ["dropdown panel hidden after selection"]
	},
	{
		id: "ui-sidebar-toggle-opens",
		suite: "ui",
		label: "Sidebar tab opens sidebar",
		description: "Sidebar tab button opens the sidebar when it is closed.",
		transitions: ["sidebar:tab-clicked-while-closed"],
		outcomes: ["sidebar becomes visible"]
	},
	{
		id: "ui-sidebar-toggle-closes",
		suite: "ui",
		label: "Sidebar tab closes sidebar",
		description: "Sidebar tab button closes the sidebar when it is open.",
		transitions: ["sidebar:tab-clicked-while-open"],
		outcomes: ["sidebar becomes hidden"]
	}
] as const;

/**
 * Fast lookup index for journey definitions by identifier.
 */
const journeyCatalogById = new Map(
	journeyCatalog.map((definition) => [definition.id, definition])
);

/**
 * Deduplicates values while preserving first-seen order.
 */
function dedupe<T>(values: readonly T[]): T[] {
	return Array.from(new Set(values));
}

/**
 * Converts covered-vs-total counts into a percentage with two-decimal
 * precision for report output.
 */
function toPercent(covered: number, total: number): number {
	if (total === 0) {
		return 100;
	}

	return Number(((covered / total) * 100).toFixed(2));
}

/**
 * Computes the weighted headline score used by the terminal summary.
 */
function toScore(
	journeyPercent: number,
	transitionPercent: number,
	outcomePercent: number
): number {
	return Number(
		(
			journeyPercent * 0.4 +
			transitionPercent * 0.35 +
			outcomePercent * 0.25
		).toFixed(1)
	);
}

/**
 * Resolves a journey definition and rejects IDs from another suite so tests
 * cannot accidentally claim coverage for the wrong domain.
 */
function getJourneyDefinition(
	suite: JourneySuiteName,
	journeyId: JourneyId
): JourneyDefinition {
	const definition = journeyCatalogById.get(journeyId);
	if (!definition) {
		throw new Error(`Unknown journey coverage id "${journeyId}".`);
	}
	if (definition.suite !== suite) {
		throw new Error(
			`Journey "${journeyId}" belongs to suite "${definition.suite}", not "${suite}".`
		);
	}
	return definition;
}

/**
 * Builds normalized task metadata for one browser-backed test.
 *
 * Accepts either one journey ID or a list of IDs, validates that every
 * journey belongs to the declared suite, then expands the catalog entries into
 * deduplicated transition and outcome coverage.
 */
export function buildJourneyCoverageMeta(
	suite: JourneySuiteName,
	journeyIds: JourneyId | JourneyId[]
): JourneyCoverageMeta {
	const normalizedJourneyIds = dedupe(
		Array.isArray(journeyIds) ? journeyIds : [journeyIds]
	);
	const definitions = normalizedJourneyIds.map((journeyId) =>
		getJourneyDefinition(suite, journeyId)
	);

	return {
		suite,
		journeys: normalizedJourneyIds,
		transitions: dedupe(
			definitions.flatMap((definition) => definition.transitions)
		),
		outcomes: dedupe(
			definitions.flatMap((definition) => definition.outcomes)
		)
	};
}

/**
 * Creates a suite-local `test(...)` wrapper that automatically attaches journey
 * coverage metadata to Vitest task meta.
 */
export function createJourneyTest(suite: JourneySuiteName) {
	return function journeyTest(
		journeyIds: JourneyId | JourneyId[],
		name: string,
		fn: TestFunction
	) {
		return test(
			name,
			{
				meta: {
					journeyCoverage: buildJourneyCoverageMeta(suite, journeyIds)
				} satisfies Partial<TaskMeta>
			},
			fn
		);
	};
}

/**
 * Returns the catalog entries relevant to the requested suites.
 */
export function getJourneyCatalogForSuites(
	suites: readonly JourneySuiteName[]
): JourneyDefinition[] {
	const activeSuites = new Set(suites);
	return journeyCatalog.filter((definition) =>
		activeSuites.has(definition.suite)
	);
}

/**
 * Builds suite-level and overall journey coverage from executed test records.
 *
 * Only passed records count as covered. Failed tests still remain in the raw
 * record list so JSON artifacts can explain what ran without inflating
 * coverage.
 *
 * `explicitSuites` pins which suites are in scope even when `records` is
 * empty — prevents stale artifacts from surviving a run where all journey
 * tests crashed before producing records.
 */
export function buildJourneyCoverageSummary(
	records: readonly JourneyCoverageRecord[],
	explicitSuites?: readonly JourneySuiteName[]
): JourneyCoverageSummary | null {
	const suites = dedupe([
		...(explicitSuites ?? []),
		...records.map((record) => record.suite)
	]);
	if (suites.length === 0) {
		return null;
	}

	const catalog = getJourneyCatalogForSuites(suites);
	const passedRecords = records.filter(
		(record) => record.status === "passed"
	);

	const suiteSummaries = suites.map((suite) => {
		const suiteCatalog = catalog.filter(
			(definition) => definition.suite === suite
		);
		const suitePassedRecords = passedRecords.filter(
			(record) => record.suite === suite
		);
		const coveredJourneys = new Set(
			suitePassedRecords.flatMap((record) => record.journeys)
		);
		const coveredTransitions = new Set(
			suitePassedRecords.flatMap((record) => record.transitions)
		);
		const coveredOutcomes = new Set(
			suitePassedRecords.flatMap((record) => record.outcomes)
		);
		const allJourneyIds = suiteCatalog.map((definition) => definition.id);
		const allTransitions = dedupe(
			suiteCatalog.flatMap((definition) => definition.transitions)
		);
		const allOutcomes = dedupe(
			suiteCatalog.flatMap((definition) => definition.outcomes)
		);
		const journeyPercent = toPercent(
			coveredJourneys.size,
			allJourneyIds.length
		);
		const transitionPercent = toPercent(
			coveredTransitions.size,
			allTransitions.length
		);
		const outcomePercent = toPercent(
			coveredOutcomes.size,
			allOutcomes.length
		);

		return {
			suite,
			journeys: {
				covered: coveredJourneys.size,
				total: allJourneyIds.length,
				percent: journeyPercent,
				missed: allJourneyIds.filter(
					(journeyId) => !coveredJourneys.has(journeyId)
				)
			},
			transitions: {
				covered: coveredTransitions.size,
				total: allTransitions.length,
				percent: transitionPercent,
				missed: allTransitions.filter(
					(transitionId) => !coveredTransitions.has(transitionId)
				)
			},
			outcomes: {
				covered: coveredOutcomes.size,
				total: allOutcomes.length,
				percent: outcomePercent,
				missed: allOutcomes.filter(
					(outcomeId) => !coveredOutcomes.has(outcomeId)
				)
			},
			score: toScore(journeyPercent, transitionPercent, outcomePercent)
		} satisfies JourneySuiteSummary;
	});

	const allJourneyIds = catalog.map((definition) => definition.id);
	const allTransitions = dedupe(
		catalog.flatMap((definition) => definition.transitions)
	);
	const allOutcomes = dedupe(
		catalog.flatMap((definition) => definition.outcomes)
	);
	const coveredJourneys = new Set(
		passedRecords.flatMap((record) => record.journeys)
	);
	const coveredTransitions = new Set(
		passedRecords.flatMap((record) => record.transitions)
	);
	const coveredOutcomes = new Set(
		passedRecords.flatMap((record) => record.outcomes)
	);
	const overallJourneyPercent = toPercent(
		coveredJourneys.size,
		allJourneyIds.length
	);
	const overallTransitionPercent = toPercent(
		coveredTransitions.size,
		allTransitions.length
	);
	const overallOutcomePercent = toPercent(
		coveredOutcomes.size,
		allOutcomes.length
	);

	return {
		suites: suiteSummaries,
		overall: {
			suites,
			journeys: {
				covered: coveredJourneys.size,
				total: allJourneyIds.length,
				percent: overallJourneyPercent,
				missed: allJourneyIds.filter(
					(journeyId) => !coveredJourneys.has(journeyId)
				)
			},
			transitions: {
				covered: coveredTransitions.size,
				total: allTransitions.length,
				percent: overallTransitionPercent,
				missed: allTransitions.filter(
					(transitionId) => !coveredTransitions.has(transitionId)
				)
			},
			outcomes: {
				covered: coveredOutcomes.size,
				total: allOutcomes.length,
				percent: overallOutcomePercent,
				missed: allOutcomes.filter(
					(outcomeId) => !coveredOutcomes.has(outcomeId)
				)
			},
			score: toScore(
				overallJourneyPercent,
				overallTransitionPercent,
				overallOutcomePercent
			)
		},
		records: [...records]
	};
}
