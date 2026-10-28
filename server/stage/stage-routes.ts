/**
 * Fastify routes for the stage under `/__stage/`, which runs the active
 * MagicMirror core itself.
 *
 * The stage serves the active MagicMirror core page and its static files
 * verbatim, the generated core files (`config/basepath.js`,
 * `js/positions.js`) from memory, the `/config/` JSON, the version's own
 * `server_functions.js` endpoints and the mounted module under
 * `modules/<ModuleName>/`. `basePath` is `/__stage/`, so every relative path
 * the core page requests lands here. The stage socket server
 * (`stage-socket.ts`) answers `/__stage/socket.io` before Fastify sees it.
 *
 * This is the only stage: every MagicMirror version, the built-in core
 * included, runs through it.
 */

import * as fs from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createRequire } from "node:module";
import fastifyStatic from "@fastify/static";
import type { FastifyInstance } from "fastify";
import * as path from "pathe";
import {
	STAGE_STATE_ELEMENT_ID,
	type StageState
} from "../../config/stage-state.ts";
import {
	buildCoreConfig,
	buildCoreConfigObjects,
	type CoreConfigSources,
	type CoreServerFunctions,
	getCoreServerFunctions,
	renderBasepathJs,
	renderPositionsJs,
	renderStageHtml
} from "./core-handlers.ts";
import { isInsideInstall, onCoreForgotten } from "./core-cache.ts";
import {
	type ActiveCore,
	resolveActiveCore,
	resolveCoreStaticPath
} from "./core-root.ts";
import { detectCoreVariants } from "./core-variants.ts";
import { serializeStageState } from "./stage-state-schema.ts";

/** Stage prefix, also the `basePath` served to the core. */
export const STAGE_PREFIX = "/__stage/";

/**
 * The single sandbox injection point placed before the first core `<script>`:
 * the isolation stylesheet, the sandbox stage state (inline JSON, read by the
 * observer) and the browser observer.
 */
export function renderStageInjection(state: StageState): string {
	return `<!-- module-sandbox:stage --><link rel="stylesheet" href="/__harness/generated/stage-isolation.css"><script type="application/json" id="${STAGE_STATE_ELEMENT_ID}">${serializeStageState(state)}</script><script src="/__harness/generated/stage-observer.js"></script><!-- /module-sandbox:stage -->`;
}

/**
 * Reads the stage state from the saved module envelope.
 */
export function getStageState(sources: CoreConfigSources): StageState {
	const envelope = sources.getModuleConfig();
	return {
		position:
			typeof envelope.position === "string" ? envelope.position : "",
		disabled: envelope.disabled === true
	};
}

/**
 * Endpoints answered by the version's `js/server_functions.js`, keyed by the
 * path the core server registers them on (`js/server.js`).
 */
const SERVER_FUNCTION_ROUTES = {
	"/env": "getEnvVars",
	"/startup": "getStartup",
	"/version": "getVersion",
	"/cors": "cors"
} as const satisfies Record<string, keyof CoreServerFunctions>;

/**
 * Config files the stage never exposes. The sandbox has no user `config.js`
 * and `config.env` holds secrets, so both answer 404.
 */
const BLOCKED_CORE_FILES = new Set(["config/config.js", "config/config.env"]);

/**
 * Whether a resolved core file is one of `BLOCKED_CORE_FILES` under its
 * canonical name. The request path is checked too, but another spelling can
 * open the same file (a link inside `config/`, a Windows short name), so the
 * final path the file system reports is compared as well. Win32 aliases such
 * as a trailing dot or an NTFS stream never get here: `resolveCoreStaticPath`
 * refuses them.
 */
function isBlockedCoreFile(core: ActiveCore, filePath: string): boolean {
	let relative: string;
	try {
		relative = path.relative(
			fs.realpathSync.native(core.root),
			fs.realpathSync.native(filePath)
		);
	} catch {
		// Unresolvable: refuse rather than serve something unchecked.
		return true;
	}
	return BLOCKED_CORE_FILES.has(relative.toLowerCase());
}

type NextFunction = (error?: unknown) => void;
type Middleware = (
	req: IncomingMessage,
	res: ServerResponse,
	next: NextFunction
) => void;
type ExpressResponse = ServerResponse & {
	status: (code: number) => ExpressResponse;
	type: (value: string) => ExpressResponse;
	send: (body: string) => ExpressResponse;
};
type ExpressApp = Middleware & {
	disable: (setting: string) => void;
	get: (
		route: string,
		handler: (
			req: IncomingMessage,
			res: ExpressResponse,
			next: NextFunction
		) => void
	) => void;
};

export type StageRoutesOptions = {
	/** Sources of the config served to the core (module envelope, runtime). */
	sources: CoreConfigSources;
	moduleName: string;
	/** Mounted module root, served at `/__stage/modules/<moduleName>/`. */
	moduleRoot: string;
	/** Active core resolver; defaults to `resolveActiveCore`. */
	getCore?: () => ActiveCore;
	/** Loader of the version's server_functions; overridable for tests. */
	loadServerFunctions?: (core: ActiveCore) => CoreServerFunctions;
};

/**
 * Assigns the active core's `fullConf` to `global.config`, as core
 * `js/app.js` does once before loading helpers. The sandbox calls it before
 * every helper (re)start; `getEnvVars` and `cors` read it too.
 */
export function assignCoreGlobalConfig(
	sources: CoreConfigSources,
	getCore: () => ActiveCore = resolveActiveCore
): void {
	(globalThis as typeof globalThis & { config?: unknown }).config =
		buildCoreConfigObjects(getCore(), STAGE_PREFIX, sources).fullConf;
}

