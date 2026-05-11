// @vitest-environment happy-dom
/**
 * Component unit tests for MmVersionDomain.
 * Uses happy-dom for DOM support; fetch is stubbed per test.
 */
import { render, screen, fireEvent, waitFor, act, cleanup } from "@testing-library/preact";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { MmVersionDomain } from "../../../client/app/components/sidebar/MmVersionDomain";

const DEFAULT_VERSIONS_RESPONSE = {
	active: null,
	versions: [],
	usingBuiltIn: true,
	builtInVersion: "2.35.0",
	capabilities: {
		helperLoadedHook: true,
		helperStopHook: true,
		classExtendSystem: true,
		es6NodeHelper: false,
		httpFetcher: true,
		corsProxy: true,
		corsProxyEnabledByDefault: true,
		secretPlaceholder: true,
		hideConfigSecrets: true,
		getUserAgent: true,
		expressVersion: "4",
		defaultModulesDir: "/modules/default",
		configLoading: "filesystem",
		configFunctions: false,
		socketNamespace: "name"
	}
};

function makeFetch(responses: Record<string, unknown> = {}) {
	return vi.fn((url: string) => {
		const body = url in responses ? responses[url] : { ok: true };
		return Promise.resolve({
			ok: true,
			json: () => Promise.resolve(body)
		} as Response);
	});
}

beforeEach(() => {
	vi.stubGlobal(
		"fetch",
		makeFetch({
			"/__harness/mm-versions": DEFAULT_VERSIONS_RESPONSE,
			"https://api.github.com/repos/MagicMirrorOrg/MagicMirror/releases?per_page=50": []
		})
	);
});

afterEach(() => {
	vi.unstubAllGlobals();
	cleanup();
});

// ── Initial render ────────────────────────────────────────────────────────────

test("renders the domain section with version input and action buttons", async () => {
	render(<MmVersionDomain />);
	await waitFor(() => {
		expect(screen.getByRole("textbox")).toBeTruthy();
	});
	const buttons = screen.getAllByRole("button");
	expect(buttons.length).toBeGreaterThan(0);
});

test("version input shows built-in version after loadVersions resolves", async () => {
	render(<MmVersionDomain />);
	await waitFor(() => {
		const input = screen.getByRole("textbox") as HTMLInputElement;
		expect(input.value).toBe("2.35.0");
	});
});

test("capabilities grid renders after fetch returns capabilities", async () => {
	render(<MmVersionDomain />);
	await waitFor(() => {
		expect(screen.getByText("loaded() hook")).toBeTruthy();
	});
});

test("shows loading spinner for capabilities before fetch resolves", () => {
	vi.stubGlobal("fetch", () => new Promise(() => {}));
	render(<MmVersionDomain />);
	expect(screen.getByText(/Loading…/)).toBeTruthy();
});

// ── Reset button ──────────────────────────────────────────────────────────────

test("reset button is disabled when usingBuiltIn is true", async () => {
	render(<MmVersionDomain />);
	await waitFor(() => {
		const input = screen.getByRole("textbox") as HTMLInputElement;
		expect(input.value).toBe("2.35.0");
	});
	const resetBtn = screen.getAllByRole("button")[0];
	expect((resetBtn as HTMLButtonElement).disabled).toBe(true);
});

test("reset button is enabled when a custom version is active", async () => {
	vi.stubGlobal(
		"fetch",
		makeFetch({
			"/__harness/mm-versions": {
				active: "2.35.0",
				versions: [{ key: "2.35.0", displayVersion: "2.35.0", installed: true, shimsBuilt: true, capabilities: DEFAULT_VERSIONS_RESPONSE.capabilities }],
				usingBuiltIn: false,
				builtInVersion: "2.35.0",
				capabilities: DEFAULT_VERSIONS_RESPONSE.capabilities
			},
			"https://api.github.com/repos/MagicMirrorOrg/MagicMirror/releases?per_page=50": []
		})
	);
	render(<MmVersionDomain />);
	await waitFor(() => {
		const input = screen.getByRole("textbox") as HTMLInputElement;
		expect(input.value).toBe("2.35.0");
	});
	const resetBtn = screen.getAllByRole("button")[0];
	expect((resetBtn as HTMLButtonElement).disabled).toBe(false);
});

