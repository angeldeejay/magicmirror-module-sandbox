/**
 * Handlers for the endpoints the MagicMirror core page requests, answered by
 * the sandbox instead of booting the core's own `js/server.js`.
 *
 * Each handler ports one piece of core server logic per reviewed variant (see
 * `core-variants.ts`) or loads the version's own implementation
 * (`js/server_functions.js`). Nothing is ever written into a core directory:
 * `config/basepath.js` and `js/positions.js` are generated in memory.
 */

import * as fs from "node:fs";
import { createRequire } from "node:module";
import * as path from "pathe";
import { createConfigApi } from "../config.ts";
import type { ActiveCore } from "./core-root.ts";
import type { CoreVariants } from "./core-variants.ts";

type JsonObject = Record<string, unknown>;

export type CoreConfigSources = {
	/** Mounted module envelope (position, header, classes, config, ...). */
	getModuleConfig: () => JsonObject;
	/** Sandbox runtime language and locale. */
	getRuntimeConfig: () => { language: string; locale: string };
	/** Harness config; only the mounted module name is used. */
	getHarnessConfig: () => { moduleName: string };
};

/** Envelope keys a saved module config carries into the core config. */
const ENVELOPE_KEYS = [
	"position",
	"header",
	"classes",
	"animateIn",
	"animateOut",
	"hiddenOnStartup",
	"disabled",
	"configDeepMerge",
	"config"
] as const;

/** Same placeholder syntax as core `replaceSecretPlaceholder`. */
const SECRET_PLACEHOLDER = /\*\*(SECRET_[^*]+)\*\*/g;

/** Same region scan as core `js/utils.js` `getModulePositions`. */
const REGION_REGEX = /"region ([^"]*)/i;

let defaultSources: CoreConfigSources | null = null;

/**
 * Lazily creates the config service used when no sources are injected.
 */
function getDefaultSources(): CoreConfigSources {
	/* v8 ignore next 3 */
	if (!defaultSources) {
		defaultSources = createConfigApi();
	}
	return defaultSources;
}

/**
 * Creates a require bound to the core root, so its files resolve their own
 * dependencies.
 */
function coreRequire(core: ActiveCore): NodeJS.Require {
	return createRequire(path.join(core.root, "package.json"));
}

/**
 * Returns the core `index.html` as core `getHtml` serves it (`#VERSION#` and
 * `#TESTMODE#` substituted), with the sandbox injection placed right before
 * the first `<script` tag so it runs before any core script.
 */
export function renderStageHtml(
	core: ActiveCore,
	_variants: CoreVariants,
	injection: string
): string {
	let html = fs.readFileSync(path.join(core.root, "index.html"), {
		encoding: "utf8"
	});
	// Same calls, in the same order, as core js/server_functions.js getHtml.
	html = html.replace("#VERSION#", core.version);
	html = html.replace("#TESTMODE#", "false");

	const firstScript = html.indexOf("<script");
	if (firstScript === -1) {
		throw new Error(
			`MagicMirror ${core.version} index.html has no <script> tag to inject the stage before.`
		);
	}
	return `${html.slice(0, firstScript)}${injection}${html.slice(firstScript)}`;
}

/**
 * Deep-maps every string in a config value, leaving functions and other
 * values as they are.
 */
function mapStrings(value: unknown, map: (input: string) => string): unknown {
	if (typeof value === "string") {
		return map(value);
	}
	if (Array.isArray(value)) {
		return value.map((entry) => mapStrings(entry, map));
	}
	if (value && typeof value === "object") {
		return Object.fromEntries(
			Object.entries(value).map(([key, entry]) => [
				key,
				mapStrings(entry, map)
			])
		);
	}
	return value;
}

/**
 * Restores `**SECRET_*` placeholders from the environment, producing the
 * core's `fullConf`. A secret that is not set keeps its placeholder.
 */
function revealSecrets(config: JsonObject): JsonObject {
	return mapStrings(config, (input) =>
		input.replaceAll(SECRET_PLACEHOLDER, (placeholder, name: string) => {
			return process.env[name] || placeholder;
		})
	) as JsonObject;
}

/**
 * Builds the module entry the core loads: the saved envelope keys plus the
 * mounted module name.
 */
function buildModuleEntry(
	moduleName: string,
	envelope: JsonObject
): JsonObject {
	const entry: JsonObject = { module: moduleName };
	for (const key of ENVELOPE_KEYS) {
		if (Object.hasOwn(envelope, key)) {
			entry[key] = envelope[key];
		}
	}
	return entry;
}

