// @vitest-environment happy-dom
/**
 * Branch-coverage tests (part B1) for MmVersionDomain — handler fallback error
 * messages for activate, redownload, delete, and reset operations.
 */
import { render, screen, fireEvent, waitFor, act, cleanup } from "@testing-library/preact";
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

// ── Handler fallback error messages ──────────────────────────────────────────

test("handleActivate uses fallback error message when response has no error field", async () => {
	vi.stubGlobal(
		"fetch",
		makeFetch({
			"/__harness/mm-versions": DEFAULT_VERSIONS_RESPONSE,
			"/__harness/mm-versions/activate": { ok: false },
			[GH_URL]: [{ tag_name: "v2.36.0", prerelease: false }]
		})
	);
	render(<MmVersionDomain />);
	await waitFor(() => expect(screen.queryByText("Loading releases…")).toBeFalsy());
	const buttons = screen.getAllByRole("button");
	await act(async () => { fireEvent.click(buttons[buttons.length - 1]); });
	await waitFor(() => {
		expect(screen.getByRole("alert").textContent).toContain("Activation failed.");
	});
});

test("handleActivate does not update caps when successful response lacks capabilities", async () => {
	vi.stubGlobal(
		"fetch",
		makeFetch({
			"/__harness/mm-versions": DEFAULT_VERSIONS_RESPONSE,
			"/__harness/mm-versions/activate": { ok: true },
			[GH_URL]: [{ tag_name: "v2.36.0", prerelease: false }]
		})
	);
	render(<MmVersionDomain />);
	await waitFor(() => expect(screen.queryByText("Loading releases…")).toBeFalsy());
	const buttons = screen.getAllByRole("button");
	await act(async () => { fireEvent.click(buttons[buttons.length - 1]); });
	await waitFor(() => {
		expect(document.querySelector(".mmv-error")).toBeNull();
	});
});

test("handleRedownload uses fallback error message when response has no error field", async () => {
	vi.stubGlobal(
		"fetch",
		makeFetch({
			"/__harness/mm-versions": {
				active: null,
				versions: [{ key: "develop", displayVersion: "develop", installed: true, shimsBuilt: true, capabilities: DEFAULT_CAPS }],
				usingBuiltIn: true, builtInVersion: "2.35.0", capabilities: DEFAULT_CAPS
			},
			"/__harness/mm-versions/redownload": { ok: false },
			[GH_URL]: []
		})
	);
	render(<MmVersionDomain />);
	await waitFor(() => expect(screen.getByText("Cached versions")).toBeTruthy());
	const btn = screen.getAllByRole("button").find((b) => (b as HTMLButtonElement).title?.includes("Re-download"))!;
	await act(async () => { fireEvent.click(btn); });
	await waitFor(() => {
		expect(screen.getByRole("alert").textContent).toContain("Re-download failed.");
	});
});

test("handleRedownload does not update caps when successful response lacks capabilities", async () => {
	vi.stubGlobal(
		"fetch",
		makeFetch({
			"/__harness/mm-versions": {
				active: null,
				versions: [{ key: "develop", displayVersion: "develop", installed: true, shimsBuilt: true, capabilities: DEFAULT_CAPS }],
				usingBuiltIn: true, builtInVersion: "2.35.0", capabilities: DEFAULT_CAPS
			},
			"/__harness/mm-versions/redownload": { ok: true },
			[GH_URL]: []
		})
	);
	render(<MmVersionDomain />);
	await waitFor(() => expect(screen.getByText("Cached versions")).toBeTruthy());
	const btn = screen.getAllByRole("button").find((b) => (b as HTMLButtonElement).title?.includes("Re-download"))!;
	await act(async () => { fireEvent.click(btn); });
	await waitFor(() => {
		expect(document.querySelector(".mmv-error")).toBeNull();
	});
});

test("handleDelete uses fallback error message when response has no error field", async () => {
	vi.stubGlobal(
		"fetch",
		makeFetch({
			"/__harness/mm-versions": {
				active: null,
				versions: [{ key: "2.36.0", displayVersion: "2.36.0", installed: true, shimsBuilt: true, capabilities: DEFAULT_CAPS }],
				usingBuiltIn: true, builtInVersion: "2.35.0", capabilities: DEFAULT_CAPS
			},
			"/__harness/mm-versions/delete-cache": { ok: false },
			[GH_URL]: []
		})
	);
	render(<MmVersionDomain />);
	await waitFor(() => expect(screen.getByText("Cached versions")).toBeTruthy());
	const btn = screen.getAllByRole("button").find((b) => (b as HTMLButtonElement).title === "Delete cached version")!;
	await act(async () => { fireEvent.click(btn); });
	await waitFor(() => {
		expect(screen.getByRole("alert").textContent).toContain("Delete failed.");
	});
});

test("handleReset uses fallback error message when response has no error field", async () => {
	vi.stubGlobal(
		"fetch",
		makeFetch({
			"/__harness/mm-versions": { ...DEFAULT_VERSIONS_RESPONSE, active: "2.35.0", usingBuiltIn: false },
			"/__harness/mm-versions/active": { ok: false },
			[GH_URL]: []
		})
	);
	render(<MmVersionDomain />);
	await waitFor(() => {
		expect((screen.getAllByRole("button")[0] as HTMLButtonElement).disabled).toBe(false);
	});
	await act(async () => { fireEvent.click(screen.getAllByRole("button")[0]); });
	await waitFor(() => {
		expect(screen.getByRole("alert").textContent).toContain("Reset failed.");
	});
});
