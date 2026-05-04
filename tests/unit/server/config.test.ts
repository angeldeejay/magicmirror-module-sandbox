/**
 * Unit coverage for the sandbox config API and persistence behavior.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import pathsModule from "../../../server/paths.ts";
import serverConfigModule from "../../../server/config.ts";

const {
	createConfigApi,
	deriveLocale,
	deriveMountedModulePersistenceHash,
	resolveSandboxPersistencePaths
} = serverConfigModule;
const { resolveMountedModuleInfo } = pathsModule;
const repoRoot = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"..",
	"..",
	".."
);

/**
 * Restore one environment variable after a test mutates it.
 *
 * @param {string} key
 * @param {string|undefined} previousValue
 * @returns {void}
 */
function restoreEnv(key, previousValue) {
	if (previousValue === undefined) {
		delete process.env[key];
		return;
	}

	process.env[key] = previousValue;
}

/**
 * Mirror the sandbox cache-key strategy used by `server/config.ts`.
 *
 * @param {object} persistedConfig
 * @returns {string}
 */
function deriveExpectedCacheKey(persistedConfig) {
	if (!persistedConfig || typeof persistedConfig !== "object") {
		return "default";
	}

	if (!Object.keys(persistedConfig).length) {
		return "default";
	}

	return createHash("sha1")
		.update(JSON.stringify(persistedConfig))
		.digest("hex")
		.slice(0, 12);
}

/**
 * Import one CommonJS module through a unique URL so Node bypasses the module cache.
 *
 * @param {string} modulePath
 * @returns {Promise<any>}
 */
async function importFreshCommonJs(modulePath) {
	const imported = await import(
		`${pathToFileURL(modulePath).href}?t=${Date.now()}-${Math.random()}`
	);
	return imported.default ?? imported;
}

/**
 * Build one deterministic harness config stub for tests that do not care about
 * mounted-module autodetection.
 *
 * @param {Partial<object>} [overrides]
 * @returns {object}
 */
function createHarnessConfigStub(overrides = {}) {
	return {
		host: "127.0.0.1",
		port: 3010,
		language: "en",
		locale: "en-US",
		moduleName: "MMM-TestModule",
		moduleEntry: "MMM-TestModule.js",
		moduleIdentifier: "MMM-TestModule_sandbox",
		sandbox: {},
		configDeepMerge: false,
		mmVersion: "2.36.0",
		header: false,
		hiddenOnStartup: false,
		...overrides
	};
}

