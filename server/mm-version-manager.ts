/**
 * MagicMirror version manager — nvm-style global store for MM core installations.
 *
 * Store layout:
 *   ~/.mmvm/
 *     versions/<sanitized>/   ← npm install output per version
 *     shims/<sanitized>/      ← pre-built sandbox shims per version
 *     active                  ← file containing the sanitized active version key
 */

import * as os from "node:os";
import * as fs from "node:fs";
import { spawnSync } from "node:child_process";
import { pathToFileURL, fileURLToPath } from "node:url";
import * as path from "pathe";

const _serverDir = path.dirname(
	typeof __filename === "string" ? __filename.replace(/\\/g, "/") : fileURLToPath(import.meta.url)
);
const _projectRoot = path.resolve(_serverDir, "..");

const MMVM_ROOT = path.join(os.homedir().replace(/\\/g, "/"), ".mmvm");
const VERSIONS_ROOT = path.join(MMVM_ROOT, "versions");
const SHIMS_STORE_ROOT = path.join(MMVM_ROOT, "shims");
const ACTIVE_FILE = path.join(MMVM_ROOT, "active");

const SHIMS_ARTIFACT_PATHS = [
	"node_helper.js",
	"logger.js",
	path.join("magicmirror-core", "package.json"),
	path.join("magicmirror-core", "js", "node_helper.js"),
	path.join("magicmirror-core", "js", "http_fetcher.js"),
	path.join("magicmirror-core", "js", "server_functions.js"),
	path.join("node_modules", "express", "index.js"),
	path.join("node_modules", "undici", "index.js")
];

function ensureDir(dir: string): void {
	fs.mkdirSync(dir, { recursive: true });
}

/**
 * Converts a version string (semver, github ref, etc.) to a safe directory name.
 */
export function sanitizeVersion(version: string): string {
	return version.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-{2,}/g, "-");
}

/**
 * Resolves the npm install spec for a version string.
 * "2.35.0" → "magicmirror@2.35.0"
 * "develop" → fork develop branch
 * "github:..." → passed through
 */
export function resolveNpmSpec(version: string): string {
	if (version.startsWith("github:") || version.startsWith("git+")) {
		return version;
	}
	if (version === "develop") {
		return "github:angeldeejay/MagicMirror#develop";
	}
	return `magicmirror@${version}`;
}

export function getMmvmRoot(): string {
	return MMVM_ROOT;
}

/**
 * Returns the active version key, or null if none is set.
 */
export function getActiveVersion(): string | null {
	try {
		if (!fs.existsSync(ACTIVE_FILE)) return null;
		const raw = fs.readFileSync(ACTIVE_FILE, "utf8").trim();
		return raw || null;
	} catch {
		return null;
	}
}

/**
 * Writes the active version key to disk.
 */
export function setActiveVersion(version: string): void {
	ensureDir(MMVM_ROOT);
	fs.writeFileSync(ACTIVE_FILE, sanitizeVersion(version), "utf8");
}

/**
 * Returns the install directory for a version.
 * node_modules/magicmirror lives inside this directory.
 */
export function getVersionInstallDir(version: string): string {
	return path.join(VERSIONS_ROOT, sanitizeVersion(version));
}

/**
 * Returns the path to the MagicMirror package root for a given version.
 */
export function getMmVersionRoot(version: string): string {
	return path.join(
		getVersionInstallDir(version),
		"node_modules",
		"magicmirror"
	);
}

/**
 * Returns the path to the built shims directory for a given version.
 */
export function getVersionShimsDir(version: string): string {
	return path.join(SHIMS_STORE_ROOT, sanitizeVersion(version));
}

/**
 * Lists all version keys that have an installed MM package.
 */
export function listCachedVersions(): string[] {
	try {
		if (!fs.existsSync(VERSIONS_ROOT)) return [];
		return fs
			.readdirSync(VERSIONS_ROOT, { withFileTypes: true })
			.filter(
				(e) =>
					e.isDirectory() &&
					fs.existsSync(
						path.join(VERSIONS_ROOT, e.name, "node_modules", "magicmirror", "package.json")
					)
			)
			.map((e) => e.name);
	} catch {
		return [];
	}
}

/**
 * Returns true if the MM package is installed for the given version key.
 */
export function isVersionInstalled(version: string): boolean {
	return fs.existsSync(
		path.join(getMmVersionRoot(version), "package.json")
	);
}

/**
 * Returns true if shims have been built for the given version key.
 */
export function areShimsBuilt(version: string): boolean {
	const shimsDir = getVersionShimsDir(version);
	return SHIMS_ARTIFACT_PATHS.every((f) =>
		fs.existsSync(path.join(shimsDir, f))
	);
}

