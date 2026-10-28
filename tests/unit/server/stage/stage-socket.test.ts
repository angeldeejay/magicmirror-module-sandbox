/**
 * Unit tests for server/stage/stage-socket.ts: the second socket.io server the
 * real MagicMirror core connects to, plus the server-side WebSocket log.
 */
import * as http from "node:http";
import * as path from "node:path";
import type { AddressInfo } from "node:net";
import { createRequire } from "node:module";
import { Server } from "socket.io";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
	createStageSocketServer,
	emitStageHarnessReload,
	WebsocketLogEntry
} from "../../../../server/stage/stage-socket.ts";

// socket.io-client is not a dependency; the server package ships a Node-loadable UMD build.
const { io: connect } = createRequire(import.meta.url)(
	path.join(
		path.dirname(createRequire(import.meta.url).resolve("socket.io")),
		"..",
		"client-dist",
		"socket.io.js"
	)
) as { io: (...args: unknown[]) => any };

const MODULE_NAME = "MMM-Test";

type Rig = {
	port: number;
	shellIo: Server;
	stage: ReturnType<typeof createStageSocketServer>;
	logs: Array<unknown>;
};

const cleanups: Array<() => Promise<void> | void> = [];

async function boot(): Promise<Rig> {
	const httpServer = http.createServer();
	const shellIo = new Server(httpServer, { serveClient: true });
	const stage = createStageSocketServer(
		httpServer,
		shellIo,
		() => MODULE_NAME
	);
	await new Promise<void>((resolve) => httpServer.listen(0, resolve));
	const logs: Array<unknown> = [];
	shellIo.on("connection", () => {});
	const spy = connect(
		`http://127.0.0.1:${(httpServer.address() as AddressInfo).port}`,
		{ path: "/socket.io", transports: ["websocket"] }
	);
	spy.on("harness:websocket-log", (entry) => logs.push(entry));
	await new Promise<void>((resolve) => spy.on("connect", () => resolve()));
	cleanups.push(async () => {
		spy.close();
		stage.dispose();
		await new Promise<void>((resolve) => shellIo.close(() => resolve()));
	});
	return {
		port: (httpServer.address() as AddressInfo).port,
		shellIo,
		stage,
		logs
	};
}

afterEach(async () => {
	while (cleanups.length) {
		await cleanups.pop()?.();
	}
});

async function until(check: () => boolean): Promise<void> {
	for (let i = 0; i < 100 && !check(); i += 1) {
		await new Promise((resolve) => setTimeout(resolve, 20));
	}
}

describe("stage socket server", () => {
	test("serves on /__stage/socket.io and serves the ESM client at /socket.io/socket.io.esm.min.js", async () => {
		const { port } = await boot();
		const esm = await fetch(
			`http://127.0.0.1:${port}/socket.io/socket.io.esm.min.js`
		);
		expect(esm.status).toBe(200);
		expect(esm.headers.get("content-type")).toContain("javascript");
		expect(await esm.text()).toContain("export");

		const stageEsm = await fetch(
			`http://127.0.0.1:${port}/__stage/socket.io/socket.io.esm.min.js`
		);
		expect(stageEsm.status).toBe(200);

		const client = connect(`http://127.0.0.1:${port}`, {
			path: "/__stage/socket.io",
			transports: ["websocket"]
		});
		cleanups.push(() => void client.close());
		await new Promise<void>((resolve, reject) => {
			client.on("connect", () => resolve());
			client.on("connect_error", reject);
		});
		expect(client.connected).toBe(true);
	});

	test("records both directions on the module namespace, from the module's side", async () => {
		const { port, stage, logs } = await boot();
		stage.io.of(`/${MODULE_NAME}`).on("connection", (socket) => {
			socket.on("PING", (payload) => socket.emit("PONG", payload));
		});
		const client = connect(`http://127.0.0.1:${port}/${MODULE_NAME}`, {
			path: "/__stage/socket.io",
			transports: ["websocket"]
		});
		cleanups.push(() => void client.close());
		const pong = new Promise((resolve) => client.on("PONG", resolve));
		client.emit("PING", { n: 1 });
		expect(await pong).toEqual({ n: 1 });
		await until(() => logs.length >= 2);

		const entries = logs.map((entry) => WebsocketLogEntry.parse(entry));
		expect(entries).toHaveLength(2);
		expect(entries[0]).toMatchObject({
			direction: "sent",
			notification: "PING",
			payload: { n: 1 }
		});
		expect(entries[1]).toMatchObject({
			direction: "received",
			notification: "PONG",
			payload: { n: 1 }
		});
	});

	test("ignores traffic on other namespaces", async () => {
		const { port, stage, logs } = await boot();
		stage.io.of("/other").on("connection", (socket) => {
			socket.on("PING", () => socket.emit("PONG"));
		});
		const client = connect(`http://127.0.0.1:${port}/other`, {
			path: "/__stage/socket.io",
			transports: ["websocket"]
		});
		cleanups.push(() => void client.close());
		const pong = new Promise((resolve) => client.on("PONG", resolve));
		client.emit("PING");
		await pong;
		await new Promise((resolve) => setTimeout(resolve, 100));
		expect(logs).toHaveLength(0);
	});

	test("emitReload sends RELOAD on the root namespace", async () => {
		const { port, stage } = await boot();
		const client = connect(`http://127.0.0.1:${port}`, {
			path: "/__stage/socket.io",
			transports: ["websocket"]
		});
		cleanups.push(() => void client.close());
		await new Promise<void>((resolve) =>
			client.on("connect", () => resolve())
		);
		const reload = new Promise((resolve) => client.on("RELOAD", resolve));
		expect(stage.emitReload()).toBe(true);
		await reload;
	});

	test("emitReload sends nothing when no core page listens on the root namespace", async () => {
		const { port, stage } = await boot();
		stage.io.of(`/${MODULE_NAME}`);
		// A module socket alone does not carry the core's RELOAD listener.
		const moduleClient = connect(`http://127.0.0.1:${port}/${MODULE_NAME}`, {
			path: "/__stage/socket.io",
			transports: ["websocket"]
		});
		cleanups.push(() => void moduleClient.close());
		await new Promise<void>((resolve) =>
			moduleClient.on("connect", () => resolve())
		);
		let reloads = 0;
		moduleClient.on("RELOAD", () => {
			reloads += 1;
		});

		expect(stage.emitReload()).toBe(false);
		await new Promise((resolve) => setTimeout(resolve, 100));
		expect(reloads).toBe(0);
	});

	test("emitStageHarnessReload marks a reload the core performs", () => {
		const shellIo = { emit: vi.fn() };
		const payload = { scope: "stage", version: "v1" };

		emitStageHarnessReload(shellIo, payload, () => true);
		emitStageHarnessReload(shellIo, payload, () => false);
		emitStageHarnessReload(shellIo, payload);

		expect(shellIo.emit.mock.calls).toEqual([
			["harness:reload", { ...payload, reloadedBy: "core" }],
			["harness:reload", payload],
			["harness:reload", payload]
		]);
	});

	test("WebsocketLogEntry rejects malformed entries", () => {
		expect(() =>
			WebsocketLogEntry.parse({
				direction: "up",
				notification: "x",
				at: 1
			})
		).toThrow();
	});
});