// ── handleReset ───────────────────────────────────────────────────────────────

test("clicking reset calls DELETE /__harness/mm-versions/active and reloads versions", async () => {
	const mockFetch = makeFetch({
		"/__harness/mm-versions": {
			...DEFAULT_VERSIONS_RESPONSE,
			active: "2.35.0",
			usingBuiltIn: false
		},
		"/__harness/mm-versions/active": { ok: true },
		"https://api.github.com/repos/MagicMirrorOrg/MagicMirror/releases?per_page=50": []
	});
	vi.stubGlobal("fetch", mockFetch);

	render(<MmVersionDomain />);
	await waitFor(() => {
		const resetBtn = screen.getAllByRole("button")[0];
		expect((resetBtn as HTMLButtonElement).disabled).toBe(false);
	});

	await act(async () => {
		fireEvent.click(screen.getAllByRole("button")[0]);
	});

	await waitFor(() => {
		const calls = mockFetch.mock.calls.map(([url, opts]: [string, RequestInit]) => `${opts?.method ?? "GET"} ${url}`);
		expect(calls.some((c) => c.includes("DELETE") && c.includes("active"))).toBe(true);
	});
});

test("reset shows error message when DELETE returns ok:false", async () => {
	vi.stubGlobal(
		"fetch",
		makeFetch({
			"/__harness/mm-versions": {
				...DEFAULT_VERSIONS_RESPONSE,
				active: "2.35.0",
				usingBuiltIn: false
			},
			"/__harness/mm-versions/active": { ok: false, error: "Reset failed." },
			"https://api.github.com/repos/MagicMirrorOrg/MagicMirror/releases?per_page=50": []
		})
	);

	render(<MmVersionDomain />);
	await waitFor(() => {
		const resetBtn = screen.getAllByRole("button")[0];
		expect((resetBtn as HTMLButtonElement).disabled).toBe(false);
	});

	await act(async () => {
		fireEvent.click(screen.getAllByRole("button")[0]);
	});

	await waitFor(() => {
		expect(screen.getByRole("alert")).toBeTruthy();
		expect(screen.getByRole("alert").textContent).toContain("Reset failed.");
	});
});

// ── handleActivate ────────────────────────────────────────────────────────────

test("activate button POSTs to /__harness/mm-versions/activate with selected version", async () => {
	const mockFetch = makeFetch({
		"/__harness/mm-versions": DEFAULT_VERSIONS_RESPONSE,
		"/__harness/mm-versions/activate": { ok: true, capabilities: DEFAULT_VERSIONS_RESPONSE.capabilities },
		"https://api.github.com/repos/MagicMirrorOrg/MagicMirror/releases?per_page=50": [
			{ tag_name: "v2.36.0", prerelease: false },
			{ tag_name: "v2.35.0", prerelease: false }
		]
	});
	vi.stubGlobal("fetch", mockFetch);

	render(<MmVersionDomain />);

	await waitFor(() => {
		expect(screen.queryByText("Loading releases…")).toBeFalsy();
	});

	const buttons = screen.getAllByRole("button");
	const activateBtn = buttons[buttons.length - 1];
	await act(async () => {
		fireEvent.click(activateBtn);
	});

	await waitFor(() => {
		const calls = mockFetch.mock.calls.map(([url, opts]: [string, RequestInit]) => `${opts?.method ?? "GET"} ${url}`);
		expect(calls.some((c) => c.includes("POST") && c.includes("activate"))).toBe(true);
	});
});

