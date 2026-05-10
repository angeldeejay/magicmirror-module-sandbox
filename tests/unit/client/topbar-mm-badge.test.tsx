// @vitest-environment happy-dom
/**
 * Component unit tests for MmVersionBadge inside Topbar.
 */
import { render, screen, waitFor, act } from "@testing-library/preact";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { Topbar } from "../../../client/app/components/Topbar";

const HARNESS: import("../../../client/app/types").HarnessState = {
	moduleName: "MMM-Test",
	moduleVersion: "1.0.0",
	language: "en",
	locale: "en-US",
	availableLanguages: [],
	moduleConfigOptions: { positions: [], animateInOptions: [], animateOutOptions: [] },
	moduleConfig: {}
};

function makeVersionsFetch(
	data: Record<string, unknown> = {
		active: null,
		usingBuiltIn: true,
		builtInVersion: "2.35.0",
		versions: []
	}
) {
	return vi.fn(() =>
		Promise.resolve({ ok: true, json: () => Promise.resolve(data) } as Response)
	);
}

beforeEach(() => {
	vi.stubGlobal("fetch", makeVersionsFetch());
});

afterEach(() => {
	vi.unstubAllGlobals();
});

// ── MmVersionBadge initial state ──────────────────────────────────────────────

test("badge renders with built-in label initially showing builtInVersion", async () => {
	render(<Topbar harness={HARNESS} />);
	await waitFor(() => {
		const badge = document.querySelector(".mmv-topbar-badge__label") as HTMLElement;
		expect(badge?.textContent).toBe("2.35.0");
	});
});

test("badge has mmv-topbar-badge--builtin class when usingBuiltIn is true", async () => {
	render(<Topbar harness={HARNESS} />);
	await waitFor(() => {
		const badge = document.querySelector(".mmv-topbar-badge");
		expect(badge?.classList.contains("mmv-topbar-badge--builtin")).toBe(true);
	});
});

test("badge shows active version and loses --builtin class when a version is active", async () => {
	vi.stubGlobal(
		"fetch",
		makeVersionsFetch({
			active: "2.36.0",
			usingBuiltIn: false,
			builtInVersion: "2.35.0",
			versions: [{ key: "2.36.0", displayVersion: "2.36.0" }]
		})
	);

	render(<Topbar harness={HARNESS} />);
	await waitFor(() => {
		const badge = document.querySelector(".mmv-topbar-badge__label") as HTMLElement;
		expect(badge?.textContent).toBe("2.36.0");
		const btn = document.querySelector(".mmv-topbar-badge");
		expect(btn?.classList.contains("mmv-topbar-badge--builtin")).toBe(false);
	});
});

test("badge falls back to active key when displayVersion is absent", async () => {
	vi.stubGlobal(
		"fetch",
		makeVersionsFetch({
			active: "develop",
			usingBuiltIn: false,
			builtInVersion: "2.35.0",
			versions: [{ key: "develop" }]
		})
	);

	render(<Topbar harness={HARNESS} />);
	await waitFor(() => {
		const badge = document.querySelector(".mmv-topbar-badge__label") as HTMLElement;
		expect(badge?.textContent).toBe("develop");
	});
});

test("mm-version-changed event triggers refresh fetch", async () => {
	const mockFetch = makeVersionsFetch();
	vi.stubGlobal("fetch", mockFetch);

	render(<Topbar harness={HARNESS} />);
	await waitFor(() => expect(mockFetch.mock.calls.length).toBeGreaterThan(0));

	const callsBefore = mockFetch.mock.calls.length;
	await act(async () => {
		window.dispatchEvent(new CustomEvent("module-sandbox:mm-version-changed"));
	});
	await waitFor(() => expect(mockFetch.mock.calls.length).toBeGreaterThan(callsBefore));
});

// ── Topbar module name display ────────────────────────────────────────────────

test("topbar displays module name from harness prop", async () => {
	render(<Topbar harness={HARNESS} />);
	await waitFor(() => {
		expect(screen.getByText("MMM-Test")).toBeTruthy();
	});
});

