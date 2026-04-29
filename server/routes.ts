/**
 * Fastify route registration for the sandbox shell, stage, assets, and config APIs.
 */

import fastifyStatic from "@fastify/static";
import * as fs from "node:fs";
import * as path from "node:path";
import type { HtmlPageOptions } from "./html.ts";
import { repoRoot, harnessRoot } from "./paths.ts";
import {
	parseConfigSaveBody,
	parseModuleConfigBody
} from "./config-payloads.ts";

type RegisterRoutesOptions = {
	app: import("fastify").FastifyInstance;
	getAvailableLanguages: () => Array<Record<string, unknown>>;
	getHarnessConfig: HtmlPageOptions["getHarnessConfig"];
	getModuleConfig: () => Record<string, unknown>;
	getModuleConfigPath: () => string;
	getRuntimeConfig: () => Record<string, unknown>;
	getRuntimeConfigPath: () => string;
	saveModuleConfig: (
		nextConfig: Record<string, unknown>
	) => Record<string, unknown>;
	saveRuntimeConfig: (
		nextConfig: Record<string, unknown>
	) => Record<string, unknown>;
	getContract: () => Record<string, unknown>;
	createHtmlPage: (options: HtmlPageOptions) => string;
	createStagePage: (options: Omit<HtmlPageOptions, "watchEnabled">) => string;
	getHelperLogEntries: () => Array<Record<string, unknown>>;
	resolveWebfontsRoot: () => string;
	resolveAnimateCss: () => string;
	resolveCronerPath: () => string;
	resolveMomentPath: () => string;
	resolveMomentTimezonePath: () => string;
	resolveFontAwesomeCss: () => string;
	io: import("socket.io").Server;
	restartHelper: () => Promise<void>;
	watchEnabled: boolean;
};

/**
 * Registers routes.
 */
async function registerRoutes({
	app,
	getAvailableLanguages,
	getHarnessConfig,
	getModuleConfig,
	getModuleConfigPath,
	getRuntimeConfig,
	getRuntimeConfigPath,
	saveModuleConfig,
	saveRuntimeConfig,
	getContract,
	createHtmlPage,
	createStagePage,
	getHelperLogEntries,
	resolveWebfontsRoot,
	resolveAnimateCss,
	resolveCronerPath,
	resolveMomentPath,
	resolveMomentTimezonePath,
	resolveFontAwesomeCss,
	io,
	restartHelper,
	watchEnabled
}: RegisterRoutesOptions): Promise<void> {
	const harnessConfig = getHarnessConfig();

	await app.register(fastifyStatic, {
		root: repoRoot,
		prefix: `/modules/${harnessConfig.moduleName}/`,
		decorateReply: false
	});
	await app.register(fastifyStatic, {
		root: resolveWebfontsRoot(),
		prefix: "/webfonts/",
		decorateReply: false
	});
	await app.register(fastifyStatic, {
		root: path.join(harnessRoot, "client"),
		prefix: "/__harness/",
		decorateReply: false
	});

	app.get("/", async (_request, reply) => {
		reply.type("text/html; charset=utf-8");
		return createHtmlPage({
			watchEnabled,
			getAvailableLanguages,
			getHarnessConfig,
			getModuleConfig,
			getContract,
			getHelperLogEntries
		});
	});

	app.get("/__harness/stage", async (_request, reply) => {
		reply.type("text/html; charset=utf-8");
		return createStagePage({
			getAvailableLanguages,
			getHarnessConfig,
			getModuleConfig,
			getContract,
			getHelperLogEntries
		});
	});

	app.get("/moment.js", async (_request, reply) => {
		reply.type("application/javascript; charset=utf-8");
		return reply.send(fs.createReadStream(resolveMomentPath()));
	});

	app.get("/animate.css", async (_request, reply) => {
		reply.type("text/css; charset=utf-8");
		return reply.send(fs.createReadStream(resolveAnimateCss()));
	});

	app.get("/croner.js", async (_request, reply) => {
		reply.type("application/javascript; charset=utf-8");
		return reply.send(fs.createReadStream(resolveCronerPath()));
	});

	app.get("/moment-timezone.js", async (_request, reply) => {
		reply.type("application/javascript; charset=utf-8");
		return reply.send(fs.createReadStream(resolveMomentTimezonePath()));
	});

	app.get("/font-awesome.css", async (_request, reply) => {
		reply.type("text/css; charset=utf-8");
		return reply.send(fs.createReadStream(resolveFontAwesomeCss()));
	});

	app.get("/__harness/config", async (_request, reply) => {
		return reply.send({
			availableLanguages: getAvailableLanguages(),
			harnessConfig: getHarnessConfig(),
			runtimeConfig: getRuntimeConfig(),
			moduleConfig: getModuleConfig(),
			contract: getContract()
		});
	});

	app.post("/__harness/config/save", async (request, reply) => {
		try {
			const {
				moduleConfig: nextModuleConfig,
				runtimeConfig: nextRuntimeConfig
			} = parseConfigSaveBody(request.body);
			const savedModuleConfig = saveModuleConfig(nextModuleConfig);
			const savedRuntimeConfig = saveRuntimeConfig(nextRuntimeConfig);
			const relativeModuleConfigPath = path.relative(
				repoRoot,
				getModuleConfigPath()
			);
			const relativeRuntimeConfigPath = path.relative(
				repoRoot,
				getRuntimeConfigPath()
			);
			const reloadVersion = Date.now().toString(36);

			if (!watchEnabled) {
				await restartHelper();
				io.emit("harness:reload", {
					event: "manual-save",
					file: relativeModuleConfigPath,
					scope: "stage",
					version: reloadVersion
				});
			}

			return reply.send({
				ok: true,
				moduleConfig: savedModuleConfig,
				runtimeConfig: savedRuntimeConfig,
				harnessConfig: getHarnessConfig(),
				moduleConfigPath: relativeModuleConfigPath,
				runtimeConfigPath: relativeRuntimeConfigPath,
				reloadMode: watchEnabled ? "watch" : "immediate"
			});
		} catch (error) {
			const routeError = error as Error;
			return reply
				.code(
					error instanceof TypeError || error instanceof RangeError
						? 400
						: 500
				)
				.send({
					error:
						routeError.message || "Failed to save sandbox config."
				});
		}
	});

	app.post("/__harness/config/module", async (request, reply) => {
		try {
			const savedConfig = saveModuleConfig(
				parseModuleConfigBody(request.body)
			);
			const relativeConfigPath = path.relative(
				repoRoot,
				getModuleConfigPath()
			);
			const reloadVersion = Date.now().toString(36);

			if (!watchEnabled) {
				await restartHelper();
				io.emit("harness:reload", {
					event: "manual-save",
					file: relativeConfigPath,
					scope: "stage",
					version: reloadVersion
				});
			}

			return reply.send({
				ok: true,
				moduleConfig: savedConfig,
				moduleConfigPath: relativeConfigPath,
				reloadMode: watchEnabled ? "watch" : "immediate"
			});
		} catch (error) {
			const routeError = error as Error;
			return reply
				.code(
					error instanceof TypeError || error instanceof RangeError
						? 400
						: 500
				)
				.send({
					error: routeError.message || "Failed to save module config."
				});
		}
	});
}

export { registerRoutes };
