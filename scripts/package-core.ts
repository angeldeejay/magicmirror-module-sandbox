/**
 * Packages the built-in MagicMirror core's browser files for distribution
 * installs (`dist/core/`), which have no `mmcore-source/`.
 *
 * The stage serves the core page through `server/stage/`, so the package
 * ships what that page requests, laid out the way the stage resolves it:
 * - the core files: `index.html`, `package.json`, `favicon.svg`, `js/`,
 *   `css/`, `translations/`, and the two `defaultmodules/` support files the
 *   page loads (`utils.js`, `defaultmodules.js`);
 * - every `node_modules/...` file the page can request, at
 *   `core/node_modules/<package>/...` (a hoisted layout, as in
 *   `mmcore-source/`), each with its package's `package.json` so Node
 *   resolution from the core root finds it (`resolveCoreStaticPath`).
 *
 * The vendor files are the transitive closure of the references the core
 * makes: `index.html` `href`/`src`, every `js/vendor.js` entry, and the
 * `url()` / `@import` references of every stylesheet reached from those and
 * from `css/`. That covers the packages core `js/server.js` serves
 * (`animate.css`, `@fontsource`, `@fortawesome`, the vendor packages) without
 * the parts of them no core page loads (sources, SVG sets, metadata).
 */
import * as fs from "node:fs";
import { createRequire } from "node:module";
import * as path from "pathe";
import {
	type ActiveCore,
	resolveCoreStaticPath
} from "../server/stage/core-root.ts";

/** Core files and directories copied verbatim. */
export const PACKAGED_CORE_ENTRIES: readonly string[] = [
	"index.html",
	"package.json",
	"favicon.svg",
	"js",
	"css",
	"translations",
	path.join("defaultmodules", "utils.js"),
	path.join("defaultmodules", "defaultmodules.js")
];

/** One file to copy: absolute source, path relative to the package root. */
export type PackagedFile = { source: string; target: string };

/** License files shipped with every vendor package. */
const LICENSE_FILE = /^(licen[cs]e|copying)(\.|$)/i;