/**
 * Creates the express sub-app answering the server_functions endpoints of one
 * core, built from that version's own bundled express.
 *
 * The handlers load lazily on the first request, after the helper runtime put
 * `logger` on NODE_PATH. A version whose server_functions.js lacks an export
 * answers 500 naming it instead of crashing the server.
 */
function createServerFunctionsApp(
	core: ActiveCore,
	loadServerFunctions: (core: ActiveCore) => CoreServerFunctions
): ExpressApp {
	const express = createRequire(path.join(core.root, "package.json"))(
		"express"
	) as () => ExpressApp;
	const subApp = express();
	// Core js/server.js mounts helmet, which drops this header.
	subApp.disable("x-powered-by");

	let functions: CoreServerFunctions | null = null;
	for (const [route, name] of Object.entries(SERVER_FUNCTION_ROUTES)) {
		subApp.get(route, (req, res, next) => {
			try {
				functions ??= loadServerFunctions(core);
			} catch (error) {
				res.status(500)
					.type("text/plain")
					.send((error as Error).message);
				return;
			}
			Promise.resolve()
				.then(() => functions?.[name](req, res))
				.catch(next);
		});
	}
	return subApp;
}

/**
 * Registers the stage routes. `@fastify/middie` must already be registered on
 * `app`; the server_functions endpoints run through it.
 */
export async function registerStageRoutes(
	app: FastifyInstance,
	{
		sources,
		moduleName,
		moduleRoot,
		getCore = resolveActiveCore,
		loadServerFunctions = getCoreServerFunctions
	}: StageRoutesOptions
): Promise<void> {
	const serverFunctionApps = new Map<string, ExpressApp>();
	// A core replaced on disk must not keep answering with its old code.
	const stopForgetting = onCoreForgotten((installPrefix) => {
		for (const root of serverFunctionApps.keys()) {
			if (isInsideInstall(installPrefix, root)) {
				serverFunctionApps.delete(root);
			}
		}
	});
	app.addHook("onClose", async () => {
		stopForgetting();
	});
	const getServerFunctionsApp = (core: ActiveCore): ExpressApp => {
		let subApp = serverFunctionApps.get(core.root);
		if (!subApp) {
			subApp = createServerFunctionsApp(core, loadServerFunctions);
			serverFunctionApps.set(core.root, subApp);
		}
		return subApp;
	};

	(app as unknown as { use: (prefix: string, fn: Middleware) => void }).use(
		STAGE_PREFIX.slice(0, -1),
		(req, res, next) => {
			const pathname = (req.url ?? "").split("?")[0];
			if (!Object.hasOwn(SERVER_FUNCTION_ROUTES, pathname)) {
				next();
				return;
			}
			let subApp: ExpressApp;
			try {
				subApp = getServerFunctionsApp(getCore());
			} catch (error) {
				// The version bundles no loadable express.
				res.statusCode = 500;
				res.setHeader("Content-Type", "text/plain; charset=utf-8");
				res.end((error as Error).message);
				return;
			}
			subApp(req, res, next);
		}
	);

	app.get("/__stage", async (_request, reply) => {
		return reply.redirect(STAGE_PREFIX);
	});

	app.get(STAGE_PREFIX, async (_request, reply) => {
		const core = getCore();
		reply.type("text/html; charset=utf-8");
		reply.header("Cache-Control", "no-store");
		return renderStageHtml(
			core,
			detectCoreVariants(core),
			renderStageInjection(getStageState(sources))
		);
	});

	for (const url of [`${STAGE_PREFIX}config`, `${STAGE_PREFIX}config/`]) {
		app.get(url, async (_request, reply) => {
			const core = getCore();
			reply.type("application/json; charset=utf-8");
			return buildCoreConfig(
				core,
				detectCoreVariants(core),
				STAGE_PREFIX,
				sources
			);
		});
	}

	app.get(`${STAGE_PREFIX}config/basepath.js`, async (_request, reply) => {
		reply.type("application/javascript; charset=utf-8");
		return renderBasepathJs(STAGE_PREFIX, detectCoreVariants(getCore()));
	});

	app.get(`${STAGE_PREFIX}js/positions.js`, async (_request, reply) => {
		const core = getCore();
		reply.type("application/javascript; charset=utf-8");
		return renderPositionsJs(core, detectCoreVariants(core));
	});

	await app.register(fastifyStatic, {
		root: moduleRoot,
		prefix: `${STAGE_PREFIX}modules/${moduleName}/`,
		decorateReply: false
	});

	// Encapsulated so `reply.sendFile` does not leak to the rest of the app.
	await app.register(async (scope) => {
		await scope.register(fastifyStatic, {
			root: moduleRoot,
			serve: false
		});
		scope.get(`${STAGE_PREFIX}*`, async (request, reply) => {
			const requestPath = (request.params as { "*": string })["*"];
			const core = getCore();
			// Compared with empty segments collapsed, as resolveCoreStaticPath
			// does, and lower-cased: Windows and macOS file systems ignore case.
			const normalizedPath = requestPath
				.split("/")
				.filter(Boolean)
				.join("/")
				.toLowerCase();
			const filePath = BLOCKED_CORE_FILES.has(normalizedPath)
				? null
				: resolveCoreStaticPath(core, requestPath);
			if (
				!filePath ||
				!fs.statSync(filePath, { throwIfNoEntry: false })?.isFile() ||
				isBlockedCoreFile(core, filePath)
			) {
				return reply.callNotFound();
			}
			return reply.sendFile(
				path.basename(filePath),
				path.dirname(filePath)
			);
		});
	});
}
