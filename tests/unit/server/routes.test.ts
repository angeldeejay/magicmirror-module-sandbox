/**
 * Unit coverage for sandbox Fastify route registration.
 *
 * A real Fastify instance is used for every test so route handler logic,
 * status codes, and content-type headers are exercised against the actual
 * handler code.  External dependencies that require a real filesystem or a
 * live network (@fastify/static, node:fs streams) are mocked at module level.
 */
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import Fastify from "fastify";
import { afterEach } from "vitest";
import * as mmVer from "../../../server/mm-version-manager.ts";

// ---------------------------------------------------------------------------
// mm-version-manager mock — no real npm installs or filesystem I/O
// ---------------------------------------------------------------------------

vi.mock("../../../server/mm-version-manager.ts", () => ({
	getActiveVersion: vi.fn(() => null),
	listCachedVersions: vi.fn(() => []),
	getVersionInfo: vi.fn((key: string) => ({
		key,
		displayVersion: "2.35.0",
		installed: true,
		shimsBuilt: true,
		capabilities: { expressVersion: "4" }
	})),
	getBuiltInMmVersion: vi.fn(() => "2.35.0"),
	deriveCapabilities: vi.fn(() => ({ expressVersion: "4" })),
	isVersionInstalled: vi.fn(() => true),
	downloadVersion: vi.fn(() => ({ ok: true })),
	buildShimsForVersion: vi.fn(async () => ({ ok: true })),
	setActiveVersion: vi.fn(),
	deleteVersionCache: vi.fn(),
	sanitizeVersion: vi.fn((v: string) =>
		v.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-{2,}/g, "-")
	)
}));

// ---------------------------------------------------------------------------
// @fastify/static mock — no real filesystem scanning during registration
// ---------------------------------------------------------------------------

vi.mock("@fastify/static", () => ({
	default: vi.fn(async () => {})
}));

// ---------------------------------------------------------------------------
// node:fs mock — createReadStream returns a readable stub with dummy content
// ---------------------------------------------------------------------------

