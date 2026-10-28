/**
 * Second socket.io server for the real MagicMirror core running in the stage
 * iframe. The core connects its root namespace and module namespace at
 * `${basePath}socket.io` (basePath `/__stage/`), so this server lives at
 * `/__stage/socket.io`, separate from the shell server on `/socket.io`.
 *
 * Module traffic on the stage is mirrored to the shell as
 * `harness:websocket-log` events, validated with Zod before emitting.
 */

import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { z } from "zod";

/** Path the real core connects to (`${basePath}socket.io`). */
export const STAGE_SOCKET_PATH = "/__stage/socket.io";
/** Shell socket event carrying one WebSocket log entry. */
export const WEBSOCKET_LOG_EVENT = "harness:websocket-log";
/** Shell socket event that reloads the stage (or, with scope "shell", the shell). */
export const HARNESS_RELOAD_EVENT = "harness:reload";
/**
 * `reloadedBy` value of a stage `harness:reload` whose reload the core's own
 * root-namespace `RELOAD` performs; the shell then leaves the frame alone.
 */
export const RELOADED_BY_CORE = "core";

/**
 * Directions are from the module's side: `sent` is module to server,
 * `received` is server to module.
 */
export const WebsocketLogEntry = z.object({
	direction: z.enum(["sent", "received"]),
	notification: z.string(),
	payload: z.unknown(),
	at: z.number()
});
export type WebsocketLogEntry = z.infer<typeof WebsocketLogEntry>;

export type StageSocketServer = {
	io: Server;
	/**
	 * Sends `RELOAD` on the root namespace, like core `server.js` does, when a
	 * core page listens for it. Returns whether it was sent.
	 */
	emitReload(): boolean;
	dispose(): void;
};

/**
 * Emits one stage `harness:reload` to the shell, making sure exactly one
 * mechanism reloads the stage document.
 *
 * The faithful path is the core's own: a mirror reloads when its root socket
 * receives `RELOAD` (`main.js` `modulesStarted`). When the core took it, the
 * payload says `reloadedBy: "core"` and the shell only shows its loading
 * backdrop. When no core page listens (the core never reached
 * `modulesStarted`, for example a module whose `start()` threw, or the page is
 * still booting), nothing would reload the stage, so the shell reloads the
 * frame itself. Without `emitStageReload` the payload goes out unchanged.
 */
export function emitStageHarnessReload(
	shellIo: Pick<Server, "emit">,
	payload: Record<string, unknown>,
	emitStageReload?: () => boolean
): void {
	const reloadedByCore = emitStageReload ? emitStageReload() : false;
	shellIo.emit(
		HARNESS_RELOAD_EVENT,
		reloadedByCore ? { ...payload, reloadedBy: RELOADED_BY_CORE } : payload
	);
}

/**
 * Attaches the stage socket server to the shared HTTP server.
 *
 * The ESM socket.io client (`/socket.io/socket.io.esm.min.js`, imported by
 * MagicMirror 2.38+) is already served by the shell server's own
 * `serveClient`; this server serves the same file under its own path too.
 */
export function createStageSocketServer(
	httpServer: HttpServer,
	shellIo: Server,
	getModuleName: () => string
): StageSocketServer {
	const io = new Server(httpServer, {
		path: STAGE_SOCKET_PATH,
		serveClient: true
	});

	const record = (
		direction: WebsocketLogEntry["direction"],
		event: string,
		args: unknown[]
	): void => {
		const parsed = WebsocketLogEntry.safeParse({
			direction,
			notification: event,
			payload: args[0],
			at: Date.now()
		});
		if (parsed.success) {
			shellIo.emit(WEBSOCKET_LOG_EVENT, parsed.data);
		}
	};

	// "new_namespace" also fires for namespaces the helper creates later.
	io.on("new_namespace", (namespace) => {
		if (namespace.name !== `/${getModuleName()}`) {
			return;
		}
		namespace.use((socket, next) => {
			socket.onAny((event: string, ...args: unknown[]) =>
				record("sent", event, args)
			);
			socket.onAnyOutgoing((event: string, ...args: unknown[]) =>
				record("received", event, args)
			);
			next();
		});
	});

	return {
		io,
		emitReload() {
			// Only core main.js connects the root namespace, right before it
			// registers its RELOAD listener; module sockets use their own
			// namespaces.
			if (io.of("/").sockets.size === 0) {
				return false;
			}
			io.emit("RELOAD");
			return true;
		},
		// Do not io.close(): that would also close the shared HTTP server,
		// which the shell server owns.
		dispose() {
			io.disconnectSockets(true);
			io.engine.close();
		}
	};
}
