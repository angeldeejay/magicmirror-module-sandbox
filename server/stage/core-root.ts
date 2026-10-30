/**
 * Resolves the active MagicMirror core root and maps request paths to files
 * inside it. Read-only: nothing is ever written into a core directory.
 */

import * as fs from "node:fs";
import * as path from "pathe";
import { createRequire } from "node:module";
import {
	getActiveVersion,
	getBuiltInMmVersion,
	getInstalledMmVersion,
	getMmVersionRoot
} from "../mm-version-manager.ts";
import { harnessRoot } from "../paths.ts";
import {
	findBuiltInCoreRoot,
	getBuiltInCoreRootCandidates,
	PACKAGED_CORE_DIRECTORY
} from "./built-in-core.ts";

export { PACKAGED_CORE_DIRECTORY };

export type ActiveCore = {
	root: string;
	version: string;
	/** mmvm version key, or null for the built-in core. */
	key: string | null;
};

/** Top-level entries served from a core, mirroring core js/server.js. */
const CORE_DIRECTORIES = new Set([
	"js",
	"css",
	"config",
	"defaultmodules",
	"translations",
	"node_modules"
]);
const CORE_FILES = new Set(["favicon.svg"]);

/**
 * `node_modules/` entries core `js/server.js` serves besides the `js/vendor.js`
 * packages: `animate.css`, the `@fontsource` and `@fortawesome` scopes, and
 * `suncalc` (listed from 2.37, a vendor entry before).
 */
const CORE_SERVED_PACKAGES: readonly string[] = [
	"animate.css",
	"@fontsource",
	"@fortawesome",
	"suncalc"
];

/** A `node_modules/<entry>/` reference in `js/vendor.js`. */
const VENDOR_PACKAGE_REFERENCE = /["'`]node_modules\/([^/"'`]+)\//g;

/**
 * Returns the `node_modules/` entries (package names, or whole scopes) the
 * core serves, as core `js/server.js` builds its `directories` list: the
 * fixed packages plus the first path segment of every `js/vendor.js` entry
 * under `node_modules/`. `js/vendor.js` is read as text, not required: from
 * 2.38 it also assigns `globalThis.vendor`. Cores past 2.38 moved it to
 * `js/vendor.mjs`, which is read first.
 */
function listServedNodeModules(core: ActiveCore): Set<string> {
	const served = new Set(CORE_SERVED_PACKAGES);
	let vendorSource = "";
	for (const file of ["vendor.mjs", "vendor.js"]) {
		try {
			vendorSource = fs.readFileSync(path.join(core.root, "js", file), "utf8");
			break;
		} catch {
			// A core without a vendor list serves only the fixed packages.
		}
	}
	for (const match of vendorSource.matchAll(VENDOR_PACKAGE_REFERENCE)) {
		served.add(match[1]);
	}
	return served;
}

/**
 * Returns the built-in core root: the synced `mmcore-source/` in the source
 * repository, else the packaged copy in a distribution install.
 */
export function resolveBuiltInCoreRoot(root: string = harnessRoot): string {
	const found = findBuiltInCoreRoot(root);
	if (!found) {
		throw new Error(
			`The built-in MagicMirror core is missing (looked in ${getBuiltInCoreRootCandidates(root).join(", ")}). Run \`node --run build\` in the sandbox repository.`
		);
	}
	return found;
}

/**
 * Returns the core the sandbox is currently running (mmvm active or built-in).
 */
export function resolveActiveCore(): ActiveCore {
	const key = getActiveVersion();
	if (key) {
		return {
			root: getMmVersionRoot(key),
			version: getInstalledMmVersion(key) ?? key,
			key
		};
	}
	return {
		root: resolveBuiltInCoreRoot(),
		version: getBuiltInMmVersion() ?? "",
		key: null
	};
}

function isInside(base: string, target: string): boolean {
	const relative = path.relative(base, target);
	return (
		relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative)
	);
}

function resolveNodeModulesPath(
	core: ActiveCore,
	segments: string[]
): string | null {
	const packageLength = segments[0]?.startsWith("@") ? 2 : 1;
	if (segments.length <= packageLength) {
		return null;
	}
	// Bounded to what the core serves, not every package Node can resolve
	// from the core root (in a distribution install, the consumer's tree).
	const served = listServedNodeModules(core);
	if (
		!served.has(segments[0]) &&
		!served.has(segments.slice(0, packageLength).join("/"))
	) {
		return null;
	}
	const packageName = segments.slice(0, packageLength).join("/");
	let packageRoot: string;
	try {
		packageRoot = path.dirname(
			createRequire(path.join(core.root, "package.json")).resolve(
				`${packageName}/package.json`
			)
		);
	} catch {
		return null;
	}
	const target = path.resolve(packageRoot, ...segments.slice(packageLength));
	return isInside(packageRoot, target) ? target : null;
}

/**
 * Whether a path segment is one Win32 would open as a different name: an NTFS
 * stream (`name:stream`, `name::$DATA`) or a trailing dot or space, which
 * Win32 strips (`config.js.` opens `config.js`). No core ships such names,
 * so they are refused on every platform.
 */
function isAliasedSegment(segment: string): boolean {
	return segment.includes(":") || /[. ]$/.test(segment);
}

/**
 * Maps a request path (relative to the core root) to an absolute file path, or
 * null when the path is outside the served set or escapes its base.
 */
export function resolveCoreStaticPath(
	core: ActiveCore,
	requestPath: string
): string | null {
	if (requestPath.includes("\\")) {
		return null;
	}
	const segments = requestPath.split("/").filter(Boolean);
	if (
		segments.length === 0 ||
		segments.includes("..") ||
		segments.some(isAliasedSegment)
	) {
		return null;
	}
	const [top] = segments;
	if (segments.length === 1 && CORE_FILES.has(top)) {
		return path.join(core.root, top);
	}
	if (!CORE_DIRECTORIES.has(top)) {
		return null;
	}
	if (top === "node_modules") {
		return resolveNodeModulesPath(core, segments.slice(1));
	}
	const target = path.resolve(core.root, ...segments);
	return isInside(core.root, target) ? target : null;
}