vi.mock("node:fs", async (importOriginal) => {
	const actual = await importOriginal<typeof import("node:fs")>();
	return {
		...actual,
		/**
		 * Returns a readable stream containing a small dummy payload so Fastify
		 * can pipe a response without touching the real filesystem.
		 *
		 * @returns {Readable}
		 */
		createReadStream: vi.fn(() => {
			return Readable.from(["/* stub */"], { objectMode: false });
		})
	};
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Builds a minimal harness-config stub.
 *
 * @param {object} [overrides]
 * @returns {object}
 */
function makeHarnessConfig(overrides: Record<string, unknown> = {}) {
	return {
		moduleName: "MMM-TestModule",
		moduleEntry: "MMM-TestModule.js",
		moduleIdentifier: "MMM-TestModule_sandbox",
		header: false,
		hiddenOnStartup: false,
		language: "en",
		locale: "en-US",
		...overrides
	};
}

/**
 * Returns the full set of registerRoutes options with sensible defaults,
 * grouped into the facade objects that registerRoutes now expects.
 * Individual tests can pass flat-field overrides; this helper maps them
 * into the correct facade groups automatically.
 *
 * @param {import("fastify").FastifyInstance} app
 * @param {object} [overrides] — flat field overrides, same names as before
 * @returns {object}
 */
function makeRouteOptions(
	app: import("fastify").FastifyInstance,
	overrides: Record<string, unknown> = {}
) {
	const flat = {
		getAvailableLanguages: vi.fn(() => [{ code: "en", label: "English" }]),
		getHarnessConfig: vi.fn(() => makeHarnessConfig()),
		getModuleConfig: vi.fn(() => ({
			position: "middle_center",
			config: {}
		})),
		getModuleConfigPath: vi.fn(() => "/repo/config/module.config.json"),
		getRuntimeConfig: vi.fn(() => ({ language: "en", locale: "en-US" })),
		getRuntimeConfigPath: vi.fn(() => "/repo/config/runtime.config.json"),
		saveModuleConfig: vi.fn((next: Record<string, unknown>) => next),
		saveRuntimeConfig: vi.fn((next: Record<string, unknown>) => next),
		getContract: vi.fn(() => ({ supportedFrontendSurface: [] })),
		createHtmlPage: vi.fn(() => "<html>shell</html>"),
		createStagePage: vi.fn(() => "<html>stage</html>"),
		getHelperLogEntries: vi.fn(() => []),
		resolveWebfontsRoot: vi.fn(() => "/stub/webfonts"),
		resolveAnimateCss: vi.fn(() => "/stub/animate.css"),
		resolveCronerPath: vi.fn(() => "/stub/croner.js"),
		resolveMomentPath: vi.fn(() => "/stub/moment.js"),
		resolveMomentTimezonePath: vi.fn(() => "/stub/moment-timezone.js"),
		resolveFontAwesomeCss: vi.fn(() => "/stub/font-awesome.css"),
		io: { emit: vi.fn() } as { emit: ReturnType<typeof vi.fn> },
		restartHelper: vi.fn(async () => {}),
		injectShimResolution: vi.fn(),
		harnessRoot: "/stub/harness" as string,
		watchEnabled: true as boolean,
		getAnalysisResult: vi.fn(() => null),
		triggerAnalysis: vi.fn(async () => {}),
		...overrides
	};
	return {
		app,
		configService: {
			getAvailableLanguages: flat.getAvailableLanguages as () => Array<
				Record<string, unknown>
			>,
			getHarnessConfig: flat.getHarnessConfig as () => Record<
				string,
				unknown
			>,
			getModuleConfig: flat.getModuleConfig as () => Record<
				string,
				unknown
			>,
			getModuleConfigPath: flat.getModuleConfigPath as () => string,
			getRuntimeConfig: flat.getRuntimeConfig as () => Record<
				string,
				unknown
			>,
			getRuntimeConfigPath: flat.getRuntimeConfigPath as () => string,
			saveModuleConfig: flat.saveModuleConfig as (
				n: Record<string, unknown>
			) => Record<string, unknown>,
			saveRuntimeConfig: flat.saveRuntimeConfig as (
				n: Record<string, unknown>
			) => Record<string, unknown>,
			getContract: flat.getContract as () => Record<string, unknown>
		},
		assetService: {
			resolveWebfontsRoot: flat.resolveWebfontsRoot as () => string,
			resolveAnimateCss: flat.resolveAnimateCss as () => string,
			resolveCronerPath: flat.resolveCronerPath as () => string,
			resolveMomentPath: flat.resolveMomentPath as () => string,
			resolveMomentTimezonePath:
				flat.resolveMomentTimezonePath as () => string,
			resolveFontAwesomeCss: flat.resolveFontAwesomeCss as () => string,
			createHtmlPage: flat.createHtmlPage as (o: object) => string,
			createStagePage: flat.createStagePage as (o: object) => string
		},
		runtimeService: {
			io: flat.io as import("socket.io").Server,
			restartHelper: flat.restartHelper as () => Promise<void>,
			injectShimResolution: flat.injectShimResolution as () => void,
			harnessRoot: flat.harnessRoot as string,
			watchEnabled: flat.watchEnabled,
			getHelperLogEntries: flat.getHelperLogEntries as () => Array<
				Record<string, unknown>
			>
		},
		analysisService: {
			getAnalysisResult: flat.getAnalysisResult as () => null,
			triggerAnalysis: flat.triggerAnalysis as () => Promise<void>
		}
	};
}

/**
 * Creates and readies a fresh Fastify instance, registers all routes using
 * the provided options, and returns the instance for injection-based testing.
 *
 * @param {object} [overrides] — flat field overrides forwarded to makeRouteOptions
 * @returns {Promise<import("fastify").FastifyInstance>}
 */
async function buildApp(overrides: Record<string, unknown> = {}) {
	const { registerRoutes } = await import("../../../server/routes.ts");
	const app = Fastify({ logger: false });
	await registerRoutes(makeRouteOptions(app, overrides));
	await app.ready();
	return app;
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

afterEach(() => {
	vi.restoreAllMocks();
	vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tests — shell page
// ---------------------------------------------------------------------------

test("GET / responds with text/html and delegates to createHtmlPage", async () => {
	const createHtmlPage = vi.fn(() => "<html>shell</html>");
	const app = await buildApp({ createHtmlPage });

	const response = await app.inject({ method: "GET", url: "/" });

	assert.equal(response.statusCode, 200);
	assert.match(response.headers["content-type"] as string, /text\/html/);
	assert.equal(response.body, "<html>shell</html>");
	assert.equal(createHtmlPage.mock.calls.length, 1);
});

// ---------------------------------------------------------------------------
// Tests — stage page
// ---------------------------------------------------------------------------

test("GET /__harness/stage responds with text/html and delegates to createStagePage", async () => {
	const createStagePage = vi.fn(() => "<html>stage</html>");
	const app = await buildApp({ createStagePage });

	const response = await app.inject({
		method: "GET",
		url: "/__harness/stage"
	});

	assert.equal(response.statusCode, 200);
	assert.match(response.headers["content-type"] as string, /text\/html/);
	assert.equal(response.body, "<html>stage</html>");
	assert.equal(createStagePage.mock.calls.length, 1);
});

// ---------------------------------------------------------------------------
// Tests — config GET
// ---------------------------------------------------------------------------

test("GET /__harness/config returns a JSON object with all required config fields", async () => {
	const app = await buildApp({
		getAvailableLanguages: vi.fn(() => [{ code: "en", label: "English" }]),
		getHarnessConfig: vi.fn(() => makeHarnessConfig()),
		getRuntimeConfig: vi.fn(() => ({ language: "en", locale: "en-US" })),
		getModuleConfig: vi.fn(() => ({
			position: "middle_center",
			config: {}
		})),
		getContract: vi.fn(() => ({
			supportedFrontendSurface: ["sendNotification"]
		}))
	});

	const response = await app.inject({
		method: "GET",
		url: "/__harness/config"
	});

	assert.equal(response.statusCode, 200);
	assert.match(
		response.headers["content-type"] as string,
		/application\/json/
	);

	const body = JSON.parse(response.body);
	assert.ok(
		Array.isArray(body.availableLanguages),
		"availableLanguages must be an array"
	);
	assert.ok(
		typeof body.harnessConfig === "object",
		"harnessConfig must be an object"
	);
	assert.ok(
		typeof body.runtimeConfig === "object",
		"runtimeConfig must be an object"
	);
	assert.ok(
		typeof body.moduleConfig === "object",
		"moduleConfig must be an object"
	);
	assert.ok(typeof body.contract === "object", "contract must be an object");
});

// ---------------------------------------------------------------------------
// Tests — POST /__harness/config/save
// ---------------------------------------------------------------------------

test("POST /__harness/config/save with valid body returns 200 ok:true and reloadMode:watch when watchEnabled", async () => {
	const app = await buildApp({ watchEnabled: true });

	const response = await app.inject({
		method: "POST",
		url: "/__harness/config/save",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({
			moduleConfig: { position: "middle_center", config: {} },
			runtimeConfig: { language: "en" }
		})
	});

	assert.equal(response.statusCode, 200);
	const body = JSON.parse(response.body);
	assert.equal(body.ok, true);
	assert.equal(body.reloadMode, "watch");
});

test("POST /__harness/config/save with watchEnabled:true does NOT call restartHelper or io.emit", async () => {
	const restartHelper = vi.fn(async () => {});
	const io = { emit: vi.fn() };
	const app = await buildApp({ watchEnabled: true, restartHelper, io });

	await app.inject({
		method: "POST",
		url: "/__harness/config/save",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({
			moduleConfig: { config: {} },
			runtimeConfig: { language: "en" }
		})
	});

	assert.equal(restartHelper.mock.calls.length, 0);
	assert.equal(io.emit.mock.calls.length, 0);
});

test("POST /__harness/config/save with watchEnabled:false calls restartHelper and io.emit, returns reloadMode:immediate", async () => {
	const restartHelper = vi.fn(async () => {});
	const io = { emit: vi.fn() };
	const app = await buildApp({ watchEnabled: false, restartHelper, io });

	const response = await app.inject({
		method: "POST",
		url: "/__harness/config/save",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({
			moduleConfig: { config: {} },
			runtimeConfig: { language: "en" }
		})
	});

	assert.equal(response.statusCode, 200);
	const body = JSON.parse(response.body);
	assert.equal(body.ok, true);
	assert.equal(body.reloadMode, "immediate");
	assert.equal(restartHelper.mock.calls.length, 1);
	assert.equal(io.emit.mock.calls.length, 1);

	const [eventName, payload] = io.emit.mock.calls[0];
	assert.equal(eventName, "harness:reload");
	assert.equal(payload.event, "manual-save");
	assert.equal(payload.scope, "stage");
	assert.ok(typeof payload.version === "string");
});

test("POST /__harness/config/save with invalid body (moduleConfig is array) returns 400 with error message", async () => {
	const app = await buildApp({ watchEnabled: true });

	const response = await app.inject({
		method: "POST",
		url: "/__harness/config/save",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({
			moduleConfig: [],
			runtimeConfig: { language: "en" }
		})
	});

	assert.equal(response.statusCode, 400);
	const body = JSON.parse(response.body);
	assert.ok(typeof body.error === "string", "error field must be present");
	assert.match(body.error, /Module config/);
});

test("POST /__harness/config/save with invalid body (runtimeConfig is array) returns 400", async () => {
	const app = await buildApp({ watchEnabled: true });

	const response = await app.inject({
		method: "POST",
		url: "/__harness/config/save",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({
			moduleConfig: {},
			runtimeConfig: []
		})
	});

	assert.equal(response.statusCode, 400);
	const body = JSON.parse(response.body);
	assert.match(body.error, /Runtime config/);
});

test("POST /__harness/config/save returns 500 when saveModuleConfig throws an unexpected error", async () => {
	const saveModuleConfig = vi.fn(() => {
		throw new Error("disk full");
	});
	const app = await buildApp({ saveModuleConfig, watchEnabled: true });

	const response = await app.inject({
		method: "POST",
		url: "/__harness/config/save",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({
			moduleConfig: { config: {} },
			runtimeConfig: { language: "en" }
		})
	});

	assert.equal(response.statusCode, 500);
	const body = JSON.parse(response.body);
	assert.ok(typeof body.error === "string");
});

// ---------------------------------------------------------------------------
// Tests — POST /__harness/config/module
// ---------------------------------------------------------------------------

test("POST /__harness/config/module with valid body returns 200 ok:true", async () => {
	const app = await buildApp({ watchEnabled: true });

	const response = await app.inject({
		method: "POST",
		url: "/__harness/config/module",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ position: "bottom_right", config: {} })
	});

	assert.equal(response.statusCode, 200);
	const body = JSON.parse(response.body);
	assert.equal(body.ok, true);
	assert.ok(typeof body.moduleConfigPath === "string");
});

test("POST /__harness/config/module with invalid body (array) returns 400", async () => {
	const app = await buildApp({ watchEnabled: true });

	const response = await app.inject({
		method: "POST",
		url: "/__harness/config/module",
		headers: { "content-type": "application/json" },
		body: JSON.stringify([1, 2, 3])
	});

	assert.equal(response.statusCode, 400);
	const body = JSON.parse(response.body);
	assert.ok(typeof body.error === "string");
});

test("POST /__harness/config/module with watchEnabled:false calls restartHelper and io.emit", async () => {
	const restartHelper = vi.fn(async () => {});
	const io = { emit: vi.fn() };
	const app = await buildApp({ watchEnabled: false, restartHelper, io });

	const response = await app.inject({
		method: "POST",
		url: "/__harness/config/module",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ position: "middle_center", config: {} })
	});

	assert.equal(response.statusCode, 200);
	assert.equal(restartHelper.mock.calls.length, 1);
	assert.equal(io.emit.mock.calls.length, 1);

	const [eventName, payload] = io.emit.mock.calls[0];
	assert.equal(eventName, "harness:reload");
	assert.equal(payload.scope, "stage");
});

test("POST /__harness/config/module with watchEnabled:true does NOT call restartHelper or io.emit", async () => {
	const restartHelper = vi.fn(async () => {});
	const io = { emit: vi.fn() };
	const app = await buildApp({ watchEnabled: true, restartHelper, io });

	await app.inject({
		method: "POST",
		url: "/__harness/config/module",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ config: {} })
	});

	assert.equal(restartHelper.mock.calls.length, 0);
	assert.equal(io.emit.mock.calls.length, 0);
});

