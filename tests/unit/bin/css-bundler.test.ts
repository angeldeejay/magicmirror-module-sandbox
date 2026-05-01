/**
 * Unit coverage for bin/helpers/css-bundler.ts.
 *
 * Uses real css-tree (devDependency) for AST fidelity; node:fs is fully mocked
 * so no real files are read.
 */
import assert from "node:assert/strict";
import path from "pathe";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// Project root — needed as packageRoot so css-tree resolves from node_modules
// ---------------------------------------------------------------------------

const __testDir = path.dirname(fileURLToPath(import.meta.url));
// tests/unit/bin → up 3 levels → project root
const projectRoot = path.resolve(__testDir, "../../..");

// ---------------------------------------------------------------------------
// node:fs mock — existsSync and readFileSync are fully controlled per test
// ---------------------------------------------------------------------------

const fsContents = new Map<string, string>();
let existsImpl: (p: string) => boolean = () => true;

vi.mock("node:fs", async (importOriginal) => {
	const actual = await importOriginal<typeof import("node:fs")>();
	return {
		...actual,
		existsSync: vi.fn((p: unknown) => existsImpl(String(p))),
		readFileSync: vi.fn((p: unknown) => {
			const key = String(p);
			if (fsContents.has(key)) {
				return fsContents.get(key) as string;
			}
			throw new Error(`[css-bundler test] no stub for readFileSync("${key}")`);
		})
	};
});

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

