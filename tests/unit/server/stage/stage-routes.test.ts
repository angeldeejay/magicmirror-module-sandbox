/**
 * Unit tests for server/stage/stage-routes.ts: the `/__stage/` routes that
 * serve the built-in MagicMirror core page, its endpoints and the mounted
 * module through a real Fastify instance.
 */
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import type { AddressInfo } from "node:net";
import * as os from "node:os";
import fastifyMiddie from "@fastify/middie";
import Fastify, { type FastifyInstance } from "fastify";
import * as path from "pathe";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { resolveMagicMirrorRoot } from "../../../../scripts/shared.ts";
import htmlModule from "../../../../server/html.ts";
import { injectShimResolution } from "../../../../server/helper-runtime.ts";
import { getBuiltInMmVersion } from "../../../../server/mm-version-manager.ts";
import { harnessRoot } from "../../../../server/paths.ts";
import { forgetCoreInstall } from "../../../../server/stage/core-cache.ts";
import {
	type CoreConfigSources,
	renderStageHtml
} from "../../../../server/stage/core-handlers.ts";
import type { ActiveCore } from "../../../../server/stage/core-root.ts";
import { detectCoreVariants } from "../../../../server/stage/core-variants.ts";
import {
	assignCoreGlobalConfig,
	getStageState,
	registerStageRoutes,
	renderStageInjection,
	STAGE_PREFIX
} from "../../../../server/stage/stage-routes.ts";
import { getStageReloadGeneration } from "../../../../server/stage/stage-socket.ts";

const MODULE_NAME = "MMM-TestModule";
const moduleRoot = path.join(harnessRoot, "tests", "_fixtures", MODULE_NAME);
const core: ActiveCore = {
	root: resolveMagicMirrorRoot(harnessRoot),
	version: getBuiltInMmVersion() ?? "",
	key: null
};

const sources: CoreConfigSources = {
	getModuleConfig: () => ({
		position: "top_left",
		header: "",
		config: { operatorName: "Stage" }
	}),
	getRuntimeConfig: () => ({ language: "es", locale: "es-ES" }),
	getHarnessConfig: () => ({ moduleName: MODULE_NAME })
};

async function bootApp(
	options: Partial<Parameters<typeof registerStageRoutes>[1]> = {}
): Promise<FastifyInstance> {
	const app = Fastify({ logger: false });
	await app.register(fastifyMiddie);
	await registerStageRoutes(app, {
		sources,
		moduleName: MODULE_NAME,
		moduleRoot,
		getCore: () => core,
		...options
	});
	await app.ready();
	return app;
}

function sha256(content: Buffer | string): string {
	return crypto.createHash("sha256").update(content).digest("hex");
}

let app: FastifyInstance;

beforeAll(async () => {
	// The core server_functions.js requires `logger` through the shim NODE_PATH,
	// exactly as the server sets it up at startup.
	injectShimResolution();
	// The server assigns global.config before every helper (re)start.
	assignCoreGlobalConfig(sources, () => core);
	app = await bootApp();
});

afterAll(async () => {
	await app.close();
});

describe("stage page", () => {
	test("GET /__stage/ returns the active core index.html with the injection", async () => {
		const response = await app.inject({ method: "GET", url: "/__stage/" });
		expect(response.statusCode).toBe(200);
		expect(response.headers["content-type"]).toContain("text/html");
		expect(response.body).toBe(
			renderStageHtml(
				core,
				detectCoreVariants(core),
				renderStageInjection({
					position: "top_left",
					disabled: false,
					reloadGeneration: getStageReloadGeneration()
				})
			)
		);
		expect(
			renderStageInjection({
				position: "top_left",
				disabled: false,
				reloadGeneration: 4
			})
		).toBe(
			'<!-- module-sandbox:stage --><link rel="stylesheet" href="/__harness/generated/stage-isolation.css"><script type="application/json" id="module-sandbox-stage-state">{"position":"top_left","disabled":false,"reloadGeneration":4}</script><script src="/__harness/generated/stage-observer.js"></script><!-- /module-sandbox:stage -->'
		);
	});

	test("the stage state follows the saved envelope and cannot close its element", () => {
		expect(
			getStageState({
				...sources,
				getModuleConfig: () => ({ disabled: true })
			})
		).toEqual({
			position: "",
			disabled: true,
			reloadGeneration: getStageReloadGeneration()
		});
		expect(
			getStageState({
				...sources,
				getModuleConfig: () => ({ position: 3, disabled: "yes" })
			})
		).toEqual({
			position: "",
			disabled: false,
			reloadGeneration: getStageReloadGeneration()
		});
		expect(
			renderStageInjection({
				position: "</script><script>alert(1)</script>",
				disabled: false,
				reloadGeneration: 0
			})
		).not.toContain("</script><script>alert");
	});

	test("GET /__stage redirects to the prefix so relative core paths resolve", async () => {
		const response = await app.inject({ method: "GET", url: "/__stage" });
		expect(response.statusCode).toBe(302);
		expect(response.headers.location).toBe("/__stage/");
	});
});

