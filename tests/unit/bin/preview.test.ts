/**
 * Unit coverage for the maintainer-only preview bootstrap helpers.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import previewModule from "../../../bin/preview.ts";

const {
	PREVIEW_MODULE_NAME,
	PREVIEW_MODULE_ENTRY,
	PREVIEW_MODULE_IDENTIFIER,
	getPackageRoot,
	getPreviewModuleRoot,
	hasMaintainerPreviewFixture,
	applyMaintainerPreviewEnv
} = previewModule;

/**
 * Create the preview fixture layout expected by `bin/preview.ts`.
 *
 * @param {string} packageRoot
 * @returns {string}
 */
function writePreviewFixture(packageRoot) {
	const previewRoot = getPreviewModuleRoot(packageRoot);
	fs.mkdirSync(previewRoot, { recursive: true });
	fs.writeFileSync(
		path.join(previewRoot, "package.json"),
		'{"name":"mock-preview"}\n',
		"utf8"
	);
	fs.writeFileSync(
		path.join(previewRoot, "node_helper.js"),
		"module.exports = {};\n",
		"utf8"
	);
	fs.writeFileSync(
		path.join(previewRoot, PREVIEW_MODULE_ENTRY),
		"module.exports = {};\n",
		"utf8"
	);
	return previewRoot;
}

test("hasMaintainerPreviewFixture detects the bundled preview module layout", () => {
	const tempRoot = fs.mkdtempSync(
		path.join(os.tmpdir(), "magicmirror-module-sandbox-preview-")
	);
	writePreviewFixture(tempRoot);

	assert.equal(hasMaintainerPreviewFixture(tempRoot), true);
});

test("hasMaintainerPreviewFixture returns false when one of the required preview files is missing", () => {
	const tempRoot = fs.mkdtempSync(
		path.join(os.tmpdir(), "magicmirror-module-sandbox-preview-")
	);
	const previewRoot = getPreviewModuleRoot(tempRoot);
	fs.mkdirSync(previewRoot, { recursive: true });

	fs.writeFileSync(
		path.join(previewRoot, "package.json"),
		'{"name":"mock-preview"}\n',
		"utf8"
	);
	assert.equal(hasMaintainerPreviewFixture(tempRoot), false);

	fs.writeFileSync(
		path.join(previewRoot, "node_helper.js"),
		"module.exports = {};\n",
		"utf8"
	);
	assert.equal(hasMaintainerPreviewFixture(tempRoot), false);
});

test("applyMaintainerPreviewEnv wires the internal preview module env overrides", () => {
	const tempRoot = fs.mkdtempSync(
		path.join(os.tmpdir(), "magicmirror-module-sandbox-preview-")
	);
	const previewRoot = writePreviewFixture(tempRoot);
	const env = {};

	const previewConfig = applyMaintainerPreviewEnv({
		env,
		packageRoot: tempRoot
	});

	assert.deepEqual(previewConfig, {
		previewRoot,
		moduleName: PREVIEW_MODULE_NAME,
		moduleEntry: PREVIEW_MODULE_ENTRY,
		moduleIdentifier: PREVIEW_MODULE_IDENTIFIER
	});
	assert.equal(env.MM_SANDBOX_MOUNTED_MODULE_ROOT, previewRoot);
	assert.equal("MM_SANDBOX_CONFIG_PATH" in env, false);
	assert.equal("MM_SANDBOX_RUNTIME_CONFIG_PATH" in env, false);
	assert.equal("MM_SANDBOX_MODULE_NAME" in env, false);
	assert.equal("MM_SANDBOX_MODULE_ENTRY" in env, false);
	assert.equal("MM_SANDBOX_MODULE_IDENTIFIER" in env, false);
	assert.equal("MM_SANDBOX_CONFIG_DEEP_MERGE" in env, false);
});

test("applyMaintainerPreviewEnv fails clearly when the preview fixture is missing", () => {
	const tempRoot = fs.mkdtempSync(
		path.join(os.tmpdir(), "magicmirror-module-sandbox-preview-")
	);

	assert.throws(() => {
		applyMaintainerPreviewEnv({
			env: {},
			packageRoot: tempRoot
		});
	}, /Maintainer preview fixture is unavailable/);
});

test("getPackageRoot resolves the repository root from the source bin directory", () => {
	assert.equal(path.basename(getPackageRoot()), "magicmirror-module-sandbox");
});