test("createConfigApi honors injected config path resolvers for mounted-module config reads and writes", () => {
	const tempRoot = fs.mkdtempSync(
		path.join(os.tmpdir(), "magicmirror-module-sandbox-config-")
	);
	const customConfigPath = path.join(tempRoot, "fixture.config.json");
	const customRuntimeConfigPath = path.join(tempRoot, "fixture.runtime.json");

	fs.writeFileSync(
		customConfigPath,
		'{\n\t"operatorName": "Fixture Operator",\n\t"pingMessage": "fixture ping"\n}\n',
		"utf8"
	);
	fs.writeFileSync(
		customRuntimeConfigPath,
		'{\n\t"language": "es",\n\t"locale": "es"\n}\n',
		"utf8"
	);

	const configApi = createConfigApi({
		/**
		 * Loads harness config.
		 */
		loadHarnessConfig: () =>
			createHarnessConfigStub({
				moduleName: "MMM-ConfigFixture",
				moduleEntry: "MMM-ConfigFixture.js",
				moduleIdentifier: "MMM-ConfigFixture_sandbox"
			}),
		/**
		 * Resolves module config path.
		 */
		resolveModuleConfigPath: () => customConfigPath,
		/**
		 * Resolves runtime config path.
		 */
		resolveRuntimeConfigPath: () => customRuntimeConfigPath
	});

	assert.equal(configApi.getModuleConfigPath(), customConfigPath);
	assert.deepEqual(configApi.getModuleConfig(), {
		position: "middle_center",
		classes: "",
		header: "",
		animateIn: "",
		animateOut: "",
		hiddenOnStartup: false,
		disabled: false,
		configDeepMerge: false,
		config: {
			operatorName: "Fixture Operator",
			pingMessage: "fixture ping"
		}
	});
	assert.equal(configApi.getRuntimeConfigPath(), customRuntimeConfigPath);
	assert.deepEqual(configApi.getRuntimeConfig(), {
		language: "es",
		locale: "es"
	});
	assert.equal(configApi.getHarnessConfig().language, "es");
	assert.equal(configApi.getHarnessConfig().locale, "es");
	assert.ok(
		configApi
			.getAvailableLanguages()
			.some((language) => language.code === "en")
	);

	const savedConfig = configApi.saveModuleConfig({
		operatorName: "Reloaded Operator",
		pingMessage: "reload ping"
	});

	assert.deepEqual(savedConfig, {
		position: "middle_center",
		classes: "",
		header: "",
		animateIn: "",
		animateOut: "",
		hiddenOnStartup: false,
		disabled: false,
		configDeepMerge: false,
		config: {
			operatorName: "Reloaded Operator",
			pingMessage: "reload ping"
		}
	});
	const savedRuntimeConfig = configApi.saveRuntimeConfig({
		language: "fr"
	});
	assert.deepEqual(savedRuntimeConfig, {
		language: "fr",
		locale: "fr"
	});
	assert.match(
		fs.readFileSync(customConfigPath, "utf8"),
		/"configDeepMerge": false/
	);
	assert.match(
		fs.readFileSync(customConfigPath, "utf8"),
		/"operatorName": "Reloaded Operator"/
	);
	assert.match(
		fs.readFileSync(customRuntimeConfigPath, "utf8"),
		/"language": "fr"/
	);
	assert.throws(
		() => configApi.saveRuntimeConfig({ language: "xx-unknown" }),
		/Unsupported runtime language/
	);
});

test("createConfigApi exposes fresh harness metadata and derives cache keys from mounted-module config", () => {
	const tempRoot = fs.mkdtempSync(
		path.join(os.tmpdir(), "magicmirror-module-sandbox-config-")
	);
	const customConfigPath = path.join(tempRoot, "fixture.config.json");
	const freshModulePath = path.join(tempRoot, "fresh-value.js");
	const originalRoot = process.env.MM_SANDBOX_MOUNTED_MODULE_ROOT;

	fs.writeFileSync(
		customConfigPath,
		'{\n\t"operatorName": "Fixture Operator",\n\t"backendUrl": "http://127.0.0.1:28000/api/v1"\n}\n',
		"utf8"
	);
	fs.writeFileSync(
		freshModulePath,
		'module.exports = { value: "first" };\n',
		"utf8"
	);
	fs.writeFileSync(
		path.join(tempRoot, "package.json"),
		'{\n\t"name": "MMM-CacheFixture"\n}\n',
		"utf8"
	);
	fs.writeFileSync(
		path.join(tempRoot, "MMM-CacheFixture.js"),
		'/* global Module */\nModule.register("MMM-CacheFixture", {});\n',
		"utf8"
	);

	process.env.MM_SANDBOX_MOUNTED_MODULE_ROOT = tempRoot;
	try {
		const configApi = createConfigApi({
			/**
			 * Resolves module config path.
			 */
			resolveModuleConfigPath: () => customConfigPath
		});

		assert.equal(
			configApi.getHarnessConfig().moduleName,
			"MMM-CacheFixture"
		);
		assert.ok(
			Array.isArray(configApi.getContract().supportedFrontendSurface)
		);
		assert.match(
			configApi.getHarnessCacheDir(),
			new RegExp(
				`\\.runtime-cache[\\\\/]${deriveExpectedCacheKey({
					operatorName: "Fixture Operator",
					backendUrl: "http://127.0.0.1:28000/api/v1"
				})}$`
			)
		);

		assert.deepEqual(configApi.loadFresh(freshModulePath), {
			value: "first"
		});
		fs.writeFileSync(
			freshModulePath,
			'module.exports = { value: "second" };\n',
			"utf8"
		);
		assert.deepEqual(configApi.loadFresh(freshModulePath), {
			value: "second"
		});

		configApi.saveModuleConfig({});
		assert.match(
			configApi.getHarnessCacheDir(),
			/\.runtime-cache[\\/]default$/
		);
		assert.throws(
			() => configApi.saveModuleConfig([]),
			/Module config must be a JSON object/
		);
	} finally {
		restoreEnv("MM_SANDBOX_MOUNTED_MODULE_ROOT", originalRoot);
	}
});