test("activate shows error when POST returns ok:false", async () => {
	vi.stubGlobal(
		"fetch",
		makeFetch({
			"/__harness/mm-versions": DEFAULT_VERSIONS_RESPONSE,
			"/__harness/mm-versions/activate": { ok: false, error: "Download failed: 404" },
			"https://api.github.com/repos/MagicMirrorOrg/MagicMirror/releases?per_page=50": [
				{ tag_name: "v2.36.0", prerelease: false }
			]
		})
	);

	render(<MmVersionDomain />);

	await waitFor(() => {
		expect(screen.queryByText("Loading releases…")).toBeFalsy();
	});

	const buttons = screen.getAllByRole("button");
	await act(async () => {
		fireEvent.click(buttons[buttons.length - 1]);
	});

	await waitFor(() => {
		expect(screen.getByRole("alert").textContent).toContain("Download failed");
	});
});

// ── isBuiltInSelected — Activate routes through reset ────────────────────────

test("when built-in version is selected in dropdown, activate button calls DELETE (reset flow)", async () => {
	const mockFetch = makeFetch({
		"/__harness/mm-versions": {
			...DEFAULT_VERSIONS_RESPONSE,
			active: "2.36.0",
			usingBuiltIn: false,
			builtInVersion: "2.35.0"
		},
		"/__harness/mm-versions/active": { ok: true },
		"/__harness/mm-versions/activate": { ok: true, capabilities: DEFAULT_VERSIONS_RESPONSE.capabilities },
		"https://api.github.com/repos/MagicMirrorOrg/MagicMirror/releases?per_page=50": [
			{ tag_name: "v2.35.0", prerelease: false }
		]
	});
	vi.stubGlobal("fetch", mockFetch);

	render(<MmVersionDomain />);

	await waitFor(() => {
		expect(screen.queryByText("Loading releases…")).toBeFalsy();
	});

	// Select the built-in version (2.35.0) in the dropdown
	const select = screen.getByRole("combobox") as HTMLSelectElement;
	await act(async () => {
		fireEvent.change(select, { target: { value: "2.35.0" } });
	});

	const buttons = screen.getAllByRole("button");
	await act(async () => {
		fireEvent.click(buttons[buttons.length - 1]);
	});

	await waitFor(() => {
		const calls = mockFetch.mock.calls.map(([url, opts]: [string, RequestInit]) => `${opts?.method ?? "GET"} ${url}`);
		expect(calls.some((c) => c.includes("DELETE") && c.includes("active"))).toBe(true);
	});
});

// ── GitHub releases loading ───────────────────────────────────────────────────

test("prerelease versions are excluded from dropdown options", async () => {
	vi.stubGlobal(
		"fetch",
		makeFetch({
			"/__harness/mm-versions": DEFAULT_VERSIONS_RESPONSE,
			"https://api.github.com/repos/MagicMirrorOrg/MagicMirror/releases?per_page=50": [
				{ tag_name: "v2.36.0", prerelease: false },
				{ tag_name: "v2.36.0-beta.1", prerelease: true }
			]
		})
	);

	render(<MmVersionDomain />);
	await waitFor(() => {
		const select = screen.getByRole("combobox");
		const options = Array.from((select as HTMLSelectElement).options).map((o) => o.value);
		expect(options.includes("2.36.0")).toBe(true);
		expect(options.includes("2.36.0-beta.1")).toBe(false);
	});
});

test("versions below minimum supported version (2.35.0) are filtered out", async () => {
	vi.stubGlobal(
		"fetch",
		makeFetch({
			"/__harness/mm-versions": DEFAULT_VERSIONS_RESPONSE,
			"https://api.github.com/repos/MagicMirrorOrg/MagicMirror/releases?per_page=50": [
				{ tag_name: "v2.36.0", prerelease: false },
				{ tag_name: "v2.34.0", prerelease: false }
			]
		})
	);

	render(<MmVersionDomain />);
	await waitFor(() => {
		const select = screen.getByRole("combobox");
		const options = Array.from((select as HTMLSelectElement).options).map((o) => o.value);
		expect(options.includes("2.36.0")).toBe(true);
		expect(options.includes("2.34.0")).toBe(false);
	});
});

