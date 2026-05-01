/**
 * Unit coverage for Eta/Preact SSR parity across the hydrated shell surfaces.
 */
import assert from "node:assert/strict";
import { h } from "preact";
import { renderToString } from "preact/compat/server";
import { HTMLElement, parse } from "node-html-parser";
import {
	getModuleConfigUiMetadata,
	normalizeModuleConfig
} from "../../../config/module-options.ts";
import { Footer } from "../../../client/app/components/Footer.tsx";
import { Sidebar } from "../../../client/app/components/Sidebar.tsx";
import { Topbar } from "../../../client/app/components/Topbar.tsx";
import { AboutDomain } from "../../../client/app/components/sidebar/AboutDomain.tsx";
import { ConfigDomain } from "../../../client/app/components/sidebar/ConfigDomain.tsx";
import { DebugDomain } from "../../../client/app/components/sidebar/DebugDomain.tsx";
import { NotificationsDomain } from "../../../client/app/components/sidebar/NotificationsDomain.tsx";
import { RuntimeDomain } from "../../../client/app/components/sidebar/RuntimeDomain.tsx";
import type { HarnessState } from "../../../client/app/harness-state.ts";
import htmlModule from "../../../server/html.ts";

const { createHtmlPage } = htmlModule;

type DomProjection = string | ProjectedElement;

type ProjectedElement = {
	tag: string;
	attrs: Record<string, string>;
	children: DomProjection[];
};

const availableLanguages = [
	{ code: "en", label: "English" },
	{ code: "es", label: "Spanish" }
];

const harnessConfig = {
	moduleName: "MMM-TestModule",
	moduleEntry: "MMM-TestModule.js",
	moduleIdentifier: "MMM-TestModule_sandbox",
	header: false,
	hiddenOnStartup: false,
	language: "en",
	locale: "en-US"
};

const rawModuleConfig = {
	operatorName: "Fixture Operator"
};

const harness: HarnessState = {
	moduleName: harnessConfig.moduleName,
	language: harnessConfig.language,
	locale: harnessConfig.locale,
	sandboxUrl: "http://127.0.0.1:3010",
	watchEnabled: true,
	availableLanguages,
	moduleConfigOptions: getModuleConfigUiMetadata(),
	moduleConfig: normalizeModuleConfig(rawModuleConfig, {
		defaultConfigDeepMerge: false
	})
};

const shellHtml = createHtmlPage({
	watchEnabled: true,
	/**
	 * Gets available languages.
	 */
	getAvailableLanguages() {
		return availableLanguages;
	},
	/**
	 * Gets harness config.
	 */
	getHarnessConfig() {
		return harnessConfig;
	},
	/**
	 * Gets module config.
	 */
	getModuleConfig() {
		return rawModuleConfig;
	},
	/**
	 * Gets contract.
	 */
	getContract() {
		return {
			supported: ["Module.register", "sendNotification"]
		};
	},
	/**
	 * Gets helper log entries.
	 */
	getHelperLogEntries() {
		return [];
	}
});

const shellRoot = parse(shellHtml);

/**
 * Normalizes attribute values for stable Eta/Preact comparisons.
 */
function normalizeAttributeValue(name: string, value: string): string {
	if (name === "style") {
		return value
			.split(";")
			.map((declaration) => declaration.trim())
			.filter(Boolean)
			.map((declaration) => {
				const [propertyName, ...propertyValueParts] = declaration.split(":");
				return `${propertyName.trim()}:${propertyValueParts.join(":").trim()}`;
			})
			.join(";");
	}

	return value.replace(/\s+/g, " ").trim();
}

/**
 * Projects parsed DOM nodes into a comparison-friendly structure.
 */
function projectNode(node: HTMLElement): ProjectedElement;
function projectNode(node: unknown): DomProjection | null;
function projectNode(node: unknown): DomProjection | null {
	if (node instanceof HTMLElement) {
		const attributes = Object.fromEntries(
			Object.entries(node.attributes)
				.map(([name, value]) => {
					return [name, normalizeAttributeValue(name, value)] as const;
				})
				.sort(([left], [right]) => left.localeCompare(right))
		);
		const children = node.childNodes
			.map((childNode) => projectNode(childNode))
			.filter((childNode): childNode is DomProjection => {
				return childNode !== null;
			});

		return {
			tag: node.rawTagName,
			attrs: attributes,
			children
		};
	}

	const textContent =
		typeof node === "object" &&
		node !== null &&
		"rawText" in node &&
		typeof node.rawText === "string"
			? node.rawText.replace(/\s+/g, " ").trim()
			: "";

	return textContent ? textContent : null;
}

/**
 * Projects one selector from a rendered HTML fragment.
 */
function getProjectedSelector(html: string, selector: string): ProjectedElement {
	const element = parse(html).querySelector(selector);

	assert.ok(element, `Expected selector "${selector}" to exist.`);

	const projection = projectNode(element);

	assert.ok(
		projection && typeof projection !== "string",
		`Expected selector "${selector}" to resolve to an element projection.`
	);

	return projection;
}

/**
 * Projects one selector from the Eta-rendered shell document.
 */
function getProjectedShellSelector(selector: string): ProjectedElement {
	const element = shellRoot.querySelector(selector);

	assert.ok(element, `Expected shell selector "${selector}" to exist.`);

	const projection = projectNode(element);

	assert.ok(
		projection && typeof projection !== "string",
		`Expected shell selector "${selector}" to resolve to an element projection.`
	);

	return projection;
}

type ParityCase = {
	name: string;
	selector: string;
	render: () => string;
};

