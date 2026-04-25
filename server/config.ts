/**
 * Backend-owned config API for sandbox bootstrap state and persisted module/runtime config.
 */

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import { createRequire } from "node:module";
import * as os from "node:os";
import * as path from "node:path";
import { createContract } from "../config/contract.ts";
import { createHarnessConfig } from "../config/harness.config.ts";
import { magicMirrorLanguages } from "../config/magicmirror-languages.ts";
import { normalizeModuleConfig } from "../config/module-options.ts";
import {
	configRoot,
	harnessRoot,
	resolveActiveMountedModuleInfo
} from "./paths.ts";

type MountedModuleInfo = {
	moduleName: string;
	packageVersion?: string;
	rootPath: string;
};

const nodeRequire = createRequire(
	typeof __filename === "string" ? __filename : import.meta.url
);

type JsonObject = Record<string, unknown>;
type RuntimeConfig = {
	language: string;
	locale: string;
};
type HarnessConfig = {
	host: string;
	port: number;
	language: string;
	locale: string;
	moduleName: string;
	moduleEntry: string;
	moduleIdentifier: string;
	sandbox: JsonObject;
	configDeepMerge: boolean;
	mmVersion: string;
	header: string | boolean;
	hiddenOnStartup: boolean;
};
type ConfigApiOptions = {
	loadHarnessConfig?: () => HarnessConfig;
	resolveActiveModuleInfo?: () => MountedModuleInfo | null;
	resolveModuleConfigPath?: (options: {
		mountedModuleInfo: MountedModuleInfo | null;
	}) => string;
	resolveRuntimeConfigPath?: (options: {
		mountedModuleInfo: MountedModuleInfo | null;
	}) => string;
};

/**
 * Resolves typed module path.
 */
function resolveTypedModulePath(
	moduleRoot: string,
	moduleStem: string
): string {
	for (const extension of [".ts", ".js"]) {
		const candidate = path.join(moduleRoot, `${moduleStem}${extension}`);
		if (fs.existsSync(candidate)) {
			return candidate;
		}
	}

	return path.join(moduleRoot, `${moduleStem}.js`);
}

/**
 * Loads fresh.
 */
function loadFresh<T>(modulePath: string): T {
	delete nodeRequire.cache[nodeRequire.resolve(modulePath)];
	return nodeRequire(modulePath) as T;
}

/**
 * Clones json.
 */
function cloneJson<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Internal helper for derive cache key.
 */
function deriveCacheKey(persistedConfig: unknown): string {
	if (!persistedConfig || typeof persistedConfig !== "object") {
		return "default";
	}

	const entries = Object.entries(persistedConfig as JsonObject);
	if (!entries.length) {
		return "default";
	}

	return crypto
		.createHash("sha1")
		.update(JSON.stringify(persistedConfig))
		.digest("hex")
		.slice(0, 12);
}

/**
 * Reads json file.
 */
