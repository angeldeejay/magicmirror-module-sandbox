/**
 * Unit coverage for maintainer-only MagicMirror asset synchronization.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import syncMagicMirrorAssetsModule from "../../../bin/sync-magicmirror-assets.ts";

const {
	clearManagedFontAssets,
	copyReferencedAsset,
	getManagedAssetManifestPath,
	readManagedAssetManifest,
	resolveMagicMirrorRoot,
	rewriteCssAssetUrls,
	syncMagicMirrorAssets,
	writeManagedAssetManifest
} = syncMagicMirrorAssetsModule;

test("resolveMagicMirrorRoot resolves the installed dev dependency", () => {
	assert.equal(path.basename(resolveMagicMirrorRoot()), "magicmirror");
});

test("clearManagedFontAssets deletes only manifest-tracked copied fonts", () => {
	const tempRoot = fs.mkdtempSync(
		path.join(os.tmpdir(), "magicmirror-module-sandbox-sync-")
	);
	fs.writeFileSync(
		path.join(tempRoot, "roboto-latin-400-normal.woff2"),
		"font",
		"utf8"
	);
	fs.writeFileSync(path.join(tempRoot, "notes.txt"), "keep", "utf8");
	writeManagedAssetManifest({
		fontsRoot: tempRoot,
		copiedFiles: new Map([
			[
				path.join(tempRoot, "roboto-latin-400-normal.woff2"),
				path.join(tempRoot, "source-font.woff2")
			]
		])
	});

	clearManagedFontAssets(tempRoot);

	assert.equal(
		fs.existsSync(path.join(tempRoot, "roboto-latin-400-normal.woff2")),
		false
	);
	assert.equal(fs.existsSync(path.join(tempRoot, "notes.txt")), true);
	assert.equal(fs.existsSync(getManagedAssetManifestPath(tempRoot)), false);
});

test("copyReferencedAsset preserves external URLs and falls back to package node_modules", () => {
	const tempRoot = fs.mkdtempSync(
		path.join(os.tmpdir(), "magicmirror-module-sandbox-sync-")
	);
	const sourceRoot = path.join(tempRoot, "source");
	const fontsRoot = path.join(tempRoot, "fonts");
	const dependencyFontsRoot = path.join(
		tempRoot,
		"node_modules",
		"@fontsource",
		"roboto",
		"files"
	);
	fs.mkdirSync(sourceRoot, { recursive: true });
	fs.mkdirSync(fontsRoot, { recursive: true });
	fs.mkdirSync(dependencyFontsRoot, { recursive: true });
	fs.writeFileSync(
		path.join(dependencyFontsRoot, "roboto-latin-400-normal.woff2"),
		"font",
		"utf8"
	);

	assert.equal(
		copyReferencedAsset({
			assetUrl: "https://example.com/font.woff2",
			sourceDirectory: sourceRoot,
			targetFontsRoot: fontsRoot,
			packageRoot: tempRoot
		}),
		"https://example.com/font.woff2"
	);

	const copiedFiles = new Map();
	const firstUrl = copyReferencedAsset({
		assetUrl:
			"../node_modules/@fontsource/roboto/files/roboto-latin-400-normal.woff2",
		sourceDirectory: sourceRoot,
		targetFontsRoot: fontsRoot,
		packageRoot: tempRoot,
		copiedFiles
	});
	const secondUrl = copyReferencedAsset({
		assetUrl:
			"../node_modules/@fontsource/roboto/files/roboto-latin-400-normal.woff2",
		sourceDirectory: sourceRoot,
		targetFontsRoot: fontsRoot,
		packageRoot: tempRoot,
		copiedFiles
	});

	assert.equal(firstUrl, "/__harness/fonts/roboto-latin-400-normal.woff2");
	assert.equal(secondUrl, firstUrl);
	assert.equal(copiedFiles.size, 1);
});

test("rewriteCssAssetUrls copies referenced assets into the sandbox fonts root", () => {
	const tempRoot = fs.mkdtempSync(
		path.join(os.tmpdir(), "magicmirror-module-sandbox-sync-")
	);
	const sourceRoot = path.join(tempRoot, "source");
	const fontsRoot = path.join(tempRoot, "fonts");
	fs.mkdirSync(sourceRoot, { recursive: true });
	fs.mkdirSync(fontsRoot, { recursive: true });
	fs.writeFileSync(
		path.join(sourceRoot, "roboto.woff2"),
		"font-data",
		"utf8"
	);

	const rewrittenCss = rewriteCssAssetUrls({
		cssSource: 'src: url("./roboto.woff2") format("woff2");',
		sourceDirectory: sourceRoot,
		targetFontsRoot: fontsRoot
	});

	assert.match(
		rewrittenCss,
		/url\((?:"|)\/*__harness\/fonts\/roboto\.woff2(?:"|)\)/
	);
	assert.equal(fs.existsSync(path.join(fontsRoot, "roboto.woff2")), true);
});

test("syncMagicMirrorAssets writes generated stage and font styles from MagicMirror sources", () => {
	const packageRoot = fs.mkdtempSync(
		path.join(os.tmpdir(), "magicmirror-module-sandbox-sync-")
	);
	const magicMirrorRoot = path.join(packageRoot, "magicmirror");
	const magicMirrorCssRoot = path.join(magicMirrorRoot, "css");
	const dependencyFontsRoot = path.join(
		packageRoot,
		"node_modules",
		"@fontsource",
		"roboto",
		"files"
	);
	const dependencyFontAwesomeCssRoot = path.join(
		packageRoot,
		"node_modules",
		"@fortawesome",
		"fontawesome-free",
		"css"
	);
	const dependencyWebfontsRoot = path.join(
		packageRoot,
		"node_modules",
		"@fortawesome",
		"fontawesome-free",
		"webfonts"
	);
	fs.mkdirSync(magicMirrorCssRoot, { recursive: true });
	fs.mkdirSync(path.join(packageRoot, "client", "styles"), {
		recursive: true
	});
	fs.mkdirSync(path.join(packageRoot, "client", "fonts"), {
		recursive: true
	});
	fs.mkdirSync(dependencyFontsRoot, { recursive: true });
	fs.mkdirSync(dependencyFontAwesomeCssRoot, { recursive: true });
	fs.mkdirSync(dependencyWebfontsRoot, { recursive: true });

	fs.writeFileSync(
		path.join(magicMirrorCssRoot, "roboto.css"),
		'@font-face{src:url("../node_modules/@fontsource/roboto/files/roboto-latin-400-normal.woff2") format("woff2");}',
		"utf8"
	);
	fs.writeFileSync(
		path.join(magicMirrorCssRoot, "font-awesome.css"),
		'@import url("../node_modules/@fortawesome/fontawesome-free/css/all.min.css");',
		"utf8"
	);
	fs.writeFileSync(
		path.join(magicMirrorCssRoot, "main.css"),
		"body{color:#999;}",
		"utf8"
	);
	fs.writeFileSync(
		path.join(dependencyFontsRoot, "roboto-latin-400-normal.woff2"),
		"font",
		"utf8"
	);
	fs.writeFileSync(
		path.join(dependencyFontAwesomeCssRoot, "all.min.css"),
		'@font-face{src:url("../webfonts/fa-solid-900.woff2") format("woff2");}',
		"utf8"
	);
	fs.writeFileSync(
		path.join(dependencyWebfontsRoot, "fa-solid-900.woff2"),
		"icon-font",
		"utf8"
	);

	syncMagicMirrorAssets({
		packageRoot,
		magicMirrorRoot
	});

	const fontsCss = fs.readFileSync(
		path.join(packageRoot, "client", "styles", "magicmirror-fonts.css"),
		"utf8"
	);
	const stageCss = fs.readFileSync(
		path.join(packageRoot, "client", "styles", "magicmirror-stage.css"),
		"utf8"
	);

	assert.doesNotMatch(
		fontsCss,
		/Generated from magicmirror\/css\/roboto\.css/
	);
	assert.match(
		fontsCss,
		/url\((?:"|)\/*__harness\/fonts\/roboto-latin-400-normal\.woff2(?:"|)\)/
	);
	assert.match(
		stageCss,
		/@import(?:"| )\/__harness\/styles\/magicmirror-fonts\.css/
	);
	assert.match(stageCss, /fa-solid-900\.woff2/);
	assert.match(stageCss, /body\{color:#999\}/);
	assert.doesNotMatch(stageCss, /Generated from MagicMirror core CSS/);
	assert.equal(
		fs.existsSync(
			path.join(
				packageRoot,
				"client",
				"fonts",
				"roboto-latin-400-normal.woff2"
			)
		),
		true
	);
	assert.equal(
		fs.existsSync(
			path.join(packageRoot, "client", "fonts", "fa-solid-900.woff2")
		),
		true
	);
	assert.deepEqual(
		readManagedAssetManifest(path.join(packageRoot, "client", "fonts")),
		["fa-solid-900.woff2", "roboto-latin-400-normal.woff2"]
	);
});
