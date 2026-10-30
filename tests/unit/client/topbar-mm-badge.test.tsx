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

// ── MmVersionBadge — version reported by the stage ────────────────────────────

function dispatchStageReady(detail: Record<string, unknown>) {
	window.dispatchEvent(new CustomEvent("module-sandbox:stage-ready", { detail }));
}

test("badge shows the version reported by the stage", async () => {
	render(<Topbar harness={HARNESS} />);
	await waitFor(() => {
		expect(document.querySelector(".mmv-topbar-badge__label")?.textContent).toBe("2.35.0");
	});

	await act(async () => {
		dispatchStageReady({ mmVersion: "2.38.0" });
	});

	await waitFor(() => {
		expect(document.querySelector(".mmv-topbar-badge__label")?.textContent).toBe("2.38.0");
	});
});

test("badge titles the mismatch when the stage disagrees with the server", async () => {
	render(<Topbar harness={HARNESS} />);
	await waitFor(() => {
		expect(document.querySelector(".mmv-topbar-badge__label")?.textContent).toBe("2.35.0");
	});

	await act(async () => {
		dispatchStageReady({ mmVersion: "2.38.0" });
	});

	await waitFor(() => {
		const title = document.querySelector(".mmv-topbar-badge")?.getAttribute("title") ?? "";
		expect(title).toContain("2.38.0");
		expect(title).toContain("2.35.0");
		expect(title.toLowerCase()).toContain("mismatch");
	});
});

test("badge has no mismatch title when the stage agrees with the server", async () => {
	render(<Topbar harness={HARNESS} />);
	await waitFor(() => {
		expect(document.querySelector(".mmv-topbar-badge__label")?.textContent).toBe("2.35.0");
	});

	await act(async () => {
		dispatchStageReady({ mmVersion: "2.35.0" });
	});

	const title = document.querySelector(".mmv-topbar-badge")?.getAttribute("title") ?? "";
	expect(title.toLowerCase()).not.toContain("mismatch");
});

test("badge ignores a stage-ready without a version", async () => {
	render(<Topbar harness={HARNESS} />);
	await act(async () => {
		dispatchStageReady({ bootComplete: true });
	});
	await waitFor(() => {
		expect(document.querySelector(".mmv-topbar-badge__label")?.textContent).toBe("2.35.0");
	});
});

test("badge picks up a version the stage reported before it mounted", async () => {
	vi.stubGlobal("__MICROCORE__", { stageMmVersion: "2.38.0" });
	render(<Topbar harness={HARNESS} />);
	await waitFor(() => {
		expect(document.querySelector(".mmv-topbar-badge__label")?.textContent).toBe("2.38.0");
	});
});

test("a version switch clears the stage version until the stage reports again", async () => {
	render(<Topbar harness={HARNESS} />);
	await act(async () => {
		dispatchStageReady({ mmVersion: "2.38.0" });
	});
	await waitFor(() => {
		expect(document.querySelector(".mmv-topbar-badge__label")?.textContent).toBe("2.38.0");
	});

	await act(async () => {
		window.dispatchEvent(new CustomEvent("module-sandbox:mm-version-changed"));
	});
	await waitFor(() => {
		expect(document.querySelector(".mmv-topbar-badge__label")?.textContent).toBe("2.35.0");
	});
	const title = document.querySelector(".mmv-topbar-badge")?.getAttribute("title") ?? "";
	expect(title.toLowerCase()).not.toContain("mismatch");

	// A stage-ready that reports nothing leaves the server state in charge.
	await act(async () => {
		dispatchStageReady({ bootComplete: true });
	});
	expect(document.querySelector(".mmv-topbar-badge__label")?.textContent).toBe("2.35.0");
});

test("a later stage-ready without a version drops the earlier one", async () => {
	render(<Topbar harness={HARNESS} />);
	await act(async () => {
		dispatchStageReady({ mmVersion: "2.38.0" });
	});
	await act(async () => {
		dispatchStageReady({});
	});
	await waitFor(() => {
		expect(document.querySelector(".mmv-topbar-badge__label")?.textContent).toBe("2.35.0");
	});
});

test("a develop core does not show a false mismatch", async () => {
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
		expect(document.querySelector(".mmv-topbar-badge__label")?.textContent).toBe("2.36.0");
	});
	await act(async () => {
		dispatchStageReady({ mmVersion: "2.36.0-develop" });
	});
	const title = document.querySelector(".mmv-topbar-badge")?.getAttribute("title") ?? "";
	expect(title.toLowerCase()).not.toContain("mismatch");
	expect(document.querySelector(".mmv-topbar-badge__label")?.textContent).toBe("2.36.0");
});

