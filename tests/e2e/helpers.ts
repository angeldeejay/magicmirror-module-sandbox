/**
 * Suite-local helpers for packaged-install smoke tests.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { waitForChildProcessClose } from "../_helpers/child-process-cleanup.ts";
import { resetPersistedStateForModuleRoot } from "../_helpers/test-module-persistence.ts";
import { writeFixtureStylesheet } from "../_helpers/test-module-style-fixture.ts";

const repoRoot = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"..",
	".."
);
const fixtureRoot = path.join(repoRoot, "tests", "_fixtures", "MMM-TestModule");
const publishedPackageName = "@angeldeejay/magicmirror-module-sandbox";
const publishedBinName = "magicmirror-module-sandbox";
const startupTimeoutMs = 60_000;
const packedSandboxTarballEnvKey = "MM_SANDBOX_E2E_TARBALL_PATH";
const packedSandboxTempRootEnvKey = "MM_SANDBOX_E2E_TEMP_ROOT";
const quietNpmEnv = {
	NPM_CONFIG_LOGLEVEL: "error",
	npm_config_loglevel: "error",
	NPM_CONFIG_PROGRESS: "false",
	npm_config_progress: "false"
};
const windowsSpawnOptions =
	process.platform === "win32" ? { windowsHide: true } : {};
let packedSandboxTarballPath = "";
let packedSandboxTempRoot = "";

type InstalledPackageManifest = {
	bin?: string | Record<string, string>;
};

/**
 * Resolve the first available executable from PATH.
 *
 * Windows consumer flows can expose multiple `npm` entrypoints, so the smoke
 * suite resolves one concrete executable before it starts spawning commands.
 *
 * @param {string[]} candidates
 * @returns {string}
 */
function resolveExecutable(candidates) {
	const lookupCommand = process.platform === "win32" ? "where.exe" : "which";

	for (const candidate of candidates) {
		const result = spawnSync(lookupCommand, [candidate], {
			encoding: "utf8"
		});
		if (result.status === 0) {
			const resolvedPath = String(result.stdout || "")
				.split(/\r?\n/)
				.map((entry) => entry.trim())
				.find(Boolean);
			if (resolvedPath) {
				return resolvedPath;
			}
		}
	}

	throw new Error(
		`Unable to resolve executable from PATH: ${candidates.join(", ")}`
	);
}

const npmCommand = resolveExecutable(
	process.platform === "win32" ? ["npm.exe", "npm.cmd", "npm"] : ["npm"]
);
const npmUsesShellWrapper =
	process.platform === "win32" &&
	/\.(cmd|bat)$/i.test(path.basename(npmCommand));

/**
 * Quote one argument for an explicit Windows `cmd.exe /c` invocation.
 *
 * @param {string} value
 * @returns {string}
 */
function quoteForWindowsCmd(value) {
	if (value.length === 0) {
		return '""';
	}

	return `"${value.replace(/"/g, '""')}"`;
}

/**
 * Build a spawn-safe command invocation without using Node's `shell: true`.
 *
 * Windows emits DEP0190 when args are passed alongside `shell: true`, so the
 * e2e helpers invoke `cmd.exe` directly when they have to go through an npm
 * batch wrapper.
 *
 * @param {string} command
 * @param {string[]} args
 * @returns {{ command: string, args: string[], options?: import("child_process").SpawnOptions }}
 */
function buildCommandInvocation(command, args) {
	if (!(npmUsesShellWrapper && command === npmCommand)) {
		return {
			command,
			args,
			options: windowsSpawnOptions
		};
	}

	const cmdCommand = process.env.ComSpec || "C:\\WINDOWS\\System32\\cmd.exe";
	const cmdLine = [
		"call",
		quoteForWindowsCmd(command),
		...args.map(quoteForWindowsCmd)
	].join(" ");
	return {
		command: cmdCommand,
		args: ["/d", "/s", "/c", `"${cmdLine}"`],
		options: {
			...windowsSpawnOptions,
			windowsVerbatimArguments: true
		}
	};
}

/**
 * Run a command synchronously and surface stdout/stderr in one failure message.
 *
 * @param {string} command
 * @param {string[]} args
 * @param {import("child_process").SpawnSyncOptions} options
 * @returns {string}
 */