test("createConfigApi defaults config files to temp persistence paths derived from the mounted module", () => {
	const tempRoot = fs.mkdtempSync(
		path.join(os.tmpdir(), "magicmirror-module-sandbox-config-")
	);
	const originalRoot = process.env.MM_SANDBOX_MOUNTED_MODULE_ROOT;
	const originalCwd = process.cwd();

	fs.writeFileSync(
		path.join(tempRoot, "package.json"),
		'{\n\t"name": "MMM-Autodiscovery",\n\t"sandbox": {\n\t\t"startup": [\n\t\t\t"bootstrap",\n\t\t\t"translations"\n\t\t]\n\t}\n}\n',
		"utf8"
	);
	fs.writeFileSync(
		path.join(tempRoot, "MMM-Autodiscovery.js"),
		'/* global Module */\nModule.register("MMM-Autodiscovery", {});\n',
		"utf8"
	);
	process.env.MM_SANDBOX_MOUNTED_MODULE_ROOT = tempRoot;
	process.chdir(tempRoot);

	try {
		const configApi = createConfigApi();
		const expectedPersistencePaths = resolveSandboxPersistencePaths(
			resolveMountedModuleInfo(tempRoot)
		);
		assert.equal(
			configApi.getModuleConfigPath(),
			expectedPersistencePaths.moduleConfigPath
		);
		assert.equal(
			configApi.getRuntimeConfigPath(),
			expectedPersistencePaths.runtimeConfigPath
		);
		assert.equal(
			configApi.getHarnessConfig().moduleName,
			"MMM-Autodiscovery"
		);
		assert.equal(
			configApi.getHarnessConfig().moduleEntry,
			"MMM-Autodiscovery.js"
		);
		assert.equal(
			configApi.getHarnessConfig().moduleIdentifier,
			"MMM-Autodiscovery_sandbox"
		);
		assert.deepEqual(configApi.getHarnessConfig().sandbox, {
			startup: ["bootstrap", "translations"]
		});
		assert.deepEqual(configApi.getModuleConfig(), {
			position: "middle_center",
			classes: "",
			header: "",
			animateIn: "",
			animateOut: "",
			hiddenOnStartup: false,
			disabled: false,
			configDeepMerge: false,
			config: {}
		});

		configApi.saveModuleConfig({
			classes: "fixture-shell",
			config: {
				operatorName: "Autodiscovery"
			}
		});
		assert.equal(
			fs.existsSync(expectedPersistencePaths.moduleConfigPath),
			true
		);
		assert.equal(
			fs.existsSync(path.join(tempRoot, "config", "module.config.json")),
			false
		);
	} finally {
		process.chdir(originalCwd);
		restoreEnv("MM_SANDBOX_MOUNTED_MODULE_ROOT", originalRoot);
	}
});

