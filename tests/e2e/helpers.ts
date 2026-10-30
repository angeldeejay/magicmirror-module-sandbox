/**
 * Suite-local helpers for packaged-install smoke tests.
 */
import fs from "node:fs";
import net from "node:net";
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
 * @param {import("child_process").SpawnSyncOptions & { baseEnv?: NodeJS.ProcessEnv }} options
 * @returns {string}
 */
function runCommand(command, args, options?) {
	const { baseEnv, ...spawnOptions } = options ?? {};
	const invocation = buildCommandInvocation(command, args);
	const result = spawnSync(invocation.command, invocation.args, {
		encoding: "utf8",
		...invocation.options,
		...spawnOptions,
		env:
			command === npmCommand
				? {
						...(baseEnv ?? process.env),
						...quietNpmEnv,
						...spawnOptions?.env
					}
				: spawnOptions?.env
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
 * Ask the OS for a free loopback port by binding to port 0.
 *
 * There is an inherent TOCTOU window between when this function closes the
 * probe socket and when the sandbox process binds the returned port.  For
 * e2e tests this window is acceptable — the alternative (a hardcoded port)
 * causes far more frequent conflicts on shared CI machines.
 *
 * @returns {Promise<number>}
 */
function allocateLoopbackPort(): Promise<number> {
	return new Promise((resolve, reject) => {
		const server = net.createServer();
		server.unref();
		server.on("error", reject);
		server.listen(0, "127.0.0.1", () => {
			const address = server.address();
			if (!address || typeof address === "string") {
				server.close(() =>
					reject(new Error("Failed to allocate loopback port."))
				);
				return;
			}
			server.close((error) => {
				if (error) {
					reject(error);
					return;
				}
				resolve(address.port);
			});
		});
	});
}

/**
 * Build the current sandbox repository once before packing it for e2e.
 *
 * `npm pack` normally triggers package lifecycle hooks such as `prepack`, so
 * e2e global setup performs the build explicitly and then packs with scripts
 * disabled to avoid paying the same build cost twice.
 *
 * Strip test-runner env vars (NODE_ENV=test, VITEST, VITEST_POOL_ID,
 * VITEST_WORKER_ID) before spawning the build.  When vite runs under those
 * vars it forces @preact/preset-vite to load via its CJS variant, which uses
 * require("zimmerframe") — a package that ships only an ESM export — causing
 * rolldown's optimizeDeps to fail.
 *
 * @returns {void}
 */
function buildCurrentRepo() {
	const {
		NODE_ENV: _node,
		VITEST: _vitest,
		VITEST_POOL_ID: _pool,
		VITEST_WORKER_ID: _worker,
		...cleanEnv
	} = process.env;
	runCommand(npmCommand, ["run", "build"], {
		cwd: repoRoot,
		baseEnv: cleanEnv
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
 * Verify that the packaged sandbox serves the built-in MagicMirror core at
 * `/__stage/` (from `dist/core/`) and that the core boots the mounted module
 * in a real browser, as the sandbox shell's stage iframe would load it.
 *
 * @param {number} smokePort
 * @returns {Promise<void>}
 */
async function assertStageBootsCore(smokePort) {
	const base = `http://127.0.0.1:${smokePort}/__stage/`;
	const mmVersion = await (
		await fetch(`http://127.0.0.1:${smokePort}/__harness/mm-versions`)
	).json();
	// The server runs under an empty home, so no mmvm version can be active:
	// the stage can only be serving the packaged core (`dist/core/`).
	if (mmVersion.usingBuiltIn !== true || mmVersion.active !== null) {
		throw new Error(
			`The packaged sandbox is not on its built-in core: ${JSON.stringify({ active: mmVersion.active, usingBuiltIn: mmVersion.usingBuiltIn })}`
		);
	}
	if (typeof mmVersion.builtInVersion !== "string" || !mmVersion.builtInVersion) {
		throw new Error(
			`The packaged sandbox reports no built-in core version: ${JSON.stringify(mmVersion)}`
		);
	}
	// The core's own page and files, plus one hoisted vendor file and the
	// server_functions-backed endpoint (its Node dependencies ship too).
	for (const requestPath of [
		"",
		"js/main.js",
		"css/main.css",
		"node_modules/moment/min/moment-with-locales.js",
		"node_modules/@fortawesome/fontawesome-free/css/all.min.css",
		"env",
		"config/"
	]) {
		const response = await fetch(`${base}${requestPath}`);
		if (!response.ok) {
			throw new Error(
				`Packaged stage answered HTTP ${response.status} for /__stage/${requestPath}.`
			);
		}
	}
	const html = await (await fetch(base)).text();
	if (!html.includes(`window.mmVersion = "${mmVersion.builtInVersion}"`)) {
		throw new Error(
			"Packaged stage page is not the built-in core's index.html."
		);
	}

	const { chromium } = await import("playwright");
	const browser = await chromium.launch();
	try {
		const page = await browser.newPage();
		await page.goto(base, { waitUntil: "domcontentloaded" });
		await page.waitForFunction(
			() =>
				document.documentElement.dataset.sandboxStage === "core" &&
				Boolean(
					document.querySelector(".module.MMM-TestModule .module-content")
						?.childElementCount
				),
			undefined,
			{ timeout: 30_000 }
		);
		const version = await page.evaluate(
			() => (window as unknown as { mmVersion?: string }).mmVersion
		);
		if (version !== mmVersion.builtInVersion) {
			throw new Error(
				`Packaged stage ran core ${String(version)}, expected ${mmVersion.builtInVersion}.`
			);
		}
	} finally {
		await browser.close();
	}
}

let originalNpmLocations: { cache: string; userconfig: string } | null = null;

/**
 * Environment for a packaged sandbox server under a fresh, empty home, so it
 * never reads the maintainer's own `~/.mmvm/active` (and can only run the
 * packaged built-in core). npm keeps the original cache and user config, so
 * `npm exec` stays offline-capable and uses the same registry settings.
 *
 * @returns {{ env: NodeJS.ProcessEnv, cleanup: () => void }}
 */
function createIsolatedHomeEnv() {
	if (!originalNpmLocations) {
		originalNpmLocations = {
			cache: runCommand(npmCommand, ["config", "get", "cache"]),
			userconfig: runCommand(npmCommand, ["config", "get", "userconfig"])
		};
	}
	const home = fs.mkdtempSync(
		path.join(os.tmpdir(), "magicmirror-module-sandbox-e2e-home-")
	);
	return {
		env: {
			HOME: home,
			USERPROFILE: home,
			npm_config_cache: originalNpmLocations.cache,
			npm_config_userconfig: originalNpmLocations.userconfig
		},
		cleanup() {
			fs.rmSync(home, { recursive: true, force: true });
		}
	};
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
	const isolatedHome = createIsolatedHomeEnv();
	const child = spawn(invocation.command, invocation.args, {
		cwd: moduleRoot,
		env: {
			...process.env,
			...quietNpmEnv,
			...isolatedHome.env,
			MM_SANDBOX_PORT: String(smokePort)
		},
		...invocation.options,
		stdio: ["ignore", "pipe", "pipe"],
		detached: process.platform !== "win32"
	});

	try {
		await waitForServerReady(child, smokePort);
		await assertServerResponds(smokePort);
		await assertStageBootsCore(smokePort);
	} finally {
		await killChildProcessTree(child);
		isolatedHome.cleanup();
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
	const isolatedHome = createIsolatedHomeEnv();
	const child = spawn(
		process.execPath,
		[getInstalledSandboxBinPath(moduleRoot)],
		{
			cwd: moduleRoot,
			env: {
				...process.env,
				...isolatedHome.env,
				MM_SANDBOX_PORT: String(smokePort)
			},
			stdio: ["ignore", "pipe", "pipe"],
			detached: process.platform !== "win32"
		}
	);

	try {
		await waitForServerReady(child, smokePort);
		await assertServerResponds(smokePort);
		await assertStageBootsCore(smokePort);
	} finally {
		await killChildProcessTree(child);
		isolatedHome.cleanup();
	}
}

/**
 * Seed one mmvm version into an isolated home from the repository's synced
 * built-in core (`mmcore-source/`), linked rather than copied, so the
 * packaged sandbox can activate a version without downloading it.
 *
 * @param {string} home
 * @returns {string} the mmvm version key
 */
function seedMmvmVersionFromBuiltInCore(home: string): string {
	const coreNodeModules = path.join(repoRoot, "mmcore-source", "node_modules");
	const version = JSON.parse(
		fs.readFileSync(
			path.join(coreNodeModules, "magicmirror", "package.json"),
			"utf8"
		)
	).version as string;
	const installDir = path.join(home, ".mmvm", "versions", version);
	fs.mkdirSync(installDir, { recursive: true });
	fs.symlinkSync(
		coreNodeModules,
		path.join(installDir, "node_modules"),
		"junction"
	);
	return version;
}

/**
 * Launch the installed sandbox CLI under an isolated home holding one mmvm
 * version, activate it through the MM Version routes, and assert that the
 * packaged server builds its helper shims and the stage boots that core.
 *
 * @param {string} moduleRoot
 * @param {number} smokePort
 * @returns {Promise<void>}
 */
async function runInstalledVersionActivation(moduleRoot, smokePort) {
	const isolatedHome = createIsolatedHomeEnv();
	const version = seedMmvmVersionFromBuiltInCore(isolatedHome.env.HOME);
	const child = spawn(
		process.execPath,
		[getInstalledSandboxBinPath(moduleRoot)],
		{
			cwd: moduleRoot,
			env: {
				...process.env,
				...isolatedHome.env,
				MM_SANDBOX_PORT: String(smokePort)
			},
			stdio: ["ignore", "pipe", "pipe"],
			detached: process.platform !== "win32"
		}
	);

	try {
		await waitForServerReady(child, smokePort);
		const response = await fetch(
			`http://127.0.0.1:${smokePort}/__harness/mm-versions/activate`,
			{
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ version })
			}
		);
		if (!response.ok) {
			throw new Error(
				`Activating mmvm version ${version} answered HTTP ${response.status}: ${await response.text()}`
			);
		}
		const state = await (
			await fetch(`http://127.0.0.1:${smokePort}/__harness/mm-versions`)
		).json();
		const info = state.versions?.find((entry) => entry.key === version);
		if (state.active !== version || info?.shimsBuilt !== true) {
			throw new Error(
				`mmvm version ${version} is not active with built shims: ${JSON.stringify({ active: state.active, info })}`
			);
		}
		const stage = await fetch(`http://127.0.0.1:${smokePort}/__stage/`);
		if (
			!stage.ok ||
			!(await stage.text()).includes(`window.mmVersion = "${version}"`)
		) {
			throw new Error(
				`The stage does not serve the activated core ${version} (HTTP ${stage.status}).`
			);
		}
	} finally {
		await killChildProcessTree(child);
		isolatedHome.cleanup();
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
	allocateLoopbackPort,
	buildCurrentRepo,
	cleanupPackedSandboxTarball,
	getInstalledSandboxBinPath,
	installTarballAsDevDependency,
	preparePackedSandboxTarball,
	runInstalledSmokeBinary,
	runInstalledVersionActivation,
	runSmokeCommand,
	withPackedSandbox
};
