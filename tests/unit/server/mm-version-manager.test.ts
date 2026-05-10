/**
 * Unit tests for server/mm-version-manager.ts.
 *
 * fs and child_process are mocked so no real disk I/O or npm installs occur.
 */
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("node:fs");
vi.mock("node:child_process");

import * as fs from "node:fs";
import * as childProcess from "node:child_process";
import {
	areShimsBuilt,
	deleteVersionCache,
	deriveCapabilities,
	downloadVersion,
	getActiveVersion,
	getBuiltInMmVersion,
	getInstalledMmVersion,
	getMmVersionRoot,
	getMmvmRoot,
	getVersionInfo,
	getVersionInstallDir,
	getVersionShimsDir,
	isVersionInstalled,
	listCachedVersions,
	resolveNpmSpec,
	sanitizeVersion,
	setActiveVersion
} from "../../../server/mm-version-manager.ts";

beforeEach(() => {
	vi.resetAllMocks();
});

// ── sanitizeVersion ────────────────────────────────────────────────────────────

test("sanitizeVersion keeps valid semver unchanged", () => {
	expect(sanitizeVersion("2.35.0")).toBe("2.35.0");
	expect(sanitizeVersion("develop")).toBe("develop");
	expect(sanitizeVersion("v2.36.0")).toBe("v2.36.0");
});

test("sanitizeVersion replaces invalid chars with hyphens", () => {
	expect(sanitizeVersion("github:org/repo#branch")).toBe("github-org-repo-branch");
	expect(sanitizeVersion("a/b\\c")).toBe("a-b-c");
});

test("sanitizeVersion collapses consecutive hyphens", () => {
	expect(sanitizeVersion("a***b")).toBe("a-b");
	expect(sanitizeVersion("foo//bar")).toBe("foo-bar");
});

// ── resolveNpmSpec ─────────────────────────────────────────────────────────────

test("resolveNpmSpec wraps semver as magicmirror@version", () => {
	expect(resolveNpmSpec("2.35.0")).toBe("magicmirror@2.35.0");
	expect(resolveNpmSpec("2.36.0")).toBe("magicmirror@2.36.0");
});

test("resolveNpmSpec maps 'develop' to fork branch ref", () => {
	expect(resolveNpmSpec("develop")).toBe("github:angeldeejay/MagicMirror#develop");
});

test("resolveNpmSpec passes through github: prefix verbatim", () => {
	expect(resolveNpmSpec("github:org/repo")).toBe("github:org/repo");
});

test("resolveNpmSpec passes through git+ prefix verbatim", () => {
	const url = "git+https://example.com/repo.git";
	expect(resolveNpmSpec(url)).toBe(url);
});

// ── path helpers ───────────────────────────────────────────────────────────────

test("getMmvmRoot contains .mmvm", () => {
	expect(getMmvmRoot()).toContain(".mmvm");
});

test("getVersionInstallDir contains sanitized version and .mmvm", () => {
	const dir = getVersionInstallDir("2.35.0");
	expect(dir).toContain("2.35.0");
	expect(dir).toContain(".mmvm");
	expect(dir).toContain("versions");
});

test("getVersionInstallDir sanitizes special chars in version", () => {
	const dir = getVersionInstallDir("org/repo");
	const lastSegment = dir.replace(/\\/g, "/").split("/").pop() ?? dir;
	expect(lastSegment).toBe("org-repo");
});

test("getMmVersionRoot points inside node_modules/magicmirror", () => {
	const root = getMmVersionRoot("2.35.0");
	expect(root).toContain("node_modules");
	expect(root).toContain("magicmirror");
});

test("getVersionShimsDir contains shims and sanitized version", () => {
	const dir = getVersionShimsDir("2.35.0");
	expect(dir).toContain("shims");
	expect(dir).toContain("2.35.0");
});

// ── getActiveVersion ───────────────────────────────────────────────────────────

test("getActiveVersion returns null when ACTIVE_FILE does not exist", () => {
	vi.mocked(fs.existsSync).mockReturnValue(false);
	expect(getActiveVersion()).toBeNull();
});

