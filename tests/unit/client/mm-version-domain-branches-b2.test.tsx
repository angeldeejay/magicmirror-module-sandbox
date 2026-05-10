// @vitest-environment happy-dom
/**
 * Branch-coverage tests (part B2) for MmVersionDomain — displayActive dash,
 * in-progress redownload guard, and VersionRow spinner states.
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

const GH_URL = "https://api.github.com/repos/MagicMirrorOrg/MagicMirror/releases?per_page=50";

beforeEach(() => {
	vi.stubGlobal(
		"fetch",
		vi.fn((url: string) => {
			if ((() => { try { return new URL(url).hostname === "api.github.com"; } catch { return false; } })()) return Promise.resolve({ ok: true, json: () => Promise.resolve([]) } as Response);
			return Promise.resolve({ ok: true, json: () => Promise.resolve({
				active: null, versions: [], usingBuiltIn: true, builtInVersion: "2.35.0", capabilities: DEFAULT_CAPS
			}) } as Response);
		})
	);
});

afterEach(() => {
	vi.unstubAllGlobals();
	cleanup();
});

// ── displayActive — dash when not using built-in and active is null ───────────

test("displayActive shows dash when usingBuiltIn is false and active is null", async () => {
	vi.stubGlobal(
		"fetch",
		vi.fn((url: string) => {
			if ((() => { try { return new URL(url).hostname === "api.github.com"; } catch { return false; } })()) return Promise.resolve({ ok: true, json: () => Promise.resolve([]) } as Response);
			return Promise.resolve({
				ok: true,
				json: () => Promise.resolve({ active: null, versions: [], usingBuiltIn: false, builtInVersion: null, capabilities: DEFAULT_CAPS })
			} as Response);
		})
	);
	render(<MmVersionDomain />);
	await waitFor(() => {
		expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("—");
	});
});

// ── VersionRow — in-progress guard ───────────────────────────────────────────

test("handleRedownload early return when already redownloading", async () => {
	let resolveRedownload: ((r: Response) => void) | undefined;
	const mockFetch = vi.fn((url: string) => {
		if (url.includes("redownload")) return new Promise<Response>((res) => { resolveRedownload = res; });
		if ((() => { try { return new URL(url).hostname === "api.github.com"; } catch { return false; } })()) return Promise.resolve({ ok: true, json: () => Promise.resolve([]) } as Response);
		return Promise.resolve({
			ok: true,
			json: () => Promise.resolve({
				active: null,
				versions: [{ key: "develop", displayVersion: "develop", installed: true, shimsBuilt: true, capabilities: DEFAULT_CAPS }],
				usingBuiltIn: true, builtInVersion: "2.35.0", capabilities: DEFAULT_CAPS
			})
		} as Response);
	});
	vi.stubGlobal("fetch", mockFetch);

	try {
		render(<MmVersionDomain />);
		await waitFor(() => expect(screen.getByText("Cached versions")).toBeTruthy());

		const btn = screen.getAllByRole("button").find((b) => (b as HTMLButtonElement).title?.includes("Re-download"))!;
		await act(async () => { fireEvent.click(btn); });
		await waitFor(() => expect(btn.querySelector(".fa-spinner")).toBeTruthy());

		const redownloadsBefore = mockFetch.mock.calls.filter(([url]: [string]) => url.includes("redownload")).length;
		// Guard is synchronous — direct assert, no polling loop
		await act(async () => { fireEvent.click(btn); });
		expect(mockFetch.mock.calls.filter(([url]: [string]) => url.includes("redownload")).length).toBe(redownloadsBefore);

		await act(async () => {
			resolveRedownload?.({ ok: true, json: () => Promise.resolve({ ok: true }) } as Response);
		});
	} finally {
		resolveRedownload?.({ ok: true, json: () => Promise.resolve({ ok: true }) } as Response);
	}
});

// ── VersionRow — spinner states ───────────────────────────────────────────────

test("VersionRow shows spinner icon while redownloading", async () => {
	let resolveRedownload: (r: Response) => void;
	const mockFetch = vi.fn((url: string) => {
		if (url.includes("redownload")) return new Promise<Response>((res) => { resolveRedownload = res; });
		if ((() => { try { return new URL(url).hostname === "api.github.com"; } catch { return false; } })()) return Promise.resolve({ ok: true, json: () => Promise.resolve([]) } as Response);
		return Promise.resolve({
			ok: true,
			json: () => Promise.resolve({
				active: null,
				versions: [{ key: "develop", displayVersion: "develop", installed: true, shimsBuilt: true, capabilities: DEFAULT_CAPS }],
				usingBuiltIn: true, builtInVersion: "2.35.0", capabilities: DEFAULT_CAPS
			})
		} as Response);
	});
	vi.stubGlobal("fetch", mockFetch);

	render(<MmVersionDomain />);
	await waitFor(() => expect(screen.getByText("Cached versions")).toBeTruthy());

	const btn = screen.getAllByRole("button").find((b) => (b as HTMLButtonElement).title?.includes("Re-download"))!;
	await act(async () => { fireEvent.click(btn); });
	await waitFor(() => expect(btn.querySelector(".fa-spinner")).toBeTruthy());

	await act(async () => {
		resolveRedownload!({ ok: true, json: () => Promise.resolve({ ok: true }) } as Response);
	});
});

test("VersionRow shows spinner icon while deleting", async () => {
	let resolveDelete: (r: Response) => void;
	const mockFetch = vi.fn((url: string) => {
		if (url.includes("delete-cache")) return new Promise<Response>((res) => { resolveDelete = res; });
		if ((() => { try { return new URL(url).hostname === "api.github.com"; } catch { return false; } })()) return Promise.resolve({ ok: true, json: () => Promise.resolve([]) } as Response);
		return Promise.resolve({
			ok: true,
			json: () => Promise.resolve({
				active: null,
				versions: [{ key: "2.36.0", displayVersion: "2.36.0", installed: true, shimsBuilt: true, capabilities: DEFAULT_CAPS }],
				usingBuiltIn: true, builtInVersion: "2.35.0", capabilities: DEFAULT_CAPS
			})
		} as Response);
	});
	vi.stubGlobal("fetch", mockFetch);

	render(<MmVersionDomain />);
	await waitFor(() => expect(screen.getByText("Cached versions")).toBeTruthy());

	const btn = screen.getAllByRole("button").find((b) => (b as HTMLButtonElement).title === "Delete cached version")!;
	await act(async () => { fireEvent.click(btn); });
	await waitFor(() => expect(btn.querySelector(".fa-spinner")).toBeTruthy());

	await act(async () => {
		resolveDelete!({ ok: true, json: () => Promise.resolve({ ok: true }) } as Response);
	});
});