test("POST /__harness/config/module returns 500 when saveModuleConfig throws an unexpected error", async () => {
	const saveModuleConfig = vi.fn(() => {
		throw new Error("unexpected write failure");
	});
	const app = await buildApp({ saveModuleConfig, watchEnabled: true });

	const response = await app.inject({
		method: "POST",
		url: "/__harness/config/module",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ config: {} })
	});

	assert.equal(response.statusCode, 500);
});

test("POST /__harness/config/save returns fallback error text when thrown error has an empty message", async () => {
	const saveModuleConfig = vi.fn(() => {
		throw new Error("");
	});
	const app = await buildApp({ saveModuleConfig, watchEnabled: true });

	const response = await app.inject({
		method: "POST",
		url: "/__harness/config/save",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({
			moduleConfig: { config: {} },
			runtimeConfig: { language: "en" }
		})
	});

	assert.equal(response.statusCode, 500);
	const body = JSON.parse(response.body);
	assert.equal(body.error, "Failed to save sandbox config.");
});

test("POST /__harness/config/module returns fallback error text when thrown error has an empty message", async () => {
	const saveModuleConfig = vi.fn(() => {
		throw new Error("");
	});
	const app = await buildApp({ saveModuleConfig, watchEnabled: true });

	const response = await app.inject({
		method: "POST",
		url: "/__harness/config/module",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ config: {} })
	});

	assert.equal(response.statusCode, 500);
	const body = JSON.parse(response.body);
	assert.equal(body.error, "Failed to save module config.");
});

