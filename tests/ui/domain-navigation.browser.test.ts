/**
 * Browser-backed UI coverage for sidebar domain navigation correctness.
 *
 * Each test verifies that using the DomainNav dropdown activates exactly the
 * corresponding sidebar panel and leaves all other panels inactive.
 * A separate test asserts that the visual order of both the DomainNav links and
 * the sidebar sections matches the canonical domain sequence — catching the
 * class of regression where one surface is reordered without updating the other.
 */
import { afterAll, expect } from "vitest";
import {
	closeSandbox,
	gotoSandbox,
	openDomain,
	pageEvaluate
} from "../_helpers/helpers.browser.ts";
import { createJourneyTest } from "../_helpers/journey-coverage.ts";

const journeyTest = createJourneyTest("ui");

afterAll(async () => {
	await closeSandbox();
});

const CANONICAL_DOMAIN_ORDER = [
	"runtime",
	"config",
	"notifications",
	"debug",
	"quality",
	"about"
] as const;

type Domain = (typeof CANONICAL_DOMAIN_ORDER)[number];

/**
 * Returns the data-domain attribute values for all DomainNav dropdown links, in DOM order.
 */
function getDomainNavOrder(): Promise<string[]> {
	return pageEvaluate(() => {
		return Array.from(
			globalThis.document.querySelectorAll<HTMLElement>(
				".harness-domain-nav-link[data-domain]"
			)
		).map((el) => el.dataset.domain ?? "");
	});
}

/**
 * Returns whether the DomainNav dropdown panel is currently open.
 */
function isDomainNavOpen(): Promise<boolean> {
	return pageEvaluate(() => {
		const panel = globalThis.document.querySelector(
			".harness-domain-nav-panel"
		);
		return (
			panel?.classList.contains("harness-domain-nav-panel--open") ?? false
		);
	});
}

/**
 * Returns the text content of the DomainNav trigger button (active domain label).
 */
function getDomainNavTriggerLabel(): Promise<string> {
	return pageEvaluate(() => {
		const trigger = globalThis.document.querySelector<HTMLElement>(
			".harness-domain-nav-trigger"
		);
		return trigger?.textContent?.trim().replace(/[\s]+/g, " ") ?? "";
	});
}

/**
 * Returns the data-domain attribute values for all top-level sidebar panels, in DOM order.
 * Deduplicates because some domains have multiple elements sharing data-domain.
 */
function getSidebarDomainOrder(): Promise<string[]> {
	return pageEvaluate(() => {
		const seen = new Set<string>();
		const order: string[] = [];
		for (const el of globalThis.document.querySelectorAll<HTMLElement>(
			".sandbox-domain[data-domain]"
		)) {
			const domain = el.dataset.domain ?? "";
			if (!seen.has(domain)) {
				seen.add(domain);
				order.push(domain);
			}
		}
		return order;
	});
}

/**
 * Returns the data-active attribute values for all top-level sidebar panels,
 * keyed by their data-domain value.
 */
function getActivePanelMap(): Promise<Record<string, string>> {
	return pageEvaluate(() => {
		const map: Record<string, string> = {};
		for (const el of globalThis.document.querySelectorAll<HTMLElement>(
			".sandbox-domain[data-domain]"
		)) {
			const domain = el.dataset.domain ?? "";
			if (!map[domain]) {
				map[domain] = el.dataset.active ?? "false";
			}
		}
		return map;
	});
}

// ── Order guard ───────────────────────────────────────────────────────────────

journeyTest(
	"ui-domain-navigation-order",
	"DomainNav dropdown order and sidebar panel order match the canonical domain sequence",
	async () => {
		await gotoSandbox();

		await expect
			.poll(getDomainNavOrder)
			.toEqual([...CANONICAL_DOMAIN_ORDER]);

		await expect
			.poll(getSidebarDomainOrder)
			.toEqual([...CANONICAL_DOMAIN_ORDER]);

		const navOrder = await getDomainNavOrder();
		const sidebarOrder = await getSidebarDomainOrder();
		expect(navOrder).toEqual(sidebarOrder);
	}
);

// ── DomainNav dropdown behavior ───────────────────────────────────────────────