test("getActiveVersion returns trimmed content of ACTIVE_FILE", () => {
	vi.mocked(fs.existsSync).mockReturnValue(true);
	vi.mocked(fs.readFileSync).mockReturnValue("2.35.0\n" as unknown as Buffer);
	expect(getActiveVersion()).toBe("2.35.0");
});

test("getActiveVersion returns null when file is blank", () => {
	vi.mocked(fs.existsSync).mockReturnValue(true);
	vi.mocked(fs.readFileSync).mockReturnValue("   " as unknown as Buffer);
	expect(getActiveVersion()).toBeNull();
});

test("getActiveVersion returns null when readFileSync throws", () => {
	vi.mocked(fs.existsSync).mockReturnValue(true);
	vi.mocked(fs.readFileSync).mockImplementation(() => {
		throw new Error("ENOENT");
	});
	expect(getActiveVersion()).toBeNull();
});

// ── setActiveVersion ───────────────────────────────────────────────────────────

test("setActiveVersion writes sanitized version to disk", () => {
	vi.mocked(fs.mkdirSync).mockReturnValue(undefined);
	vi.mocked(fs.writeFileSync).mockReturnValue(undefined);
	setActiveVersion("2.35.0");
	expect(fs.writeFileSync).toHaveBeenCalledWith(
		expect.stringContaining("active"),
		"2.35.0",
		"utf8"
	);
});

test("setActiveVersion sanitizes the version before writing", () => {
	vi.mocked(fs.mkdirSync).mockReturnValue(undefined);
	vi.mocked(fs.writeFileSync).mockReturnValue(undefined);
	setActiveVersion("github:org/repo");
	const written = vi.mocked(fs.writeFileSync).mock.calls[0][1] as string;
	expect(written).not.toContain(":");
	expect(written).not.toContain("/");
});

// ── listCachedVersions ─────────────────────────────────────────────────────────

test("listCachedVersions returns empty array when VERSIONS_ROOT does not exist", () => {
	vi.mocked(fs.existsSync).mockReturnValue(false);
	expect(listCachedVersions()).toEqual([]);
});

test("listCachedVersions returns keys for directories with installed magicmirror", () => {
	vi.mocked(fs.existsSync).mockImplementation(() => true);
	vi.mocked(fs.readdirSync).mockReturnValue([
		{ name: "2.35.0", isDirectory: () => true } as fs.Dirent,
		{ name: "develop", isDirectory: () => true } as fs.Dirent,
		{ name: "not-a-dir", isDirectory: () => false } as fs.Dirent
	]);
	const result = listCachedVersions();
	expect(result).toContain("2.35.0");
	expect(result).toContain("develop");
	expect(result).not.toContain("not-a-dir");
});

test("listCachedVersions excludes directories missing magicmirror/package.json", () => {
	vi.mocked(fs.existsSync).mockImplementation((p) => {
		const ps = String(p);
		if (ps.includes("versions") && !ps.includes("package.json")) return true;
		if (ps.includes("2.35.0") && ps.includes("package.json")) return true;
		if (ps.includes("develop") && ps.includes("package.json")) return false;
		return false;
	});
	vi.mocked(fs.readdirSync).mockReturnValue([
		{ name: "2.35.0", isDirectory: () => true } as fs.Dirent,
		{ name: "develop", isDirectory: () => true } as fs.Dirent
	]);
	const result = listCachedVersions();
	expect(result).toContain("2.35.0");
	expect(result).not.toContain("develop");
});

test("listCachedVersions returns empty array on readdirSync error", () => {
	vi.mocked(fs.existsSync).mockReturnValue(true);
	vi.mocked(fs.readdirSync).mockImplementation(() => {
		throw new Error("EACCES");
	});
	expect(listCachedVersions()).toEqual([]);
});

// ── isVersionInstalled ─────────────────────────────────────────────────────────

test("isVersionInstalled returns true when package.json exists", () => {
	vi.mocked(fs.existsSync).mockReturnValue(true);
	expect(isVersionInstalled("2.35.0")).toBe(true);
});

test("isVersionInstalled returns false when package.json is missing", () => {
	vi.mocked(fs.existsSync).mockReturnValue(false);
	expect(isVersionInstalled("2.35.0")).toBe(false);
});