// ---------------------------------------------------------------------------
// Tests — static asset routes
// ---------------------------------------------------------------------------

test("GET /moment.js responds with application/javascript content-type", async () => {
	const app = await buildApp();

	const response = await app.inject({ method: "GET", url: "/moment.js" });

	assert.equal(response.statusCode, 200);
	assert.match(
		response.headers["content-type"] as string,
		/application\/javascript/
	);
});

test("GET /animate.css responds with text/css content-type", async () => {
	const app = await buildApp();

	const response = await app.inject({ method: "GET", url: "/animate.css" });

	assert.equal(response.statusCode, 200);
	assert.match(response.headers["content-type"] as string, /text\/css/);
});

test("GET /croner.js responds with application/javascript content-type", async () => {
	const app = await buildApp();

	const response = await app.inject({ method: "GET", url: "/croner.js" });

	assert.equal(response.statusCode, 200);
	assert.match(
		response.headers["content-type"] as string,
		/application\/javascript/
	);
});

test("GET /moment-timezone.js responds with application/javascript content-type", async () => {
	const app = await buildApp();

	const response = await app.inject({
		method: "GET",
		url: "/moment-timezone.js"
	});

	assert.equal(response.statusCode, 200);
	assert.match(
		response.headers["content-type"] as string,
		/application\/javascript/
	);
});

test("GET /font-awesome.css responds with text/css content-type", async () => {
	const app = await buildApp();

	const response = await app.inject({
		method: "GET",
		url: "/font-awesome.css"
	});

	assert.equal(response.statusCode, 200);
	assert.match(response.headers["content-type"] as string, /text\/css/);
});

// ---------------------------------------------------------------------------
// Tests — POST /__harness/restart
// ---------------------------------------------------------------------------

test("POST /__harness/restart returns 200 with ok:true", async () => {
	const app = await buildApp();

	const response = await app.inject({
		method: "POST",
		url: "/__harness/restart"
	});

	assert.equal(response.statusCode, 200);
	assert.deepEqual(response.json(), { ok: true });
});

test("POST /__harness/restart calls restartHelper and emits harness:reload with scope:stage", async () => {
	const restartHelper = vi.fn(async () => {});
	const io = { emit: vi.fn() };
	const app = await buildApp({ restartHelper, io });

	await app.inject({ method: "POST", url: "/__harness/restart" });

	assert.equal(restartHelper.mock.calls.length, 1);
	assert.equal(io.emit.mock.calls.length, 1);

	const [eventName, payload] = io.emit.mock.calls[0];
	assert.equal(eventName, "harness:reload");
	assert.equal(payload.scope, "stage");
	assert.equal(payload.event, "manual-restart");
	assert.equal(typeof payload.version, "string");
});

// ---------------------------------------------------------------------------
// Tests — static asset routes
// ---------------------------------------------------------------------------