function runCommand(command, args, options) {
	const invocation = buildCommandInvocation(command, args);
	const result = spawnSync(invocation.command, invocation.args, {
		encoding: "utf8",
		...invocation.options,
		...options,
		env:
			command === npmCommand
				? {
						...process.env,
						...quietNpmEnv,
						...options?.env
					}
				: options?.env
	});

	if (result.error) {
		throw result.error;
	}

	if (result.status !== 0) {
		throw new Error(
			[
				`Command failed: ${command} ${args.join(" ")}`,
				result.stdout || "",
				result.stderr || ""
			]
				.filter(Boolean)
				.join("\n")
		);
	}

	return String(result.stdout || "").trim();
}

/**
 * Create an isolated temporary consumer-module copy from the internal fixture.
 *
 * @param {string} prefix
 * @returns {string}
 */
function createTempModuleRepo(prefix) {
	const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
	fs.cpSync(fixtureRoot, tempRoot, {
		recursive: true
	});
	writeFixtureStylesheet(path.join(tempRoot, "MMM-TestModule.css"));
	resetPersistedStateForModuleRoot(tempRoot);
	return tempRoot;
}

/**
 * Build the current sandbox repository once before packing it for e2e.
 *
 * `npm pack` normally triggers package lifecycle hooks such as `prepack`, so
 * e2e global setup performs the build explicitly and then packs with scripts
 * disabled to avoid paying the same build cost twice.
 *
 * @returns {void}
 */
function buildCurrentRepo() {
	runCommand(npmCommand, ["run", "build"], {
		cwd: repoRoot
	});
}

/**
 * Create one OS-native temporary workspace for e2e packaging artifacts.
 *
 * @returns {string}
 */
function createPackedSandboxTempRoot() {
	const existingTempRoot = process.env[packedSandboxTempRootEnvKey];
	if (existingTempRoot && fs.existsSync(existingTempRoot)) {
		packedSandboxTempRoot = existingTempRoot;
		return packedSandboxTempRoot;
	}

	packedSandboxTempRoot = fs.mkdtempSync(
		path.join(os.tmpdir(), "magicmirror-module-sandbox-e2e-")
	);
	process.env[packedSandboxTempRootEnvKey] = packedSandboxTempRoot;
	return packedSandboxTempRoot;
}

/**
 * Pack the current sandbox repository and return the tarball path.
 *
 * @returns {string}
 */
function packCurrentRepo() {
	const tempRoot = createPackedSandboxTempRoot();
	const tarballName = runCommand(
		npmCommand,
		["pack", "--quiet", "--ignore-scripts", "--pack-destination", tempRoot],
		{
			cwd: repoRoot
		}
	)
		.split(/\r?\n/)
		.pop();
	if (!tarballName) {
		throw new Error("npm pack did not return a tarball name.");
	}
	return path.join(tempRoot, tarballName);
}

/**
 * Remove the cached temporary workspace for the current e2e suite run.
 *
 * @returns {void}
 */
function cleanupPackedSandboxTempRoot() {
	if (!packedSandboxTempRoot) {
		const existingTempRoot = process.env[packedSandboxTempRootEnvKey];
		if (!existingTempRoot) {
			return;
		}
		packedSandboxTempRoot = existingTempRoot;
	}

	fs.rmSync(packedSandboxTempRoot, {
		recursive: true,
		force: true
	});
	packedSandboxTempRoot = "";
	delete process.env[packedSandboxTempRootEnvKey];
}

/**
 * Remove the cached packed tarball for the current e2e suite run.
 *
 * @returns {void}
 */
function cleanupPackedSandboxTarball() {
	if (!packedSandboxTarballPath) {
		const existingTarballPath = process.env[packedSandboxTarballEnvKey];
		if (!existingTarballPath) {
			cleanupPackedSandboxTempRoot();
			return;
		}
		packedSandboxTarballPath = existingTarballPath;
	}

	fs.rmSync(packedSandboxTarballPath, {
		force: true
	});
	packedSandboxTarballPath = "";
	delete process.env[packedSandboxTarballEnvKey];
	cleanupPackedSandboxTempRoot();
}

