// @vitest-environment happy-dom
/**
 * Component unit tests for Sidebar / DomainNav.
 */
import { render, screen, fireEvent, act } from "@testing-library/preact";
import { afterEach, expect, test, vi } from "vitest";
import { Sidebar } from "../../../client/app/components/Sidebar";
import type { HarnessState } from "../../../client/app/types";

const HARNESS: HarnessState = {
	moduleName: "MMM-Test",
	moduleVersion: "1.0.0",
	language: "en",
	locale: "en-US",
	availableLanguages: [],
	moduleConfigOptions: { positions: [], animateInOptions: [], animateOutOptions: [] },
	moduleConfig: {}
};

afterEach(() => {
	vi.unstubAllGlobals();
});

// ── DomainNav rendering ────────────────────────────────────────────────────────

test("domain nav renders all expected menu items", () => {
	vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
	render(<Sidebar harness={HARNESS} />);
	const links = document.querySelectorAll(".harness-domain-nav-link");
	const domains = Array.from(links).map((l) => (l as HTMLElement).dataset.domain);
	expect(domains).toContain("runtime");
	expect(domains).toContain("config");
	expect(domains).toContain("notifications");
	expect(domains).toContain("debug");
	expect(domains).toContain("quality");
	expect(domains).toContain("mmversion");
	expect(domains).toContain("about");
});

test("domain nav trigger button is present and starts collapsed", () => {
	vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
	render(<Sidebar harness={HARNESS} />);
	const trigger = document.querySelector(".harness-domain-nav-trigger") as HTMLButtonElement;
	expect(trigger).toBeTruthy();
	expect(trigger.getAttribute("aria-expanded")).toBe("false");
});

test("clicking trigger toggles the nav panel open", async () => {
	vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
	render(<Sidebar harness={HARNESS} />);
	const trigger = document.querySelector(".harness-domain-nav-trigger") as HTMLButtonElement;

	await act(async () => {
		fireEvent.click(trigger);
	});

	expect(trigger.getAttribute("aria-expanded")).toBe("true");
	const panel = document.querySelector(".harness-domain-nav-panel");
	expect(panel?.classList.contains("harness-domain-nav-panel--open")).toBe(true);
});

test("clicking trigger again closes the nav panel", async () => {
	vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
	render(<Sidebar harness={HARNESS} />);
	const trigger = document.querySelector(".harness-domain-nav-trigger") as HTMLButtonElement;

	await act(async () => { fireEvent.click(trigger); });
	await act(async () => { fireEvent.click(trigger); });

	expect(trigger.getAttribute("aria-expanded")).toBe("false");
});

test("clicking a nav link closes the panel", async () => {
	vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
	render(<Sidebar harness={HARNESS} />);
	const trigger = document.querySelector(".harness-domain-nav-trigger") as HTMLButtonElement;

	await act(async () => { fireEvent.click(trigger); });

	const configLink = document.querySelector('[data-domain="config"]') as HTMLElement;
	await act(async () => { fireEvent.click(configLink); });

	expect(trigger.getAttribute("aria-expanded")).toBe("false");
});

test("clicking outside the nav container closes the panel", async () => {
	vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
	render(<Sidebar harness={HARNESS} />);
	const trigger = document.querySelector(".harness-domain-nav-trigger") as HTMLButtonElement;

	await act(async () => { fireEvent.click(trigger); });
	expect(trigger.getAttribute("aria-expanded")).toBe("true");

	await act(async () => {
		fireEvent.mouseDown(document.body);
	});

	expect(trigger.getAttribute("aria-expanded")).toBe("false");
});

test("clicking inside the nav container does not close the panel", async () => {
	vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
	render(<Sidebar harness={HARNESS} />);
	const trigger = document.querySelector(".harness-domain-nav-trigger") as HTMLButtonElement;

	await act(async () => { fireEvent.click(trigger); });
	expect(trigger.getAttribute("aria-expanded")).toBe("true");

	const panel = document.querySelector(".harness-domain-nav-panel") as HTMLElement;
	await act(async () => {
		fireEvent.mouseDown(panel);
	});

	expect(trigger.getAttribute("aria-expanded")).toBe("true");
});

// ── Domain sections presence ──────────────────────────────────────────────────

test("sidebar contains the mmversion domain section", () => {
	vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
	render(<Sidebar harness={HARNESS} />);
	expect(document.getElementById("domain-mmversion")).toBeTruthy();
});

// ── DomainNav — MutationObserver and edge cases ───────────────────────────────

test("MutationObserver updates active domain label when a link gets data-active=true", async () => {
	vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
	render(<Sidebar harness={HARNESS} />);

	const trigger = document.querySelector(".harness-domain-nav-trigger") as HTMLButtonElement;
	// Initially shows "Runtime" (activeDomain = "runtime")
	expect(trigger.textContent).toContain("Runtime");

	await act(async () => {
		const configLink = document.getElementById("menu-config") as HTMLElement;
		configLink.dataset.active = "true";
		// Allow MutationObserver microtask to fire
		await new Promise((r) => setTimeout(r, 10));
	});

	expect(trigger.textContent).toContain("Config");
});

test("MutationObserver sets empty activeDomain when no link has data-active=true", async () => {
	vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
	render(<Sidebar harness={HARNESS} />);

	await act(async () => {
		// Set one link active, then remove it — observer fires with no active element
		const runtimeLink = document.getElementById("menu-runtime") as HTMLElement;
		runtimeLink.dataset.active = "true";
		await new Promise((r) => setTimeout(r, 10));
		delete runtimeLink.dataset.active;
		await new Promise((r) => setTimeout(r, 10));
	});

	// Component doesn't crash — trigger still renders
	expect(document.querySelector(".harness-domain-nav-trigger")).toBeTruthy();
});