test("a stage-ready from the new core that arrives before mm-version-changed keeps its version", async () => {
	// The shell records each stage-ready in __MICROCORE__.stageMmVersion
	// before dispatching it (client/runtime/shell-stage.ts).
	const shellCore: { stageMmVersion?: string } = {};
	vi.stubGlobal("__MICROCORE__", shellCore);
	vi.stubGlobal(
		"fetch",
		makeVersionsFetch({
			active: "2.38.0",
			usingBuiltIn: false,
			builtInVersion: "2.35.0",
			versions: [{ key: "2.38.0", displayVersion: "2.38.0" }]
		})
	);
	render(<Topbar harness={HARNESS} />);

	await act(async () => {
		shellCore.stageMmVersion = "2.38.0";
		dispatchStageReady({ mmVersion: "2.38.0" });
	});
	await act(async () => {
		window.dispatchEvent(new CustomEvent("module-sandbox:mm-version-changed"));
	});

	await waitFor(() => {
		expect(document.querySelector(".mmv-topbar-badge__label")?.textContent).toBe("2.38.0");
	});
	// Still the stage's own report, not only the server state.
	vi.stubGlobal("fetch", makeVersionsFetch());
	await act(async () => {
		window.dispatchEvent(new CustomEvent("module-sandbox:mm-version-changed"));
	});
	await waitFor(() => {
		const title = document.querySelector(".mmv-topbar-badge")?.getAttribute("title") ?? "";
		expect(title.toLowerCase()).toContain("mismatch");
	});
	expect(document.querySelector(".mmv-topbar-badge__label")?.textContent).toBe("2.38.0");
});

test("mm-version-changed before the stage reloads keeps the running core until it reports again", async () => {
	const shellCore: { stageMmVersion?: string } = {};
	vi.stubGlobal("__MICROCORE__", shellCore);
	render(<Topbar harness={HARNESS} />);
	await act(async () => {
		shellCore.stageMmVersion = "2.36.0";
		dispatchStageReady({ mmVersion: "2.36.0" });
	});

	await act(async () => {
		window.dispatchEvent(new CustomEvent("module-sandbox:mm-version-changed"));
	});
	// The old document still runs 2.36.0 until the stage reloads.
	expect(document.querySelector(".mmv-topbar-badge__label")?.textContent).toBe("2.36.0");

	// Frame load clears the shell copy; the new core then reports itself.
	await act(async () => {
		shellCore.stageMmVersion = "2.38.0";
		dispatchStageReady({ mmVersion: "2.38.0" });
	});
	await waitFor(() => {
		expect(document.querySelector(".mmv-topbar-badge__label")?.textContent).toBe("2.38.0");
	});
});

test("a stage reload drops the old core, so a new core that never reports leaves the server state", async () => {
	const shellCore: { stageMmVersion?: string } = {};
	vi.stubGlobal("__MICROCORE__", shellCore);
	vi.stubGlobal(
		"fetch",
		makeVersionsFetch({
			active: "2.38.0",
			usingBuiltIn: false,
			builtInVersion: "2.35.0",
			versions: [{ key: "2.38.0", displayVersion: "2.38.0" }]
		})
	);
	render(<Topbar harness={HARNESS} />);
	await act(async () => {
		shellCore.stageMmVersion = "2.36.0";
		dispatchStageReady({ mmVersion: "2.36.0" });
	});
	await act(async () => {
		window.dispatchEvent(new CustomEvent("module-sandbox:mm-version-changed"));
	});
	expect(document.querySelector(".mmv-topbar-badge__label")?.textContent).toBe("2.36.0");

	// The frame loads the new document, which never posts stage-ready.
	await act(async () => {
		shellCore.stageMmVersion = undefined;
		window.dispatchEvent(new CustomEvent("module-sandbox:stage-reloaded"));
	});
	await waitFor(() => {
		expect(document.querySelector(".mmv-topbar-badge__label")?.textContent).toBe("2.38.0");
	});
	const title = document.querySelector(".mmv-topbar-badge")?.getAttribute("title") ?? "";
	expect(title.toLowerCase()).not.toContain("mismatch");
});