/**
 * Build and pack the sandbox once for the current e2e suite run.
 *
 * The suite global setup calls this once and lets every smoke worker reuse the
 * same tarball path.
 *
 * @returns {string}
 */
function preparePackedSandboxTarball() {
	const existingTarballPath = process.env[packedSandboxTarballEnvKey];
	if (existingTarballPath && fs.existsSync(existingTarballPath)) {
		packedSandboxTarballPath = existingTarballPath;
		return packedSandboxTarballPath;
	}

	buildCurrentRepo();
	packedSandboxTarballPath = packCurrentRepo();
	process.env[packedSandboxTarballEnvKey] = packedSandboxTarballPath;
	return packedSandboxTarballPath;
}

/**
 * Install the packed sandbox tarball as a consumer `devDependency`.
 *
 * @param {string} tarballPath
 * @param {string} moduleRoot
 * @returns {void}
 */
function installTarballAsDevDependency(tarballPath, moduleRoot) {
	runCommand(
		npmCommand,
		[
			"install",
			"--save-dev",
			"--package-lock=false",
			"--no-audit",
			"--no-fund",
			"--no-update-notifier",
			tarballPath
		],
		{
			cwd: moduleRoot
		}
	);
}

/**
 * Resolve the installed CLI entrypoint from one consumer `node_modules` tree.
 *
 * @param {string} moduleRoot
 * @returns {string}
 */
function getInstalledSandboxBinPath(moduleRoot) {
	const packageRoot = path.join(
		moduleRoot,
		"node_modules",
		publishedPackageName
	);
	const manifest = JSON.parse(
		fs.readFileSync(path.join(packageRoot, "package.json"), "utf8")
	) as InstalledPackageManifest;
	const binPath =
		typeof manifest.bin === "string"
			? manifest.bin
			: manifest.bin?.[publishedBinName];
	if (!binPath) {
		throw new Error(
			`Installed package ${publishedPackageName} does not declare a CLI bin path.`
		);
	}

	return path.join(packageRoot, binPath);
}

/**
 * Terminate the sandbox process tree started by one smoke command.
 *
 * @param {import("child_process").ChildProcess} child
 * @returns {Promise<void>}
 */
async function killChildProcessTree(child) {
	if (!child || !child.pid) {
		return;
	}

	if (process.platform === "win32") {
		await new Promise<void>((resolve, reject) => {
			const killer = spawn(
				"taskkill",
				["/PID", String(child.pid), "/T", "/F"],
				{
					stdio: "ignore",
					...windowsSpawnOptions
				}
			);
			killer.on("error", (error) => {
				const nodeError = error as NodeJS.ErrnoException;
				if (
					nodeError.code === "ESRCH" ||
					nodeError.code === "ENOENT" ||
					nodeError.code === "EPERM"
				) {
					resolve();
					return;
				}
				reject(error);
			});
			killer.on("exit", (code) => {
				if (code === 0 || code === 1 || code === 128 || code === 255) {
					resolve();
					return;
				}
				reject(
					new Error(
						`taskkill failed for pid ${child.pid} with exit code ${code}`
					)
				);
			});
		});
		await waitForChildProcessClose(child, 5_000);
		return;
	}

	await new Promise<void>((resolve, reject) => {
		try {
			process.kill(-child.pid, "SIGKILL");
			resolve();
		} catch (error) {
			const nodeError = error as NodeJS.ErrnoException;
			if (nodeError.code === "ESRCH" || nodeError.code === "EPERM") {
				resolve();
				return;
			}
			reject(error);
		}
	});
	await waitForChildProcessClose(child, 5_000);
}

/**
 * Wait until the child process reports that the sandbox HTTP server is listening.
 *
 * @param {import("child_process").ChildProcess} child
 * @param {number} smokePort
 * @returns {Promise<void>}
 */
