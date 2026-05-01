/**
 * Unit coverage for the package install guard used by consumer installs.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "pathe";
import installGuardModule from "../../../bin/install-guard.ts";

const {
	assertSupportedInstallType,
	getInstallSection,
	getPackageName,
	isMaintainerSourceRepo,
	resolveConsumerPackageJsonPath,
	runInstallGuard,
	runMaintainerPostinstall,
	runPostinstall
} = installGuardModule;
const publishedPackageName = "@angeldeejay/magicmirror-module-sandbox";

/**
 * Resolve the installed package root for one temporary consumer workspace.
 *
 * @param {string} tempRoot
 * @returns {string}
 */
function getInstalledPackageRoot(tempRoot) {
	return path.join(
		tempRoot,
		"node_modules",
		...publishedPackageName.split("/")
	);
}

/**
 * Write a temporary consumer `package.json` fixture.
 *
 * @param {string} rootPath
 * @param {object} packageJson
 * @returns {string}
 */
function writePackageJson(rootPath, packageJson) {
	fs.mkdirSync(rootPath, { recursive: true });
	const packageJsonPath = path.join(rootPath, "package.json");
	fs.writeFileSync(
		packageJsonPath,
		`${JSON.stringify(packageJson, null, "\t")}\n`,
		"utf8"
	);
	return packageJsonPath;
}

test("resolveConsumerPackageJsonPath prefers the original install cwd", () => {
	const tempRoot = fs.mkdtempSync(
		path.join(os.tmpdir(), "magicmirror-module-sandbox-install-guard-")
	);
	const packageRoot = getInstalledPackageRoot(tempRoot);
	const consumerRoot = path.join(tempRoot, "consumer-module");
	const consumerPackageJsonPath = writePackageJson(consumerRoot, {
		name: "consumer-module"
	});

	assert.equal(
		resolveConsumerPackageJsonPath({
			env: {
				INIT_CWD: consumerRoot
			},
			packageRoot
		}),
		consumerPackageJsonPath
	);
});

test("resolveConsumerPackageJsonPath falls back to npm_config_local_prefix", () => {
	const tempRoot = fs.mkdtempSync(
		path.join(os.tmpdir(), "magicmirror-module-sandbox-install-guard-")
	);
	const packageRoot = getInstalledPackageRoot(tempRoot);
	const consumerRoot = path.join(tempRoot, "consumer-module");
	const consumerPackageJsonPath = writePackageJson(consumerRoot, {
		name: "consumer-module"
	});

	assert.equal(
		resolveConsumerPackageJsonPath({
			env: {
				npm_config_local_prefix: consumerRoot
			},
			packageRoot
		}),
		consumerPackageJsonPath
	);
});

test("getInstallSection identifies devDependencies and dependencies", () => {
	assert.equal(
		getInstallSection(
			{
				devDependencies: {
					[publishedPackageName]: "^1.0.0"
				}
			},
			publishedPackageName
		),
		"devDependencies"
	);
	assert.equal(
		getInstallSection(
			{
				dependencies: {
					[publishedPackageName]: "^1.0.0"
				}
			},
			publishedPackageName
		),
		"dependencies"
	);
	assert.equal(
		getInstallSection(
			{
				dependencies: {
					express: "^5.0.0"
				}
			},
			publishedPackageName
		),
		null
	);
});

test("getPackageName reads the published package name from disk", () => {
	const tempRoot = fs.mkdtempSync(
		path.join(os.tmpdir(), "magicmirror-module-sandbox-install-guard-")
	);
	writePackageJson(tempRoot, {
		name: "sandbox-under-test"
	});

	assert.equal(getPackageName(tempRoot), "sandbox-under-test");
});

test("getPackageName falls back to an empty string when the manifest omits name", () => {
	const tempRoot = fs.mkdtempSync(
		path.join(os.tmpdir(), "magicmirror-module-sandbox-install-guard-")
	);
	writePackageJson(tempRoot, {
		version: "1.0.0"
	});

	assert.equal(getPackageName(tempRoot), "");
});

test("assertSupportedInstallType allows devDependency installs and npx usage", () => {
	assert.equal(
		assertSupportedInstallType({
			consumerPackageJson: {
				devDependencies: {
					[publishedPackageName]: "^1.0.0"
				}
			},
			consumerPackageJsonPath: "/consumer/package.json",
			packageName: publishedPackageName
		}),
		"devDependencies"
	);
	assert.equal(
		assertSupportedInstallType({
			consumerPackageJson: {
				dependencies: {
					express: "^5.0.0"
				}
			},
			consumerPackageJsonPath: "/consumer/package.json",
			packageName: publishedPackageName
		}),
		null
	);
});

test("assertSupportedInstallType rejects dependency installs with a clear error", () => {
	assert.throws(() => {
		assertSupportedInstallType({
			consumerPackageJson: {
				dependencies: {
					[publishedPackageName]: "^1.0.0"
				}
			},
			consumerPackageJsonPath: "/consumer/package.json",
			packageName: publishedPackageName
		});
	}, /must be installed as a devDependency/);
});

test("isMaintainerSourceRepo detects the checked-out source repository", () => {
	const tempRoot = fs.mkdtempSync(
		path.join(os.tmpdir(), "magicmirror-module-sandbox-maintainer-")
	);
	fs.mkdirSync(path.join(tempRoot, "client", "scss"), { recursive: true });
	fs.mkdirSync(path.join(tempRoot, "scripts"), { recursive: true });
	fs.writeFileSync(
		path.join(tempRoot, "client", "scss", "entrypoint.scss"),
		"",
		"utf8"
	);
	fs.writeFileSync(
		path.join(tempRoot, "scripts", "build-dist.ts"),
		"",
		"utf8"
	);

	assert.equal(
		isMaintainerSourceRepo({
			env: {
				INIT_CWD: tempRoot
			},
			packageRoot: tempRoot
		}),
		true
	);
});