// ── areShimsBuilt ──────────────────────────────────────────────────────────────

test("areShimsBuilt returns true when all shim artifacts exist", () => {
	vi.mocked(fs.existsSync).mockReturnValue(true);
	expect(areShimsBuilt("2.35.0")).toBe(true);
});

test("areShimsBuilt returns false when any shim artifact is missing", () => {
	vi.mocked(fs.existsSync)
		.mockReturnValueOnce(false);
	expect(areShimsBuilt("2.35.0")).toBe(false);
});

// ── deleteVersionCache ─────────────────────────────────────────────────────────

test("deleteVersionCache removes both install dir and shims dir", () => {
	vi.mocked(fs.rmSync).mockReturnValue(undefined);
	deleteVersionCache("2.35.0");
	expect(fs.rmSync).toHaveBeenCalledTimes(2);
	const calls = vi.mocked(fs.rmSync).mock.calls.map((c) => String(c[0]));
	expect(calls.some((p) => p.includes("versions"))).toBe(true);
	expect(calls.some((p) => p.includes("shims"))).toBe(true);
});

// ── getInstalledMmVersion ──────────────────────────────────────────────────────

test("getInstalledMmVersion returns version string from package.json", () => {
	vi.mocked(fs.existsSync).mockReturnValue(true);
	vi.mocked(fs.readFileSync).mockReturnValue(
		JSON.stringify({ version: "2.35.0" }) as unknown as Buffer
	);
	expect(getInstalledMmVersion("2.35.0")).toBe("2.35.0");
});

test("getInstalledMmVersion returns null when package.json is missing", () => {
	vi.mocked(fs.existsSync).mockReturnValue(false);
	expect(getInstalledMmVersion("2.35.0")).toBeNull();
});

test("getInstalledMmVersion returns null when version field is not a string", () => {
	vi.mocked(fs.existsSync).mockReturnValue(true);
	vi.mocked(fs.readFileSync).mockReturnValue(
		JSON.stringify({ version: 235 }) as unknown as Buffer
	);
	expect(getInstalledMmVersion("2.35.0")).toBeNull();
});

test("getInstalledMmVersion returns null on JSON parse error", () => {
	vi.mocked(fs.existsSync).mockReturnValue(true);
	vi.mocked(fs.readFileSync).mockReturnValue("not-json" as unknown as Buffer);
	expect(getInstalledMmVersion("2.35.0")).toBeNull();
});

// ── getBuiltInMmVersion ────────────────────────────────────────────────────────

test("getBuiltInMmVersion returns version from first available candidate", () => {
	vi.mocked(fs.existsSync).mockReturnValueOnce(true);
	vi.mocked(fs.readFileSync).mockReturnValueOnce(
		JSON.stringify({ version: "2.36.0" }) as unknown as Buffer
	);
	expect(getBuiltInMmVersion()).toBe("2.36.0");
});

test("getBuiltInMmVersion falls back to second candidate", () => {
	vi.mocked(fs.existsSync)
		.mockReturnValueOnce(false)
		.mockReturnValueOnce(true);
	vi.mocked(fs.readFileSync).mockReturnValueOnce(
		JSON.stringify({ version: "2.35.0" }) as unknown as Buffer
	);
	expect(getBuiltInMmVersion()).toBe("2.35.0");
});

test("getBuiltInMmVersion returns null when no candidate exists", () => {
	vi.mocked(fs.existsSync).mockReturnValue(false);
	expect(getBuiltInMmVersion()).toBeNull();
});

test("getBuiltInMmVersion returns null when version field is missing", () => {
	vi.mocked(fs.existsSync).mockReturnValueOnce(true);
	vi.mocked(fs.readFileSync).mockReturnValueOnce(
		JSON.stringify({ name: "magicmirror" }) as unknown as Buffer
	);
	expect(getBuiltInMmVersion()).toBeNull();
});

// ── deriveCapabilities ─────────────────────────────────────────────────────────

