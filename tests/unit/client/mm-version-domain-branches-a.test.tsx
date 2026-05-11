// @vitest-environment happy-dom
/**
 * Branch-coverage tests (part A) for MmVersionDomain — CapEntry display,
 * loadVersions null-coalescing, and mm-version-changed edge cases.
 */
import { render, screen, waitFor, act, cleanup } from "@testing-library/preact";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { MmVersionDomain } from "../../../client/app/components/sidebar/MmVersionDomain";

const DEFAULT_CAPS = {
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
};

const DEFAULT_VERSIONS_RESPONSE = {
	active: null,
	versions: [],
	usingBuiltIn: true,
	builtInVersion: "2.35.0",
	capabilities: DEFAULT_CAPS
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

const GH_URL = "https://api.github.com/repos/MagicMirrorOrg/MagicMirror/releases?per_page=50";

beforeEach(() => {
	vi.stubGlobal(
		"fetch",
		makeFetch({
			"/__harness/mm-versions": DEFAULT_VERSIONS_RESPONSE,
			[GH_URL]: []
		})
	);
});

afterEach(() => {
	vi.unstubAllGlobals();
	cleanup();
});

// ── CapEntry — warn class and lookup fallbacks ────────────────────────────────

test("CapEntry shows warn class when es6NodeHelper is true", async () => {
	vi.stubGlobal(
		"fetch",
		makeFetch({
			"/__harness/mm-versions": { ...DEFAULT_VERSIONS_RESPONSE, capabilities: { ...DEFAULT_CAPS, es6NodeHelper: true } },
			[GH_URL]: []
		})
	);
	render(<MmVersionDomain />);
	await waitFor(() => {
		expect(document.querySelector(".mmv-cap-val--warn")).toBeTruthy();
	});
});

test("CapEntry falls back to raw value when expressVersion is not in lookup table", async () => {
	vi.stubGlobal(
		"fetch",
		makeFetch({
			"/__harness/mm-versions": { ...DEFAULT_VERSIONS_RESPONSE, capabilities: { ...DEFAULT_CAPS, expressVersion: "3" } },
			[GH_URL]: []
		})
	);
	render(<MmVersionDomain />);
	await waitFor(() => {
		expect(screen.getByText("3")).toBeTruthy();
	});
});

test("CapEntry falls back to raw value when defaultModulesDir is not in lookup table", async () => {
	vi.stubGlobal(
		"fetch",
		makeFetch({
			"/__harness/mm-versions": { ...DEFAULT_VERSIONS_RESPONSE, capabilities: { ...DEFAULT_CAPS, defaultModulesDir: "/my-custom/modules" } },
			[GH_URL]: []
		})
	);
	render(<MmVersionDomain />);
	await waitFor(() => {
		expect(screen.getByText("/my-custom/modules")).toBeTruthy();
	});
});

// ── loadVersions — null-coalescing and caps-derivation branches ───────────────

test("loadVersions treats missing active field as null", async () => {
	vi.stubGlobal(
		"fetch",
		makeFetch({
			"/__harness/mm-versions": { versions: [], usingBuiltIn: true, builtInVersion: "2.35.0", capabilities: DEFAULT_CAPS } as any,
			[GH_URL]: []
		})
	);
	render(<MmVersionDomain />);
	await waitFor(() => {
		expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("2.35.0");
	});
});

test("loadVersions treats non-array versions field as empty array", async () => {
	vi.stubGlobal(
		"fetch",
		makeFetch({
			"/__harness/mm-versions": { active: null, versions: "invalid" as any, usingBuiltIn: true, builtInVersion: "2.35.0", capabilities: DEFAULT_CAPS },
			[GH_URL]: []
		})
	);
	render(<MmVersionDomain />);
	await waitFor(() => {
		expect(document.getElementById("domain-mmversion")).toBeTruthy();
	});
});

test("loadVersions leaves caps null when active version key not found in versions", async () => {
	vi.stubGlobal(
		"fetch",
		makeFetch({
			"/__harness/mm-versions": {
				active: "missing-key",
				versions: [{ key: "2.36.0", displayVersion: "2.36.0", installed: true, shimsBuilt: true, capabilities: DEFAULT_CAPS }],
				usingBuiltIn: false,
				builtInVersion: "2.35.0"
			},
			[GH_URL]: []
		})
	);
	render(<MmVersionDomain />);
	await waitFor(() => {
		expect(screen.getByText(/Loading…/)).toBeTruthy();
	});
});

test("loadVersions finds built-in by key when displayVersion differs", async () => {
	vi.stubGlobal(
		"fetch",
		makeFetch({
			"/__harness/mm-versions": {
				active: null,
				versions: [{ key: "2.35.0", displayVersion: "stable-2.35.0", installed: true, shimsBuilt: true, capabilities: DEFAULT_CAPS }],
				usingBuiltIn: true,
				builtInVersion: "2.35.0"
			},
			[GH_URL]: []
		})
	);
	render(<MmVersionDomain />);
	await waitFor(() => {
		expect(screen.getByText("loaded() hook")).toBeTruthy();
	});
});

test("loadVersions leaves caps null when built-in version not found in versions array", async () => {
	vi.stubGlobal(
		"fetch",
		makeFetch({
			"/__harness/mm-versions": {
				active: null,
				versions: [{ key: "2.36.0", displayVersion: "2.36.0", installed: true, shimsBuilt: true, capabilities: DEFAULT_CAPS }],
				usingBuiltIn: true,
				builtInVersion: "2.35.0"
			},
			[GH_URL]: []
		})
	);
	render(<MmVersionDomain />);
	await waitFor(() => {
		expect(screen.getByText(/Loading…/)).toBeTruthy();
	});
});

// ── mm-version-changed — event edge cases ────────────────────────────────────

test("mm-version-changed event without detail is silently ignored", async () => {
	render(<MmVersionDomain />);
	await waitFor(() => expect(screen.getByRole("textbox")).toBeTruthy());
	await act(async () => {
		window.dispatchEvent(new CustomEvent("module-sandbox:mm-version-changed"));
	});
	expect(document.getElementById("domain-mmversion")).toBeTruthy();
});

test("mm-version-changed event with non-array versions falls back to previous versions", async () => {
	render(<MmVersionDomain />);
	await waitFor(() => expect(screen.getByRole("textbox")).toBeTruthy());
	await act(async () => {
		window.dispatchEvent(new CustomEvent("module-sandbox:mm-version-changed", {
			detail: { active: "2.36.0", versions: "not-an-array", usingBuiltIn: false, capabilities: DEFAULT_CAPS }
		}));
	});
	expect(document.getElementById("domain-mmversion")).toBeTruthy();
});

test("mm-version-changed without capabilities calls setCaps(null)", async () => {
	render(<MmVersionDomain />);
	await waitFor(() => expect(screen.getByText("loaded() hook")).toBeTruthy());
	await act(async () => {
		window.dispatchEvent(new CustomEvent("module-sandbox:mm-version-changed", {
			detail: { active: "2.36.0", versions: [], usingBuiltIn: false }
		}));
	});
	await waitFor(() => {
		expect(screen.getByText(/Loading…/)).toBeTruthy();
	});
});