test("releases error shows error message in select area", async () => {
	vi.stubGlobal(
		"fetch",
		vi.fn((url: string) => {
			if ((() => { try { return new URL(url).hostname === "api.github.com"; } catch { return false; } })()) {
				return Promise.reject(new Error("network error"));
			}
			return Promise.resolve({
				ok: true,
				json: () => Promise.resolve(DEFAULT_VERSIONS_RESPONSE)
			} as Response);
		})
	);

	render(<MmVersionDomain />);
	await waitFor(() => {
		const select = document.querySelector<HTMLSelectElement>(".mmv-version-select");
		expect(select).toBeTruthy();
		const opts = Array.from(select?.options ?? []);
		expect(opts.some((o) => /Could not load/i.test(o.text))).toBe(true);
	});
});

// ── Cached versions list ──────────────────────────────────────────────────────

test("cached versions section renders when versions are present", async () => {
	vi.stubGlobal(
		"fetch",
		makeFetch({
			"/__harness/mm-versions": {
				active: "develop",
				versions: [
					{ key: "develop", displayVersion: "develop", installed: true, shimsBuilt: true, capabilities: DEFAULT_VERSIONS_RESPONSE.capabilities },
					{ key: "2.36.0", displayVersion: "2.36.0", installed: true, shimsBuilt: false, capabilities: DEFAULT_VERSIONS_RESPONSE.capabilities }
				],
				usingBuiltIn: false,
				builtInVersion: "2.35.0",
				capabilities: DEFAULT_VERSIONS_RESPONSE.capabilities
			},
			"https://api.github.com/repos/MagicMirrorOrg/MagicMirror/releases?per_page=50": []
		})
	);

	render(<MmVersionDomain />);
	await waitFor(() => {
		expect(screen.getByText("Cached versions")).toBeTruthy();
	});
});

test("shims pending label appears for versions without built shims", async () => {
	vi.stubGlobal(
		"fetch",
		makeFetch({
			"/__harness/mm-versions": {
				active: null,
				versions: [
					{ key: "2.36.0", displayVersion: "2.36.0", installed: true, shimsBuilt: false, capabilities: DEFAULT_VERSIONS_RESPONSE.capabilities }
				],
				usingBuiltIn: true,
				builtInVersion: "2.35.0",
				capabilities: DEFAULT_VERSIONS_RESPONSE.capabilities
			},
			"https://api.github.com/repos/MagicMirrorOrg/MagicMirror/releases?per_page=50": []
		})
	);

	render(<MmVersionDomain />);
	await waitFor(() => {
		expect(screen.getByText("shims pending")).toBeTruthy();
	});
});

// ── handleRedownload ──────────────────────────────────────────────────────────

test("redownload button POSTs to /__harness/mm-versions/redownload", async () => {
	const mockFetch = makeFetch({
		"/__harness/mm-versions": {
			active: null,
			versions: [
				{ key: "develop", displayVersion: "develop-latest", installed: true, shimsBuilt: true, capabilities: DEFAULT_VERSIONS_RESPONSE.capabilities }
			],
			usingBuiltIn: true,
			builtInVersion: "2.35.0",
			capabilities: DEFAULT_VERSIONS_RESPONSE.capabilities
		},
		"/__harness/mm-versions/redownload": { ok: true, capabilities: DEFAULT_VERSIONS_RESPONSE.capabilities },
		"https://api.github.com/repos/MagicMirrorOrg/MagicMirror/releases?per_page=50": []
	});
	vi.stubGlobal("fetch", mockFetch);

	render(<MmVersionDomain />);
	await waitFor(() => {
		expect(screen.getByText("Cached versions")).toBeTruthy();
	});

	const redownloadBtn = screen.getAllByRole("button").find(
		(b) => (b as HTMLButtonElement).title?.includes("Re-download")
	)!;
	await act(async () => {
		fireEvent.click(redownloadBtn);
	});

	await waitFor(() => {
		const calls = mockFetch.mock.calls.map(([url, opts]: [string, RequestInit]) => `${opts?.method ?? "GET"} ${url}`);
		expect(calls.some((c) => c.includes("POST") && c.includes("redownload"))).toBe(true);
	});
});