describe("core static files", () => {
	test("GET /__stage/js/main.js returns the core file byte-for-byte", async () => {
		const response = await app.inject({
			method: "GET",
			url: "/__stage/js/main.js"
		});
		expect(response.statusCode).toBe(200);
		expect(response.headers["content-type"]).toContain("javascript");
		expect(sha256(response.rawPayload)).toBe(
			sha256(fs.readFileSync(path.join(core.root, "js", "main.js")))
		);
	});

	test("GET /__stage/node_modules/... resolves hoisted vendor files", async () => {
		const response = await app.inject({
			method: "GET",
			url: "/__stage/node_modules/nunjucks/browser/nunjucks.min.js"
		});
		expect(response.statusCode).toBe(200);
	});

	test("paths outside the served core set return 404", async () => {
		for (const url of [
			// Resolvable from the core root, but not a package the core serves.
			"/__stage/node_modules/express/package.json",
			"/__stage/index.html",
			"/__stage/package.json",
			"/__stage/js/missing-file.js",
			"/__stage/js/%2e%2e/package.json",
			"/__stage/modules/MMM-Other/MMM-Other.js"
		]) {
			const response = await app.inject({ method: "GET", url });
			expect(response.statusCode, url).toBe(404);
		}
	});

	test("GET /__stage/config/config.js and /config/config.env return 404, as the core does", async () => {
		for (const url of [
			"/__stage/config/config.js",
			"/__stage/config/config.env",
			"/__stage/config/CONFIG.JS"
		]) {
			const response = await app.inject({ method: "GET", url });
			expect(response.statusCode, url).toBe(404);
		}
	});
});

describe("blocked config files", () => {
	let tmp = "";
	let blockedApp: FastifyInstance;

	beforeAll(async () => {
		// A core whose config/ directory holds the files the stage never serves.
		tmp = fs.realpathSync(
			fs.mkdtempSync(path.join(os.tmpdir(), "stage-routes-"))
		);
		fs.mkdirSync(path.join(tmp, "config"), { recursive: true });
		for (const name of ["config.js", "config.env", "custom.css"]) {
			fs.writeFileSync(path.join(tmp, "config", name), name);
		}
		blockedApp = await bootApp({
			getCore: () => ({ root: tmp, version: "0.0.0", key: null })
		});
	});

	afterAll(async () => {
		await blockedApp.close();
		fs.rmSync(tmp, { recursive: true, force: true });
	});

	test("config.js and config.env stay blocked through empty segments and mixed case", async () => {
		for (const url of [
			"/__stage/config/config.js",
			"/__stage/config/config.env",
			"/__stage/config//config.js",
			"/__stage/config//Config.Env",
			"/__stage//config/CONFIG.js"
		]) {
			const response = await blockedApp.inject({ method: "GET", url });
			expect(response.statusCode, url).toBe(404);
		}
	});

	test("config.js and config.env stay blocked through spellings Win32 opens as the same file", async () => {
		for (const url of [
			"/__stage/config/config.js.",
			"/__stage/config/config.env.",
			"/__stage/config/config.env%20",
			"/__stage/config/config.env::$DATA",
			"/__stage/config/config.env:$DATA",
			"/__stage/config./config.env"
		]) {
			const response = await blockedApp.inject({ method: "GET", url });
			expect(response.statusCode, url).toBe(404);
		}
	});

	test("config.env stays blocked when a link inside config/ reaches it", async () => {
		// A directory junction (a plain symlink off Windows) that leads back
		// to config/, so the request path never names config/config.env.
		fs.symlinkSync(
			path.join(tmp, "config"),
			path.join(tmp, "config", "loop"),
			"junction"
		);
		try {
			for (const url of [
				"/__stage/config/loop/config.env",
				"/__stage/config/loop/config.js"
			]) {
				const response = await blockedApp.inject({ method: "GET", url });
				expect(response.statusCode, url).toBe(404);
			}
			const allowed = await blockedApp.inject({
				method: "GET",
				url: "/__stage/config/loop/custom.css"
			});
			expect(allowed.statusCode).toBe(200);
		} finally {
			fs.rmSync(path.join(tmp, "config", "loop"), {
				recursive: false,
				force: true
			});
		}
	});

	test("other config/ files are still served", async () => {
		const response = await blockedApp.inject({
			method: "GET",
			url: "/__stage/config/custom.css"
		});
		expect(response.statusCode).toBe(200);
		expect(response.body).toBe("custom.css");
	});
});