test("isMaintainerSourceRepo rejects missing INIT_CWD or source markers", () => {
	const tempRoot = fs.mkdtempSync(
		path.join(os.tmpdir(), "magicmirror-module-sandbox-maintainer-")
	);

	assert.equal(
		isMaintainerSourceRepo({
			env: {},
			packageRoot: tempRoot
		}),
		false
	);

	fs.mkdirSync(path.join(tempRoot, "client", "scss"), { recursive: true });
	assert.equal(
		isMaintainerSourceRepo({
			env: {
				INIT_CWD: tempRoot
			},
			packageRoot: tempRoot
		}),
		false
	);
});

test("runMaintainerPostinstall skips asset sync outside the source repository", () => {
	let called = false;

	runMaintainerPostinstall({
		env: {
			INIT_CWD: "/consumer"
		},
		packageRoot: "/package-root",
		/**
		 * Synchronizes assets.
		 */
		syncAssets() {
			called = true;
		}
	});

	assert.equal(called, false);
});

test("runMaintainerPostinstall syncs assets for the maintainer source repository", () => {
	const tempRoot = fs.mkdtempSync(
		path.join(os.tmpdir(), "magicmirror-module-sandbox-maintainer-")
	);
	fs.mkdirSync(path.join(tempRoot, "client", "scss"), { recursive: true });
	fs.mkdirSync(path.join(tempRoot, "scripts"), { recursive: true });
	fs.writeFileSync(
		path.join(tempRoot, "client", "scss", "entrypoint.scss"),
		"",
		"utf8"
	);
	fs.writeFileSync(
		path.join(tempRoot, "scripts", "build-dist.ts"),
		"",
		"utf8"
	);

	let called = false;
	runMaintainerPostinstall({
		env: {
			INIT_CWD: tempRoot
		},
		packageRoot: tempRoot,
		/**
		 * Synchronizes assets.
		 */
		syncAssets({ packageRoot }) {
			called = packageRoot === tempRoot;
		}
	});

	assert.equal(called, true);
});

test("runInstallGuard allows npx-like installs with no consumer package", () => {
	const tempRoot = fs.mkdtempSync(
		path.join(os.tmpdir(), "magicmirror-module-sandbox-install-guard-")
	);
	writePackageJson(tempRoot, {
		name: publishedPackageName
	});

	assert.doesNotThrow(() => {
		runInstallGuard({
			env: {},
			packageRoot: tempRoot,
			stderr: {
				/**
				 * Writes.
				 */
				write() {}
			}
		});
	});
});

test("resolveConsumerPackageJsonPath skips the package root and falls back to the next candidate", () => {
	const tempRoot = fs.mkdtempSync(
		path.join(os.tmpdir(), "magicmirror-module-sandbox-install-guard-")
	);
	const packageRoot = getInstalledPackageRoot(tempRoot);
	const consumerRoot = path.join(tempRoot, "consumer-module");
	writePackageJson(packageRoot, {
		name: publishedPackageName
	});
	const consumerPackageJsonPath = writePackageJson(consumerRoot, {
		name: "consumer-module"
	});

	assert.equal(
		resolveConsumerPackageJsonPath({
			env: {
				INIT_CWD: packageRoot,
				npm_config_local_prefix: consumerRoot
			},
			packageRoot
		}),
		consumerPackageJsonPath
	);
});

test("runInstallGuard validates consumer devDependency installs and touches stderr", () => {
	const tempRoot = fs.mkdtempSync(
		path.join(os.tmpdir(), "magicmirror-module-sandbox-install-guard-")
	);
	const packageRoot = getInstalledPackageRoot(tempRoot);
	const consumerRoot = path.join(tempRoot, "consumer-module");
	writePackageJson(packageRoot, {
		name: publishedPackageName
	});
	writePackageJson(consumerRoot, {
		name: "consumer-module",
		devDependencies: {
			[publishedPackageName]: "^1.0.0"
		}
	});

	let writes = 0;
	runInstallGuard({
		env: {
			INIT_CWD: consumerRoot
		},
		packageRoot,
		stderr: {
			/**
			 * Writes.
			 */
			write() {
				writes += 1;
			}
		}
	});

	assert.equal(writes, 1);
});

test("runPostinstall executes maintainer sync after the install guard", () => {
	const tempRoot = fs.mkdtempSync(
		path.join(os.tmpdir(), "magicmirror-module-sandbox-maintainer-")
	);
	writePackageJson(tempRoot, {
		name: publishedPackageName
	});
	fs.mkdirSync(path.join(tempRoot, "client", "scss"), { recursive: true });
	fs.mkdirSync(path.join(tempRoot, "scripts"), { recursive: true });
	fs.writeFileSync(
		path.join(tempRoot, "client", "scss", "entrypoint.scss"),
		"",
		"utf8"
	);
	fs.writeFileSync(
		path.join(tempRoot, "scripts", "build-dist.ts"),
		"",
		"utf8"
	);

	let called = false;
	runPostinstall({
		env: {
			INIT_CWD: tempRoot
		},
		packageRoot: tempRoot,
		stderr: {
			/**
			 * Writes.
			 */
			write() {}
		},
		/**
		 * Synchronizes assets.
		 */
		syncAssets({ packageRoot }) {
			called = packageRoot === tempRoot;
		}
	});

	assert.equal(called, true);
});
