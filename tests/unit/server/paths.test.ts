/**
 * Unit coverage for server path resolution helpers.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "pathe";
import pathsModule from "../../../server/paths.ts";

const {
	MAX_PARENT_PACKAGE_DEPTH,
	harnessRoot,
	resolveMountedModuleInfo,
	resolveActiveMountedModuleInfo,
	createMissingMountedModuleError,
	isMountedModuleRoot,
	findMountedModuleRoot,
	resolveRepoRoot
} = pathsModule;

/**
 * Create one fake MagicMirror module root on disk.
 *
 * @param {string} rootPath
 * @param {{ moduleName?: string, packageVersion?: string, withNodeHelper?: boolean, main?: string, sandbox?: object }} [options]
 * @returns {void}
 */
function writeFakeModuleRoot(rootPath, options = {}) {
	const moduleName = options.moduleName || "MMM-FakeModule";
	const packageData = {
		name: moduleName,
		version: options.packageVersion || "1.0.0"
	};
	if (options.sandbox) {
		packageData.sandbox = options.sandbox;
	}
	if (options.main) {
		packageData.main = options.main;
	}
	fs.mkdirSync(rootPath, { recursive: true });
	fs.writeFileSync(
		path.join(rootPath, "package.json"),
		`${JSON.stringify(packageData, null, "\t")}\n`,
		"utf8"
	);
	fs.writeFileSync(
		path.join(rootPath, options.main || `${moduleName}.js`),
		'/* global Module */\nModule.register("MMM-FakeModule", {});\n',
		"utf8"
	);
	if (options.withNodeHelper !== false) {
		fs.writeFileSync(
			path.join(rootPath, "node_helper.js"),
			"module.exports = {};\n",
			"utf8"
		);
	}
}

test("isMountedModuleRoot accepts frontend-only modules with package.json and entry file", () => {
	const tempRoot = fs.mkdtempSync(
		path.join(os.tmpdir(), "magicmirror-module-sandbox-paths-")
	);
	const validRoot = path.join(tempRoot, "valid-module");
	const invalidRoot = path.join(tempRoot, "invalid-module");

	writeFakeModuleRoot(validRoot, {
		withNodeHelper: false
	});
	fs.mkdirSync(invalidRoot, { recursive: true });
	fs.writeFileSync(
		path.join(invalidRoot, "package.json"),
		'{"name":"not-a-module"}\n',
		"utf8"
	);

	assert.equal(isMountedModuleRoot(validRoot), true);
	assert.equal(isMountedModuleRoot(invalidRoot), false);
});

test("findMountedModuleRoot resolves a module root within the parent-level limit", () => {
	const tempRoot = fs.mkdtempSync(
		path.join(os.tmpdir(), "magicmirror-module-sandbox-paths-")
	);
	const moduleRoot = path.join(tempRoot, "MMM-FakeModule");
	const nestedStart = path.join(moduleRoot, "a", "b", "c");

	writeFakeModuleRoot(moduleRoot);
	fs.mkdirSync(nestedStart, { recursive: true });

	assert.equal(
		findMountedModuleRoot(nestedStart, MAX_PARENT_PACKAGE_DEPTH),
		moduleRoot
	);
});

test("findMountedModuleRoot stops after the configured parent-level limit", () => {
	const tempRoot = fs.mkdtempSync(
		path.join(os.tmpdir(), "magicmirror-module-sandbox-paths-")
	);
	const moduleRoot = path.join(tempRoot, "MMM-FakeModule");
	const nestedStart = path.join(moduleRoot, "a", "b", "c", "d");

	writeFakeModuleRoot(moduleRoot);
	fs.mkdirSync(nestedStart, { recursive: true });

	assert.equal(findMountedModuleRoot(nestedStart, 3), null);
});

test("findMountedModuleRoot returns null when it reaches the filesystem root", () => {
	const filesystemRoot = path.parse(process.cwd()).root;
	assert.equal(
		findMountedModuleRoot(filesystemRoot, MAX_PARENT_PACKAGE_DEPTH),
		null
	);
});