export type VersionActionResult =
	| { ok: true }
	| { ok: false; error: string };

/**
 * Deletes the cached install and shims for a version key so it can be re-downloaded.
 */
export function deleteVersionCache(version: string): void {
	fs.rmSync(getVersionInstallDir(version), { recursive: true, force: true });
	fs.rmSync(getVersionShimsDir(version), { recursive: true, force: true });
}

const SAFE_SPEC_RE = /^[a-zA-Z0-9._@/#:+-]+$/;

/**
 * Downloads (npm install) a MagicMirror version into the global store.
 * Uses the full npm install to include MM's own dependencies (express, undici).
 */
export function downloadVersion(version: string): VersionActionResult {
	const spec = resolveNpmSpec(version);
	if (!SAFE_SPEC_RE.test(spec)) {
		return { ok: false, error: `Unsafe version spec rejected: "${spec}"` };
	}

	const installDir = getVersionInstallDir(version);
	ensureDir(installDir);

	const result =
		process.platform === "win32"
			? spawnSync("cmd.exe", ["/c", "npm", "install", "--prefix", installDir, spec, "--no-save", "--ignore-scripts"], {
					stdio: "pipe",
					encoding: "utf8"
				})
			: spawnSync("npm", ["install", "--prefix", installDir, spec, "--no-save", "--ignore-scripts"], {
					stdio: "pipe",
					encoding: "utf8"
				});

	if (result.error) {
		return { ok: false, error: result.error.message };
	}
	if (result.status !== 0) {
		return {
			ok: false,
			error: (result.stderr || result.stdout || "npm install failed").trim()
		};
	}
	return { ok: true };
}

/**
 * Builds sandbox shims for a given version and stores them in ~/.mmvm/shims/<version>/.
 * Dynamically imports build-node-compat to avoid a hard dependency at module load time.
 */
export async function buildShimsForVersion(
	version: string,
	harnessRoot: string
): Promise<VersionActionResult> {
	if (!isVersionInstalled(version)) {
		return { ok: false, error: `MM version "${version}" is not installed` };
	}

	const mmVersionRoot = getMmVersionRoot(version);
	const outputDir = getVersionShimsDir(version);

	try {
		const scriptPath = path.join(harnessRoot, "scripts", "build-node-compat.ts");
		const { buildNodeCompat } = await import(
			/* @vite-ignore */ pathToFileURL(scriptPath).href
		);
		buildNodeCompat({ mmRoot: mmVersionRoot, outputRoot: outputDir });
		return { ok: true };
	} catch (err) {
		const e = err as Error;
		return { ok: false, error: e?.message ?? String(err) };
	}
}

/**
 * Returns the resolved display version string for a sanitized version key,
 * reading it from the installed package.json.
 */
export function getInstalledMmVersion(versionKey: string): string | null {
	try {
		const pkgPath = path.join(getMmVersionRoot(versionKey), "package.json");
		if (!fs.existsSync(pkgPath)) return null;
		const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as {
			version?: unknown;
		};
		return typeof pkg.version === "string" ? pkg.version : null;
	} catch {
		return null;
	}
}

/**
 * Returns the version of the baseline MagicMirror package used for built-in shims.
 * Prefers mmcore-source/ (populated by sync-mmcore-source.ts) over node_modules/.
 */
export function getBuiltInMmVersion(): string | null {
	const candidates = [
		path.join(_projectRoot, "mmcore-source", "node_modules", "magicmirror", "package.json"),
		path.join(_projectRoot, "node_modules", "magicmirror", "package.json")
	];
	for (const pkgPath of candidates) {
		try {
			if (!fs.existsSync(pkgPath)) continue;
			const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as { version?: unknown };
			if (typeof pkg.version === "string") return pkg.version;
		} catch {
			// try next candidate
		}
	}
	return null;
}

// ── Capability map ────────────────────────────────────────────────────────────

/**
 * Feature flags describing what the sandbox UI can expose for a given MM version.
 * Consumed by the client to show/hide/enable/disable panels and controls.
 */
export type MmCapabilities = {
	/** node_helper.loaded() lifecycle hook exists */
	helperLoadedHook: boolean;
	/** node_helper.stop() lifecycle hook exists */
	helperStopHook: boolean;
	/** Class.extend() system available (pre-ES6-class era) */
	classExtendSystem: boolean;
	/** NodeHelper is an ES6 class (≥2.37.0) */
	es6NodeHelper: boolean;
	/** HTTPFetcher class available via http_fetcher.js */
	httpFetcher: boolean;
	/** CORS proxy endpoint available (/cors) */
	corsProxy: boolean;
	/** CORS proxy is ON by default (disabled from 2.36.0 onward) */
	corsProxyEnabledByDefault: boolean;
	/** replaceSecretPlaceholder() available in server_functions */
	secretPlaceholder: boolean;
	/** config.hideConfigSecrets supported */
	hideConfigSecrets: boolean;
	/** getUserAgent() available in server_functions */
	getUserAgent: boolean;
	/** Express version loaded by MM (affects expressApp advanced usage) */
	expressVersion: "4" | "5" | "unknown";
	/** Default modules directory path convention */
	defaultModulesDir: "/modules/default" | "/defaultmodules" | "unknown";
	/** config.js loading mechanism */
	configLoading: "filesystem" | "endpoint" | "unknown";
	/** Functions allowed in config.js (serialized via __mmFunction wrapper) */
	configFunctions: boolean;
	/** node_helper socket namespace format */
	socketNamespace: "name" | "/name";
};

/**
 * Parses a semver string into [major, minor, patch].
 * Returns null if unparseable.
 */
function parseSemver(version: string): [number, number, number] | null {
	const m = /^(\d+)\.(\d+)\.(\d+)/.exec(version);
	if (!m) return null;
	return [parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10)];
}