test("createConfigApi validates the supported single-module envelope", () => {
	const tempRoot = fs.mkdtempSync(
		path.join(os.tmpdir(), "magicmirror-module-sandbox-config-")
	);
	const customConfigPath = path.join(tempRoot, "fixture.config.json");
	const customRuntimePath = path.join(tempRoot, "fixture.runtime.json");

	fs.writeFileSync(
		customConfigPath,
		'{\n\t"position": "bottom_right",\n\t"classes": "fixture-shell",\n\t"header": "Fixture header",\n\t"hiddenOnStartup": true,\n\t"disabled": false,\n\t"config": {\n\t\t"operatorName": "Fixture"\n\t}\n}\n',
		"utf8"
	);

	const configApi = createConfigApi({
		/**
		 * Loads harness config.
		 */
		loadHarnessConfig: () =>
			createHarnessConfigStub({
				moduleName: "MMM-EnvelopeFixture",
				moduleEntry: "MMM-EnvelopeFixture.js",
				moduleIdentifier: "MMM-EnvelopeFixture_sandbox",
				configDeepMerge: true
			}),
		/**
		 * Resolves module config path.
		 */
		resolveModuleConfigPath: () => customConfigPath,
		/**
		 * Resolves runtime config path.
		 */
		resolveRuntimeConfigPath: () => customRuntimePath
	});

	assert.equal(configApi.getModuleConfig().position, "bottom_right");
	assert.equal(configApi.getModuleConfig().classes, "fixture-shell");
	assert.equal(configApi.getModuleConfig().header, "Fixture header");
	assert.equal(configApi.getModuleConfig().hiddenOnStartup, true);
	assert.equal(configApi.getModuleConfig().configDeepMerge, true);
	assert.deepEqual(configApi.getModuleConfig().config, {
		operatorName: "Fixture"
	});

	assert.throws(
		() =>
			configApi.saveModuleConfig({
				module: "MMM-TestModule",
				config: {}
			}),
		/not editable/
	);
	assert.throws(
		() => configApi.saveModuleConfig({ position: "sideways", config: {} }),
		/Unsupported module position/
	);
	assert.throws(
		() =>
			configApi.saveModuleConfig({
				animateIn: "fadeSideways",
				config: {}
			}),
		/Unsupported module animateIn value/
	);
});

test("createConfigApi falls back for missing runtime config and ignores env overrides for runtime language", () => {
	const tempRoot = fs.mkdtempSync(
		path.join(os.tmpdir(), "magicmirror-module-sandbox-config-")
	);
	const customConfigPath = path.join(tempRoot, "fixture.config.json");
	const missingRuntimeConfigPath = path.join(
		tempRoot,
		"missing.runtime.json"
	);
	const originalLanguage = process.env.MM_SANDBOX_LANGUAGE;
	const originalLocale = process.env.MM_SANDBOX_LOCALE;

	fs.writeFileSync(
		customConfigPath,
		'{\n\t"operatorName": "Fixture"\n}\n',
		"utf8"
	);

	try {
		const configApi = createConfigApi({
			/**
			 * Loads harness config.
			 */
			loadHarnessConfig: () =>
				createHarnessConfigStub({
					moduleName: "MMM-RuntimeFixture",
					moduleEntry: "MMM-RuntimeFixture.js",
					moduleIdentifier: "MMM-RuntimeFixture_sandbox"
				}),
			/**
			 * Resolves module config path.
			 */
			resolveModuleConfigPath: () => customConfigPath,
			/**
			 * Resolves runtime config path.
			 */
			resolveRuntimeConfigPath: () => missingRuntimeConfigPath
		});

		assert.deepEqual(configApi.getRuntimeConfig(), {
			language: "en",
			locale: "en-US"
		});
		assert.equal(configApi.getHarnessConfig().language, "en");
		assert.equal(configApi.getHarnessConfig().locale, "en-US");

		assert.throws(
			() => configApi.saveRuntimeConfig([]),
			/Runtime config must be a JSON object/
		);
		assert.throws(
			() => configApi.saveRuntimeConfig({ language: "   " }),
			/Runtime language must be a non-empty string/
		);

		process.env.MM_SANDBOX_LANGUAGE = "de";
		process.env.MM_SANDBOX_LOCALE = "de-DE";
		assert.equal(configApi.getHarnessConfig().language, "en");
		assert.equal(configApi.getHarnessConfig().locale, "en-US");
	} finally {
		restoreEnv("MM_SANDBOX_LANGUAGE", originalLanguage);
		restoreEnv("MM_SANDBOX_LOCALE", originalLocale);
	}
});