test("resolveRepoRoot honors MM_SANDBOX_MOUNTED_MODULE_ROOT when provided", () => {
	const tempRoot = fs.mkdtempSync(
		path.join(os.tmpdir(), "magicmirror-module-sandbox-paths-")
	);
	const originalRoot = process.env.MM_SANDBOX_MOUNTED_MODULE_ROOT;

	process.env.MM_SANDBOX_MOUNTED_MODULE_ROOT = tempRoot;
	try {
		assert.equal(resolveRepoRoot(), tempRoot);
	} finally {
		if (originalRoot) {
			process.env.MM_SANDBOX_MOUNTED_MODULE_ROOT = originalRoot;
		} else {
			delete process.env.MM_SANDBOX_MOUNTED_MODULE_ROOT;
		}
	}
});

test("resolveRepoRoot falls back to the sandbox-near mounted module root when cwd has no match", () => {
	const tempRoot = fs.mkdtempSync(
		path.join(os.tmpdir(), "magicmirror-module-sandbox-paths-")
	);
	const originalRoot = process.env.MM_SANDBOX_MOUNTED_MODULE_ROOT;
	const originalCwd = process.cwd();
	const fallbackCwd = path.join(tempRoot, "plain", "nested");
	const expectedRepoRoot =
		findMountedModuleRoot(harnessRoot, MAX_PARENT_PACKAGE_DEPTH) ||
		fallbackCwd;

	delete process.env.MM_SANDBOX_MOUNTED_MODULE_ROOT;
	fs.mkdirSync(fallbackCwd, { recursive: true });
	process.chdir(fallbackCwd);

	try {
		assert.equal(resolveRepoRoot(), expectedRepoRoot);
	} finally {
		process.chdir(originalCwd);
		if (originalRoot) {
			process.env.MM_SANDBOX_MOUNTED_MODULE_ROOT = originalRoot;
		}
	}
});

test("resolveMountedModuleInfo discovers module identity from package name and entry file", () => {
	const tempRoot = fs.mkdtempSync(
		path.join(os.tmpdir(), "magicmirror-module-sandbox-paths-")
	);

	writeFakeModuleRoot(tempRoot, {
		moduleName: "MMM-AutoDetected",
		withNodeHelper: false,
		sandbox: {
			startup: ["bootstrap", "translations"]
		}
	});

	assert.deepEqual(resolveMountedModuleInfo(tempRoot), {
		rootPath: tempRoot,
		moduleName: "MMM-AutoDetected",
		packageVersion: "1.0.0",
		moduleEntry: "MMM-AutoDetected.js",
		moduleIdentifier: "MMM-AutoDetected_sandbox",
		hasNodeHelper: false,
		sandbox: {
			startup: ["bootstrap", "translations"]
		}
	});
});

test("resolveMountedModuleInfo falls back to package.main when the preferred entry is absent", () => {
	const tempRoot = fs.mkdtempSync(
		path.join(os.tmpdir(), "magicmirror-module-sandbox-paths-")
	);

	writeFakeModuleRoot(tempRoot, {
		moduleName: "MMM-MainFallback",
		main: "custom-entry.js",
		withNodeHelper: false
	});
	fs.rmSync(path.join(tempRoot, "MMM-MainFallback.js"), {
		force: true
	});

	assert.equal(
		resolveMountedModuleInfo(tempRoot)?.moduleEntry,
		"custom-entry.js"
	);
});

test("resolveMountedModuleInfo falls back to a single MagicMirror-named entry", () => {
	const tempRoot = fs.mkdtempSync(
		path.join(os.tmpdir(), "magicmirror-module-sandbox-paths-")
	);

	fs.mkdirSync(tempRoot, { recursive: true });
	fs.writeFileSync(
		path.join(tempRoot, "package.json"),
		'{\n\t"name": "plain-package",\n\t"version": "1.0.0"\n}\n',
		"utf8"
	);
	fs.writeFileSync(
		path.join(tempRoot, "MMM-Standalone.js"),
		'/* global Module */\nModule.register("MMM-Standalone", {});\n',
		"utf8"
	);

	assert.equal(
		resolveMountedModuleInfo(tempRoot)?.moduleEntry,
		"MMM-Standalone.js"
	);
});

