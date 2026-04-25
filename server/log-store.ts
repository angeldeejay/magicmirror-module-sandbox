/**
 * In-memory helper log store plus Socket.IO wiring for live diagnostics.
 */

const helperLogEntries: Array<{
	timestamp: string;
	method: string;
	args: unknown[];
}> = [];
const MAX_HELPER_LOG_ENTRIES = 200;
let socketServer: import("socket.io").Server | null = null;
const moduleSandboxGlobal = globalThis as typeof globalThis & {
	__MODULE_SANDBOX_LOGGER__?: {
		recordHelperLog: (method: string, args: unknown[]) => void;
	};
};

/**
 * Clones log value.
 */
function cloneLogValue(value: unknown): unknown {
	if (value instanceof Error) {
		return {
			name: value.name,
			message: value.message,
			stack: value.stack
		};
	}

	if (value === undefined) {
		return "[undefined]";
	}

	if (typeof value === "function") {
		return `[Function ${value.name || "anonymous"}]`;
	}

	try {
		return JSON.parse(JSON.stringify(value));
	} catch (_error) {
		return String(value);
	}
}

/**
 * Attaches socket server.
 */
export function attachSocketServer(
	io: import("socket.io").Server | null
): void {
	socketServer = io || null;
}

/**
 * Internal helper for record helper log.
 */
export function recordHelperLog(method: string, args: unknown[]): void {
	const entry: { timestamp: string; method: string; args: unknown[] } = {
		timestamp: new Date().toISOString(),
		method,
		args: Array.isArray(args) ? args.map(cloneLogValue) : []
	};

	helperLogEntries.unshift(entry);
	if (helperLogEntries.length > MAX_HELPER_LOG_ENTRIES) {
		helperLogEntries.length = MAX_HELPER_LOG_ENTRIES;
	}

	if (socketServer) {
		socketServer.emit("harness:helper-log", entry);
	}
}

/**
 * Gets helper log entries.
 */
export function getHelperLogEntries(): Array<{
	timestamp: string;
	method: string;
	args: unknown[];
}> {
	return helperLogEntries.slice();
}

moduleSandboxGlobal.__MODULE_SANDBOX_LOGGER__ = {
	recordHelperLog
};