describe("mounted module", () => {
	test("GET /__stage/modules/MMM-TestModule/MMM-TestModule.js serves the mounted module", async () => {
		const response = await app.inject({
			method: "GET",
			url: "/__stage/modules/MMM-TestModule/MMM-TestModule.js"
		});
		expect(response.statusCode).toBe(200);
		expect(response.body).toBe(
			fs.readFileSync(path.join(moduleRoot, "MMM-TestModule.js"), "utf8")
		);
	});

	test("module translations resolve under the stage prefix", async () => {
		const response = await app.inject({
			method: "GET",
			url: "/__stage/modules/MMM-TestModule/translations/en.json"
		});
		expect(response.statusCode).toBe(200);
		expect(JSON.parse(response.body)).toHaveProperty("GREETING");
	});
});

describe("generated core files", () => {
	test("GET /__stage/config/ serves the core config with the stage basePath", async () => {
		for (const url of ["/__stage/config/", "/__stage/config"]) {
			const response = await app.inject({ method: "GET", url });
			expect(response.statusCode, url).toBe(200);
			expect(response.headers["content-type"]).toContain(
				"application/json"
			);
			const body = JSON.parse(response.body);
			expect(body.basePath).toBe("/__stage/");
			expect(body.language).toBe("es");
			expect(body.modules).toEqual([
				{
					module: MODULE_NAME,
					position: "top_left",
					header: "",
					config: { operatorName: "Stage" }
				}
			]);
		}
	});

	test("GET /__stage/config/basepath.js and /js/positions.js are generated in memory", async () => {
		const basepath = await app.inject({
			method: "GET",
			url: "/__stage/config/basepath.js"
		});
		expect(basepath.statusCode).toBe(200);
		expect(basepath.headers["content-type"]).toContain("javascript");
		expect(basepath.body).toContain('basePath: "/__stage/"');

		const positions = await app.inject({
			method: "GET",
			url: "/__stage/js/positions.js"
		});
		expect(positions.statusCode).toBe(200);
		expect(positions.body).toContain("const modulePositions=[");
		expect(positions.body).toContain('"top_left"');
	});
});

describe("core server_functions endpoints", () => {
	// Express swaps the response prototype, which bypasses Fastify's inject
	// capture, so these endpoints are exercised over a real socket.
	async function listen(target: FastifyInstance): Promise<string> {
		await target.listen({ port: 0, host: "127.0.0.1" });
		const address = target.server.address() as AddressInfo;
		return `http://127.0.0.1:${address.port}`;
	}

	let baseUrl = "";

	beforeAll(async () => {
		baseUrl = await listen(app);
	});

	test("GET /__stage/env answers through the version's own getEnvVars", async () => {
		const response = await fetch(`${baseUrl}/__stage/env`);
		expect(response.status).toBe(200);
		expect(response.headers.get("x-powered-by")).toBeNull();
		expect(await response.json()).toMatchObject({
			modulesDir: "modules",
			defaultModulesDir: "defaultmodules"
		});
	});

	test("GET /__stage/version and /startup answer through the core handlers", async () => {
		const version = await fetch(`${baseUrl}/__stage/version`);
		expect(version.status).toBe(200);
		expect(await version.text()).toBe(
			(globalThis as typeof globalThis & { version?: string }).version
		);

		const first = await fetch(`${baseUrl}/__stage/startup`);
		const second = await fetch(`${baseUrl}/__stage/startup`);
		expect(first.status).toBe(200);
		const startup = await first.text();
		expect(startup).not.toBe("");
		expect(await second.text()).toBe(startup);
	});

	test("GET /__stage/cors follows the version default (disabled)", async () => {
		const response = await fetch(
			`${baseUrl}/__stage/cors?url=https://example.com/`
		);
		expect(response.status).toBe(403);
	});

	test("a version that drops a server_functions export answers 500 naming it and keeps serving", async () => {
		const broken = await bootApp({
			loadServerFunctions: () => {
				throw new Error(
					"MagicMirror 9.9.9 js/server_functions.js does not export getEnvVars."
				);
			}
		});
		try {
			const brokenUrl = await listen(broken);
			const response = await fetch(`${brokenUrl}/__stage/env`);
			expect(response.status).toBe(500);
			expect(await response.text()).toContain("getEnvVars");

			const page = await fetch(`${brokenUrl}/__stage/`);
			expect(page.status).toBe(200);
		} finally {
			await broken.close();
		}
	});

	test("a core without a loadable express answers 500 instead of crashing", async () => {
		const noExpress = await bootApp({
			getCore: () => ({
				...core,
				root: path.join(os.tmpdir(), "no-such-magicmirror-core")
			})
		});
		try {
			const noExpressUrl = await listen(noExpress);
			const response = await fetch(`${noExpressUrl}/__stage/version`);
			expect(response.status).toBe(500);
			expect(await response.text()).toContain("express");
		} finally {
			await noExpress.close();
		}
	});
});

