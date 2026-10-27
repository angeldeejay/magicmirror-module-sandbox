/**
 * Unit tests for server/stage/core-handlers.ts against real core files
 * extracted from the MagicMirror release tags (tests/_fixtures/core-snippets).
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "pathe";
import { afterEach, describe, expect, test } from "vitest";
import {
	buildCoreConfig,
	type CoreConfigSources,
	getCoreServerFunctions,
	renderBasepathJs,
	renderPositionsJs,
	renderStageHtml
} from "../../../../server/stage/core-handlers.ts";
import type { ActiveCore } from "../../../../server/stage/core-root.ts";
import {
	type CoreVariants,
	detectCoreVariants
} from "../../../../server/stage/core-variants.ts";

const snippetsRoot = path.resolve(
	import.meta.dirname,
	"../../../_fixtures/core-snippets"
);
const RELEASES = ["2.35.0", "2.36.0", "2.37.0", "2.38.0"];
const INJECTION =
	'<!-- module-sandbox:stage --><link rel="stylesheet" href="/__harness/generated/stage-isolation.css"><script src="/__harness/generated/stage-observer.js"></script><!-- /module-sandbox:stage -->';
const INDEX_POSITIONS = [
	"fullscreen_below",
	"top_bar",
	"top_left",
	"top_center",
	"top_right",
	"upper_third",
	"middle_center",
	"lower_third",
	"bottom_bar",
	"bottom_left",
	"bottom_center",
	"bottom_right",
	"fullscreen_above"
];

function fixtureCore(version: string): ActiveCore {
	return { root: path.join(snippetsRoot, version), version, key: version };
}

function variantsFor(
	version: string,
	overrides: Partial<CoreVariants> = {}
): CoreVariants {
	return { ...detectCoreVariants(fixtureCore(version)), ...overrides };
}

function sources(
	moduleConfig: Record<string, unknown> = {
		position: "top_left",
		header: "",
		classes: "",
		config: { a: 1 }
	}
): CoreConfigSources {
	return {
		getModuleConfig: () => moduleConfig,
		getRuntimeConfig: () => ({ language: "es", locale: "es-ES" }),
		getHarnessConfig: () => ({ moduleName: "MMM-Test" })
	};
}

/**
 * Evaluates a template literal found in a fixture's js/utils.js with the
 * given bindings, reproducing exactly what that core writes to disk.
 */
function evaluateUtilsTemplate(
	version: string,
	linePattern: RegExp,
	bindings: Record<string, unknown>
): string {
	const utils = fs.readFileSync(
		path.join(snippetsRoot, version, "js", "utils.js"),
		"utf8"
	);
	const line = utils.split("\n").find((entry) => linePattern.test(entry));
	const template = line ? /`([^`]*)`/.exec(line)?.[1] : undefined;
	if (template === undefined) {
		throw new Error(`template not found in ${version} utils.js`);
	}
	const names = Object.keys(bindings);
	const render = new Function(...names, `return \`${template}\`;`);
	return render(...names.map((name) => bindings[name])) as string;
}

const tempDirs: string[] = [];
const savedSecret = process.env.SECRET_X;

afterEach(() => {
	for (const dir of tempDirs.splice(0)) {
		fs.rmSync(dir, { recursive: true, force: true });
	}
	if (savedSecret === undefined) {
		delete process.env.SECRET_X;
	} else {
		process.env.SECRET_X = savedSecret;
	}
});

describe("renderStageHtml", () => {
	test.each(RELEASES)(
		"renderStageHtml applies the core substitutions and one injection (%s)",
		(version) => {
			const core = fixtureCore(version);
			const source = fs.readFileSync(
				path.join(core.root, "index.html"),
				"utf8"
			);
			const html = renderStageHtml(core, variantsFor(version), INJECTION);

			expect(html).toContain(`window.mmVersion = "${version}";`);
			expect(html).toContain('window.mmTestMode = "false";');
			expect(html.split("<!-- module-sandbox:stage -->")).toHaveLength(2);

			const blockStart = html.indexOf("<!-- module-sandbox:stage -->");
			const firstCoreScript = html.indexOf(
				"<script",
				blockStart + INJECTION.length
			);
			expect(blockStart).toBeLessThan(firstCoreScript);
			expect(html.slice(0, blockStart)).not.toContain("<script");

			const reverted = html
				.replace(INJECTION, "")
				.replace(
					`window.mmVersion = "${version}";`,
					'window.mmVersion = "#VERSION#";'
				)
				.replace(
					'window.mmTestMode = "false";',
					'window.mmTestMode = "#TESTMODE#";'
				);
			expect(reverted).toBe(source);
		}
	);
});

