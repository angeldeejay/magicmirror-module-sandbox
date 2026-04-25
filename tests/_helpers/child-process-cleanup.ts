/**
 * Child-process shutdown helpers shared by sandbox test utilities.
 */
import { setTimeout } from "node:timers";

/**
 * Wait until a child process finishes closing after termination starts.
 *
 * @param {import("node:child_process").ChildProcess | null | undefined} child
 * @param {number} [timeoutMs=5_000]
 * @returns {Promise<void>}
 */
export async function waitForChildProcessClose(child, timeoutMs = 5_000) {
	if (!child || child.exitCode !== null) {
		return;
	}

	await new Promise<void>((resolve, reject) => {
		let settled = false;
		const timer = setTimeout(() => {
			if (!settled) {
				settled = true;
				reject(
					new Error(
						`Timed out waiting for child process ${child.pid || "unknown"} to close.`
					)
				);
			}
		}, timeoutMs);

		/**
		 * Internal helper for finish.
		 */
		const finish = (callback: () => void) => {
			if (settled) {
				return;
			}
			settled = true;
			clearTimeout(timer);
			callback();
		};

		child.once("close", () => {
			finish(resolve);
		});
		child.once("error", (error) => {
			finish(() => reject(error));
		});
	});
}

/**
 * Terminate one direct child process and wait for the OS to close it.
 *
 * @param {import("node:child_process").ChildProcess | null | undefined} child
 * @param {{ timeoutMs?: number }} [options]
 * @returns {Promise<void>}
 */
export async function terminateChildProcess(
	child,
	options: { timeoutMs?: number } = {}
) {
	if (!child) {
		return;
	}

	const timeoutMs = options.timeoutMs ?? 5_000;
	if (child.exitCode !== null) {
		return;
	}

	const waitForClose = waitForChildProcessClose(child, timeoutMs);
	const sentSignal = child.kill();
	if (!sentSignal && child.exitCode === null) {
		throw new Error(
			`Failed to terminate child process ${child.pid || "unknown"}.`
		);
	}
	await waitForClose;
}