test("redownload shows error when response ok:false", async () => {
	vi.stubGlobal(
		"fetch",
		makeFetch({
			"/__harness/mm-versions": {
				active: null,
				versions: [
					{ key: "develop", displayVersion: "develop", installed: true, shimsBuilt: true, capabilities: DEFAULT_VERSIONS_RESPONSE.capabilities }
				],
				usingBuiltIn: true,
				builtInVersion: "2.35.0",
				capabilities: DEFAULT_VERSIONS_RESPONSE.capabilities
			},
			"/__harness/mm-versions/redownload": { ok: false, error: "Re-download failed." },
			"https://api.github.com/repos/MagicMirrorOrg/MagicMirror/releases?per_page=50": []
		})
	);

	render(<MmVersionDomain />);
	await waitFor(() => {
		expect(screen.getByText("Cached versions")).toBeTruthy();
	});

	const redownloadBtn = screen.getAllByRole("button").find(
		(b) => (b as HTMLButtonElement).title?.includes("Re-download")
	)!;
	await act(async () => {
		fireEvent.click(redownloadBtn);
	});

	await waitFor(() => {
		expect(screen.getByRole("alert").textContent).toContain("Re-download failed.");
	});
});

// ── handleDelete ──────────────────────────────────────────────────────────────

test("delete button POSTs to /__harness/mm-versions/delete-cache", async () => {
	const mockFetch = makeFetch({
		"/__harness/mm-versions": {
			active: null,
			versions: [
				{ key: "2.36.0", displayVersion: "2.36.0", installed: true, shimsBuilt: true, capabilities: DEFAULT_VERSIONS_RESPONSE.capabilities }
			],
			usingBuiltIn: true,
			builtInVersion: "2.35.0",
			capabilities: DEFAULT_VERSIONS_RESPONSE.capabilities
		},
		"/__harness/mm-versions/delete-cache": { ok: true },
		"https://api.github.com/repos/MagicMirrorOrg/MagicMirror/releases?per_page=50": []
	});
	vi.stubGlobal("fetch", mockFetch);

	render(<MmVersionDomain />);
	await waitFor(() => {
		expect(screen.getByText("Cached versions")).toBeTruthy();
	});

	const deleteBtn = screen.getAllByRole("button").find(
		(b) => (b as HTMLButtonElement).title === "Delete cached version"
	)!;
	await act(async () => {
		fireEvent.click(deleteBtn);
	});

	await waitFor(() => {
		const calls = mockFetch.mock.calls.map(([url, opts]: [string, RequestInit]) => `${opts?.method ?? "GET"} ${url}`);
		expect(calls.some((c) => c.includes("POST") && c.includes("delete-cache"))).toBe(true);
	});
});

// ── mm-version-changed custom event ──────────────────────────────────────────

test("mm-version-changed event updates active version state", async () => {
	render(<MmVersionDomain />);

	await waitFor(() => {
		expect(screen.getByRole("textbox") as HTMLInputElement).toBeTruthy();
	});

	await act(async () => {
		window.dispatchEvent(
			new CustomEvent("module-sandbox:mm-version-changed", {
				detail: {
					active: "2.36.0",
					versions: [],
					usingBuiltIn: false,
					capabilities: { ...DEFAULT_VERSIONS_RESPONSE.capabilities, expressVersion: "5" }
				}
			})
		);
	});

	await waitFor(() => {
		const calls = (vi.mocked(fetch) as ReturnType<typeof vi.fn>).mock.calls;
		expect(calls.length).toBeGreaterThan(0);
	});
});

