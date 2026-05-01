/**
 * Socket.IO client listener for module quality analysis results.
 *
 * Stores the latest analysis result on the shared MICROCORE object and fans
 * out to registered DOM-event subscribers so that the Quality sidebar domain
 * can stay live without polling.
 */

export type AnalysisSeverity = "error" | "warning" | "info";

export interface AnalysisFinding {
	id: string;
	category: string;
	severity: AnalysisSeverity;
	description: string;
	file: string | null;
}

export interface ModuleAnalysisResult {
	moduleName: string;
	moduleRoot: string;
	analyzedAt: number;
	durationMs: number;
	moduleUrl: string | null;
	findings: AnalysisFinding[];
	findingCounts: {
		total: number;
		errors: number;
		warnings: number;
		info: number;
	};
	error: string | null;
}

export type AnalysisUpdateCallback = (result: ModuleAnalysisResult) => void;

let lastResult: ModuleAnalysisResult | null = null;
const listeners: AnalysisUpdateCallback[] = [];

/**
 * Register a callback that fires whenever a new analysis result arrives.
 *
 * Returns an unsubscribe function that removes the callback.
 *
 * @param {AnalysisUpdateCallback} cb
 * @returns {() => void}
 */
export function onAnalysisUpdate(cb: AnalysisUpdateCallback): () => void {
	listeners.push(cb);
	return () => {
		const index = listeners.indexOf(cb);
		if (index !== -1) {
			listeners.splice(index, 1);
		}
	};
}

/**
 * Return the most recently received analysis result, or null if none has
 * arrived yet.
 *
 * @returns {ModuleAnalysisResult | null}
 */
export function getAnalysisResult(): ModuleAnalysisResult | null {
	return lastResult;
}

/**
 * Attach the harness:quality-result Socket.IO listener to an existing socket.
 *
 * Call this once after the socket is created in the shell runtime.
 *
 * @param {{ on: (event: string, handler: (...args: unknown[]) => void) => void }} socket
 * @returns {void}
 */
export function initAnalysisListener(socket: {
	on: (event: string, handler: (...args: unknown[]) => void) => void;
}): void {
	socket.on("harness:quality-result", (result: unknown) => {
		lastResult = result as ModuleAnalysisResult;
		for (const cb of listeners) {
			try {
				cb(lastResult);
			} catch (_err) {
				// Never let a subscriber crash the broadcast loop.
			}
		}
	});
}
