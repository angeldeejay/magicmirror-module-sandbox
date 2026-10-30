/**
 * Unit tests for server/stage/core-variants.ts against real core files
 * extracted from the MagicMirror release tags (tests/_fixtures/core-snippets).
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "pathe";
import { afterEach, describe, expect, test } from "vitest";
import type { ActiveCore } from "../../../../server/stage/core-root.ts";
import {
	CORE_PIECES,
	coreSnapshotDir,
	detectCoreVariants
} from "../../../../server/stage/core-variants.ts";

const snippetsRoot = path.resolve(
	import.meta.dirname,
	"../../../_fixtures/core-snippets"
);

function fixtureCore(version: string): ActiveCore {
	return { root: path.join(snippetsRoot, version), version, key: version };
}

const tempDirs: string[] = [];

/**
 * Copies a fixture core into a temp dir so a test can alter its files.
 */
function copyFixture(version: string): ActiveCore {
	const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "core-variants-"));
	tempDirs.push(tmp);
	fs.cpSync(path.join(snippetsRoot, version), tmp, { recursive: true });
	return { root: tmp, version, key: version };
}

afterEach(() => {
	for (const dir of tempDirs.splice(0)) {
		fs.rmSync(dir, { recursive: true, force: true });
	}
});

describe("detectCoreVariants", () => {
	test("detectCoreVariants classifies every supported release", () => {
		expect(detectCoreVariants(fixtureCore("2.35.0"))).toEqual({
			config: "plain",
			redaction: "whenHidden",
			basepath: "classic",
			positions: "classic",
			unreviewed: []
		});
		expect(detectCoreVariants(fixtureCore("2.36.0"))).toEqual({
			config: "mmFunction",
			redaction: "whenHidden",
			basepath: "classic",
			positions: "classic",
			unreviewed: []
		});
		// 2.37.0 still writes the classic positions.js and basepath.js:
		// js/utils.js lines 61 and 166 at tag v2.37.0, and index.html loads
		// both as classic <script> tags.
		expect(detectCoreVariants(fixtureCore("2.37.0"))).toEqual({
			config: "mmFunction",
			redaction: "whenHidden",
			basepath: "classic",
			positions: "classic",
			unreviewed: []
		});
		expect(detectCoreVariants(fixtureCore("2.38.0"))).toEqual({
			config: "mmFunction",
			redaction: "always",
			basepath: "global",
			positions: "global",
			unreviewed: []
		});
	});

	test("detectCoreVariants reports unreviewed pieces and falls back to the newest variant", () => {
		const core = copyFixture("2.38.0");
		const serverPath = path.join(core.root, "js", "server.js");
		const source = fs.readFileSync(serverPath, "utf8");
		const altered = source.replace(
			"const obj = configObj.redactedConf;",
			"const obj = { ...configObj.redactedConf, altered: true };"
		);
		expect(altered).not.toBe(source);
		fs.writeFileSync(serverPath, altered);

		const variants = detectCoreVariants(core);
		expect(variants.unreviewed).toEqual(["config"]);
		expect(variants.config).toBe("mmFunction");
		expect(variants.redaction).toBe("always");
	});

	test("detectCoreVariants reads js/server.mjs on cores that moved the server to ESM", () => {
		const core = copyFixture("2.38.0");
		fs.renameSync(
			path.join(core.root, "js", "server.js"),
			path.join(core.root, "js", "server.mjs")
		);
		expect(detectCoreVariants(core).unreviewed).toEqual([]);
	});

	test("detectCoreVariants ignores CRLF line endings", () => {
		const core = copyFixture("2.36.0");
		for (const file of [
			"js/server.js",
			"js/server_functions.js",
			"js/utils.js"
		]) {
			const filePath = path.join(core.root, file);
			const source = fs.readFileSync(filePath, "utf8");
			fs.writeFileSync(filePath, source.replace(/\n/g, "\r\n"));
		}
		expect(detectCoreVariants(core).unreviewed).toEqual([]);
	});

	test("detectCoreVariants flags every piece of a core it cannot read", () => {
		const core = copyFixture("2.38.0");
		fs.rmSync(path.join(core.root, "js"), { recursive: true, force: true });
		expect(detectCoreVariants(core)).toEqual({
			config: "mmFunction",
			redaction: "always",
			basepath: "global",
			positions: "global",
			unreviewed: ["config", "redaction", "html", "basepath", "positions"]
		});
	});

	test("detectCoreVariants flags a piece whose source can no longer be located", () => {
		const core = copyFixture("2.36.0");
		const functionsPath = path.join(core.root, "js", "server_functions.js");
		const source = fs.readFileSync(functionsPath, "utf8");
		fs.writeFileSync(
			functionsPath,
			source.replace(
				"function getHtml (req, res) {",
				"function renderPage (req, res) {"
			)
		);
		const variants = detectCoreVariants(core);
		expect(variants.unreviewed).toEqual(["html"]);
		expect(variants.config).toBe("mmFunction");
		expect(variants.redaction).toBe("whenHidden");
	});
	test("detectCoreVariants flags an altered loadConfig redaction block and stays redacting", () => {
		const core = copyFixture("2.38.0");
		const utilsPath = path.join(core.root, "js", "utils.js");
		const source = fs.readFileSync(utilsPath, "utf8");
		const altered = source.replace(
			'if (env.startsWith("SECRET_")) {',
			'if (env.startsWith("SECRET_") && !process.env.MM_SHOW_SECRETS) {'
		);
		expect(altered).not.toBe(source);
		fs.writeFileSync(utilsPath, altered);

		const variants = detectCoreVariants(core);
		expect(variants.unreviewed).toEqual(["redaction"]);
		expect(variants.redaction).toBe("always");
	});

	test("detectCoreVariants keeps whenHidden when only the loadConfig block of 2.37 is unknown", () => {
		const core = copyFixture("2.37.0");
		const utilsPath = path.join(core.root, "js", "utils.js");
		const source = fs.readFileSync(utilsPath, "utf8");
		fs.writeFileSync(
			utilsPath,
			source.replace(
				"const hideConfigSecrets = configContent.match(",
				"const hideConfigSecrets = configContent.match( "
			)
		);

		const variants = detectCoreVariants(core);
		expect(variants.unreviewed).toEqual(["redaction"]);
		// The reviewed 2.37 /config closure still serves fullConf unless
		// hideConfigSecrets is set, so redaction cannot be "always".
		expect(variants.redaction).toBe("whenHidden");
	});

	test("detectCoreVariants treats a malformed snapshot value as unreviewed", () => {
		const snapshotDir = fs.mkdtempSync(
			path.join(os.tmpdir(), "core-snapshots-")
		);
		tempDirs.push(snapshotDir);
		for (const piece of CORE_PIECES) {
			fs.copyFileSync(
				path.join(coreSnapshotDir, `${piece}.json`),
				path.join(snapshotDir, `${piece}.json`)
			);
		}
		const configPath = path.join(snapshotDir, "config.json");
		const config = JSON.parse(
			fs.readFileSync(configPath, "utf8")
		) as Record<string, string>;
		// Drop the redaction half of every value: "mmFunction:always" → "mmFunction".
		for (const hash of Object.keys(config)) {
			config[hash] = config[hash].split(":")[0];
		}
		fs.writeFileSync(configPath, JSON.stringify(config));
		fs.writeFileSync(path.join(snapshotDir, "html.json"), "[1, 2]");
		fs.writeFileSync(path.join(snapshotDir, "positions.json"), "not json");

		const variants = detectCoreVariants(fixtureCore("2.37.0"), snapshotDir);
		expect(variants.unreviewed).toEqual(["config", "html", "positions"]);
		expect(variants.config).toBe("mmFunction");
		expect(variants.redaction).toBe("whenHidden");
		expect(variants.positions).toBe("global");

		const newest = detectCoreVariants(fixtureCore("2.38.0"), snapshotDir);
		expect(newest.unreviewed).toEqual(["config", "html", "positions"]);
		expect(newest.redaction).toBe("always");
	});
});
