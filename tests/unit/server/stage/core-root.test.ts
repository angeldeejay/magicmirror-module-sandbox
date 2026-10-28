/**
 * Unit tests for server/stage/core-root.ts using a real hoisted temp layout.
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "pathe";
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("../../../../server/mm-version-manager.ts", () => ({
	getActiveVersion: vi.fn(),
	getMmVersionRoot: vi.fn(),
	getInstalledMmVersion: vi.fn(),
	getBuiltInMmVersion: vi.fn()
}));
import * as mmvm from "../../../../server/mm-version-manager.ts";
import { harnessRoot } from "../../../../server/paths.ts";
import {
	PACKAGED_CORE_DIRECTORY,
	resolveActiveCore,
	resolveBuiltInCoreRoot,
	resolveCoreStaticPath
} from "../../../../server/stage/core-root.ts";

let tmp = "";
let root = "";

function write(file: string, content = "x"): void {
	fs.mkdirSync(path.dirname(file), { recursive: true });
	fs.writeFileSync(file, content);
}

beforeAll(() => {
	tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "core-root-")));
	root = path.join(tmp, "node_modules", "magicmirror");
	write(path.join(root, "package.json"), '{"name":"magicmirror"}');
	write(path.join(root, "index.html"));
	write(path.join(root, "js", "main.js"));
	write(path.join(root, "css", "main.css"));
	// The core's vendor list, read as text the way core js/server.js turns it
	// into served node_modules directories.
	write(
		path.join(root, "js", "vendor.js"),
		[
			"const vendor = {",
			'\t"moment.js": "node_modules/moment/min/moment-with-locales.js",',
			'\t"suncalc.js": "js/suncalc-global.mjs"',
			"};",
			"globalThis.vendor = vendor;",
			""
		].join("\n")
	);
	// Resolvable from the core root, but never served by the core.
	write(
		path.join(tmp, "node_modules", "left-pad", "package.json"),
		'{"name":"left-pad","version":"1.0.0"}'
	);
	write(path.join(tmp, "node_modules", "left-pad", "index.js"));
	write(
		path.join(tmp, "node_modules", "@private", "secret", "package.json"),
		'{"name":"@private/secret","version":"1.0.0"}'
	);
	write(path.join(tmp, "node_modules", "@private", "secret", "index.js"));
	write(
		path.join(tmp, "node_modules", "moment", "package.json"),
		'{"name":"moment","version":"1.0.0"}'
	);
	write(path.join(tmp, "node_modules", "moment", "min", "moment-with-locales.js"));
	write(path.join(tmp, "node_modules", "@fontsource", "roboto", "index.css"));
	write(
		path.join(tmp, "node_modules", "@fontsource", "roboto", "package.json"),
		'{"name":"@fontsource/roboto","version":"1.0.0"}'
	);
});

afterAll(() => {
	fs.rmSync(tmp, { recursive: true, force: true });
});

beforeEach(() => {
	vi.resetAllMocks();
});

describe("resolveActiveCore", () => {
	test("resolveActiveCore returns the built-in root and version when no mmvm version is active", () => {
		vi.mocked(mmvm.getActiveVersion).mockReturnValue(null);
		vi.mocked(mmvm.getBuiltInMmVersion).mockReturnValue("2.39.0");
		expect(resolveActiveCore()).toEqual({
			root: resolveBuiltInCoreRoot(harnessRoot),
			version: "2.39.0",
			key: null
		});
	});

	test("resolveActiveCore returns the mmvm root when a version is active", () => {
		vi.mocked(mmvm.getActiveVersion).mockReturnValue("2.38.0");
		vi.mocked(mmvm.getMmVersionRoot).mockReturnValue(root);
		vi.mocked(mmvm.getInstalledMmVersion).mockReturnValue("2.38.0");
		expect(resolveActiveCore()).toEqual({
			root,
			version: "2.38.0",
			key: "2.38.0"
		});
	});

	test("resolveActiveCore falls back to the key when the installed version is unknown", () => {
		vi.mocked(mmvm.getActiveVersion).mockReturnValue("develop");
		vi.mocked(mmvm.getMmVersionRoot).mockReturnValue(root);
		vi.mocked(mmvm.getInstalledMmVersion).mockReturnValue(null);
		expect(resolveActiveCore().version).toBe("develop");
	});

	test("resolveActiveCore uses an empty version when the built-in version is unknown", () => {
		vi.mocked(mmvm.getActiveVersion).mockReturnValue(null);
		vi.mocked(mmvm.getBuiltInMmVersion).mockReturnValue(null);
		expect(resolveActiveCore().version).toBe("");
	});
});

describe("resolveBuiltInCoreRoot", () => {
	test("prefers the synced mmcore-source core", () => {
		const base = path.join(tmp, "source-install");
		const synced = path.join(base, "mmcore-source", "node_modules", "magicmirror");
		write(path.join(synced, "index.html"));
		write(path.join(base, PACKAGED_CORE_DIRECTORY, "index.html"));
		expect(resolveBuiltInCoreRoot(base)).toBe(synced);
	});

	test("falls back to the packaged core of a distribution install", () => {
		const base = path.join(tmp, "dist-install");
		write(path.join(base, PACKAGED_CORE_DIRECTORY, "index.html"));
		expect(resolveBuiltInCoreRoot(base)).toBe(
			path.join(base, PACKAGED_CORE_DIRECTORY)
		);
	});

	test("fails clearly when no built-in core exists", () => {
		expect(() => resolveBuiltInCoreRoot(path.join(tmp, "empty"))).toThrow(
			/built-in MagicMirror core is missing/
		);
	});
});

describe("resolveCoreStaticPath", () => {
	const core = () => ({ root, version: "2.38.0", key: "2.38.0" });

	test("resolveCoreStaticPath maps core directories inside root", () => {
		expect(resolveCoreStaticPath(core(), "js/main.js")).toBe(
			path.join(root, "js", "main.js")
		);
		expect(resolveCoreStaticPath(core(), "css/main.css")).toBe(
			path.join(root, "css", "main.css")
		);
		expect(resolveCoreStaticPath(core(), "/js/main.js")).toBe(
			path.join(root, "js", "main.js")
		);
		expect(resolveCoreStaticPath(core(), "favicon.svg")).toBe(
			path.join(root, "favicon.svg")
		);
		expect(resolveCoreStaticPath(core(), "index.html")).toBeNull();
	});

	test("resolveCoreStaticPath resolves node_modules through Node resolution", () => {
		expect(
			resolveCoreStaticPath(
				core(),
				"node_modules/moment/min/moment-with-locales.js"
			)
		).toBe(path.join(tmp, "node_modules", "moment", "min", "moment-with-locales.js"));
		expect(
			resolveCoreStaticPath(core(), "node_modules/@fontsource/roboto/index.css")
		).toBe(path.join(tmp, "node_modules", "@fontsource", "roboto", "index.css"));
	});

	test("resolveCoreStaticPath returns null for unresolvable or malformed node_modules paths", () => {
		expect(resolveCoreStaticPath(core(), "node_modules/nope-pkg/x.js")).toBeNull();
		expect(resolveCoreStaticPath(core(), "node_modules")).toBeNull();
		expect(resolveCoreStaticPath(core(), "node_modules/@scope")).toBeNull();
		expect(resolveCoreStaticPath(core(), "node_modules/moment/../../x")).toBeNull();
	});

	test("resolveCoreStaticPath serves only the node_modules entries the core serves", () => {
		expect(
			resolveCoreStaticPath(core(), "node_modules/left-pad/index.js")
		).toBeNull();
		expect(
			resolveCoreStaticPath(core(), "node_modules/@private/secret/index.js")
		).toBeNull();
		// js/vendor.js is read as text: requiring it would assign
		// globalThis.vendor in the sandbox process, as 2.38 vendor.js does.
		expect("vendor" in globalThis).toBe(false);
	});

	test("resolveCoreStaticPath serves only the fixed packages when the core has no js/vendor.js", () => {
		const bare = path.join(tmp, "bare-core");
		write(path.join(bare, "package.json"), '{"name":"magicmirror"}');
		const bareCore = { root: bare, version: "0.0.0", key: null };
		expect(
			resolveCoreStaticPath(
				bareCore,
				"node_modules/moment/min/moment-with-locales.js"
			)
		).toBeNull();
		expect(
			resolveCoreStaticPath(bareCore, "node_modules/@fontsource/roboto/index.css")
		).toBe(path.join(tmp, "node_modules", "@fontsource", "roboto", "index.css"));
	});

	test("resolveCoreStaticPath rejects names Win32 opens as another file", () => {
		for (const requestPath of [
			"js/main.js.",
			"js/main.js ",
			"js/main.js::$DATA",
			"js/main.js:stream",
			"config./config.js",
			"js/./main.js"
		]) {
			expect(resolveCoreStaticPath(core(), requestPath), requestPath).toBeNull();
		}
	});

	test("resolveCoreStaticPath rejects traversal and unknown roots", () => {
		expect(resolveCoreStaticPath(core(), "../package.json")).toBeNull();
		expect(resolveCoreStaticPath(core(), "js/../../x")).toBeNull();
		expect(resolveCoreStaticPath(core(), "server/x.js")).toBeNull();
		expect(resolveCoreStaticPath(core(), "")).toBeNull();
		expect(resolveCoreStaticPath(core(), "js\\..\\..\\x")).toBeNull();
	});
});