const parityCases: ParityCase[] = [
	{
		name: "topbar",
		selector: ".harness-topbar",
		render() {
			return renderToString(h(Topbar, { harness }));
		}
	},
	{
		name: "sidebar shell",
		selector: "#harness-sidebar",
		render() {
			return renderToString(h(Sidebar, { harness }));
		}
	},
	{
		name: "runtime domain",
		selector: "#domain-runtime",
		render() {
			return renderToString(h(RuntimeDomain, { harness }));
		}
	},
	{
		name: "config domain",
		selector: "#domain-config",
		render() {
			return renderToString(h(ConfigDomain, { harness }));
		}
	},
	{
		name: "notifications domain",
		selector: "#domain-notifications",
		render() {
			return renderToString(h(NotificationsDomain, {}));
		}
	},
	{
		name: "debug domain",
		selector: "#domain-debug",
		render() {
			return renderToString(h(DebugDomain, {}));
		}
	},
	{
		name: "about domain",
		selector: "#domain-about",
		render() {
			return renderToString(h(AboutDomain, {}));
		}
	},
	{
		name: "footer",
		selector: ".harness-footer",
		render() {
			return renderToString(h(Footer, {}));
		}
	}
];

parityCases.forEach(({ name, selector, render }) => {
	test(`shell Eta markup stays in sync with the hydrated ${name}`, () => {
		assert.deepEqual(
			getProjectedShellSelector(selector),
			getProjectedSelector(render(), selector)
		);
	});
});

// ── Domain ordering guards ────────────────────────────────────────────────────
// These tests exist to catch mismatches between Topbar.tsx and sidebar ordering.
// The bug pattern: changing one without the other produces wrong panels on click.

const CANONICAL_DOMAIN_ORDER = [
	"runtime",
	"config",
	"notifications",
	"debug",
	"quality",
	"about"
] as const;

test("Topbar menu items follow the canonical domain order", () => {
	const topbarHtml = renderToString(h(Topbar, { harness }));
	const topbarRoot = parse(topbarHtml);
	const links = topbarRoot.querySelectorAll("[data-domain]");
	const actualOrder = links.map((el) => el.getAttribute("data-domain"));
	assert.deepEqual(actualOrder, [...CANONICAL_DOMAIN_ORDER]);
});

test("Sidebar domain sections follow the canonical domain order", () => {
	const sidebarHtml = renderToString(h(Sidebar, { harness }));
	const sidebarRoot = parse(sidebarHtml);
	const sections = sidebarRoot.querySelectorAll("[data-domain]:not([data-tab]):not([data-tab-panel])");
	const actualOrder = [...new Set(sections.map((el) => el.getAttribute("data-domain")))];
	assert.deepEqual(actualOrder, [...CANONICAL_DOMAIN_ORDER]);
});

test("Topbar domain order matches sidebar domain order", () => {
	const topbarHtml = renderToString(h(Topbar, { harness }));
	const sidebarHtml = renderToString(h(Sidebar, { harness }));
	const topbarLinks = parse(topbarHtml)
		.querySelectorAll("[data-domain]")
		.map((el) => el.getAttribute("data-domain"));
	const sidebarSections = parse(sidebarHtml)
		.querySelectorAll("[data-domain]:not([data-tab]):not([data-tab-panel])");
	const sidebarOrder = [...new Set(sidebarSections.map((el) => el.getAttribute("data-domain")))];
	assert.deepEqual(topbarLinks, sidebarOrder, "Topbar and sidebar domain order must match exactly");
});

test("Topbar and RuntimeDomain fall back to empty/default harness values", () => {
	const minimalHarness: HarnessState = {};
	const topbarRoot = parse(renderToString(h(Topbar, { harness: minimalHarness })));
	const runtimeRoot = parse(
		renderToString(h(RuntimeDomain, { harness: minimalHarness }))
	);

	assert.equal(topbarRoot.querySelector(".harness-mounted-module code")?.text, "");
	assert.equal(
		runtimeRoot.querySelector(".sandbox-hint-list li code")?.text,
		"http://127.0.0.1:3010"
	);
	assert.equal(
		runtimeRoot.querySelectorAll(".sandbox-hint-list li code")[1]?.text,
		"sandbox UI"
	);
	assert.equal(
		runtimeRoot.querySelectorAll(".sandbox-hint-list li code")[2]?.text,
		"off"
	);
});

test("ConfigDomain tolerates missing options and reflects disabled/boolean module state", () => {
	const configRoot = parse(
		renderToString(
			h(ConfigDomain, {
				harness: {
					moduleName: "MMM-DisabledState",
					moduleConfig: {
						header: false,
						hiddenOnStartup: true,
						disabled: true
					}
				}
			})
		)
	);

	assert.equal(configRoot.querySelectorAll("#config-language option").length, 0);
	assert.equal(configRoot.querySelectorAll("#config-position option").length, 0);
	assert.equal(configRoot.querySelector("#config-header")?.getAttribute("disabled"), "");
	assert.equal(
		configRoot.querySelector("#config-header")?.getAttribute("value"),
		""
	);
	assert.equal(
		configRoot.querySelector("#config-hidden-on-startup")?.getAttribute("checked"),
		""
	);
	assert.equal(
		configRoot.querySelector("#config-disabled")?.getAttribute("checked"),
		""
	);
	assert.equal(
		configRoot.querySelector("module-config-editor")?.getAttribute("module-name"),
		"MMM-DisabledState"
	);
	assert.equal(
		configRoot.querySelector("module-config-editor")?.getAttribute("language"),
		""
	);
	assert.equal(
		configRoot.querySelector("module-config-editor")?.getAttribute("locale"),
		""
	);
});
