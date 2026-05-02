/**
 * CSS bundling helpers for maintainer build scripts that inline imports before output.
 */

import * as fs from "node:fs";
import { createRequire } from "node:module";
import * as path from "pathe";
import { fileURLToPath } from "node:url";

type CssNode = {
	type?: string;
	name?: string;
	value?: string;
	prelude?: {
		children?: {
			toArray?: () => CssNode[];
		};
	};
	children?: {
		toArray?: () => CssNode[];
	};
};

type CssAst = {
	children?: {
		toArray?: () => CssNode[];
	};
};

type CssTreeModule = {
	parse: (
		source: string,
		options?: {
			context: "declarationList";
		}
	) => CssAst | CssNode;
	generate: (node: CssAst | CssNode) => string;
	walk: (
		ast: CssAst | CssNode,
		options: {
			visit: "Url";
			enter: (node: CssNode) => void;
		}
	) => void;
};

const fromOS = (p: string) => p.replace(/\\/g, "/");
const currentFilePath = fromOS(
	/* v8 ignore next 3 */
	typeof __filename === "string" ? __filename : fileURLToPath(import.meta.url)
);
const currentDirPath =
	/* v8 ignore next */
	typeof __dirname === "string"
		? fromOS(__dirname)
		: path.dirname(currentFilePath);
const nodeRequire = createRequire(
	/* v8 ignore next */
	typeof __filename === "string" ? __filename : import.meta.url
);

/**
 * Gets css tree.
 */
function getCssTree(packageRoot: string): CssTreeModule {
	const repoRoot = path.resolve(currentDirPath, "..", "..");
	const cssTreePath = nodeRequire.resolve("css-tree", {
		paths: [packageRoot, repoRoot]
	});
	return nodeRequire(cssTreePath) as CssTreeModule;
}

/**
 * Parses stylesheet.
 */
function parseStylesheet({
	cssSource,
	packageRoot
}: {
	cssSource: string;
	packageRoot: string;
}): CssAst | CssNode {
	return getCssTree(packageRoot).parse(cssSource);
}

/**
 * Internal helper for generate css.
 */
function generateCss({
	node,
	packageRoot
}: {
	node: CssAst | CssNode;
	packageRoot: string;
}): string {
	return getCssTree(packageRoot).generate(node);
}

/**
 * Determines whether import rule.
 */
function isImportRule(node: CssNode): boolean {
	return Boolean(node) && node.type === "Atrule" && node.name === "import";
}

/**
 * Gets import url.
 */
function getImportUrl({
	rule,
	packageRoot
}: {
	rule: CssNode;
	packageRoot: string;
}): string {
	const cssTree = getCssTree(packageRoot);
	const preludeChildren = rule.prelude?.children?.toArray?.() || [];
	const importTarget = preludeChildren.find((child) => {
		return child.type === "Url" || child.type === "String";
	});
	if (!importTarget?.value) {
		throw new Error(
			"[module-sandbox] Unsupported MagicMirror CSS import without URL target."
		);
	}

	const qualifiers = preludeChildren
		.filter((child) => child !== importTarget)
		.map((child) => cssTree.generate(child))
		.join(" ")
		.trim();
	if (qualifiers) {
		throw new Error(
			`[module-sandbox] Unsupported qualified MagicMirror CSS import: ${qualifiers}`
		);
	}

	return importTarget.value;
}

/**
 * Resolves imported stylesheet path.
 */
function resolveImportedStylesheetPath({
	importUrl,
	sourceDirectory,
	packageRoot
}: {
	importUrl: string;
	sourceDirectory: string;
	packageRoot: string;
}): string {
	let absoluteImportPath = path.resolve(sourceDirectory, importUrl);
	if (
		!fs.existsSync(absoluteImportPath) &&
		importUrl.startsWith("../node_modules/")
	) {
		absoluteImportPath = path.join(
			packageRoot,
			"node_modules",
			importUrl.replace(/^\.\.\/node_modules\//, "")
		);
	}
	if (!fs.existsSync(absoluteImportPath)) {
		throw new Error(
			`[module-sandbox] Missing imported MagicMirror stylesheet: ${absoluteImportPath}`
		);
	}

	return absoluteImportPath;
}

/**
 * Rewrites parsed asset urls.
 */
function rewriteParsedAssetUrls({
	ast,
	packageRoot,
	sourceDirectory,
	rewriteAssetUrl
}: {
	ast: CssAst | CssNode;
	packageRoot: string;
	sourceDirectory: string;
	rewriteAssetUrl: (assetUrl: string, sourceDirectory: string) => string;
}): void {
	const cssTree = getCssTree(packageRoot);
	cssTree.walk(ast, {
		visit: "Url",
		/**
		 * Internal helper for enter.
		 */
		enter(node) {
			node.value = rewriteAssetUrl(node.value || "", sourceDirectory);
		}
	});
}

/**
 * Rewrites css asset urls.
 */
function rewriteCssAssetUrls({
	cssSource,
	packageRoot,
	sourceDirectory,
	rewriteAssetUrl
}: {
	cssSource: string;
	packageRoot: string;
	sourceDirectory: string;
	rewriteAssetUrl: (assetUrl: string, sourceDirectory: string) => string;
}): string {
	const cssTree = getCssTree(packageRoot);
	const ast = cssTree.parse(
		cssSource,
		/\{/.test(cssSource) || /^\s*@/.test(cssSource)
			? undefined
			: {
					context: "declarationList"
				}
	);
	rewriteParsedAssetUrls({
		ast,
		packageRoot,
		sourceDirectory,
		rewriteAssetUrl
	});
	return generateCss({
		node: ast,
		packageRoot
	});
}

/**
 * Internal helper for inline and rewrite stylesheet.
 */
function inlineAndRewriteStylesheet({
	entryCssPath,
	packageRoot,
	rewriteAssetUrl,
	visitedStylesheets = new Set<string>()
}: {
	entryCssPath: string;
	packageRoot: string;
	rewriteAssetUrl: (assetUrl: string, sourceDirectory: string) => string;
	visitedStylesheets?: Set<string>;
}): string {
	const absoluteEntryPath = path.resolve(entryCssPath);
	if (visitedStylesheets.has(absoluteEntryPath)) {
		return "";
	}
	visitedStylesheets.add(absoluteEntryPath);

	const cssSource = fs.readFileSync(absoluteEntryPath, "utf8");
	const ast = parseStylesheet({
		cssSource,
		packageRoot
	});
	const stylesheetNodes =
		"children" in ast && ast.children?.toArray
			? ast.children.toArray()
			: [];
	const sourceDirectory = path.dirname(absoluteEntryPath);

	const importedCss = stylesheetNodes
		.filter(isImportRule)
		.map((rule) => {
			return inlineAndRewriteStylesheet({
				entryCssPath: resolveImportedStylesheetPath({
					importUrl: getImportUrl({
						rule,
						packageRoot
					}),
					sourceDirectory,
					packageRoot
				}),
				packageRoot,
				rewriteAssetUrl,
				visitedStylesheets
			});
		})
		.filter(Boolean);

	const localCss = stylesheetNodes
		.filter((node) => !isImportRule(node))
		.map((node) => {
			rewriteParsedAssetUrls({
				ast: node,
				packageRoot,
				sourceDirectory,
				rewriteAssetUrl
			});
			return generateCss({
				node,
				packageRoot
			});
		})
		.filter(Boolean);

	return [...importedCss, ...localCss].join("\n\n");
}

export { inlineAndRewriteStylesheet, rewriteCssAssetUrls };
