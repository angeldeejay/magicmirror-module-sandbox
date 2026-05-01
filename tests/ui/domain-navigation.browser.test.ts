/**
 * Browser-backed UI coverage for topbar domain navigation correctness.
 *
 * Each test verifies that clicking a topbar menu link activates exactly the
 * corresponding sidebar panel and leaves all other panels inactive.
 * A separate test asserts that the visual order of both the topbar links and
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
 * Returns the data-domain attribute values for all topbar menu links, in DOM order.
 */
function getTopbarDomainOrder(): Promise<string[]> {
	return pageEvaluate(() => {
		return Array.from(
			globalThis.document.querySelectorAll<HTMLElement>(
				".harness-menu-link[data-domain]"
			)
		).map((el) => el.dataset.domain ?? "");
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
	"topbar link order and sidebar panel order match the canonical domain sequence",
	async () => {
		await gotoSandbox();

		await expect
			.poll(getTopbarDomainOrder)
			.toEqual([...CANONICAL_DOMAIN_ORDER]);

		await expect
			.poll(getSidebarDomainOrder)
			.toEqual([...CANONICAL_DOMAIN_ORDER]);

		const topbarOrder = await getTopbarDomainOrder();
		const sidebarOrder = await getSidebarDomainOrder();
		expect(topbarOrder).toEqual(sidebarOrder);
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