// ── CapEntry value-mode branches ──────────────────────────────────────────────

test("capabilities grid shows Express 5 label for expressVersion:5", async () => {
	vi.stubGlobal(
		"fetch",
		makeFetch({
			"/__harness/mm-versions": {
				...DEFAULT_VERSIONS_RESPONSE,
				capabilities: { ...DEFAULT_VERSIONS_RESPONSE.capabilities, expressVersion: "5" }
			},
			"https://api.github.com/repos/MagicMirrorOrg/MagicMirror/releases?per_page=50": []
		})
	);

	render(<MmVersionDomain />);
	await waitFor(() => {
		expect(screen.getByText("Express 5")).toBeTruthy();
	});
});

test("capabilities grid shows unknown state for unrecognized expressVersion", async () => {
	vi.stubGlobal(
		"fetch",
		makeFetch({
			"/__harness/mm-versions": {
				...DEFAULT_VERSIONS_RESPONSE,
				capabilities: { ...DEFAULT_VERSIONS_RESPONSE.capabilities, expressVersion: "unknown" }
			},
			"https://api.github.com/repos/MagicMirrorOrg/MagicMirror/releases?per_page=50": []
		})
	);

	render(<MmVersionDomain />);
	await waitFor(() => {
		expect(screen.getByText("Express ?")).toBeTruthy();
	});
});

test("capabilities grid shows /defaultmodules label for defaultModulesDir", async () => {
	vi.stubGlobal(
		"fetch",
		makeFetch({
			"/__harness/mm-versions": {
				...DEFAULT_VERSIONS_RESPONSE,
				capabilities: { ...DEFAULT_VERSIONS_RESPONSE.capabilities, defaultModulesDir: "/defaultmodules" }
			},
			"https://api.github.com/repos/MagicMirrorOrg/MagicMirror/releases?per_page=50": []
		})
	);

	render(<MmVersionDomain />);
	await waitFor(() => {
		const cells = screen.getAllByText("/defaultmodules");
		expect(cells.length).toBeGreaterThan(0);
	});
});

// ── loadVersions — caps derived from versions array (no top-level capabilities) ─

test("loadVersions derives caps from active version in versions array when top-level capabilities absent", async () => {
	vi.stubGlobal(
		"fetch",
		makeFetch({
			"/__harness/mm-versions": {
				active: "2.35.0",
				versions: [
					{
						key: "2.35.0",
						displayVersion: "2.35.0",
						installed: true,
						shimsBuilt: true,
						capabilities: { ...DEFAULT_VERSIONS_RESPONSE.capabilities, expressVersion: "4" }
					}
				],
				usingBuiltIn: false,
				builtInVersion: null,
				// no top-level capabilities field
			},
			"https://api.github.com/repos/MagicMirrorOrg/MagicMirror/releases?per_page=50": []
		})
	);

	render(<MmVersionDomain />);
	await waitFor(() => {
		expect(screen.getByText("loaded() hook")).toBeTruthy();
	});
});

test("loadVersions derives caps from built-in version found in versions array", async () => {
	vi.stubGlobal(
		"fetch",
		makeFetch({
			"/__harness/mm-versions": {
				active: null,
				versions: [
					{
						key: "2.35.0",
						displayVersion: "2.35.0",
						installed: true,
						shimsBuilt: true,
						capabilities: { ...DEFAULT_VERSIONS_RESPONSE.capabilities, expressVersion: "4" }
					}
				],
				usingBuiltIn: true,
				builtInVersion: "2.35.0",
				// no top-level capabilities field
			},
			"https://api.github.com/repos/MagicMirrorOrg/MagicMirror/releases?per_page=50": []
		})
	);

	render(<MmVersionDomain />);
	await waitFor(() => {
		expect(screen.getByText("loaded() hook")).toBeTruthy();
	});
});

// ── nonBuiltInVersions when builtInVersion is null ────────────────────────────