describe("buildCoreConfig", () => {
	test("buildCoreConfig serves the mounted module only", () => {
		const core = fixtureCore("2.38.0");
		const body = buildCoreConfig(
			core,
			variantsFor("2.38.0"),
			"/__stage/",
			sources()
		);
		const config = JSON.parse(body);

		expect(config.modules).toEqual([
			{
				module: "MMM-Test",
				position: "top_left",
				header: "",
				classes: "",
				config: { a: 1 }
			}
		]);
		expect(config.basePath).toBe("/__stage/");
		expect(config.language).toBe("es");
		expect(config.locale).toBe("es-ES");
		// Core defaults from the version's own js/defaults.js.
		expect(config.cors).toBe("disabled");
		expect(config.timeFormat).toBe(24);
	});

	test("buildCoreConfig keeps every saved envelope key and drops unknown ones", () => {
		const envelope = {
			position: "bottom_bar",
			header: "Title",
			classes: "small",
			animateIn: "fadeIn",
			animateOut: "fadeOut",
			hiddenOnStartup: true,
			disabled: false,
			configDeepMerge: true,
			config: { nested: { b: [1, 2] } },
			unrelated: "dropped"
		};
		const body = buildCoreConfig(
			fixtureCore("2.36.0"),
			variantsFor("2.36.0"),
			"/__stage/",
			sources(envelope)
		);
		const { unrelated: _unrelated, ...kept } = envelope;
		expect(JSON.parse(body).modules).toEqual([
			{ module: "MMM-Test", ...kept }
		]);
	});

	test("buildCoreConfig follows each redaction variant", () => {
		process.env.SECRET_X = "real";
		const moduleConfig = {
			position: "top_left",
			config: { token: "**SECRET_X**", list: ["**SECRET_X**"] }
		};

		const whenHidden = JSON.parse(
			buildCoreConfig(
				fixtureCore("2.37.0"),
				variantsFor("2.37.0", { redaction: "whenHidden" }),
				"/__stage/",
				sources(moduleConfig)
			)
		);
		expect(whenHidden.hideConfigSecrets).toBe(false);
		expect(whenHidden.modules[0].config.token).toBe("real");
		expect(whenHidden.modules[0].config.list).toEqual(["real"]);

		const always = JSON.parse(
			buildCoreConfig(
				fixtureCore("2.38.0"),
				variantsFor("2.38.0", { redaction: "always" }),
				"/__stage/",
				sources(moduleConfig)
			)
		);
		expect(always.modules[0].config.token).toBe("**SECRET_X**");
	});

	test("buildCoreConfig keeps a placeholder whose secret is not set", () => {
		delete process.env.SECRET_X;
		const body = buildCoreConfig(
			fixtureCore("2.36.0"),
			variantsFor("2.36.0"),
			"/__stage/",
			sources({ config: { token: "**SECRET_X**" } })
		);
		expect(JSON.parse(body).modules[0].config.token).toBe("**SECRET_X**");
	});

	test("buildCoreConfig encodes functions per variant", () => {
		function formatter(value: number) {
			return value * 2;
		}
		const moduleConfig = { config: { formatter, keep: 1 } };

		const tagged = JSON.parse(
			buildCoreConfig(
				fixtureCore("2.36.0"),
				variantsFor("2.36.0", { config: "mmFunction" }),
				"/__stage/",
				sources(moduleConfig)
			)
		);
		expect(tagged.modules[0].config.formatter).toEqual({
			__mmFunction: formatter.toString()
		});

		const plain = JSON.parse(
			buildCoreConfig(
				fixtureCore("2.35.0"),
				variantsFor("2.35.0", { config: "plain" }),
				"/__stage/",
				sources(moduleConfig)
			)
		);
		expect(plain.modules[0].config).toEqual({ keep: 1 });
	});
});

describe("generated core files", () => {
	test.each(RELEASES)(
		"renderBasepathJs equals what the %s utils.js writes",
		(version) => {
			const expected = evaluateUtilsTemplate(version, /const cfg = `/, {
				configObj: { fullConf: { basePath: "/__stage/" } }
			});
			expect(renderBasepathJs("/__stage/", variantsFor(version))).toBe(
				expected
			);
		}
	);

	test.each(RELEASES)(
		"renderPositionsJs equals what the %s utils.js writes",
		(version) => {
			const expected = evaluateUtilsTemplate(
				version,
				/writeFileSync\(discoveredPositionsJSFilename, `/,
				{ modulePositions: INDEX_POSITIONS }
			);
			expect(
				renderPositionsJs(fixtureCore(version), variantsFor(version))
			).toBe(expected);
		}
	);

	test("renderPositionsJs writes the classic and global shapes", () => {
		const core = fixtureCore("2.38.0");
		const list = JSON.stringify(INDEX_POSITIONS);
		expect(
			renderPositionsJs(
				core,
				variantsFor("2.38.0", { positions: "classic" })
			)
		).toBe(`const modulePositions=${list}`);
		expect(
			renderPositionsJs(
				core,
				variantsFor("2.38.0", { positions: "global" })
			)
		).toBe(
			`const modulePositions=${list};\nglobalThis.modulePositions = modulePositions;`
		);
	});
});

describe("getCoreServerFunctions", () => {
	test("getCoreServerFunctions loads the version's own server_functions.js", () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), "core-functions-"));
		tempDirs.push(root);
		fs.mkdirSync(path.join(root, "js"));
		fs.writeFileSync(
			path.join(root, "package.json"),
			'{"type":"commonjs"}'
		);
		fs.writeFileSync(
			path.join(root, "js", "server_functions.js"),
			[
				"const marker = __dirname;",
				"function cors () { return marker; }",
				"function getVersion () {}",
				"function getStartup () {}",
				"function getEnvVars () {}",
				"module.exports = { cors, getVersion, getStartup, getEnvVars };"
			].join("\n")
		);

		const functions = getCoreServerFunctions({
			root,
			version: "9.9.9",
			key: "9.9.9"
		});
		expect(
			path.normalize(String(functions.cors({} as never, {} as never)))
		).toBe(path.join(path.normalize(root), "js"));
		expect(typeof functions.getVersion).toBe("function");
		expect(typeof functions.getStartup).toBe("function");
		expect(typeof functions.getEnvVars).toBe("function");
	});

	test("getCoreServerFunctions fails clearly when a handler is missing", () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), "core-functions-"));
		tempDirs.push(root);
		fs.mkdirSync(path.join(root, "js"));
		fs.writeFileSync(
			path.join(root, "package.json"),
			'{"type":"commonjs"}'
		);
		fs.writeFileSync(
			path.join(root, "js", "server_functions.js"),
			"module.exports = { cors () {} };"
		);

		expect(() =>
			getCoreServerFunctions({ root, version: "9.9.9", key: "9.9.9" })
		).toThrow(/getVersion/);
	});
});
