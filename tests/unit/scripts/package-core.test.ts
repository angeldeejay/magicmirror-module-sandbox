/**
 * Unit coverage for the packaged built-in core (`scripts/package-core.ts`)
 * against a hoisted temp layout shaped like `mmcore-source/`.
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "pathe";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { distCoreDirectory } from "../../../scripts/dist-layout.ts";
import {
	CORE_SERVER_DEPENDENCIES,
	collectPackagedCoreFiles,
	collectVendorRequestPaths,
	packageBuiltInCore,
	packageCoreServerDependencies
} from "../../../scripts/package-core.ts";
import type { ActiveCore } from "../../../server/stage/core-root.ts";

let tmp = "";
let core: ActiveCore;

function write(relativePath: string, content = "x"): void {
	const file = path.join(tmp, relativePath);
	fs.mkdirSync(path.dirname(file), { recursive: true });
	fs.writeFileSync(file, content);
}

function pkg(name: string): string {
	return JSON.stringify({ name, version: "1.0.0" });
}

beforeAll(() => {
	tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "package-core-")));
	const mm = "node_modules/magicmirror";
	write(
		`${mm}/index.html`,
		[
			'<link rel="icon" href="favicon.svg" />',
			'<link rel="stylesheet" href="css/main.css" />',
			'<link rel="stylesheet" href="node_modules/animate.css/animate.min.css" />',
			'<script src="socket.io/socket.io.js"></script>',
			'<script src="config/basepath.js"></script>',
			'<script src="https://cdn.example/x.js"></script>',
			'<script src="js/vendor.js"></script>'
		].join("\n")
	);
	write(`${mm}/package.json`, pkg("magicmirror"));
	write(`${mm}/favicon.svg`);
	write(
		`${mm}/js/vendor.js`,
		`module.exports = {
			"moment.js": "node_modules/moment/min/moment-with-locales.js",
			"weather-icons.css": "node_modules/weathericons/css/weather-icons.css",
			"font-awesome.css": "css/font-awesome.css"
		};`
	);
	write(`${mm}/js/main.js`);
	write(
		`${mm}/css/main.css`,
		'body{background:url("data:image/png;base64,AAA")} @font-face{src:url(../node_modules/@fontsource/roboto/files/r.woff2) format("woff2")}'
	);
	write(
		`${mm}/css/font-awesome.css`,
		'@import url("../node_modules/@fortawesome/fontawesome-free/css/all.min.css");'
	);
	write(`${mm}/translations/en.json`, "{}");
	write(`${mm}/defaultmodules/utils.js`);
	write(`${mm}/defaultmodules/defaultmodules.js`);
	write(`${mm}/defaultmodules/clock/clock.js`);

	write("node_modules/animate.css/package.json", pkg("animate.css"));
	write("node_modules/animate.css/animate.min.css");
	write("node_modules/animate.css/LICENSE");
	write("node_modules/animate.css/source/unused.css");
	write("node_modules/moment/package.json", pkg("moment"));
	write("node_modules/moment/min/moment-with-locales.js");
	write("node_modules/moment/src/unused.js");
	write("node_modules/weathericons/package.json", pkg("weathericons"));
	write(
		"node_modules/weathericons/css/weather-icons.css",
		"@font-face{src:url('../font/w.woff') format('woff')} .x{background:url(#frag)}"
	);
	write("node_modules/weathericons/font/w.woff");
	write("node_modules/weathericons/font/unused.ttf");
	write("node_modules/@fontsource/roboto/package.json", pkg("@fontsource/roboto"));
	write("node_modules/@fontsource/roboto/files/r.woff2");
	write(
		"node_modules/@fortawesome/fontawesome-free/package.json",
		pkg("@fortawesome/fontawesome-free")
	);
	write(
		"node_modules/@fortawesome/fontawesome-free/LICENSE.txt"
	);
	write(
		"node_modules/@fortawesome/fontawesome-free/css/all.min.css",
		"@font-face{src:url(../webfonts/fa.woff2?v=1#iefix)}"
	);
	write("node_modules/@fortawesome/fontawesome-free/webfonts/fa.woff2");
	write("node_modules/@fortawesome/fontawesome-free/svgs/unused.svg");

	core = { root: path.join(tmp, mm), version: "9.9.9", key: null };
});

afterAll(() => {
	fs.rmSync(tmp, { recursive: true, force: true });
});

describe("collectVendorRequestPaths", () => {
	test("follows index.html, vendor.js and stylesheet references transitively", () => {
		expect(collectVendorRequestPaths(core)).toEqual([
			"node_modules/@fontsource/roboto/files/r.woff2",
			"node_modules/@fortawesome/fontawesome-free/css/all.min.css",
			"node_modules/@fortawesome/fontawesome-free/webfonts/fa.woff2",
			"node_modules/animate.css/animate.min.css",
			"node_modules/moment/min/moment-with-locales.js",
			"node_modules/weathericons/css/weather-icons.css",
			"node_modules/weathericons/font/w.woff"
		]);
	});

	test("fails when the core references a vendor file that does not resolve", () => {
		const broken = path.join(tmp, "broken", "node_modules", "magicmirror");
		fs.mkdirSync(path.join(broken, "js"), { recursive: true });
		fs.writeFileSync(
			path.join(broken, "index.html"),
			'<script src="node_modules/missing-pkg/x.js"></script>'
		);
		fs.writeFileSync(path.join(broken, "package.json"), pkg("magicmirror"));
		fs.writeFileSync(path.join(broken, "js", "vendor.js"), "module.exports = {};");
		expect(() =>
			collectVendorRequestPaths({ root: broken, version: "0.0.1", key: null })
		).toThrow(/node_modules\/missing-pkg\/x\.js/);
	});
});

describe("collectPackagedCoreFiles", () => {
	test("lists the core entries, the vendor closure and each package manifest", () => {
		const targets = collectPackagedCoreFiles(core)
			.map((file) => file.target)
			.sort();
		expect(targets).toEqual(
			[
				"css/font-awesome.css",
				"css/main.css",
				"defaultmodules/defaultmodules.js",
				"defaultmodules/utils.js",
				"favicon.svg",
				"index.html",
				"js/main.js",
				"js/vendor.js",
				"node_modules/@fontsource/roboto/files/r.woff2",
				"node_modules/@fontsource/roboto/package.json",
				"node_modules/@fortawesome/fontawesome-free/LICENSE.txt",
				"node_modules/@fortawesome/fontawesome-free/css/all.min.css",
				"node_modules/@fortawesome/fontawesome-free/package.json",
				"node_modules/@fortawesome/fontawesome-free/webfonts/fa.woff2",
				"node_modules/animate.css/LICENSE",
				"node_modules/animate.css/animate.min.css",
				"node_modules/animate.css/package.json",
				"node_modules/moment/min/moment-with-locales.js",
				"node_modules/moment/package.json",
				"node_modules/weathericons/css/weather-icons.css",
				"node_modules/weathericons/font/w.woff",
				"node_modules/weathericons/package.json",
				"package.json",
				"translations/en.json"
			].sort()
		);
	});

	test("fails when a core entry is missing", () => {
		const partial = path.join(tmp, "partial");
		fs.mkdirSync(partial, { recursive: true });
		fs.writeFileSync(path.join(partial, "index.html"), "");
		expect(() =>
			collectPackagedCoreFiles({ root: partial, version: "0.0.2", key: null })
		).toThrow(/has no package\.json/);
	});
});

describe("packageBuiltInCore", () => {
	test("copies the files so the stage resolves them from the packaged root", async () => {
		const destination = path.join(tmp, "dist", distCoreDirectory);
		packageBuiltInCore(core, destination);
		const { resolveCoreStaticPath } = await import(
			"../../../server/stage/core-root.ts"
		);
		const packaged: ActiveCore = { root: destination, version: "9.9.9", key: null };
		for (const requestPath of collectVendorRequestPaths(core)) {
			expect(resolveCoreStaticPath(packaged, requestPath)).toBe(
				path.join(destination, requestPath)
			);
		}
		expect(fs.existsSync(path.join(destination, "index.html"))).toBe(true);
		expect(
			fs.existsSync(path.join(destination, "defaultmodules", "clock"))
		).toBe(false);
	});

});

describe("packageCoreServerDependencies", () => {
	test("copies the server-side dependency bundles next to the packaged core", () => {
		const shims = path.join(tmp, "shims", "node_modules");
		for (const name of CORE_SERVER_DEPENDENCIES) {
			write(`shims/node_modules/${name}/index.js`, `module.exports = "${name}";`);
		}
		const destination = path.join(tmp, "dist-deps", "core");
		packageCoreServerDependencies(shims, destination);
		for (const name of CORE_SERVER_DEPENDENCIES) {
			expect(
				fs.readFileSync(
					path.join(destination, "node_modules", name, "index.js"),
					"utf8"
				)
			).toContain(name);
		}
	});

	test("fails when a bundle has not been built", () => {
		expect(() =>
			packageCoreServerDependencies(
				path.join(tmp, "no-shims"),
				path.join(tmp, "dist-none")
			)
		).toThrow(/build:20-node-compat/);
	});
});
