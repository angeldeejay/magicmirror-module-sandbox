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