beforeEach(() => {
	fsContents.clear();
	existsImpl = () => true;
	vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Resolves a path the same way pathe would so the stub key matches what
 * css-bundler.ts passes to fs calls.
 */
function absPath(...parts: string[]): string {
	return path.resolve(path.join(projectRoot, "tests", "_css_stubs", ...parts));
}

/** Registers a stub CSS file. */
function putFile(file: string, content: string): string {
	const resolved = path.resolve(file);
	fsContents.set(resolved, content);
	return resolved;
}

// ---------------------------------------------------------------------------
// rewriteCssAssetUrls — parse context branches
// ---------------------------------------------------------------------------

test("rewriteCssAssetUrls rewrites url() references inside a full stylesheet block", async () => {
	const { rewriteCssAssetUrls } = await import(
		"../../../bin/helpers/css-bundler.ts"
	);
	const result = rewriteCssAssetUrls({
		cssSource: "body { background: url(image.png); }",
		packageRoot: projectRoot,
		sourceDirectory: "/some/dir",
		rewriteAssetUrl: (url) => `../assets/${url}`
	});
	assert.match(result, /url\(\.\.\/assets\/image\.png\)/);
});

test("rewriteCssAssetUrls rewrites url() in a declaration list (no braces, no @-rule)", async () => {
	const { rewriteCssAssetUrls } = await import(
		"../../../bin/helpers/css-bundler.ts"
	);
	const result = rewriteCssAssetUrls({
		cssSource: "background: url(icon.png)",
		packageRoot: projectRoot,
		sourceDirectory: "/some/dir",
		rewriteAssetUrl: (url) => `/static/${url}`
	});
	assert.match(result, /url\(\/static\/icon\.png\)/);
});

test("rewriteCssAssetUrls returns CSS unchanged when there are no url() nodes", async () => {
	const { rewriteCssAssetUrls } = await import(
		"../../../bin/helpers/css-bundler.ts"
	);
	const result = rewriteCssAssetUrls({
		cssSource: "body { color: red; font-size: 14px; }",
		packageRoot: projectRoot,
		sourceDirectory: "/some/dir",
		rewriteAssetUrl: (url) => `/NEVER/${url}`
	});
	assert.doesNotMatch(result, /\/NEVER\//);
	assert.match(result, /color:red/);
});

test("rewriteCssAssetUrls parses @-rule stylesheets as full context (not declarationList)", async () => {
	const { rewriteCssAssetUrls } = await import(
		"../../../bin/helpers/css-bundler.ts"
	);
	const result = rewriteCssAssetUrls({
		cssSource: "@media screen { body { background: url(bg.png); } }",
		packageRoot: projectRoot,
		sourceDirectory: "/some/dir",
		rewriteAssetUrl: (url) => `rewritten-${url}`
	});
	assert.match(result, /url\(rewritten-bg\.png\)/);
});

// ---------------------------------------------------------------------------
// inlineAndRewriteStylesheet — visited / circular
// ---------------------------------------------------------------------------

test("inlineAndRewriteStylesheet returns empty string when entry path is already in visitedStylesheets", async () => {
	const { inlineAndRewriteStylesheet } = await import(
		"../../../bin/helpers/css-bundler.ts"
	);
	const entry = absPath("main.css");
	putFile(entry, "body { color: red; }");

	const visited = new Set<string>();
	visited.add(path.resolve(entry));

	const result = inlineAndRewriteStylesheet({
		entryCssPath: entry,
		packageRoot: projectRoot,
		rewriteAssetUrl: (url) => url,
		visitedStylesheets: visited
	});
	assert.equal(result, "");
});

test("inlineAndRewriteStylesheet resolves circular imports without infinite recursion", async () => {
	const { inlineAndRewriteStylesheet } = await import(
		"../../../bin/helpers/css-bundler.ts"
	);
	const aEntry = absPath("a.css");
	const bEntry = absPath("b.css");
	putFile(aEntry, `@import "b.css";\n.a { color: red; }`);
	putFile(bEntry, `@import "a.css";\n.b { color: blue; }`);

	const result = inlineAndRewriteStylesheet({
		entryCssPath: aEntry,
		packageRoot: projectRoot,
		rewriteAssetUrl: (url) => url
	});
	assert.ok(typeof result === "string");
	assert.match(result, /color:blue/);
	assert.match(result, /color:red/);
});

// ---------------------------------------------------------------------------
// inlineAndRewriteStylesheet — no imports (local only)
// ---------------------------------------------------------------------------

test("inlineAndRewriteStylesheet returns local CSS when there are no @import rules", async () => {
	const { inlineAndRewriteStylesheet } = await import(
		"../../../bin/helpers/css-bundler.ts"
	);
	const entry = absPath("simple.css");
	putFile(entry, "body { margin: 0; padding: 0; }");

	const result = inlineAndRewriteStylesheet({
		entryCssPath: entry,
		packageRoot: projectRoot,
		rewriteAssetUrl: (url) => url
	});
	assert.match(result, /margin:0/);
	assert.match(result, /padding:0/);
});

// ---------------------------------------------------------------------------
// inlineAndRewriteStylesheet — @import inlining
// ---------------------------------------------------------------------------

test("inlineAndRewriteStylesheet inlines a @import string dependency before local rules", async () => {
	const { inlineAndRewriteStylesheet } = await import(
		"../../../bin/helpers/css-bundler.ts"
	);
	const entry = absPath("main.css");
	const dep = absPath("base.css");
	putFile(entry, `@import "base.css";\nbody { color: red; }`);
	putFile(dep, "html { box-sizing: border-box; }");

	const result = inlineAndRewriteStylesheet({
		entryCssPath: entry,
		packageRoot: projectRoot,
		rewriteAssetUrl: (url) => url
	});
	assert.match(result, /box-sizing/);
	assert.match(result, /color:red/);
	assert.ok(
		result.indexOf("box-sizing") < result.indexOf("color:red"),
		"imported CSS must appear before local CSS"
	);
});

test("inlineAndRewriteStylesheet inlines a @import url() dependency", async () => {
	const { inlineAndRewriteStylesheet } = await import(
		"../../../bin/helpers/css-bundler.ts"
	);
	const entry = absPath("main.css");
	const dep = absPath("vars.css");
	putFile(entry, `@import url("vars.css");\nbody { font-size: 16px; }`);
	putFile(dep, ":root { --color: #fff; }");

	const result = inlineAndRewriteStylesheet({
		entryCssPath: entry,
		packageRoot: projectRoot,
		rewriteAssetUrl: (url) => url
	});
	assert.match(result, /--color/);
	assert.match(result, /font-size/);
});

// ---------------------------------------------------------------------------
// inlineAndRewriteStylesheet — missing file
// ---------------------------------------------------------------------------

test("inlineAndRewriteStylesheet throws when an imported stylesheet path does not exist", async () => {
	const { inlineAndRewriteStylesheet } = await import(
		"../../../bin/helpers/css-bundler.ts"
	);
	const entry = absPath("main.css");
	putFile(entry, `@import "missing.css";\nbody { color: red; }`);
	existsImpl = (p) => !p.includes("missing");

	assert.throws(
		() =>
			inlineAndRewriteStylesheet({
				entryCssPath: entry,
				packageRoot: projectRoot,
				rewriteAssetUrl: (url) => url
			}),
		/Missing imported MagicMirror stylesheet/
	);
});

// ---------------------------------------------------------------------------
// inlineAndRewriteStylesheet — ../node_modules/ path remapping
// ---------------------------------------------------------------------------

test("inlineAndRewriteStylesheet remaps ../node_modules/ imports to packageRoot/node_modules/ when initial path is missing", async () => {
	const { inlineAndRewriteStylesheet } = await import(
		"../../../bin/helpers/css-bundler.ts"
	);
	const entry = absPath("main.css");
	const remappedPath = path.join(
		projectRoot,
		"node_modules",
		"some-pkg",
		"dist",
		"style.css"
	);
	putFile(entry, `@import "../node_modules/some-pkg/dist/style.css";\nbody { color: red; }`);
	putFile(remappedPath, ".pkg { display: flex; }");

	existsImpl = (p) => {
		// The initial resolved path from _css_stubs goes to tests/node_modules/...
		// which we simulate as missing so the remapping branch fires.
		const norm = p.replace(/\\/g, "/");
		if (norm.includes("/tests/node_modules/")) {
			return false;
		}
		return true;
	};

	const result = inlineAndRewriteStylesheet({
		entryCssPath: entry,
		packageRoot: projectRoot,
		rewriteAssetUrl: (url) => url
	});
	assert.match(result, /display:flex/);
});

// ---------------------------------------------------------------------------
// inlineAndRewriteStylesheet — getImportUrl error paths
// ---------------------------------------------------------------------------

test("inlineAndRewriteStylesheet throws for @import with no URL or string target", async () => {
	const { inlineAndRewriteStylesheet } = await import(
		"../../../bin/helpers/css-bundler.ts"
	);
	const entry = absPath("bad-import.css");
	// An @import with a plain identifier — not a URL or String node in the AST
	putFile(entry, "@import foo;\nbody { color: red; }");

	assert.throws(
		() =>
			inlineAndRewriteStylesheet({
				entryCssPath: entry,
				packageRoot: projectRoot,
				rewriteAssetUrl: (url) => url
			}),
		/Unsupported MagicMirror CSS import/
	);
});

test("inlineAndRewriteStylesheet throws for @import with media query qualifiers", async () => {
	const { inlineAndRewriteStylesheet } = await import(
		"../../../bin/helpers/css-bundler.ts"
	);
	const entry = absPath("qualified-import.css");
	// Qualified @import — url() target + media query "screen"
	putFile(entry, `@import url("theme.css") screen;\nbody { color: red; }`);

	assert.throws(
		() =>
			inlineAndRewriteStylesheet({
				entryCssPath: entry,
				packageRoot: projectRoot,
				rewriteAssetUrl: (url) => url
			}),
		/Unsupported qualified MagicMirror CSS import/
	);
});