function readJsonFile<T>(filePath: string): T {
	return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

/**
 * Writes json file.
 */
function writeJsonFile(filePath: string, value: unknown): void {
	fs.mkdirSync(path.dirname(filePath), {
		recursive: true
	});
	fs.writeFileSync(
		filePath,
		`${JSON.stringify(value, null, "\t")}\n`,
		"utf8"
	);
}

/**
 * Internal helper for derive locale.
 */
function deriveLocale(language: unknown): string {
	const normalizedLanguage =
		typeof language === "string" ? language.trim().toLowerCase() : "";
	if (!normalizedLanguage) {
		return "en-US";
	}

	const localeMap: Record<string, string> = {
		en: "en-US",
		"pt-br": "pt-BR",
		"zh-cn": "zh-CN",
		"zh-tw": "zh-TW",
		"ms-my": "ms-MY"
	};
	return localeMap[normalizedLanguage] || normalizedLanguage;
}

/**
 * Internal helper for derive mounted module persistence hash.
 */
function deriveMountedModulePersistenceHash(
	mountedModuleInfo: MountedModuleInfo
): string {
	if (
		!mountedModuleInfo ||
		typeof mountedModuleInfo !== "object" ||
		typeof mountedModuleInfo.moduleName !== "string" ||
		!mountedModuleInfo.moduleName.trim() ||
		typeof mountedModuleInfo.rootPath !== "string" ||
		!mountedModuleInfo.rootPath.trim()
	) {
		throw new TypeError(
			"Mounted module identity is required to derive sandbox persistence paths."
		);
	}

	return crypto
		.createHash("sha1")
		.update(
			JSON.stringify({
				moduleName: mountedModuleInfo.moduleName,
				packageVersion:
					typeof mountedModuleInfo.packageVersion === "string"
						? mountedModuleInfo.packageVersion
						: "",
				rootPath: path.resolve(mountedModuleInfo.rootPath)
			})
		)
		.digest("hex")
		.slice(0, 16);
}

/**
 * Resolves sandbox persistence paths.
 */
function resolveSandboxPersistencePaths(
	mountedModuleInfo: MountedModuleInfo,
	systemTempRoot = os.tmpdir()
): {
	tempRoot: string;
	hash: string;
	moduleConfigPath: string;
	runtimeConfigPath: string;
} {
	const hash = deriveMountedModulePersistenceHash(mountedModuleInfo);
	const tempRoot = path.join(systemTempRoot, "magicmirror-module-sandbox");
	return {
		tempRoot,
		hash,
		moduleConfigPath: path.join(tempRoot, `module.config.${hash}.json`),
		runtimeConfigPath: path.join(tempRoot, `runtime.config.${hash}.json`)
	};
}

/**
 * Creates config api.
 */
function createConfigApi({
	loadHarnessConfig = () => createHarnessConfig() as HarnessConfig,
	resolveActiveModuleInfo = () => resolveActiveMountedModuleInfo(),
	resolveModuleConfigPath = ({ mountedModuleInfo }) =>
		resolveSandboxPersistencePaths(mountedModuleInfo as MountedModuleInfo)
			.moduleConfigPath,
	resolveRuntimeConfigPath = ({ mountedModuleInfo }) =>
		resolveSandboxPersistencePaths(mountedModuleInfo as MountedModuleInfo)
			.runtimeConfigPath
}: ConfigApiOptions = {}) {
	const mountedModuleInfo = resolveActiveModuleInfo();
	const moduleConfigPath = resolveModuleConfigPath({
		mountedModuleInfo
	});
	const runtimeConfigPath = resolveRuntimeConfigPath({
		mountedModuleInfo
	});

	/**
	 * Gets available languages.
	 */
	function getAvailableLanguages(): Array<{ code: string; label: string }> {
		return cloneJson(magicMirrorLanguages);
	}

	/**
	 * Gets runtime config.
	 */
	function getRuntimeConfig(): RuntimeConfig {
		if (!fs.existsSync(runtimeConfigPath)) {
			return {
				language: "en",
				locale: deriveLocale("en")
			};
		}

		const runtimeConfig = cloneJson(
			readJsonFile<JsonObject>(runtimeConfigPath)
		);
		return {
			language:
				typeof runtimeConfig.language === "string" &&
				runtimeConfig.language.trim()
					? runtimeConfig.language.trim().toLowerCase()
					: "en",
			locale:
				typeof runtimeConfig.locale === "string" &&
				runtimeConfig.locale.trim()
					? runtimeConfig.locale.trim()
					: deriveLocale(runtimeConfig.language)
		};
	}

	/**
	 * Gets harness config.
	 */
	function getHarnessConfig(): HarnessConfig {
		const baseHarnessConfig = loadHarnessConfig();
		const runtimeConfig = getRuntimeConfig();
		return {
			...baseHarnessConfig,
			language:
				typeof runtimeConfig.language === "string"
					? runtimeConfig.language
					: baseHarnessConfig.language,
			locale:
				typeof runtimeConfig.locale === "string"
					? runtimeConfig.locale
					: baseHarnessConfig.locale ||
						deriveLocale(baseHarnessConfig.language)
		};
	}

	/**
	 * Gets contract.
	 */
	function getContract(): JsonObject {
		return cloneJson(createContract());
	}

	/**
	 * Gets harness cache dir.
	 */
	function getHarnessCacheDir(): string {
		const moduleConfig = getModuleConfig();
		const persistedConfig =
			moduleConfig &&
			typeof moduleConfig.config === "object" &&
			moduleConfig.config &&
			!Array.isArray(moduleConfig.config)
				? (moduleConfig.config as JsonObject)
				: {};
		const cacheKey = deriveCacheKey(persistedConfig);
		return path.join(harnessRoot, ".runtime-cache", cacheKey || "default");
	}

	/**
	 * Gets module config.
	 */
	function getModuleConfig(): Record<string, unknown> {
		if (!fs.existsSync(moduleConfigPath)) {
			return normalizeModuleConfig(
				{},
				{
					defaultConfigDeepMerge: getHarnessConfig().configDeepMerge
				}
			);
		}

		return normalizeModuleConfig(readJsonFile(moduleConfigPath), {
			defaultConfigDeepMerge: getHarnessConfig().configDeepMerge
		});
	}

	/**
	 * Gets module config path.
	 */
	function getModuleConfigPath(): string {
		return moduleConfigPath;
	}

	/**
	 * Gets runtime config path.
	 */
	function getRuntimeConfigPath(): string {
		return runtimeConfigPath;
	}

	/**
	 * Saves module config.
	 */
	function saveModuleConfig(nextConfig: unknown): Record<string, unknown> {
		const normalizedConfig = normalizeModuleConfig(nextConfig, {
			defaultConfigDeepMerge: getHarnessConfig().configDeepMerge
		});
		writeJsonFile(moduleConfigPath, normalizedConfig);
		return cloneJson(normalizedConfig);
	}

	/**
	 * Saves runtime config.
	 */
	function saveRuntimeConfig(nextConfig: unknown): RuntimeConfig {
		if (
			!nextConfig ||
			typeof nextConfig !== "object" ||
			Array.isArray(nextConfig)
		) {
			throw new TypeError("Runtime config must be a JSON object.");
		}

		const nextRuntimeConfig = nextConfig as JsonObject;
		const nextLanguage =
			typeof nextRuntimeConfig.language === "string"
				? nextRuntimeConfig.language.trim().toLowerCase()
				: "";
		if (!nextLanguage) {
			throw new TypeError("Runtime language must be a non-empty string.");
		}

		const isSupported = getAvailableLanguages().some((language) => {
			return language.code === nextLanguage;
		});
		if (!isSupported) {
			throw new RangeError(
				`Unsupported runtime language: ${nextLanguage}`
			);
		}

		const savedConfig: RuntimeConfig = {
			language: nextLanguage,
			locale:
				typeof nextRuntimeConfig.locale === "string" &&
				nextRuntimeConfig.locale.trim()
					? nextRuntimeConfig.locale.trim()
					: deriveLocale(nextLanguage)
		};
		writeJsonFile(runtimeConfigPath, savedConfig);
		return cloneJson(savedConfig);
	}

	return {
		loadFresh,
		getAvailableLanguages,
		getHarnessConfig,
		getContract,
		getHarnessCacheDir,
		getModuleConfig,
		getModuleConfigPath,
		getRuntimeConfig,
		getRuntimeConfigPath,
		saveModuleConfig,
		saveRuntimeConfig
	};
}

export {
	createConfigApi,
	deriveLocale,
	deriveMountedModulePersistenceHash,
	resolveSandboxPersistencePaths
};

export default {
	createConfigApi,
	deriveLocale,
	deriveMountedModulePersistenceHash,
	resolveSandboxPersistencePaths
};