describe("a core replaced on disk", () => {
	// An mmvm-shaped install: versions/<key>/node_modules/magicmirror, with the
	// core's express next to it. Express is linked from the sandbox's own
	// dependencies; only the core files change between the two "downloads".
	let installDir = "";
	let replacedApp: FastifyInstance;
	let replacedUrl = "";

	function writeCore(release: string): void {
		const coreRoot = path.join(installDir, "node_modules", "magicmirror");
		fs.rmSync(coreRoot, { recursive: true, force: true });
		fs.mkdirSync(path.join(coreRoot, "js"), { recursive: true });
		fs.writeFileSync(
			path.join(coreRoot, "package.json"),
			JSON.stringify({ name: "magicmirror", version: release })
		);
		fs.writeFileSync(
			path.join(coreRoot, "index.html"),
			"<html><body><script></script></body></html>"
		);
		fs.writeFileSync(
			path.join(coreRoot, "js", "defaults.js"),
			`module.exports = { release: ${JSON.stringify(release)} };`
		);
		fs.writeFileSync(
			path.join(coreRoot, "js", "server_functions.js"),
			[
				"const reply = (req, res) => res.send(" +
					JSON.stringify(release) +
					");",
				"module.exports = { cors: reply, getVersion: reply, getStartup: reply, getEnvVars: reply };",
				""
			].join("\n")
		);
	}

	beforeAll(async () => {
		installDir = fs.realpathSync(
			fs.mkdtempSync(path.join(os.tmpdir(), "stage-replaced-core-"))
		);
		writeCore("1.0.0-old");
		fs.symlinkSync(
			path.join(harnessRoot, "node_modules", "express"),
			path.join(installDir, "node_modules", "express"),
			"junction"
		);
		const coreRoot = path.join(installDir, "node_modules", "magicmirror");
		replacedApp = await bootApp({
			getCore: () => ({ root: coreRoot, version: "1.0.0", key: "x" })
		});
		await replacedApp.listen({ port: 0, host: "127.0.0.1" });
		const address = replacedApp.server.address() as AddressInfo;
		replacedUrl = `http://127.0.0.1:${address.port}`;
	});

	afterAll(async () => {
		await replacedApp.close();
		fs.rmSync(installDir, { recursive: true, force: true });
	});

	async function servedReleases(): Promise<{
		config: unknown;
		version: string;
	}> {
		const config = await fetch(`${replacedUrl}/__stage/config/`);
		const version = await fetch(`${replacedUrl}/__stage/version`);
		return {
			config: ((await config.json()) as { release?: unknown }).release,
			version: await version.text()
		};
	}

	test("a reinstalled core serves its new defaults and server_functions once forgotten", async () => {
		expect(await servedReleases()).toEqual({
			config: "1.0.0-old",
			version: "1.0.0-old"
		});

		// Replaced on disk, the core's code is still cached in-process.
		writeCore("2.0.0-new");
		expect(await servedReleases()).toEqual({
			config: "1.0.0-old",
			version: "1.0.0-old"
		});

		// deleteVersionCache (redownload, delete-cache) forgets the install.
		forgetCoreInstall(installDir);
		expect(await servedReleases()).toEqual({
			config: "2.0.0-new",
			version: "2.0.0-new"
		});
	});
});

describe("shell stage url", () => {
	test("the shell iframe always loads the stage at /__stage/", () => {
		const html = htmlModule.createHtmlPage({
			getAvailableLanguages: () => [{ code: "en", label: "English" }],
			getHarnessConfig: () => ({
				moduleName: MODULE_NAME,
				moduleEntry: "MMM-TestModule.js",
				moduleIdentifier: "MMM-TestModule_sandbox",
				language: "en"
			}),
			getModuleConfig: () => ({}),
			getContract: () => ({}),
			getHelperLogEntries: () => []
		});
		expect(html).toContain(`src="${STAGE_PREFIX}"`);
	});
});