test("static asset routes each invoke their resolver function to locate the file", async () => {
	const resolveMomentPath = vi.fn(() => "/stub/moment.js");
	const resolveAnimateCss = vi.fn(() => "/stub/animate.css");
	const resolveCronerPath = vi.fn(() => "/stub/croner.js");
	const resolveMomentTimezonePath = vi.fn(() => "/stub/moment-timezone.js");
	const resolveFontAwesomeCss = vi.fn(() => "/stub/font-awesome.css");

	const app = await buildApp({
		resolveMomentPath,
		resolveAnimateCss,
		resolveCronerPath,
		resolveMomentTimezonePath,
		resolveFontAwesomeCss
	});

	await app.inject({ method: "GET", url: "/moment.js" });
	await app.inject({ method: "GET", url: "/animate.css" });
	await app.inject({ method: "GET", url: "/croner.js" });
	await app.inject({ method: "GET", url: "/moment-timezone.js" });
	await app.inject({ method: "GET", url: "/font-awesome.css" });

	assert.equal(resolveMomentPath.mock.calls.length, 1);
	assert.equal(resolveAnimateCss.mock.calls.length, 1);
	assert.equal(resolveCronerPath.mock.calls.length, 1);
	assert.equal(resolveMomentTimezonePath.mock.calls.length, 1);
	assert.equal(resolveFontAwesomeCss.mock.calls.length, 1);
});

// ---------------------------------------------------------------------------
// Tests — GET /__harness/analysis
// ---------------------------------------------------------------------------

test("GET /__harness/analysis returns 202 with status:pending when no result is available yet", async () => {
	const getAnalysisResult = vi.fn(() => null);
	const app = await buildApp({ getAnalysisResult });

	const response = await app.inject({
		method: "GET",
		url: "/__harness/analysis"
	});

	assert.equal(response.statusCode, 202);
	const body = JSON.parse(response.body);
	assert.equal(body.status, "pending");
	assert.equal(getAnalysisResult.mock.calls.length, 1);
});

test("GET /__harness/analysis returns 200 with the result when analysis is available", async () => {
	const fakeResult = { errors: [], warnings: [{ message: "test" }] };
	const getAnalysisResult = vi.fn(() => fakeResult);
	const app = await buildApp({ getAnalysisResult });

	const response = await app.inject({
		method: "GET",
		url: "/__harness/analysis"
	});

	assert.equal(response.statusCode, 200);
	const body = JSON.parse(response.body);
	assert.deepEqual(body, fakeResult);
});

// ---------------------------------------------------------------------------
// Tests — POST /__harness/analysis
// ---------------------------------------------------------------------------

test("POST /__harness/analysis returns 202 with status:pending and triggers analysis", async () => {
	const triggerAnalysis = vi.fn(async () => {});
	const app = await buildApp({ triggerAnalysis });

	const response = await app.inject({
		method: "POST",
		url: "/__harness/analysis"
	});

	assert.equal(response.statusCode, 202);
	const body = JSON.parse(response.body);
	assert.equal(body.status, "pending");
});

// ---------------------------------------------------------------------------
// Tests — GET /__harness/mm-versions
// ---------------------------------------------------------------------------

test("GET /__harness/mm-versions returns active:null and usingBuiltIn:true when no active version is set", async () => {
	vi.mocked(mmVer.getActiveVersion).mockReturnValueOnce(null);
	vi.mocked(mmVer.listCachedVersions).mockReturnValueOnce([]);
	const app = await buildApp();

	const response = await app.inject({
		method: "GET",
		url: "/__harness/mm-versions"
	});

	assert.equal(response.statusCode, 200);
	const body = JSON.parse(response.body);
	assert.equal(body.active, null);
	assert.equal(body.usingBuiltIn, true);
	assert.ok(Array.isArray(body.versions));
	assert.ok(typeof body.builtInVersion === "string" || body.builtInVersion === null);
});

test("GET /__harness/mm-versions returns active key and usingBuiltIn:false when a version is active", async () => {
	vi.mocked(mmVer.getActiveVersion).mockReturnValueOnce("2.35.0");
	vi.mocked(mmVer.listCachedVersions).mockReturnValueOnce(["2.35.0"]);
	const app = await buildApp();

	const response = await app.inject({
		method: "GET",
		url: "/__harness/mm-versions"
	});

	assert.equal(response.statusCode, 200);
	const body = JSON.parse(response.body);
	assert.equal(body.active, "2.35.0");
	assert.equal(body.usingBuiltIn, false);
	assert.equal(body.versions.length, 1);
});

test("GET /__harness/mm-versions includes capabilities derived from active version when active is set", async () => {
	vi.mocked(mmVer.getActiveVersion).mockReturnValueOnce("2.35.0");
	vi.mocked(mmVer.listCachedVersions).mockReturnValueOnce(["2.35.0"]);
	const app = await buildApp();

	const response = await app.inject({
		method: "GET",
		url: "/__harness/mm-versions"
	});

	const body = JSON.parse(response.body);
	assert.ok(body.capabilities !== undefined);
});

test("GET /__harness/mm-versions uses deriveCapabilities(builtInVersion) when active version is not in cached list", async () => {
	vi.mocked(mmVer.getActiveVersion).mockReturnValueOnce("unknown-key");
	vi.mocked(mmVer.listCachedVersions).mockReturnValueOnce([]);
	const app = await buildApp();

	const response = await app.inject({
		method: "GET",
		url: "/__harness/mm-versions"
	});

	assert.equal(response.statusCode, 200);
	const body = JSON.parse(response.body);
	assert.ok(body.capabilities !== undefined);
});

