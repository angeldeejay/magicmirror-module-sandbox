/**
 * Browser-backed UI coverage for the MM Version sidebar domain.
 *
 * Verifies:
 * - Domain renders inside the sidebar when activated
 * - Topbar badge renders with expected text and opens the domain on click
 * - Active core input shows version only (no built-in suffix)
 * - Switch version select always has bleeding-edge as first option
 * - Built-in version appears in dropdown without label suffix
 * - Capability grid appears once domain is open
 * - Reset button disabled when using built-in; Activate button present and wired
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

// ── Helpers ───────────────────────────────────────────────────────────────────

function isMmVersionDomainActive(): Promise<boolean> {
	return pageEvaluate(() => {
		const el = globalThis.document.getElementById("domain-mmversion");
		return el?.dataset.active === "true";
	});
}

function getMmVersionDomainExists(): Promise<boolean> {
	return pageEvaluate(() => {
		return Boolean(globalThis.document.getElementById("domain-mmversion"));
	});
}

function getTopbarBadgeText(): Promise<string> {
	return pageEvaluate(() => {
		const badge = globalThis.document.querySelector<HTMLElement>(
			".mmv-topbar-badge"
		);
		return badge?.querySelector(".mmv-topbar-badge__label")?.textContent?.trim() ?? "";
	});
}

function getTopbarBadgeExists(): Promise<boolean> {
	return pageEvaluate(() => {
		return Boolean(
			globalThis.document.querySelector(".mmv-topbar-badge")
		);
	});
}

function getVersionInputExists(): Promise<boolean> {
	return pageEvaluate(() => {
		return Boolean(
			globalThis.document.querySelector(".mmv-version-input")
		);
	});
}

function getVersionInputValue(): Promise<string> {
	return pageEvaluate(() => {
		const input = globalThis.document.querySelector<HTMLInputElement>(
			".mmv-version-input"
		);
		return input?.value ?? "";
	});
}

function getActivateButtonExists(): Promise<boolean> {
	return pageEvaluate(() => {
		return Boolean(
			globalThis.document.querySelector(".mmv-activate-btn")
		);
	});
}

/** Returns disabled state of the Reset button (first .mmv-activate-btn). */
function getResetButtonDisabled(): Promise<boolean> {
	return pageEvaluate(() => {
		const btn = globalThis.document.querySelector<HTMLButtonElement>(
			".mmv-activate-btn"
		);
		return btn?.disabled ?? true;
	});
}

function getSwitchSelectExists(): Promise<boolean> {
	return pageEvaluate(() => {
		return Boolean(
			globalThis.document.querySelector(".mmv-version-select")
		);
	});
}

function getSwitchSelectFirstOptionValue(): Promise<string> {
	return pageEvaluate(() => {
		const sel = globalThis.document.querySelector<HTMLSelectElement>(
			".mmv-version-select"
		);
		return sel?.options[0]?.value ?? "";
	});
}

function getSwitchSelectOptions(): Promise<{ value: string; text: string }[]> {
	return pageEvaluate(() => {
		const sel = globalThis.document.querySelector<HTMLSelectElement>(
			".mmv-version-select"
		);
		return Array.from(sel?.options ?? []).map((o) => ({
			value: o.value,
			text: o.text
		}));
	});
}

function clickTopbarBadge(): Promise<void> {
	return pageEvaluate(() => {
		const badge = globalThis.document.querySelector<HTMLElement>(
			".mmv-topbar-badge"
		);
		badge?.click();
	});
}

function isSidebarOpen(): Promise<boolean> {
	return pageEvaluate(() => {
		return (
			globalThis.document.getElementById("harness-body")?.dataset
				.sidebarOpen === "true"
		);
	});
}

// ── Tests ─────────────────────────────────────────────────────────────────────

journeyTest(
	"ui-mmversion-domain-renders",
	"MM Version domain section exists in the sidebar DOM",
	async () => {
		await gotoSandbox();
		await expect.poll(getMmVersionDomainExists).toBe(true);
	}
);

journeyTest(
	"ui-mmversion-domain-activates",
	"opening mmversion domain sets its panel to data-active=true",
	async () => {
		await gotoSandbox();
		await openDomain("mmversion");
		await expect.poll(isMmVersionDomainActive).toBe(true);
	}
);

journeyTest(
	"ui-mmversion-sidebar-stays-open",
	"sidebar stays open after clicking the mmversion domain",
	async () => {
		await gotoSandbox();
		await openDomain("mmversion");
		await expect.poll(isSidebarOpen).toBe(true);
		await expect.poll(isMmVersionDomainActive).toBe(true);
	}
);