test("harness config ignores env overrides and follows mounted-module autodetection", async () => {
	const tempRoot = fs.mkdtempSync(
		path.join(os.tmpdir(), "magicmirror-module-sandbox-config-")
	);
	const originalRoot = process.env.MM_SANDBOX_MOUNTED_MODULE_ROOT;
	const originalName = process.env.MM_SANDBOX_MODULE_NAME;
	const originalEntry = process.env.MM_SANDBOX_MODULE_ENTRY;
	const originalIdentifier = process.env.MM_SANDBOX_MODULE_IDENTIFIER;
	const originalConfigDeepMerge = process.env.MM_SANDBOX_CONFIG_DEEP_MERGE;
	const originalLanguage = process.env.MM_SANDBOX_LANGUAGE;
	const originalLocale = process.env.MM_SANDBOX_LOCALE;
	const originalMmVersion = process.env.MM_SANDBOX_MM_VERSION;

	fs.writeFileSync(
		path.join(tempRoot, "package.json"),
		'{\n\t"name": "MMM-TestModule"\n}\n',
		"utf8"
	);
	fs.writeFileSync(
		path.join(tempRoot, "MMM-TestModule.js"),
		'/* global Module */\nModule.register("MMM-TestModule", {});\n',
		"utf8"
	);
	process.env.MM_SANDBOX_MOUNTED_MODULE_ROOT = tempRoot;
	process.env.MM_SANDBOX_LANGUAGE = "es";
	process.env.MM_SANDBOX_LOCALE = "es-MX";
	process.env.MM_SANDBOX_MODULE_NAME = "MMM-OverrideName";
	process.env.MM_SANDBOX_MODULE_ENTRY = "MMM-OverrideEntry.js";
	process.env.MM_SANDBOX_MODULE_IDENTIFIER = "MMM-OverrideIdentifier";
	process.env.MM_SANDBOX_CONFIG_DEEP_MERGE = "true";
	process.env.MM_SANDBOX_MM_VERSION = "9.9.9";

	try {
		const harnessConfigModule = await importFreshCommonJs(
			path.join(repoRoot, "config", "harness.config.js")
		);
		const harnessConfig = harnessConfigModule.createHarnessConfig();
		assert.equal(harnessConfig.language, "en");
		assert.equal(harnessConfig.locale, "en-US");
		assert.equal(harnessConfig.moduleName, "MMM-TestModule");
		assert.equal(harnessConfig.moduleEntry, "MMM-TestModule.js");
		assert.equal(harnessConfig.moduleIdentifier, "MMM-TestModule_sandbox");
		assert.equal(harnessConfig.configDeepMerge, false);
		assert.equal(harnessConfig.mmVersion, "2.36.0");
		assert.deepEqual(harnessConfig.sandbox, {});
	} finally {
		restoreEnv("MM_SANDBOX_MOUNTED_MODULE_ROOT", originalRoot);
		restoreEnv("MM_SANDBOX_LANGUAGE", originalLanguage);
		restoreEnv("MM_SANDBOX_LOCALE", originalLocale);
		restoreEnv("MM_SANDBOX_MODULE_NAME", originalName);
		restoreEnv("MM_SANDBOX_MODULE_ENTRY", originalEntry);
		restoreEnv("MM_SANDBOX_MODULE_IDENTIFIER", originalIdentifier);
		restoreEnv("MM_SANDBOX_CONFIG_DEEP_MERGE", originalConfigDeepMerge);
		restoreEnv("MM_SANDBOX_MM_VERSION", originalMmVersion);
	}
});

