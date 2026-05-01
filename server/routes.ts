/**
 * Fastify route registration for the sandbox shell, stage, assets, and config APIs.
 */

import fastifyStatic from "@fastify/static";
import * as fs from "node:fs";
import * as path from "pathe";
import type { HtmlPageOptions } from "./html.ts";
import { repoRoot, harnessRoot } from "./paths.ts";
import {
	parseConfigSaveBody,
	parseModuleConfigBody
} from "./config-payloads.ts";
import { ValidationError } from "./errors.ts";

type ConfigService = {
	getAvailableLanguages: () => Array<Record<string, unknown>>;
	getHarnessConfig: HtmlPageOptions["getHarnessConfig"];
	getModuleConfig: () => Record<string, unknown>;
	getModuleConfigPath: () => string;
	getRuntimeConfig: () => Record<string, unknown>;
	getRuntimeConfigPath: () => string;
	saveModuleConfig: (nextConfig: Record<string, unknown>) => Record<string, unknown>;
	saveRuntimeConfig: (nextConfig: Record<string, unknown>) => Record<string, unknown>;
	getContract: () => Record<string, unknown>;
};

type AssetService = {
	resolveWebfontsRoot: () => string;
	resolveAnimateCss: () => string;
	resolveCronerPath: () => string;
	resolveMomentPath: () => string;
	resolveMomentTimezonePath: () => string;
	resolveFontAwesomeCss: () => string;
	createHtmlPage: (options: HtmlPageOptions) => string;
	createStagePage: (options: Omit<HtmlPageOptions, "watchEnabled">) => string;
};

type RuntimeService = {
	io: import("socket.io").Server;
	restartHelper: () => Promise<void>;
	watchEnabled: boolean;
	getHelperLogEntries: () => Array<Record<string, unknown>>;
};

type AnalysisService = {
	getAnalysisResult: () => import("./analysis-types.ts").ModuleAnalysisResult | null;
	triggerAnalysis: () => Promise<void>;
};

type RegisterRoutesOptions = {
	app: import("fastify").FastifyInstance;
	configService: ConfigService;
	assetService: AssetService;
	runtimeService: RuntimeService;
	analysisService: AnalysisService;
};

/**
 * Registers routes.
 */
async function registerRoutes({
	app,
	configService,
	assetService,
	runtimeService,
	analysisService
}: RegisterRoutesOptions): Promise<void> {
	const {
		getAvailableLanguages,
		getHarnessConfig,
		getModuleConfig,
		getModuleConfigPath,
		getRuntimeConfig,
		getRuntimeConfigPath,
		saveModuleConfig,
		saveRuntimeConfig,
		getContract
	} = configService;
	const {
		resolveWebfontsRoot,
		resolveAnimateCss,
		resolveCronerPath,
		resolveMomentPath,
		resolveMomentTimezonePath,
		resolveFontAwesomeCss,
		createHtmlPage,
		createStagePage
	} = assetService;
	const { io, restartHelper, watchEnabled, getHelperLogEntries } = runtimeService;
	const { getAnalysisResult, triggerAnalysis } = analysisService;
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
		decorateReply: false,
		setHeaders(res) {
			res.setHeader("Cache-Control", "no-store");
		}
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
				.code(error instanceof ValidationError ? error.statusCode : 500)
				.send({
					error: routeError.message || "Failed to save sandbox config."
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
				.code(error instanceof ValidationError ? error.statusCode : 500)
				.send({
					error: routeError.message || "Failed to save module config."
				});
		}
	});

	app.get("/__harness/analysis", async (_request, reply) => {
		const result = getAnalysisResult();
		if (!result) {
			return reply.code(202).send({ status: "pending" });
		}
		return reply.send(result);
	});

	app.post("/__harness/analysis", async (_request, reply) => {
		// Fire-and-forget — result is pushed to clients via Socket.IO when ready.
		void triggerAnalysis();
		return reply.code(202).send({ status: "pending" });
	});

	app.post("/__harness/restart", async (_request, reply) => {
		const reloadVersion = Date.now().toString(36);
		await restartHelper();
		io.emit("harness:reload", {
			event: "manual-restart",
			scope: "stage",
			version: reloadVersion
		});
		return reply.send({ ok: true });
	});
}

export { registerRoutes };