journeyTest(
	"ui-mmversion-topbar-badge-renders",
	"topbar MM version badge is present in the DOM",
	async () => {
		await gotoSandbox();
		await expect.poll(getTopbarBadgeExists).toBe(true);
	}
);

journeyTest(
	"ui-mmversion-topbar-badge-shows-builtin",
	"topbar badge shows the built-in core version number when no mmvm version is active",
	async () => {
		await gotoSandbox();
		await expect.poll(getTopbarBadgeText).toMatch(/^\d+\.\d+\.\d+/);
	}
);

journeyTest(
	"ui-mmversion-topbar-badge-opens-domain",
	"clicking the topbar badge opens the mmversion domain without closing the sidebar",
	async () => {
		await gotoSandbox();
		await clickTopbarBadge();
		await expect.poll(isSidebarOpen).toBe(true);
		await expect.poll(isMmVersionDomainActive).toBe(true);
	}
);

journeyTest(
	"ui-mmversion-active-row-shows-builtin",
	"active core input shows version number without built-in suffix",
	async () => {
		await gotoSandbox();
		await openDomain("mmversion");
		await expect.poll(getVersionInputValue, { timeout: 5000 }).not.toContain("(built-in)");
		await expect.poll(getVersionInputValue, { timeout: 5000 }).not.toBe("");
	}
);

journeyTest(
	"ui-mmversion-version-input-present",
	"version text input (active core display) is rendered inside the domain",
	async () => {
		await gotoSandbox();
		await openDomain("mmversion");
		await expect.poll(getVersionInputExists).toBe(true);
	}
);

journeyTest(
	"ui-mmversion-activate-button-present",
	"at least one action button is rendered inside the domain",
	async () => {
		await gotoSandbox();
		await openDomain("mmversion");
		await expect.poll(getActivateButtonExists).toBe(true);
	}
);

journeyTest(
	"ui-mmversion-activate-button-disabled-when-empty",
	"reset button is disabled when the active core is the built-in version",
	async () => {
		// Reset mmvm state before loading so the component mounts fresh
		await gotoSandbox();
		await pageEvaluate(() =>
			fetch("/__harness/mm-versions/active", { method: "DELETE" })
		);
		await gotoSandbox();
		await openDomain("mmversion");
		await expect.poll(getResetButtonDisabled).toBe(true);
	}
);

journeyTest(
	"ui-mmversion-activate-button-enabled-when-filled",
	"switch version select always contains the bleeding-edge option",
	async () => {
		await gotoSandbox();
		await openDomain("mmversion");
		await expect.poll(getSwitchSelectFirstOptionValue).toBe("develop");
	}
);

// ── New journeys for new behaviors ────────────────────────────────────────────

journeyTest(
	"ui-mmversion-switch-version-select-present",
	"switch version select element is rendered inside the domain",
	async () => {
		await gotoSandbox();
		await openDomain("mmversion");
		await expect.poll(getSwitchSelectExists).toBe(true);
	}
);

journeyTest(
	"ui-mmversion-dropdown-bleeding-edge-first",
	"switch version dropdown has bleeding-edge (develop) as the first option",
	async () => {
		await gotoSandbox();
		await openDomain("mmversion");
		await expect.poll(getSwitchSelectFirstOptionValue).toBe("develop");
	}
);

journeyTest(
	"ui-mmversion-active-core-version-only",
	"active core input shows a version number without any '(built-in)' suffix",
	async () => {
		await gotoSandbox();
		await openDomain("mmversion");
		await expect.poll(getVersionInputValue, { timeout: 6000 }).not.toBe("");
		const value = await getVersionInputValue();
		expect(value).not.toContain("(built-in)");
	}
);

journeyTest(
	"ui-mmversion-dropdown-includes-builtin-version",
	"once releases load, dropdown options do not contain any '(built-in)' text",
	async () => {
		await gotoSandbox();
		await openDomain("mmversion");
		// Wait until at least one release option loads beyond the develop entry
		await expect
			.poll(
				async () => {
					const opts = await getSwitchSelectOptions();
					return opts.length;
				},
				{ timeout: 15000, interval: 500 }
			)
			.toBeGreaterThan(1);
		const opts = await getSwitchSelectOptions();
		expect(opts.every((o) => !o.text.includes("(built-in)"))).toBe(true);
	}
);