test("createConfigApi temp persistence hash changes with mounted module identity", () => {
	const firstRoot = fs.mkdtempSync(
		path.join(os.tmpdir(), "magicmirror-module-sandbox-config-")
	);
	const secondRoot = fs.mkdtempSync(
		path.join(os.tmpdir(), "magicmirror-module-sandbox-config-")
	);

	fs.writeFileSync(
		path.join(firstRoot, "package.json"),
		'{\n\t"name": "MMM-TestModule",\n\t"version": "1.0.0"\n}\n',
		"utf8"
	);
	fs.writeFileSync(
		path.join(firstRoot, "MMM-TestModule.js"),
		'/* global Module */\nModule.register("MMM-TestModule", {});\n',
		"utf8"
	);
	fs.writeFileSync(
		path.join(secondRoot, "package.json"),
		'{\n\t"name": "MMM-TestModule",\n\t"version": "2.0.0"\n}\n',
		"utf8"
	);
	fs.writeFileSync(
		path.join(secondRoot, "MMM-TestModule.js"),
		'/* global Module */\nModule.register("MMM-TestModule", {});\n',
		"utf8"
	);

	const firstPaths = resolveSandboxPersistencePaths(
		resolveMountedModuleInfo(firstRoot)
	);
	const secondPaths = resolveSandboxPersistencePaths(
		resolveMountedModuleInfo(secondRoot)
	);

	assert.notEqual(firstPaths.hash, secondPaths.hash);
	assert.match(
		firstPaths.moduleConfigPath,
		/module\.config\.[0-9a-f]+\.json$/
	);
	assert.match(
		secondPaths.runtimeConfigPath,
		/runtime\.config\.[0-9a-f]+\.json$/
	);
});

test("contract moduleName follows autodetected mounted module and ignores env overrides", async () => {
	const tempRoot = fs.mkdtempSync(
		path.join(os.tmpdir(), "magicmirror-module-sandbox-config-")
	);
	const originalRoot = process.env.MM_SANDBOX_MOUNTED_MODULE_ROOT;
	const originalName = process.env.MM_SANDBOX_MODULE_NAME;

	fs.writeFileSync(
		path.join(tempRoot, "package.json"),
		'{\n\t"name": "MMM-TestModule"\n}\n',
		"utf8"
	);
	fs.writeFileSync(
		path.join(tempRoot, "MMM-TestModule.js"),
		'/* global Module */\nModule.register("MMM-TestModule", {});\n',
		"utf8"
	);
	process.env.MM_SANDBOX_MOUNTED_MODULE_ROOT = tempRoot;
	process.env.MM_SANDBOX_MODULE_NAME = "MMM-OverrideName";

	try {
		const contractModule = await importFreshCommonJs(
			path.join(repoRoot, "config", "contract.js")
		);
		const contract = contractModule.createContract();
		assert.equal(contract.moduleName, "MMM-TestModule");
		assert.match(
			contract.unsupportedMagicMirrorSurface.join(" "),
			/mounted module under test/
		);
	} finally {
		restoreEnv("MM_SANDBOX_MOUNTED_MODULE_ROOT", originalRoot);
		restoreEnv("MM_SANDBOX_MODULE_NAME", originalName);
	}
});

test("harness config fails clearly when neither a mounted module nor preview env is available", async () => {
	const originalRoot = process.env.MM_SANDBOX_MOUNTED_MODULE_ROOT;
	const originalCwd = process.cwd();
	const tempRoot = fs.mkdtempSync(
		path.join(os.tmpdir(), "magicmirror-module-sandbox-missing-module-")
	);

	delete process.env.MM_SANDBOX_MOUNTED_MODULE_ROOT;
	process.chdir(tempRoot);

	try {
		await assert.rejects(async () => {
			const harnessConfigModule = await importFreshCommonJs(
				path.join(repoRoot, "config", "harness.config.js")
			);
			harnessConfigModule.createHarnessConfig();
		}, /No mounted MagicMirror module could be resolved/);
	} finally {
		process.chdir(originalCwd);
		restoreEnv("MM_SANDBOX_MOUNTED_MODULE_ROOT", originalRoot);
	}
});

// ---------------------------------------------------------------------------
// deriveLocale
// ---------------------------------------------------------------------------

test("deriveLocale returns en-US for non-string input", () => {
	assert.equal(deriveLocale(null), "en-US");
	assert.equal(deriveLocale(42), "en-US");
	assert.equal(deriveLocale(undefined), "en-US");
});

test("deriveLocale returns en-US for empty or whitespace string", () => {
	assert.equal(deriveLocale(""), "en-US");
	assert.equal(deriveLocale("   "), "en-US");
});

test("deriveLocale maps known locale codes", () => {
	assert.equal(deriveLocale("pt-br"), "pt-BR");
	assert.equal(deriveLocale("zh-cn"), "zh-CN");
	assert.equal(deriveLocale("zh-tw"), "zh-TW");
	assert.equal(deriveLocale("ms-my"), "ms-MY");
	assert.equal(deriveLocale("en"), "en-US");
});