test("topbar displays module version when provided", async () => {
	render(<Topbar harness={HARNESS} />);
	await waitFor(() => {
		expect(screen.getByText("v1.0.0")).toBeTruthy();
	});
});

test("topbar does not render version span when moduleVersion is absent", async () => {
	const noVer = { ...HARNESS, moduleVersion: undefined };
	render(<Topbar harness={noVer} />);
	await waitFor(() => {
		expect(document.querySelector(".harness-mounted-module-version")).toBeNull();
	});
});

// ── MmVersionBadge — uncovered branches ──────────────────────────────────────

test("badge shows data.active key when active is set but not found in versions array", async () => {
	vi.stubGlobal(
		"fetch",
		makeVersionsFetch({
			active: "2.36.0",
			usingBuiltIn: false,
			builtInVersion: "2.35.0",
			versions: []
		})
	);
	render(<Topbar harness={HARNESS} />);
	await waitFor(() => {
		const badge = document.querySelector(".mmv-topbar-badge__label") as HTMLElement;
		expect(badge?.textContent).toBe("2.36.0");
	});
});

test("badge strips -develop suffix from displayVersion", async () => {
	vi.stubGlobal(
		"fetch",
		makeVersionsFetch({
			active: "develop",
			usingBuiltIn: false,
			builtInVersion: "2.35.0",
			versions: [{ key: "develop", displayVersion: "2.36.0-develop" }]
		})
	);
	render(<Topbar harness={HARNESS} />);
	await waitFor(() => {
		const badge = document.querySelector(".mmv-topbar-badge__label") as HTMLElement;
		expect(badge?.textContent).toBe("2.36.0");
	});
});

test("badge silently ignores fetch errors and keeps previous state", async () => {
	vi.stubGlobal(
		"fetch",
		vi.fn(() => Promise.reject(new Error("network error")))
	);
	render(<Topbar harness={HARNESS} />);
	await waitFor(() => {
		const badge = document.querySelector(".mmv-topbar-badge__label") as HTMLElement;
		expect(badge?.textContent).toBe("—");
	});
});

// ── MmVersionBadge — null-coalescing fallback branches ────────────────────────

test("badge shows dash when response has no usingBuiltIn field", async () => {
	vi.stubGlobal("fetch", makeVersionsFetch({} as any));
	render(<Topbar harness={HARNESS} />);
	await waitFor(() => {
		const badge = document.querySelector(".mmv-topbar-badge__label") as HTMLElement;
		expect(badge?.textContent).toBe("—");
	});
});

test("badge shows dash when usingBuiltIn is true and builtInVersion is null", async () => {
	vi.stubGlobal(
		"fetch",
		makeVersionsFetch({ usingBuiltIn: true, builtInVersion: null, active: null, versions: [] })
	);
	render(<Topbar harness={HARNESS} />);
	await waitFor(() => {
		const badge = document.querySelector(".mmv-topbar-badge__label") as HTMLElement;
		expect(badge?.textContent).toBe("—");
	});
});

test("badge shows dash when usingBuiltIn is false and active is null", async () => {
	vi.stubGlobal(
		"fetch",
		makeVersionsFetch({ usingBuiltIn: false, active: null, builtInVersion: "2.35.0", versions: [] })
	);
	render(<Topbar harness={HARNESS} />);
	await waitFor(() => {
		const badge = document.querySelector(".mmv-topbar-badge__label") as HTMLElement;
		expect(badge?.textContent).toBe("—");
		const btn = document.querySelector(".mmv-topbar-badge");
		expect(btn?.classList.contains("mmv-topbar-badge--builtin")).toBe(false);
	});
});

test("badge shows active key when usingBuiltIn is false and versions array is absent", async () => {
	vi.stubGlobal(
		"fetch",
		makeVersionsFetch({ usingBuiltIn: false, active: "2.36.0", builtInVersion: "2.35.0" } as any)
	);
	render(<Topbar harness={HARNESS} />);
	await waitFor(() => {
		const badge = document.querySelector(".mmv-topbar-badge__label") as HTMLElement;
		expect(badge?.textContent).toBe("2.36.0");
	});
});