journeyTest(
	"ui-domain-nav-dropdown-opens",
	"DomainNav trigger opens the dropdown panel on click",
	async () => {
		await gotoSandbox();
		await expect.poll(isDomainNavOpen).toBe(false);
		await pageEvaluate(() => {
			globalThis.document
				.querySelector<HTMLElement>(".harness-domain-nav-trigger")
				?.click();
		});
		await expect.poll(isDomainNavOpen).toBe(true);
	}
);

journeyTest(
	"ui-domain-nav-dropdown-closes-on-outside-click",
	"DomainNav dropdown closes when clicking outside",
	async () => {
		await gotoSandbox();
		await pageEvaluate(() => {
			globalThis.document
				.querySelector<HTMLElement>(".harness-domain-nav-trigger")
				?.click();
		});
		await expect.poll(isDomainNavOpen).toBe(true);
		await pageEvaluate(() => {
			globalThis.document.body.dispatchEvent(
				new MouseEvent("mousedown", { bubbles: true })
			);
		});
		await expect.poll(isDomainNavOpen).toBe(false);
	}
);

journeyTest(
	"ui-domain-nav-trigger-reflects-active-domain",
	"DomainNav trigger label updates to reflect the selected domain",
	async () => {
		await gotoSandbox();
		await openDomain("config");
		await expect.poll(getDomainNavTriggerLabel).toMatch(/config/i);
	}
);

journeyTest(
	"ui-domain-nav-dropdown-closes-on-selection",
	"DomainNav dropdown closes after selecting a domain",
	async () => {
		await gotoSandbox();
		await pageEvaluate(() => {
			globalThis.document
				.querySelector<HTMLElement>(".harness-domain-nav-trigger")
				?.click();
		});
		await expect.poll(isDomainNavOpen).toBe(true);
		await pageEvaluate(() => {
			globalThis.document
				.querySelector<HTMLElement>("#menu-config")
				?.click();
		});
		await expect.poll(isDomainNavOpen).toBe(false);
	}
);

// ── Sidebar toggle ────────────────────────────────────────────────────────────

function isSidebarOpen(): Promise<boolean> {
	return pageEvaluate(() => {
		return (
			globalThis.document.getElementById("harness-body")?.dataset
				.sidebarOpen === "true"
		);
	});
}

journeyTest(
	"ui-sidebar-toggle-opens",
	"sidebar tab button opens the sidebar when it is closed",
	async () => {
		await gotoSandbox();
		await expect.poll(isSidebarOpen).toBe(true);
		// Close sidebar first via the tab
		await pageEvaluate(() => {
			globalThis.document
				.querySelector<HTMLElement>(".harness-sidebar-tab")
				?.click();
		});
		await expect.poll(isSidebarOpen).toBe(false);
		// Re-open
		await pageEvaluate(() => {
			globalThis.document
				.querySelector<HTMLElement>(".harness-sidebar-tab")
				?.click();
		});
		await expect.poll(isSidebarOpen).toBe(true);
	}
);

journeyTest(
	"ui-sidebar-toggle-closes",
	"sidebar tab button closes the sidebar when it is open",
	async () => {
		await gotoSandbox();
		await expect.poll(isSidebarOpen).toBe(true);
		await pageEvaluate(() => {
			globalThis.document
				.querySelector<HTMLElement>(".harness-sidebar-tab")
				?.click();
		});
		await expect.poll(isSidebarOpen).toBe(false);
	}
);

// ── Per-domain navigation ─────────────────────────────────────────────────────

const domainNavCases: Array<{ journeyId: string; domain: Domain }> = [
	{ journeyId: "ui-domain-nav-runtime", domain: "runtime" },
	{ journeyId: "ui-domain-nav-config", domain: "config" },
	{ journeyId: "ui-domain-nav-notifications", domain: "notifications" },
	{ journeyId: "ui-domain-nav-debug", domain: "debug" },
	{ journeyId: "ui-domain-nav-quality", domain: "quality" },
	{ journeyId: "ui-domain-nav-about", domain: "about" }
];

domainNavCases.forEach(({ journeyId, domain }) => {
	journeyTest(
		journeyId,
		`clicking ${domain} activates only the ${domain} sidebar panel`,
		async () => {
			await gotoSandbox();
			await openDomain(domain);

			const activeMap = await getActivePanelMap();

			// Target panel must be active.
			expect(activeMap[domain]).toBe("true");

			// All other panels must be inactive.
			for (const other of CANONICAL_DOMAIN_ORDER) {
				if (other !== domain) {
					expect(activeMap[other]).toBe("false");
				}
			}
		}
	);
});