test("cached versions shows all versions when builtInVersion is null", async () => {
	vi.stubGlobal(
		"fetch",
		makeFetch({
			"/__harness/mm-versions": {
				active: "2.36.0",
				versions: [
					{ key: "2.36.0", displayVersion: "2.36.0", installed: true, shimsBuilt: true, capabilities: DEFAULT_VERSIONS_RESPONSE.capabilities }
				],
				usingBuiltIn: false,
				builtInVersion: null,
				capabilities: DEFAULT_VERSIONS_RESPONSE.capabilities
			},
			"https://api.github.com/repos/MagicMirrorOrg/MagicMirror/releases?per_page=50": []
		})
	);

	render(<MmVersionDomain />);
	await waitFor(() => {
		expect(screen.getByText("Cached versions")).toBeTruthy();
	});
});

// ── VersionRow — displayVersion different from key ────────────────────────────

test("VersionRow shows displayVersion span when it differs from key", async () => {
	vi.stubGlobal(
		"fetch",
		makeFetch({
			"/__harness/mm-versions": {
				active: null,
				versions: [
					{
						key: "develop",
						displayVersion: "2.36.0-develop",
						installed: true,
						shimsBuilt: true,
						capabilities: DEFAULT_VERSIONS_RESPONSE.capabilities
					}
				],
				usingBuiltIn: true,
				builtInVersion: "2.35.0",
				capabilities: DEFAULT_VERSIONS_RESPONSE.capabilities
			},
			"https://api.github.com/repos/MagicMirrorOrg/MagicMirror/releases?per_page=50": []
		})
	);

	render(<MmVersionDomain />);
	await waitFor(() => {
		// displayVersion stripped of -develop suffix should appear
		expect(screen.getByText("2.36.0")).toBeTruthy();
	});
});

// ── Network error branches in handlers ───────────────────────────────────────

test("handleActivate shows error message on network failure", async () => {
	const mockFetch = vi.fn((url: string) => {
		if (url.includes("activate")) return Promise.reject(new Error("net::ERR_FAILED"));
		if ((() => { try { return new URL(url).hostname === "api.github.com"; } catch { return false; } })()) return Promise.resolve({ ok: true, json: () => Promise.resolve([{ tag_name: "v2.36.0", prerelease: false }]) } as Response);
		return Promise.resolve({ ok: true, json: () => Promise.resolve(DEFAULT_VERSIONS_RESPONSE) } as Response);
	});
	vi.stubGlobal("fetch", mockFetch);

	render(<MmVersionDomain />);
	await waitFor(() => expect(screen.queryByText("Loading releases…")).toBeFalsy());

	await act(async () => {
		const buttons = screen.getAllByRole("button");
		fireEvent.click(buttons[buttons.length - 1]);
	});

	await waitFor(() => {
		expect(screen.getByRole("alert").textContent).toContain("net::ERR_FAILED");
	});
});

test("handleReset shows error on network failure", async () => {
	vi.stubGlobal(
		"fetch",
		vi.fn((url: string) => {
			if (url.includes("/active")) return Promise.reject(new Error("connection reset"));
			if ((() => { try { return new URL(url).hostname === "api.github.com"; } catch { return false; } })()) return Promise.resolve({ ok: true, json: () => Promise.resolve([]) } as Response);
			return Promise.resolve({
				ok: true,
				json: () => Promise.resolve({ ...DEFAULT_VERSIONS_RESPONSE, active: "2.35.0", usingBuiltIn: false })
			} as Response);
		})
	);

	render(<MmVersionDomain />);
	await waitFor(() => {
		const resetBtn = screen.getAllByRole("button")[0];
		expect((resetBtn as HTMLButtonElement).disabled).toBe(false);
	});

	await act(async () => {
		fireEvent.click(screen.getAllByRole("button")[0]);
	});

	await waitFor(() => {
		expect(screen.getByRole("alert").textContent).toContain("connection reset");
	});
});