describe("deriveCapabilities", () => {
	test("null version → conservative unknown defaults", () => {
		const c = deriveCapabilities(null);
		expect(c.expressVersion).toBe("unknown");
		expect(c.defaultModulesDir).toBe("unknown");
		expect(c.configLoading).toBe("unknown");
		expect(c.es6NodeHelper).toBe(false);
		expect(c.classExtendSystem).toBe(true);
		expect(c.helperLoadedHook).toBe(true);
		expect(c.helperStopHook).toBe(true);
	});

	test("unparseable version string → same unknown defaults", () => {
		const c = deriveCapabilities("not-a-version");
		expect(c.expressVersion).toBe("unknown");
		expect(c.configLoading).toBe("unknown");
	});

	test("v2.27.0 — pre-HttpFetcher era", () => {
		const c = deriveCapabilities("2.27.0");
		expect(c.httpFetcher).toBe(false);
		expect(c.getUserAgent).toBe(false);
		expect(c.secretPlaceholder).toBe(false);
		expect(c.hideConfigSecrets).toBe(false);
		expect(c.expressVersion).toBe("4");
		expect(c.defaultModulesDir).toBe("/modules/default");
		expect(c.configLoading).toBe("filesystem");
		expect(c.corsProxyEnabledByDefault).toBe(true);
		expect(c.configFunctions).toBe(false);
		expect(c.es6NodeHelper).toBe(false);
		expect(c.classExtendSystem).toBe(true);
	});

	test("v2.28.0 — secretPlaceholder and hideConfigSecrets added", () => {
		const c = deriveCapabilities("2.28.0");
		expect(c.secretPlaceholder).toBe(true);
		expect(c.hideConfigSecrets).toBe(true);
		expect(c.httpFetcher).toBe(false);
	});

	test("v2.30.0 — httpFetcher and getUserAgent added", () => {
		const c = deriveCapabilities("2.30.0");
		expect(c.httpFetcher).toBe(true);
		expect(c.getUserAgent).toBe(true);
		expect(c.expressVersion).toBe("4");
	});

	test("v2.32.0 — Express 5 adopted", () => {
		const c = deriveCapabilities("2.32.0");
		expect(c.expressVersion).toBe("5");
		expect(c.defaultModulesDir).toBe("/modules/default");
	});

	test("v2.35.0 — /defaultmodules dir and config via endpoint", () => {
		const c = deriveCapabilities("2.35.0");
		expect(c.defaultModulesDir).toBe("/defaultmodules");
		expect(c.configLoading).toBe("endpoint");
		expect(c.corsProxyEnabledByDefault).toBe(true);
		expect(c.configFunctions).toBe(false);
		expect(c.es6NodeHelper).toBe(false);
	});

	test("v2.36.0 — CORS disabled by default, config functions enabled", () => {
		const c = deriveCapabilities("2.36.0");
		expect(c.corsProxyEnabledByDefault).toBe(false);
		expect(c.configFunctions).toBe(true);
		expect(c.es6NodeHelper).toBe(false);
		expect(c.classExtendSystem).toBe(true);
	});

	test("v2.37.0 — ES6 class node_helper, class extend system gone", () => {
		const c = deriveCapabilities("2.37.0");
		expect(c.es6NodeHelper).toBe(true);
		expect(c.classExtendSystem).toBe(false);
	});

	test("corsProxy is always true regardless of version", () => {
		expect(deriveCapabilities("2.27.0").corsProxy).toBe(true);
		expect(deriveCapabilities("2.37.0").corsProxy).toBe(true);
	});

	test("helperLoadedHook and helperStopHook are always true", () => {
		expect(deriveCapabilities("2.35.0").helperLoadedHook).toBe(true);
		expect(deriveCapabilities("2.35.0").helperStopHook).toBe(true);
	});

	test("socketNamespace is always 'name'", () => {
		expect(deriveCapabilities("2.35.0").socketNamespace).toBe("name");
		expect(deriveCapabilities("2.37.0").socketNamespace).toBe("name");
	});

	test("patch version boundary respected for 2.30.0", () => {
		expect(deriveCapabilities("2.29.9").httpFetcher).toBe(false);
		expect(deriveCapabilities("2.30.0").httpFetcher).toBe(true);
	});

	test("patch version boundary respected for 2.36.0", () => {
		expect(deriveCapabilities("2.35.9").corsProxyEnabledByDefault).toBe(true);
		expect(deriveCapabilities("2.36.0").corsProxyEnabledByDefault).toBe(false);
	});
});

