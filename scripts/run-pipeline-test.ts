/**
 * Runs the CI pipeline via `act` and performs Docker cleanup regardless of outcome.
 *
 * Resolves act binary and Docker socket explicitly — never assumes PATH availability.
 * Preserves act-toolcache volume (shared across runs for performance).
 */
import { execSync, spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import Dockerode from "dockerode";

const ACT_JOB_VOLUME_PREFIX = "act-CI-";
const ACT_CONTAINER_PREFIX = "act-";
const PLATFORM_IMAGE =
	"ubuntu-latest=ghcr.io/angeldeejay/ubuntu-latest-playwright:latest";

// ---------------------------------------------------------------------------
// Binary resolution
// ---------------------------------------------------------------------------

function resolveBinary(envVar: string, name: string): string {
	const envPath = process.env[envVar];
	if (envPath && fs.existsSync(envPath)) {
		return envPath;
	}

	try {
		const cmd = os.platform() === "win32" ? `where ${name}` : `which ${name}`;
		const result = execSync(cmd, {
			encoding: "utf8",
			stdio: ["pipe", "pipe", "pipe"]
		})
			.trim()
			.split(/\r?\n/)[0];
		if (result && fs.existsSync(result)) {
			return result;
		}
	} catch {
		// fall through
	}

	const localBin = path.join(process.cwd(), "node_modules", ".bin", name);
	for (const candidate of [localBin, `${localBin}.exe`, `${localBin}.cmd`]) {
		if (fs.existsSync(candidate)) {
			return candidate;
		}
	}

	throw new Error(
		`Binary not found: "${name}". Set ${envVar} env var to its absolute path.`
	);
}

// ---------------------------------------------------------------------------
// Docker socket resolution
// ---------------------------------------------------------------------------

type DockerodeOptions = ConstructorParameters<typeof Dockerode>[0];

function resolveDockerOptions(): DockerodeOptions {
	const dockerHost = process.env.DOCKER_HOST;

	if (dockerHost) {
		if (dockerHost.startsWith("unix://")) {
			return { socketPath: dockerHost.slice("unix://".length) };
		}
		if (dockerHost.startsWith("npipe://")) {
			return { socketPath: dockerHost.slice("npipe://".length) };
		}
		if (dockerHost.startsWith("tcp://")) {
			const url = new URL(dockerHost);
			return {
				host: url.hostname,
				port: Number(url.port) || 2376
			};
		}
	}

	if (os.platform() === "win32") {
		return { socketPath: "//./pipe/docker_engine" };
	}

	const unixSocket = "/var/run/docker.sock";
	if (fs.existsSync(unixSocket)) {
		return { socketPath: unixSocket };
	}

	return {};
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

async function collectActVolumes(
	docker: Dockerode,
	containerIds: string[]
): Promise<string[]> {
	const volumeNames = new Set<string>();
	for (const id of containerIds) {
		try {
			const info = await docker.getContainer(id).inspect();
			for (const mount of info.Mounts ?? []) {
				if (
					mount.Type === "volume" &&
					mount.Name &&
					mount.Name.startsWith(ACT_JOB_VOLUME_PREFIX)
				) {
					volumeNames.add(mount.Name);
				}
			}
		} catch {
			// container already gone — ignore
		}
	}
	return [...volumeNames];
}

async function cleanupActResources(docker: Dockerode): Promise<void> {
	console.log("\n[pipeline] Cleaning up act containers and volumes...");

	let containers: Dockerode.ContainerInfo[] = [];
	try {
		const all = await docker.listContainers({ all: true });
		containers = all.filter((c) =>
			c.Names.some((n) => n.replace(/^\//, "").startsWith(ACT_CONTAINER_PREFIX))
		);
	} catch (err) {
		console.warn(`[pipeline]   could not list containers: ${err}`);
		return;
	}

	if (containers.length === 0) {
		console.log("[pipeline]   no act containers found.");
		return;
	}

	const containerIds = containers.map((c) => c.Id);
	const volumesToRemove = await collectActVolumes(docker, containerIds);

	for (const info of containers) {
		const label = info.Names[0]?.replace(/^\//, "") ?? info.Id.slice(0, 12);
		const container = docker.getContainer(info.Id);
		try {
			if (info.State === "running") {
				console.log(`[pipeline]   stopping: ${label}`);
				await container.stop({ t: 5 });
			}
			console.log(`[pipeline]   removing container: ${label}`);
			await container.remove({ force: true });
		} catch (err) {
			console.warn(`[pipeline]   warning removing ${label}: ${err}`);
		}
	}

	for (const name of volumesToRemove) {
		try {
			console.log(`[pipeline]   removing volume: ${name}`);
			await docker
				.getVolume(name)
				.remove({ force: true } as Parameters<Dockerode.Volume["remove"]>[0]);
		} catch (err) {
			console.warn(`[pipeline]   warning removing volume ${name}: ${err}`);
		}
	}
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
	let actBin: string;
	try {
		actBin = resolveBinary("ACT_PATH", "act");
	} catch (err) {
		console.error(`[pipeline] ${err}`);
		process.exit(1);
	}

	const dockerOptions = resolveDockerOptions();
	const docker = new Dockerode(dockerOptions);

	console.log(`[pipeline] act binary  : ${actBin}`);
	console.log(`[pipeline] docker socket: ${JSON.stringify(dockerOptions)}`);

	try {
		await docker.ping();
		console.log("[pipeline] docker     : reachable\n");
	} catch (err) {
		console.error(`[pipeline] Cannot reach Docker daemon: ${err}`);
		process.exit(1);
	}

	const actArgs = [
		"push",
		"--job",
		"validate",
		"--use-gitignore",
		"-P",
		PLATFORM_IMAGE,
		...process.argv.slice(2)
	];

	console.log(`[pipeline] running: ${actBin} ${actArgs.join(" ")}\n`);

	const exitCode = await new Promise<number>((resolve) => {
		const proc = spawn(actBin, actArgs, { stdio: "inherit", shell: false });

		let settled = false;
		function settle(code: number): void {
			if (!settled) {
				settled = true;
				resolve(code);
			}
		}

		async function handleSignal(signal: NodeJS.Signals): Promise<void> {
			console.log(`\n[pipeline] ${signal} received — stopping act...`);
			proc.kill(signal);
			// give act a moment to handle its own cleanup before we force-kill
			await new Promise<void>((r) => setTimeout(r, 2000));
			if (!settled) {
				proc.kill("SIGKILL");
			}
			settle(130);
		}

		process.once("SIGINT", () => void handleSignal("SIGINT"));
		process.once("SIGTERM", () => void handleSignal("SIGTERM"));

		proc.on("exit", (code, signal) => {
			settle(signal != null ? 1 : (code ?? 0));
		});

		proc.on("error", (err) => {
			console.error(`\n[pipeline] spawn error: ${err.message}`);
			settle(1);
		});
	});

	await cleanupActResources(docker);

	const status = exitCode === 0 ? "succeeded" : exitCode === 130 ? "cancelled" : "FAILED";
	console.log(`\n[pipeline] Pipeline ${status}. Exit code: ${exitCode}`);
	process.exit(exitCode);
}

main().catch((err) => {
	console.error(`[pipeline] Unexpected error: ${err}`);
	process.exit(1);
});