test("deriveLocale returns language as-is for unknown codes", () => {
	assert.equal(deriveLocale("fr"), "fr");
	assert.equal(deriveLocale("de"), "de");
});

// ---------------------------------------------------------------------------
// deriveMountedModulePersistenceHash
// ---------------------------------------------------------------------------

test("deriveMountedModulePersistenceHash throws for null or invalid input", () => {
	assert.throws(
		() => deriveMountedModulePersistenceHash(null as any),
		/required/
	);
	assert.throws(
		() =>
			deriveMountedModulePersistenceHash({
				moduleName: "",
				rootPath: "/some/path"
			}),
		/required/
	);
	assert.throws(
		() =>
			deriveMountedModulePersistenceHash({
				moduleName: "MMM-X",
				rootPath: ""
			}),
		/required/
	);
});

test("deriveMountedModulePersistenceHash handles missing packageVersion", () => {
	const hash = deriveMountedModulePersistenceHash({
		moduleName: "MMM-X",
		rootPath: "/some/path"
	});
	assert.equal(typeof hash, "string");
	assert.equal(hash.length, 16);
});

// ---------------------------------------------------------------------------
// createConfigApi — sandbox.moduleConfig and config.sandbox.json paths
// ---------------------------------------------------------------------------

test("createConfigApi reads moduleConfig from package.json sandbox.moduleConfig when no temp file exists", () => {
	const tempRoot = fs.mkdtempSync(
		path.join(os.tmpdir(), "magicmirror-module-sandbox-pkg-config-")
	);
	fs.writeFileSync(
		path.join(tempRoot, "package.json"),
		JSON.stringify({
			name: "MMM-PkgConfig",
			sandbox: { moduleConfig: { apiKey: "fixture-key", maxItems: 5 } }
		}),
		"utf8"
	);

	const configApi = createConfigApi({
		loadHarnessConfig: () =>
			createHarnessConfigStub({ moduleName: "MMM-PkgConfig" }),
		resolveActiveModuleInfo: () => ({
			moduleName: "MMM-PkgConfig",
			rootPath: tempRoot,
			packageVersion: "1.0.0"
		}),
		resolveModuleConfigPath: () =>
			path.join(tempRoot, "missing.config.json"),
		resolveRuntimeConfigPath: () =>
			path.join(tempRoot, "missing.runtime.json")
	});

	assert.deepEqual(configApi.getModuleConfig().config, {
		apiKey: "fixture-key",
		maxItems: 5
	});
});

test("createConfigApi reads moduleConfig from config.sandbox.json when it exists in module root", () => {
	const tempRoot = fs.mkdtempSync(
		path.join(os.tmpdir(), "magicmirror-module-sandbox-sandbox-cfg-")
	);
	fs.writeFileSync(
		path.join(tempRoot, "package.json"),
		JSON.stringify({ name: "MMM-SandboxCfg" }),
		"utf8"
	);
	fs.writeFileSync(
		path.join(tempRoot, "config.sandbox.json"),
		JSON.stringify({ config: { fromFile: true } }),
		"utf8"
	);

	const configApi = createConfigApi({
		loadHarnessConfig: () =>
			createHarnessConfigStub({ moduleName: "MMM-SandboxCfg" }),
		resolveActiveModuleInfo: () => ({
			moduleName: "MMM-SandboxCfg",
			rootPath: tempRoot
		}),
		resolveModuleConfigPath: () =>
			path.join(tempRoot, "missing.config.json"),
		resolveRuntimeConfigPath: () =>
			path.join(tempRoot, "missing.runtime.json")
	});

	assert.deepEqual(configApi.getModuleConfig().config, { fromFile: true });
});