/**
 * Returns true if `version` is >= the given [major, minor, patch] threshold.
 */
function gte(
	version: [number, number, number],
	[ma, mi, pa]: [number, number, number]
): boolean {
	if (version[0] !== ma) return version[0] > ma;
	if (version[1] !== mi) return version[1] > mi;
	return version[2] >= pa;
}

/**
 * Derives the capability set for a given MM semver string.
 * Falls back to a conservative "unknown" set for unrecognized versions.
 */
export function deriveCapabilities(mmVersion: string | null): MmCapabilities {
	// Unknown / unparseable version → conservative defaults
	const unknown: MmCapabilities = {
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
		expressVersion: "unknown",
		defaultModulesDir: "unknown",
		configLoading: "unknown",
		configFunctions: false,
		socketNamespace: "name"
	};

	if (!mmVersion) return unknown;

	const semver = parseSemver(mmVersion);
	if (!semver) return unknown;

	// v2.32.0 — Express v5 (undocumented, issue #3835)
	const hasExpressV5 = gte(semver, [2, 32, 0]);

	// v2.35.0 — defaultmodules dir, config via endpoint, weather server-side, performWebRequest removed
	const hasDefaultModulesDir = gte(semver, [2, 35, 0]);
	const hasConfigEndpoint = gte(semver, [2, 35, 0]);

	// v2.36.0 — CORS disabled by default, SSRF protection, config functions via __mmFunction
	const hasCorsDisabledDefault = gte(semver, [2, 36, 0]);
	const hasConfigFunctions = gte(semver, [2, 36, 0]);

	// v2.37.0 — node_helper as ES6 class (PR #4147)
	const hasEs6NodeHelper = gte(semver, [2, 37, 0]);

	return {
		helperLoadedHook: true,
		helperStopHook: true,
		classExtendSystem: !hasEs6NodeHelper,
		es6NodeHelper: hasEs6NodeHelper,
		httpFetcher: gte(semver, [2, 30, 0]),
		corsProxy: true,
		corsProxyEnabledByDefault: !hasCorsDisabledDefault,
		secretPlaceholder: gte(semver, [2, 28, 0]),
		hideConfigSecrets: gte(semver, [2, 28, 0]),
		getUserAgent: gte(semver, [2, 30, 0]),
		expressVersion: hasExpressV5 ? "5" : "4",
		defaultModulesDir: hasDefaultModulesDir ? "/defaultmodules" : "/modules/default",
		configLoading: hasConfigEndpoint ? "endpoint" : "filesystem",
		configFunctions: hasConfigFunctions,
		socketNamespace: "name"
	};
}

/**
 * Returns full version info for a version key, including capabilities.
 */
export type MmVersionInfo = {
	key: string;
	displayVersion: string | null;
	installed: boolean;
	shimsBuilt: boolean;
	capabilities: MmCapabilities;
};

export function getVersionInfo(versionKey: string): MmVersionInfo {
	const installed = isVersionInstalled(versionKey);
	const shimsBuilt = areShimsBuilt(versionKey);
	const displayVersion = installed ? getInstalledMmVersion(versionKey) : null;
	return {
		key: versionKey,
		displayVersion,
		installed,
		shimsBuilt,
		capabilities: deriveCapabilities(displayVersion)
	};
}