// ── downloadVersion ────────────────────────────────────────────────────────────

test("downloadVersion returns ok:true when npm install exits 0", () => {
	vi.mocked(fs.mkdirSync).mockReturnValue(undefined);
	vi.mocked(childProcess.spawnSync).mockReturnValue({
		status: 0,
		error: undefined,
		stderr: "",
		stdout: "",
		pid: 0,
		output: [],
		signal: null
	});
	expect(downloadVersion("2.35.0")).toEqual({ ok: true });
});

test("downloadVersion returns ok:false with stderr when exit code != 0", () => {
	vi.mocked(fs.mkdirSync).mockReturnValue(undefined);
	vi.mocked(childProcess.spawnSync).mockReturnValue({
		status: 1,
		error: undefined,
		stderr: "npm ERR! 404",
		stdout: "",
		pid: 0,
		output: [],
		signal: null
	});
	const result = downloadVersion("2.35.0");
	expect(result.ok).toBe(false);
	expect((result as { error: string }).error).toContain("npm ERR!");
});

test("downloadVersion returns ok:false when spawnSync sets error field", () => {
	vi.mocked(fs.mkdirSync).mockReturnValue(undefined);
	vi.mocked(childProcess.spawnSync).mockReturnValue({
		status: null,
		error: new Error("ENOENT: npm not found"),
		stderr: "",
		stdout: "",
		pid: 0,
		output: [],
		signal: null
	});
	const result = downloadVersion("2.35.0");
	expect(result.ok).toBe(false);
	expect((result as { error: string }).error).toContain("ENOENT");
});

test("downloadVersion falls back to stdout when stderr is empty", () => {
	vi.mocked(fs.mkdirSync).mockReturnValue(undefined);
	vi.mocked(childProcess.spawnSync).mockReturnValue({
		status: 1,
		error: undefined,
		stderr: "",
		stdout: "Something went wrong",
		pid: 0,
		output: [],
		signal: null
	});
	const result = downloadVersion("2.35.0");
	expect(result.ok).toBe(false);
	expect((result as { error: string }).error).toContain("Something went wrong");
});

// ── buildShimsForVersion ───────────────────────────────────────────────────────

test("buildShimsForVersion returns error when version is not installed", async () => {
	vi.mocked(fs.existsSync).mockReturnValue(false);
	const { buildShimsForVersion } = await import("../../../server/mm-version-manager.ts");
	const result = await buildShimsForVersion("2.35.0", "/harness");
	expect(result.ok).toBe(false);
	expect((result as { ok: false; error: string }).error).toMatch(/not installed/);
});

test("buildShimsForVersion catches dynamic import error and returns ok:false", async () => {
	vi.mocked(fs.existsSync).mockReturnValue(true);
	const { buildShimsForVersion } = await import("../../../server/mm-version-manager.ts");
	const result = await buildShimsForVersion("2.35.0", "/nonexistent-harness-___xyz");
	expect(result.ok).toBe(false);
	expect(typeof (result as { ok: false; error: string }).error).toBe("string");
});

// ── getVersionInfo ─────────────────────────────────────────────────────────────

test("getVersionInfo returns full info for an installed version with all shims", () => {
	vi.mocked(fs.existsSync).mockReturnValue(true);
	vi.mocked(fs.readFileSync).mockReturnValue(
		JSON.stringify({ version: "2.35.0" }) as unknown as Buffer
	);
	const info = getVersionInfo("2.35.0");
	expect(info.key).toBe("2.35.0");
	expect(info.installed).toBe(true);
	expect(info.shimsBuilt).toBe(true);
	expect(info.displayVersion).toBe("2.35.0");
	expect(info.capabilities.configLoading).toBe("endpoint");
});

test("getVersionInfo returns not-installed when version dir is absent", () => {
	vi.mocked(fs.existsSync).mockReturnValue(false);
	const info = getVersionInfo("9.99.99");
	expect(info.installed).toBe(false);
	expect(info.displayVersion).toBeNull();
	expect(info.shimsBuilt).toBe(false);
	expect(info.capabilities.expressVersion).toBe("unknown");
});