// ---------------------------------------------------------------------------
// Tests — POST /__harness/mm-versions/activate
// ---------------------------------------------------------------------------

test("POST /__harness/mm-versions/activate returns 400 when version field is missing", async () => {
	const app = await buildApp();

	const response = await app.inject({
		method: "POST",
		url: "/__harness/mm-versions/activate",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({})
	});

	assert.equal(response.statusCode, 400);
	const body = JSON.parse(response.body);
	assert.ok(typeof body.error === "string");
});

test("POST /__harness/mm-versions/activate returns 400 when version is an empty string", async () => {
	const app = await buildApp();

	const response = await app.inject({
		method: "POST",
		url: "/__harness/mm-versions/activate",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ version: "   " })
	});

	assert.equal(response.statusCode, 400);
});

test("POST /__harness/mm-versions/activate returns 400 when version is not a string", async () => {
	const app = await buildApp();

	const response = await app.inject({
		method: "POST",
		url: "/__harness/mm-versions/activate",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ version: 42 })
	});

	assert.equal(response.statusCode, 400);
});

test("POST /__harness/mm-versions/activate returns 200 and calls restartHelper + io.emit when already installed with shims", async () => {
	const restartHelper = vi.fn(async () => {});
	const io = { emit: vi.fn() };
	vi.mocked(mmVer.isVersionInstalled).mockReturnValueOnce(true);
	vi.mocked(mmVer.getVersionInfo).mockReturnValue({
		key: "2.35.0",
		displayVersion: "2.35.0",
		installed: true,
		shimsBuilt: true,
		capabilities: { expressVersion: "4" } as ReturnType<typeof mmVer.deriveCapabilities>
	});

	const app = await buildApp({ restartHelper, io });

	const response = await app.inject({
		method: "POST",
		url: "/__harness/mm-versions/activate",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ version: "2.35.0" })
	});

	assert.equal(response.statusCode, 200);
	const body = JSON.parse(response.body);
	assert.equal(body.ok, true);
	assert.equal(restartHelper.mock.calls.length, 1);
	assert.ok(io.emit.mock.calls.some(([name]: [string]) => name === "mm:version-changed"));
	assert.ok(io.emit.mock.calls.some(([name]: [string]) => name === "harness:reload"));
});

test("POST /__harness/mm-versions/activate downloads version when not installed then returns 200", async () => {
	vi.mocked(mmVer.isVersionInstalled).mockReturnValueOnce(false);
	vi.mocked(mmVer.downloadVersion).mockReturnValueOnce({ ok: true });
	vi.mocked(mmVer.getVersionInfo).mockReturnValue({
		key: "2.35.0",
		displayVersion: "2.35.0",
		installed: true,
		shimsBuilt: true,
		capabilities: { expressVersion: "4" } as ReturnType<typeof mmVer.deriveCapabilities>
	});

	const app = await buildApp();

	const response = await app.inject({
		method: "POST",
		url: "/__harness/mm-versions/activate",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ version: "2.35.0" })
	});

	assert.equal(response.statusCode, 200);
	assert.equal(vi.mocked(mmVer.downloadVersion).mock.calls.length, 1);
});

test("POST /__harness/mm-versions/activate returns 502 when download fails", async () => {
	vi.mocked(mmVer.isVersionInstalled).mockReturnValueOnce(false);
	vi.mocked(mmVer.downloadVersion).mockReturnValueOnce({
		ok: false,
		error: "npm ERR! 404 Not Found"
	});

	const app = await buildApp();

	const response = await app.inject({
		method: "POST",
		url: "/__harness/mm-versions/activate",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ version: "9.99.99" })
	});

	assert.equal(response.statusCode, 502);
	const body = JSON.parse(response.body);
	assert.match(body.error, /Download failed/);
});

test("POST /__harness/mm-versions/activate builds shims when not yet built then returns 200", async () => {
	vi.mocked(mmVer.isVersionInstalled).mockReturnValueOnce(true);
	vi.mocked(mmVer.getVersionInfo).mockReturnValueOnce({
		key: "2.35.0",
		displayVersion: "2.35.0",
		installed: true,
		shimsBuilt: false,
		capabilities: { expressVersion: "4" } as ReturnType<typeof mmVer.deriveCapabilities>
	});
	vi.mocked(mmVer.buildShimsForVersion).mockResolvedValueOnce({ ok: true });
	vi.mocked(mmVer.getVersionInfo).mockReturnValue({
		key: "2.35.0",
		displayVersion: "2.35.0",
		installed: true,
		shimsBuilt: true,
		capabilities: { expressVersion: "4" } as ReturnType<typeof mmVer.deriveCapabilities>
	});

	const app = await buildApp();

	const response = await app.inject({
		method: "POST",
		url: "/__harness/mm-versions/activate",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ version: "2.35.0" })
	});

	assert.equal(response.statusCode, 200);
	assert.equal(vi.mocked(mmVer.buildShimsForVersion).mock.calls.length, 1);
});