test("handleRedownload shows error on network failure", async () => {
	vi.stubGlobal(
		"fetch",
		vi.fn((url: string) => {
			if (url.includes("redownload")) return Promise.reject(new Error("timeout"));
			if ((() => { try { return new URL(url).hostname === "api.github.com"; } catch { return false; } })()) return Promise.resolve({ ok: true, json: () => Promise.resolve([]) } as Response);
			return Promise.resolve({
				ok: true,
				json: () => Promise.resolve({
					active: null,
					versions: [{ key: "develop", displayVersion: "develop", installed: true, shimsBuilt: true, capabilities: DEFAULT_VERSIONS_RESPONSE.capabilities }],
					usingBuiltIn: true,
					builtInVersion: "2.35.0",
					capabilities: DEFAULT_VERSIONS_RESPONSE.capabilities
				})
			} as Response);
		})
	);

	render(<MmVersionDomain />);
	await waitFor(() => expect(screen.getByText("Cached versions")).toBeTruthy());

	const redownloadBtn = screen.getAllByRole("button").find(
		(b) => (b as HTMLButtonElement).title?.includes("Re-download")
	)!;
	await act(async () => { fireEvent.click(redownloadBtn); });

	await waitFor(() => {
		expect(screen.getByRole("alert").textContent).toContain("timeout");
	});
});

test("handleDelete shows error when response ok:false", async () => {
	vi.stubGlobal(
		"fetch",
		makeFetch({
			"/__harness/mm-versions": {
				active: null,
				versions: [{ key: "2.36.0", displayVersion: "2.36.0", installed: true, shimsBuilt: true, capabilities: DEFAULT_VERSIONS_RESPONSE.capabilities }],
				usingBuiltIn: true,
				builtInVersion: "2.35.0",
				capabilities: DEFAULT_VERSIONS_RESPONSE.capabilities
			},
			"/__harness/mm-versions/delete-cache": { ok: false, error: "Cannot delete active version." },
			"https://api.github.com/repos/MagicMirrorOrg/MagicMirror/releases?per_page=50": []
		})
	);

	render(<MmVersionDomain />);
	await waitFor(() => expect(screen.getByText("Cached versions")).toBeTruthy());

	const deleteBtn = screen.getAllByRole("button").find(
		(b) => (b as HTMLButtonElement).title === "Delete cached version"
	)!;
	await act(async () => { fireEvent.click(deleteBtn); });

	await waitFor(() => {
		expect(screen.getByRole("alert").textContent).toContain("Cannot delete active version.");
	});
});

test("handleDelete shows error on network failure", async () => {
	vi.stubGlobal(
		"fetch",
		vi.fn((url: string) => {
			if (url.includes("delete-cache")) return Promise.reject(new Error("fetch failed"));
			if ((() => { try { return new URL(url).hostname === "api.github.com"; } catch { return false; } })()) return Promise.resolve({ ok: true, json: () => Promise.resolve([]) } as Response);
			return Promise.resolve({
				ok: true,
				json: () => Promise.resolve({
					active: null,
					versions: [{ key: "2.36.0", displayVersion: "2.36.0", installed: true, shimsBuilt: true, capabilities: DEFAULT_VERSIONS_RESPONSE.capabilities }],
					usingBuiltIn: true,
					builtInVersion: "2.35.0",
					capabilities: DEFAULT_VERSIONS_RESPONSE.capabilities
				})
			} as Response);
		})
	);

	render(<MmVersionDomain />);
	await waitFor(() => expect(screen.getByText("Cached versions")).toBeTruthy());

	const deleteBtn = screen.getAllByRole("button").find(
		(b) => (b as HTMLButtonElement).title === "Delete cached version"
	)!;
	await act(async () => { fireEvent.click(deleteBtn); });

	await waitFor(() => {
		expect(screen.getByRole("alert").textContent).toContain("fetch failed");
	});
});