test("resolveMountedModuleInfo falls back to Module.register discovery when needed", () => {
	const tempRoot = fs.mkdtempSync(
		path.join(os.tmpdir(), "magicmirror-module-sandbox-paths-")
	);

	fs.mkdirSync(tempRoot, { recursive: true });
	fs.writeFileSync(
		path.join(tempRoot, "package.json"),
		'{\n\t"name": "plain-package",\n\t"version": "1.0.0"\n}\n',
		"utf8"
	);
	fs.writeFileSync(
		path.join(tempRoot, "alpha.js"),
		'console.log("alpha");\n',
		"utf8"
	);
	fs.writeFileSync(
		path.join(tempRoot, "beta.js"),
		'/* global Module */\nModule.register("MMM-Beta", {});\n',
		"utf8"
	);

	assert.equal(resolveMountedModuleInfo(tempRoot)?.moduleEntry, "beta.js");
});

test("resolveMountedModuleInfo rejects invalid sandbox.startup values", () => {
	const tempRoot = fs.mkdtempSync(
		path.join(os.tmpdir(), "magicmirror-module-sandbox-paths-")
	);

	writeFakeModuleRoot(tempRoot, {
		moduleName: "MMM-InvalidSandbox",
		withNodeHelper: false,
		sandbox: {
			startup: ["bootstrap", ""]
		}
	});

	assert.throws(() => {
		resolveMountedModuleInfo(tempRoot);
	}, /package\.json sandbox\.startup\[1\] must be a non-empty string/);
});

test("resolveActiveMountedModuleInfo honors MM_SANDBOX_MOUNTED_MODULE_ROOT for the active flow", () => {
	const tempRoot = fs.mkdtempSync(
		path.join(os.tmpdir(), "magicmirror-module-sandbox-paths-")
	);
	const originalRoot = process.env.MM_SANDBOX_MOUNTED_MODULE_ROOT;

	writeFakeModuleRoot(tempRoot, {
		moduleName: "MMM-ActiveFlow",
		withNodeHelper: false
	});
	process.env.MM_SANDBOX_MOUNTED_MODULE_ROOT = tempRoot;

	try {
		assert.deepEqual(resolveActiveMountedModuleInfo(), {
			rootPath: tempRoot,
			moduleName: "MMM-ActiveFlow",
			packageVersion: "1.0.0",
			moduleEntry: "MMM-ActiveFlow.js",
			moduleIdentifier: "MMM-ActiveFlow_sandbox",
			hasNodeHelper: false,
			sandbox: {}
		});
	} finally {
		if (originalRoot) {
			process.env.MM_SANDBOX_MOUNTED_MODULE_ROOT = originalRoot;
		} else {
			delete process.env.MM_SANDBOX_MOUNTED_MODULE_ROOT;
		}
	}
});

test("resolveActiveMountedModuleInfo falls back to the current working directory module root", () => {
	const tempRoot = fs.mkdtempSync(
		path.join(os.tmpdir(), "magicmirror-module-sandbox-paths-")
	);
	const moduleRoot = path.join(tempRoot, "MMM-CwdModule");
	const nestedRoot = path.join(moduleRoot, "nested", "deeper");
	const originalRoot = process.env.MM_SANDBOX_MOUNTED_MODULE_ROOT;
	const originalCwd = process.cwd();

	writeFakeModuleRoot(moduleRoot, {
		moduleName: "MMM-CwdModule",
		withNodeHelper: false
	});
	fs.mkdirSync(nestedRoot, { recursive: true });
	delete process.env.MM_SANDBOX_MOUNTED_MODULE_ROOT;
	process.chdir(nestedRoot);

	try {
		assert.equal(resolveActiveMountedModuleInfo()?.rootPath, moduleRoot);
	} finally {
		process.chdir(originalCwd);
		if (originalRoot === undefined) {
			delete process.env.MM_SANDBOX_MOUNTED_MODULE_ROOT;
		} else {
			process.env.MM_SANDBOX_MOUNTED_MODULE_ROOT = originalRoot;
		}
	}
});

test("createMissingMountedModuleError explains the supported startup flows", () => {
	assert.match(
		createMissingMountedModuleError().message,
		/use --preview for the maintainer fixture/
	);
});