test("POST /__harness/mm-versions/activate returns 500 when shim build fails", async () => {
	vi.mocked(mmVer.isVersionInstalled).mockReturnValueOnce(true);
	vi.mocked(mmVer.getVersionInfo).mockReturnValueOnce({
		key: "2.35.0",
		displayVersion: "2.35.0",
		installed: true,
		shimsBuilt: false,
		capabilities: { expressVersion: "4" } as ReturnType<typeof mmVer.deriveCapabilities>
	});
	vi.mocked(mmVer.buildShimsForVersion).mockResolvedValueOnce({
		ok: false,
		error: "module not found"
	});

	const app = await buildApp();

	const response = await app.inject({
		method: "POST",
		url: "/__harness/mm-versions/activate",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ version: "2.35.0" })
	});

	assert.equal(response.statusCode, 500);
	const body = JSON.parse(response.body);
	assert.match(body.error, /Shim build failed/);
});

test("POST /__harness/mm-versions/activate calls injectShimResolution before restart", async () => {
	const injectShimResolution = vi.fn();
	vi.mocked(mmVer.isVersionInstalled).mockReturnValueOnce(true);
	vi.mocked(mmVer.getVersionInfo).mockReturnValue({
		key: "2.35.0",
		displayVersion: "2.35.0",
		installed: true,
		shimsBuilt: true,
		capabilities: { expressVersion: "4" } as ReturnType<typeof mmVer.deriveCapabilities>
	});

	const app = await buildApp({ injectShimResolution });

	await app.inject({
		method: "POST",
		url: "/__harness/mm-versions/activate",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ version: "2.35.0" })
	});

	assert.equal(injectShimResolution.mock.calls.length, 1);
});

// ---------------------------------------------------------------------------
// Tests — POST /__harness/mm-versions/redownload
// ---------------------------------------------------------------------------

test("POST /__harness/mm-versions/redownload returns 400 when version is missing", async () => {
	const app = await buildApp();

	const response = await app.inject({
		method: "POST",
		url: "/__harness/mm-versions/redownload",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({})
	});

	assert.equal(response.statusCode, 400);
});

test("POST /__harness/mm-versions/redownload returns 502 when download fails", async () => {
	vi.mocked(mmVer.downloadVersion).mockReturnValueOnce({
		ok: false,
		error: "network error"
	});

	const app = await buildApp();

	const response = await app.inject({
		method: "POST",
		url: "/__harness/mm-versions/redownload",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ version: "2.35.0" })
	});

	assert.equal(response.statusCode, 502);
	const body = JSON.parse(response.body);
	assert.match(body.error, /Download failed/);
});

test("POST /__harness/mm-versions/redownload returns 500 when shim build fails", async () => {
	vi.mocked(mmVer.downloadVersion).mockReturnValueOnce({ ok: true });
	vi.mocked(mmVer.buildShimsForVersion).mockResolvedValueOnce({
		ok: false,
		error: "build error"
	});

	const app = await buildApp();

	const response = await app.inject({
		method: "POST",
		url: "/__harness/mm-versions/redownload",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ version: "2.35.0" })
	});

	assert.equal(response.statusCode, 500);
	const body = JSON.parse(response.body);
	assert.match(body.error, /Shim build failed/);
});

test("POST /__harness/mm-versions/redownload returns 200 and does not restart when version is not active", async () => {
	vi.mocked(mmVer.downloadVersion).mockReturnValueOnce({ ok: true });
	vi.mocked(mmVer.buildShimsForVersion).mockResolvedValueOnce({ ok: true });
	vi.mocked(mmVer.getActiveVersion).mockReturnValueOnce("develop");
	vi.mocked(mmVer.getVersionInfo).mockReturnValue({
		key: "2.35.0",
		displayVersion: "2.35.0",
		installed: true,
		shimsBuilt: true,
		capabilities: { expressVersion: "4" } as ReturnType<typeof mmVer.deriveCapabilities>
	});
	const restartHelper = vi.fn(async () => {});
	const io = { emit: vi.fn() };

	const app = await buildApp({ restartHelper, io });

	const response = await app.inject({
		method: "POST",
		url: "/__harness/mm-versions/redownload",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ version: "2.35.0" })
	});

	assert.equal(response.statusCode, 200);
	assert.equal(restartHelper.mock.calls.length, 0);
	assert.equal(io.emit.mock.calls.length, 0);
});

test("POST /__harness/mm-versions/redownload restarts and emits events when version is the active one", async () => {
	vi.mocked(mmVer.downloadVersion).mockReturnValueOnce({ ok: true });
	vi.mocked(mmVer.buildShimsForVersion).mockResolvedValueOnce({ ok: true });
	vi.mocked(mmVer.getActiveVersion).mockReturnValueOnce("2.35.0");
	vi.mocked(mmVer.sanitizeVersion).mockReturnValueOnce("2.35.0");
	vi.mocked(mmVer.getVersionInfo).mockReturnValue({
		key: "2.35.0",
		displayVersion: "2.35.0",
		installed: true,
		shimsBuilt: true,
		capabilities: { expressVersion: "4" } as ReturnType<typeof mmVer.deriveCapabilities>
	});
	const restartHelper = vi.fn(async () => {});
	const io = { emit: vi.fn() };
	const injectShimResolution = vi.fn();

	const app = await buildApp({ restartHelper, io, injectShimResolution });

	const response = await app.inject({
		method: "POST",
		url: "/__harness/mm-versions/redownload",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ version: "2.35.0" })
	});

	assert.equal(response.statusCode, 200);
	assert.equal(restartHelper.mock.calls.length, 1);
	assert.equal(injectShimResolution.mock.calls.length, 1);
	assert.ok(io.emit.mock.calls.some(([name]: [string]) => name === "mm:version-changed"));
	assert.ok(io.emit.mock.calls.some(([name]: [string]) => name === "harness:reload"));
});

