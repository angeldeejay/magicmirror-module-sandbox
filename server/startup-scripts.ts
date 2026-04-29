/**
 * Consumer startup-script execution and teardown helpers used by the sandbox host.
 */

import { spawn, spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

type SpawnSyncFn = typeof import("node:child_process").spawnSync;
type SpawnFn = typeof import("node:child_process").spawn;
type ChildProcess = import("node:child_process").ChildProcess;

/**
 * Reads consumer package json.
 */
function readConsumerPackageJson(repoRoot: string): Record<string, unknown> {
	const packageJsonPath = path.join(repoRoot, "package.json");
	return JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as Record<
		string,
		unknown
	>;
}

/**
 * Gets package scripts.
 */
function getPackageScripts(
	packageData: Record<string, unknown>
): Record<string, string> {
	return packageData &&
		packageData.scripts &&
		typeof packageData.scripts === "object" &&
		!Array.isArray(packageData.scripts)
		? (packageData.scripts as Record<string, string>)
		: {};
}

/**
 * Quotes Windows command argument.
 */
function quoteWindowsCommandArgument(value: string): string {
	return `"${value.replace(/(["^&|<>])/g, "^$1")}"`;
}

/**
 * Gets npm spawn command.
 */
function getNpmSpawnCommand(repoRoot: string, scriptName: string) {
	const baseOptions = {
		cwd: repoRoot,
		stdio: "inherit" as const,
		env: process.env
	};

	if (process.platform === "win32") {
		return {
			command: `npm run ${quoteWindowsCommandArgument(scriptName)}`,
			args: [],
			options: {
				...baseOptions,
				shell: true
			}
		};
	}

	return {
		command: "npm",
		args: ["run", scriptName],
		options: {
			...baseOptions,
			shell: false
		}
	};
}

/**
 * Runs startup script.
 */
function runStartupScript({
	repoRoot,
	scriptName,
	spawn: spawnProcess = spawnSync
}: {
	repoRoot: string;
	scriptName: string;
	spawn?: SpawnSyncFn;
}): void {
	const packageData = readConsumerPackageJson(repoRoot);
	const scripts = getPackageScripts(packageData);

	if (
		typeof scripts[scriptName] !== "string" ||
		!scripts[scriptName].trim()
	) {
		throw new RangeError(
			`package.json sandbox.startup references missing npm script: ${scriptName}`
		);
	}

	const npmSpawn = getNpmSpawnCommand(repoRoot, scriptName);
	const result = spawnProcess(
		npmSpawn.command,
		npmSpawn.args,
		npmSpawn.options
	);

	if (result.error) {
		throw result.error;
	}
	if (result.status !== 0) {
		throw new Error(
			`Startup npm script failed: ${scriptName} (exit code ${result.status})`
		);
	}
}

/**
 * Runs startup scripts.
 */
function runStartupScripts({
	repoRoot,
	startupScripts = [],
	log = console.log,
	spawn: spawnProcess = spawn,
	killProcessTree = stopProcessTree
}: {
	repoRoot: string;
	startupScripts?: string[];
	log?: (message: string) => void;
	spawn?: SpawnFn;
	killProcessTree?: (pid: number | undefined) => Promise<void>;
}) {
	const packageData = readConsumerPackageJson(repoRoot);
	const scripts = getPackageScripts(packageData);
	const processes: Array<{ scriptName: string; child: ChildProcess }> = [];

	for (const scriptName of startupScripts) {
		if (
			typeof scripts[scriptName] !== "string" ||
			!scripts[scriptName].trim()
		) {
			throw new RangeError(
				`package.json sandbox.startup references missing npm script: ${scriptName}`
			);
		}

		log(`[module-sandbox] running startup script: ${scriptName}`);
		let child: ChildProcess;
		try {
			const npmSpawn = getNpmSpawnCommand(repoRoot, scriptName);
			child = spawnProcess(npmSpawn.command, npmSpawn.args, {
				...npmSpawn.options,
				detached: process.platform !== "win32"
			});
		} catch (error) {
			const spawnError = error as Error;
			log(
				`[module-sandbox] startup script error (${scriptName}): ${spawnError.message}`
			);
			continue;
		}

		child.on("error", (error: Error & { code?: string }) => {
			log(
				`[module-sandbox] startup script error (${scriptName}): ${error.message}`
			);
		});
		child.on(
			"exit",
			(code: number | null, signal: NodeJS.Signals | null) => {
				if (signal) {
					log(
						`[module-sandbox] startup script stopped (${scriptName}): ${signal}`
					);
					return;
				}

				if (code === 0) {
					log(
						`[module-sandbox] startup script exited (${scriptName}): 0`
					);
				}
			}
		);
		processes.push({
			scriptName,
			child
		});
	}

	return {
		processes,
		/**
		 * Stops all.
		 */
		async stopAll(): Promise<void> {
			await Promise.all(
				processes.map(({ child }) => {
					return killProcessTree(child.pid);
				})
			);
		}
	};
}

/**
 * Stops process tree.
 */
function stopProcessTree(
	pid: number | undefined,
	{
		platform = process.platform,
		spawnProcess = spawn,
		processKill = process.kill
	}: {
		platform?: NodeJS.Platform;
		spawnProcess?: SpawnFn;
		processKill?: typeof process.kill;
	} = {}
): Promise<void> {
	if (!pid) {
		return Promise.resolve();
	}

	if (platform === "win32") {
		return new Promise((resolve, reject) => {
			const killer = spawnProcess(
				"taskkill",
				["/PID", String(pid), "/T", "/F"],
				{
					stdio: "ignore"
				}
			);
			killer.on("error", (error: Error & { code?: string }) => {
				if (
					error &&
					(error.code === "ESRCH" ||
						error.code === "ENOENT" ||
						error.code === "EPERM")
				) {
					resolve();
					return;
				}
				reject(error);
			});
			killer.on("exit", (code: number | null) => {
				if (code === 0 || code === 1 || code === 128 || code === 255) {
					resolve();
					return;
				}

				reject(
					new Error(
						`taskkill failed for pid ${pid} with exit code ${code}`
					)
				);
			});
		});
	}

	return new Promise((resolve, reject) => {
		try {
			processKill(-pid, "SIGKILL");
		} catch (error) {
			const killError = error as Error & { code?: string };
			if (killError.code === "ESRCH" || killError.code === "EPERM") {
				resolve();
				return;
			}
			reject(killError);
			return;
		}
		resolve();
	});
}

export {
	readConsumerPackageJson,
	runStartupScript,
	runStartupScripts,
	stopProcessTree
};

export default {
	readConsumerPackageJson,
	runStartupScript,
	runStartupScripts,
	stopProcessTree
};