const HTML_REFERENCE = /\s(?:href|src)="([^"]+)"/g;
const CSS_URL_REFERENCE = /url\(\s*(['"]?)([^'")]+)\1\s*\)/g;
const CSS_IMPORT_REFERENCE = /@import\s+(['"])([^'"]+)\1/g;

/**
 * Turns one reference found in the file served at `fromRequestPath` into a
 * core request path, or null for references the stage never serves from the
 * core (absolute URLs, data URIs, fragments).
 */
function toRequestPath(
	reference: string,
	fromRequestPath: string
): string | null {
	const clean = reference.split(/[?#]/)[0].trim();
	if (
		clean === "" ||
		/^[a-z][a-z0-9+.-]*:/i.test(clean) ||
		clean.startsWith("/") ||
		clean.startsWith("//")
	) {
		return null;
	}
	const joined = path.normalize(
		path.join(path.dirname(fromRequestPath), clean)
	);
	return joined.startsWith("..") ? null : joined;
}

/**
 * Splits `node_modules/<package>/<rest>` into its package name, or null.
 */
function packageNameOf(requestPath: string): string | null {
	const segments = requestPath.split("/");
	if (segments[0] !== "node_modules" || segments.length < 3) {
		return null;
	}
	return segments[1].startsWith("@")
		? `${segments[1]}/${segments[2]}`
		: segments[1];
}

/**
 * Lists every stylesheet directly under a directory.
 */
function listStylesheets(directory: string): string[] {
	if (!fs.existsSync(directory)) {
		return [];
	}
	return fs
		.readdirSync(directory)
		.filter((name) => name.endsWith(".css"));
}

/**
 * Collects the `node_modules/...` files the core page can request, as
 * request paths, following stylesheet references transitively.
 */
export function collectVendorRequestPaths(core: ActiveCore): string[] {
	const pending: string[] = [];
	const seen = new Set<string>();
	const enqueue = (requestPath: string | null) => {
		if (requestPath && !seen.has(requestPath)) {
			seen.add(requestPath);
			pending.push(requestPath);
		}
	};

	const html = fs.readFileSync(path.join(core.root, "index.html"), "utf8");
	for (const match of html.matchAll(HTML_REFERENCE)) {
		enqueue(toRequestPath(match[1], "index.html"));
	}
	const vendor = createRequire(path.join(core.root, "package.json"))(
		"./js/vendor.js"
	) as Record<string, string>;
	for (const file of Object.values(vendor)) {
		enqueue(toRequestPath(file, "index.html"));
	}
	for (const name of listStylesheets(path.join(core.root, "css"))) {
		enqueue(`css/${name}`);
	}

	const vendorPaths: string[] = [];
	while (pending.length > 0) {
		const requestPath = pending.shift() as string;
		const isVendor = packageNameOf(requestPath) !== null;
		const filePath = resolveCoreStaticPath(core, requestPath);
		if (!filePath || !fs.existsSync(filePath)) {
			if (isVendor) {
				throw new Error(
					`MagicMirror ${core.version} references ${requestPath}, which does not resolve from ${core.root}.`
				);
			}
			// Generated in memory by the stage (config/basepath.js,
			// js/positions.js) or not a core file (socket.io/).
			continue;
		}
		if (isVendor) {
			vendorPaths.push(requestPath);
		}
		if (requestPath.endsWith(".css")) {
			const css = fs.readFileSync(filePath, "utf8");
			for (const pattern of [CSS_URL_REFERENCE, CSS_IMPORT_REFERENCE]) {
				for (const match of css.matchAll(pattern)) {
					enqueue(toRequestPath(match[2], requestPath));
				}
			}
		}
	}
	return vendorPaths.sort();
}

/**
 * Lists every file of the packaged core: the core entries, the vendor files
 * and one `package.json` per vendor package.
 */
export function collectPackagedCoreFiles(core: ActiveCore): PackagedFile[] {
	const files: PackagedFile[] = [];
	const addTree = (relativePath: string) => {
		const source = path.join(core.root, relativePath);
		if (!fs.existsSync(source)) {
			throw new Error(
				`MagicMirror ${core.version} has no ${relativePath} at ${core.root}.`
			);
		}
		if (fs.statSync(source).isDirectory()) {
			for (const entry of fs.readdirSync(source)) {
				addTree(path.join(relativePath, entry));
			}
			return;
		}
		files.push({ source, target: relativePath });
	};
	PACKAGED_CORE_ENTRIES.forEach(addTree);

	const packages = new Set<string>();
	for (const requestPath of collectVendorRequestPaths(core)) {
		files.push({
			source: resolveCoreStaticPath(core, requestPath) as string,
			target: requestPath
		});
		packages.add(packageNameOf(requestPath) as string);
	}
	const coreRequire = createRequire(path.join(core.root, "package.json"));
	for (const packageName of [...packages].sort()) {
		const manifest = coreRequire.resolve(`${packageName}/package.json`);
		const packageTarget = path.join("node_modules", packageName);
		files.push({
			source: manifest,
			target: path.join(packageTarget, "package.json")
		});
		for (const name of fs.readdirSync(path.dirname(manifest)).sort()) {
			if (LICENSE_FILE.test(name)) {
				files.push({
					source: path.join(path.dirname(manifest), name),
					target: path.join(packageTarget, name)
				});
			}
		}
	}
	return files;
}

/**
 * Copies the packaged core into `destination`.
 */
export function packageBuiltInCore(
	core: ActiveCore,
	destination: string
): PackagedFile[] {
	const files = collectPackagedCoreFiles(core);
	for (const { source, target } of files) {
		const output = path.join(destination, target);
		fs.mkdirSync(path.dirname(output), { recursive: true });
		fs.copyFileSync(source, output);
	}
	return files;
}

/**
 * Packages the core reads on the server side, from the files the stage loads
 * (`js/server_functions.js`, see `server/stage/core-handlers.ts`). In
 * `mmcore-source/` they are hoisted next to the core; a distribution install
 * has no such tree, so the self-contained bundles `build-node-compat.ts`
 * writes into `shims/generated/node_modules/` ship next to the packaged core
 * instead. `logger` reaches the core through the shims' own `NODE_PATH`
 * entry (`server/helper-runtime.ts` `injectShimResolution`).
 */
export const CORE_SERVER_DEPENDENCIES: readonly string[] = [
	"undici",
	"ipaddr.js"
];

/**
 * Copies the server-side dependency bundles into `<destination>/node_modules`.
 */
export function packageCoreServerDependencies(
	shimsNodeModulesRoot: string,
	destination: string
): void {
	for (const name of CORE_SERVER_DEPENDENCIES) {
		const source = path.join(shimsNodeModulesRoot, name);
		if (!fs.existsSync(path.join(source, "index.js"))) {
			throw new Error(
				`The ${name} bundle is missing at ${source}; run build:20-node-compat first.`
			);
		}
		fs.cpSync(source, path.join(destination, "node_modules", name), {
			recursive: true
		});
	}
}