test("POST /__harness/mm-versions/redownload calls deleteVersionCache before downloading", async () => {
	vi.mocked(mmVer.downloadVersion).mockReturnValueOnce({ ok: true });
	vi.mocked(mmVer.buildShimsForVersion).mockResolvedValueOnce({ ok: true });
	vi.mocked(mmVer.getActiveVersion).mockReturnValueOnce(null);
	vi.mocked(mmVer.getVersionInfo).mockReturnValue({
		key: "2.35.0",
		displayVersion: "2.35.0",
		installed: true,
		shimsBuilt: true,
		capabilities: { expressVersion: "4" } as ReturnType<typeof mmVer.deriveCapabilities>
	});

	const app = await buildApp();

	await app.inject({
		method: "POST",
		url: "/__harness/mm-versions/redownload",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ version: "2.35.0" })
	});

	assert.equal(vi.mocked(mmVer.deleteVersionCache).mock.calls.length, 1);
});

// ---------------------------------------------------------------------------
// Tests — POST /__harness/mm-versions/delete-cache
// ---------------------------------------------------------------------------

test("POST /__harness/mm-versions/delete-cache returns 400 when version is missing", async () => {
	const app = await buildApp();

	const response = await app.inject({
		method: "POST",
		url: "/__harness/mm-versions/delete-cache",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({})
	});

	assert.equal(response.statusCode, 400);
});

test("POST /__harness/mm-versions/delete-cache returns 409 when trying to delete the active version", async () => {
	vi.mocked(mmVer.getActiveVersion).mockReturnValueOnce("2.35.0");
	vi.mocked(mmVer.sanitizeVersion).mockReturnValueOnce("2.35.0");

	const app = await buildApp();

	const response = await app.inject({
		method: "POST",
		url: "/__harness/mm-versions/delete-cache",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ version: "2.35.0" })
	});

	assert.equal(response.statusCode, 409);
	const body = JSON.parse(response.body);
	assert.match(body.error, /Cannot delete the active version/);
});

test("POST /__harness/mm-versions/delete-cache returns 200 and calls deleteVersionCache when version is not active", async () => {
	vi.mocked(mmVer.getActiveVersion).mockReturnValueOnce("develop");
	vi.mocked(mmVer.sanitizeVersion).mockReturnValueOnce("2.35.0");

	const app = await buildApp();

	const response = await app.inject({
		method: "POST",
		url: "/__harness/mm-versions/delete-cache",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ version: "2.35.0" })
	});

	assert.equal(response.statusCode, 200);
	assert.deepEqual(JSON.parse(response.body), { ok: true });
	assert.equal(vi.mocked(mmVer.deleteVersionCache).mock.calls.length, 1);
});

test("POST /__harness/mm-versions/delete-cache returns 200 when no version is currently active", async () => {
	vi.mocked(mmVer.getActiveVersion).mockReturnValueOnce(null);

	const app = await buildApp();

	const response = await app.inject({
		method: "POST",
		url: "/__harness/mm-versions/delete-cache",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ version: "2.35.0" })
	});

	assert.equal(response.statusCode, 200);
});

// ---------------------------------------------------------------------------
// Tests — DELETE /__harness/mm-versions/active
// ---------------------------------------------------------------------------

test("DELETE /__harness/mm-versions/active returns 200 with active:null", async () => {
	const app = await buildApp();

	const response = await app.inject({
		method: "DELETE",
		url: "/__harness/mm-versions/active"
	});

	assert.equal(response.statusCode, 200);
	const body = JSON.parse(response.body);
	assert.equal(body.ok, true);
	assert.equal(body.active, null);
});

test("DELETE /__harness/mm-versions/active calls setActiveVersion with empty string", async () => {
	const app = await buildApp();

	await app.inject({ method: "DELETE", url: "/__harness/mm-versions/active" });

	const calls = vi.mocked(mmVer.setActiveVersion).mock.calls;
	assert.ok(calls.length >= 1);
	assert.equal(calls[calls.length - 1][0], "");
});

test("DELETE /__harness/mm-versions/active calls injectShimResolution and restartHelper", async () => {
	const injectShimResolution = vi.fn();
	const restartHelper = vi.fn(async () => {});

	const app = await buildApp({ injectShimResolution, restartHelper });

	await app.inject({ method: "DELETE", url: "/__harness/mm-versions/active" });

	assert.equal(injectShimResolution.mock.calls.length, 1);
	assert.equal(restartHelper.mock.calls.length, 1);
});

test("DELETE /__harness/mm-versions/active emits mm:version-changed and harness:reload events", async () => {
	const io = { emit: vi.fn() };
	const app = await buildApp({ io });

	await app.inject({ method: "DELETE", url: "/__harness/mm-versions/active" });

	const emitNames = io.emit.mock.calls.map(([name]: [string]) => name);
	assert.ok(emitNames.includes("mm:version-changed"));
	assert.ok(emitNames.includes("harness:reload"));

	const versionChanged = io.emit.mock.calls.find(
		([name]: [string]) => name === "mm:version-changed"
	);
	assert.ok(versionChanged);
	assert.equal(versionChanged[1].version, null);
	assert.equal(versionChanged[1].key, null);
});