function waitForServerReady(child, smokePort) {
	return new Promise<void>((resolve, reject) => {
		let settled = false;
		let output = "";
		const timer = setTimeout(() => {
			if (!settled) {
				settled = true;
				reject(
					new Error(
						`Timed out waiting for sandbox startup.\n${output}`
					)
				);
			}
		}, startupTimeoutMs);

		/**
		 * Internal helper for finish.
		 */
		const finish = (callback) => {
			if (settled) {
				return;
			}
			settled = true;
			clearTimeout(timer);
			callback();
		};

		/**
		 * Internal helper for on chunk.
		 */
		const onChunk = (chunk) => {
			const text = String(chunk);
			output += text;
			if (
				output.includes(
					`[module-sandbox] listening at http://127.0.0.1:${smokePort}`
				)
			) {
				finish(resolve);
			}
		};

		child.stdout.on("data", onChunk);
		child.stderr.on("data", onChunk);
		child.on("exit", (code, signal) => {
			finish(() => {
				reject(
					new Error(
						`Sandbox exited before becoming ready (code=${code}, signal=${signal}).\n${output}`
					)
				);
			});
		});
		child.on("error", (error) => {
			finish(() => reject(error));
		});
	});
}

/**
 * Verify that the running sandbox responds through its public harness API.
 *
 * @param {number} smokePort
 * @returns {Promise<void>}
 */
async function assertServerResponds(smokePort) {
	const response = await fetch(
		`http://127.0.0.1:${smokePort}/__harness/config`
	);
	if (!response.ok) {
		throw new Error(`Smoke server responded with HTTP ${response.status}.`);
	}

	const body = await response.json();
	if (
		!body ||
		!body.harnessConfig ||
		body.harnessConfig.moduleName !== "MMM-TestModule"
	) {
		throw new Error(
			"Smoke server returned an unexpected harness config payload."
		);
	}
}

/**
 * Launch one packaged sandbox command and assert that it boots successfully.
 *
 * @param {string[]} args
 * @param {string} moduleRoot
 * @param {number} smokePort
 * @returns {Promise<void>}
 */
async function runSmokeCommand(args, moduleRoot, smokePort) {
	const invocation = buildCommandInvocation(npmCommand, args);
	const child = spawn(invocation.command, invocation.args, {
		cwd: moduleRoot,
		env: {
			...process.env,
			...quietNpmEnv,
			MM_SANDBOX_PORT: String(smokePort)
		},
		...invocation.options,
		stdio: ["ignore", "pipe", "pipe"],
		detached: process.platform !== "win32"
	});

	try {
		await waitForServerReady(child, smokePort);
		await assertServerResponds(smokePort);
	} finally {
		await killChildProcessTree(child);
	}
}

/**
 * Launch the already installed sandbox CLI entrypoint directly with Node and
 * assert that it boots successfully.
 *
 * This keeps the consumer-devDependency scenario intact while skipping the extra
 * `npm exec` shim layer once the package is already installed locally.
 *
 * @param {string} moduleRoot
 * @param {number} smokePort
 * @returns {Promise<void>}
 */
async function runInstalledSmokeBinary(moduleRoot, smokePort) {
	const child = spawn(
		process.execPath,
		[getInstalledSandboxBinPath(moduleRoot)],
		{
			cwd: moduleRoot,
			env: {
				...process.env,
				MM_SANDBOX_PORT: String(smokePort)
			},
			stdio: ["ignore", "pipe", "pipe"],
			detached: process.platform !== "win32"
		}
	);

	try {
		await waitForServerReady(child, smokePort);
		await assertServerResponds(smokePort);
	} finally {
		await killChildProcessTree(child);
	}
}

/**
 * Pack the current repository, create a temporary consumer module, run the
 * supplied callback, and clean up both artifacts afterward.
 *
 * @param {string} prefix
 * @param {(context: { moduleRoot: string, tarballPath: string }) => Promise<void>} callback
 * @returns {Promise<void>}
 */
async function withPackedSandbox(prefix, callback) {
	const moduleRoot = createTempModuleRepo(prefix);
	const tarballPath = preparePackedSandboxTarball();

	try {
		await callback({
			moduleRoot,
			tarballPath
		});
	} finally {
		fs.rmSync(moduleRoot, {
			recursive: true,
			force: true
		});
	}
}

export {
	buildCurrentRepo,
	cleanupPackedSandboxTarball,
	getInstalledSandboxBinPath,
	installTarballAsDevDependency,
	preparePackedSandboxTarball,
	runInstalledSmokeBinary,
	runSmokeCommand,
	withPackedSandbox
};