test("createConfigApi falls back to empty config when no moduleInfo is available", () => {
	const tempRoot = fs.mkdtempSync(
		path.join(os.tmpdir(), "magicmirror-module-sandbox-no-module-")
	);

	const configApi = createConfigApi({
		loadHarnessConfig: () => createHarnessConfigStub(),
		resolveActiveModuleInfo: () => null,
		resolveModuleConfigPath: () =>
			path.join(tempRoot, "missing.config.json"),
		resolveRuntimeConfigPath: () =>
			path.join(tempRoot, "missing.runtime.json")
	});

	assert.deepEqual(configApi.getModuleConfig().config, {});
});

test("getRuntimeConfig falls back for stored file with invalid language and locale fields", () => {
	const tempRoot = fs.mkdtempSync(
		path.join(os.tmpdir(), "magicmirror-module-sandbox-rt-fallback-")
	);
	const runtimeConfigPath = path.join(tempRoot, "runtime.json");
	fs.writeFileSync(
		runtimeConfigPath,
		JSON.stringify({ language: "  ", locale: null }),
		"utf8"
	);

	const configApi = createConfigApi({
		loadHarnessConfig: () => createHarnessConfigStub(),
		resolveActiveModuleInfo: () => null,
		resolveModuleConfigPath: () =>
			path.join(tempRoot, "missing.config.json"),
		resolveRuntimeConfigPath: () => runtimeConfigPath
	});

	const runtimeConfig = configApi.getRuntimeConfig();
	assert.equal(runtimeConfig.language, "en");
	assert.equal(runtimeConfig.locale, "en-US");
});

test("saveRuntimeConfig derives locale when not provided", () => {
	const tempRoot = fs.mkdtempSync(
		path.join(os.tmpdir(), "magicmirror-module-sandbox-rt-locale-derive-")
	);
	const runtimeConfigPath = path.join(tempRoot, "runtime.json");

	const configApi = createConfigApi({
		loadHarnessConfig: () => createHarnessConfigStub(),
		resolveActiveModuleInfo: () => null,
		resolveModuleConfigPath: () =>
			path.join(tempRoot, "missing.config.json"),
		resolveRuntimeConfigPath: () => runtimeConfigPath
	});

	const saved = configApi.saveRuntimeConfig({ language: "en" });
	assert.equal(saved.language, "en");
	assert.equal(saved.locale, "en-US");
});

test("createConfigApi ignores package.json sandbox when it is an array", () => {
	const tempRoot = fs.mkdtempSync(
		path.join(os.tmpdir(), "magicmirror-module-sandbox-pkg-array-")
	);
	fs.writeFileSync(
		path.join(tempRoot, "package.json"),
		JSON.stringify({ name: "MMM-ArraySandbox", sandbox: ["bad"] }),
		"utf8"
	);

	const configApi = createConfigApi({
		loadHarnessConfig: () => createHarnessConfigStub(),
		resolveActiveModuleInfo: () => ({
			moduleName: "MMM-ArraySandbox",
			rootPath: tempRoot
		}),
		resolveModuleConfigPath: () =>
			path.join(tempRoot, "missing.config.json"),
		resolveRuntimeConfigPath: () =>
			path.join(tempRoot, "missing.runtime.json")
	});

	assert.deepEqual(configApi.getModuleConfig().config, {});
});

test("createConfigApi ignores package.json sandbox.moduleConfig when it is an array", () => {
	const tempRoot = fs.mkdtempSync(
		path.join(os.tmpdir(), "magicmirror-module-sandbox-mc-array-")
	);
	fs.writeFileSync(
		path.join(tempRoot, "package.json"),
		JSON.stringify({
			name: "MMM-McArray",
			sandbox: { moduleConfig: [1, 2] }
		}),
		"utf8"
	);

	const configApi = createConfigApi({
		loadHarnessConfig: () => createHarnessConfigStub(),
		resolveActiveModuleInfo: () => ({
			moduleName: "MMM-McArray",
			rootPath: tempRoot
		}),
		resolveModuleConfigPath: () =>
			path.join(tempRoot, "missing.config.json"),
		resolveRuntimeConfigPath: () =>
			path.join(tempRoot, "missing.runtime.json")
	});

	assert.deepEqual(configApi.getModuleConfig().config, {});
});