/**
 * Returns the JSON body of `/config/`: the version's own defaults merged with
 * the sandbox runtime language/locale, the stage `basePath` and the mounted
 * module, redacted and serialized as that version's core does.
 *
 * Saved configs hold secrets as `**SECRET_*` placeholders, which is the core's
 * `redactedConf` form; the `fullConf` form restores them from the environment.
 */
export function buildCoreConfig(
	core: ActiveCore,
	variants: CoreVariants,
	basePath: string,
	sources: CoreConfigSources = getDefaultSources()
): string {
	const defaults = coreRequire(core)("./js/defaults.js") as JsonObject;
	const { language, locale } = sources.getRuntimeConfig();
	const moduleEntry = buildModuleEntry(
		sources.getHarnessConfig().moduleName,
		sources.getModuleConfig()
	);
	// Core js/utils.js loadConfig: Object.assign({}, defaults, userConfig).
	const redactedConf: JsonObject = Object.assign({}, defaults, {
		language,
		locale,
		basePath,
		modules: [moduleEntry]
	});
	const fullConf = revealSecrets(redactedConf);

	// Core js/server.js getConfig: 2.35–2.37 redact only with
	// hideConfigSecrets; 2.38+ always serve the redacted config.
	const served =
		variants.redaction === "always" || fullConf.hideConfigSecrets
			? redactedConf
			: fullConf;

	if (variants.config === "plain") {
		// 2.35 res.send(object) → JSON.stringify, which drops functions.
		return JSON.stringify(served);
	}
	return JSON.stringify(served, (_key, value: unknown) => {
		if (typeof value === "function") {
			return { __mmFunction: value.toString() };
		}
		return value;
	});
}

/**
 * Returns `config/basepath.js` as the version's js/utils.js writes it.
 */
export function renderBasepathJs(
	basePath: string,
	variants: Pick<CoreVariants, "basepath">
): string {
	if (variants.basepath === "classic") {
		return `let config = { basePath: "${basePath}"};`;
	}
	return `globalThis.config = { basePath: "${basePath}"};`;
}

/**
 * Discovers the module positions from the core `index.html` with the same
 * line-by-line region scan as core js/utils.js.
 */
function discoverModulePositions(core: ActiveCore): string[] {
	const modulePositions: string[] = [];
	const lines = fs
		.readFileSync(path.join(core.root, "index.html"))
		.toString()
		.split("\n");
	for (const line of lines) {
		const results = REGION_REGEX.exec(line);
		if (results && results.length > 0) {
			const positionName = results[1].replace(" ", "_");
			if (!modulePositions.includes(positionName)) {
				modulePositions.push(positionName);
			}
		}
	}
	return modulePositions;
}

/**
 * Returns `js/positions.js` as the version's js/utils.js writes it.
 */
export function renderPositionsJs(
	core: ActiveCore,
	variants: CoreVariants
): string {
	const modulePositions = discoverModulePositions(core);
	const declaration = `const modulePositions=${JSON.stringify(modulePositions)}`;
	if (variants.positions === "classic") {
		return declaration;
	}
	return `${declaration};\nglobalThis.modulePositions = modulePositions;`;
}

type CoreHandler = (req: unknown, res: unknown) => unknown;

export type CoreServerFunctions = {
	cors: CoreHandler;
	getVersion: CoreHandler;
	getStartup: CoreHandler;
	getEnvVars: CoreHandler;
};

const SERVER_FUNCTION_NAMES = [
	"cors",
	"getVersion",
	"getStartup",
	"getEnvVars"
] as const;

/**
 * Loads the version's own js/server_functions.js and returns the endpoint
 * handlers the stage reuses verbatim.
 */
export function getCoreServerFunctions(core: ActiveCore): CoreServerFunctions {
	const loaded = coreRequire(core)("./js/server_functions.js") as Record<
		string,
		unknown
	>;
	const missing = SERVER_FUNCTION_NAMES.filter(
		(name) => typeof loaded[name] !== "function"
	);
	if (missing.length > 0) {
		throw new Error(
			`MagicMirror ${core.version} js/server_functions.js does not export ${missing.join(", ")}.`
		);
	}
	return {
		cors: loaded.cors as CoreHandler,
		getVersion: loaded.getVersion as CoreHandler,
		getStartup: loaded.getStartup as CoreHandler,
		getEnvVars: loaded.getEnvVars as CoreHandler
	};
}
