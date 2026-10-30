#!/usr/bin/env tsx

/**
 * Maintainer-mode MagicMirror core source sync.
 *
 * Downloads the pinned built-in MM release (or a specified one) from npm using the
 * official magicmirror package directly into mmcore-source/, replacing the magicmirror
 * devDependency. The pin keeps the built-in core, which the stage runs, identical on
 * every checkout; postinstall and build both use it, with no network call.
 *
 * Usage:
 *   tsx scripts/sync-mmcore-source.ts                # pinned built-in version
 *   tsx scripts/sync-mmcore-source.ts --version 2.38.0
 *   tsx scripts/sync-mmcore-source.ts --latest       # latest stable (GitHub API)
 *   tsx scripts/sync-mmcore-source.ts --force        # re-download even if up-to-date
 */

import * as fs from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as path from "pathe";
import { fromOS } from "./shared.ts";

const __filename = fromOS(fileURLToPath(import.meta.url));
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");
const MMCORE_SOURCE_ROOT = path.join(root, "mmcore-source");
const VERSION_MANIFEST_PATH = path.join(MMCORE_SOURCE_ROOT, "version.json");
/**
 * MagicMirror release used as the built-in core: the latest MagicMirrorOrg
 * release, pinned here rather than resolved at build time, so every build and
 * CI run is deterministic and needs no GitHub API call. Bump it by hand on a
 * new release, and keep a CI core-matrix entry for every version that has a
 * pinned core-fidelity suite.
 */
const BUILT_IN_CORE_VERSION = "2.38.0";

type GhRelease = { tag_name: string; prerelease: boolean };
type VersionManifest = { version: string; syncedAt: string };

function readCurrentManifest(): VersionManifest | null {
	try {
		if (!fs.existsSync(VERSION_MANIFEST_PATH)) return null;
		return JSON.parse(fs.readFileSync(VERSION_MANIFEST_PATH, "utf8")) as VersionManifest;
	} catch {
		return null;
	}
}

async function fetchLatestVersion(): Promise<string> {
	const res = await fetch(
		"https://api.github.com/repos/MagicMirrorOrg/MagicMirror/releases?per_page=10",
		{
			headers: {
				Accept: "application/vnd.github+json",
				"User-Agent": "magicmirror-module-sandbox/sync-mmcore-source"
			}
		}
	);
	if (!res.ok) throw new Error(`GitHub API error: ${res.status} ${res.statusText}`);
	const releases = (await res.json()) as GhRelease[];
	const latest = releases.find((r) => !r.prerelease);
	if (!latest) throw new Error("No stable release found on GitHub");
	return latest.tag_name.replace(/^v/, "");
}

function spawnNpm(args: string[]): ReturnType<typeof spawnSync> {
	if (process.platform === "win32") {
		return spawnSync("cmd.exe", ["/c", "npm", ...args], {
			stdio: "inherit",
			encoding: "utf8"
		});
	}
	return spawnSync("npm", args, { stdio: "inherit", encoding: "utf8" });
}

const SAFE_VERSION_RE = /^[a-zA-Z0-9._-]+$/;

function npmInstall(version: string): void {
	if (!SAFE_VERSION_RE.test(version)) {
		throw new Error(`Unsafe version string rejected: "${version}"`);
	}
	const result = spawnNpm([
		"install",
		"--prefix",
		MMCORE_SOURCE_ROOT,
		`magicmirror@${version}`,
		"--no-save",
		"--ignore-scripts"
	]);
	if (result.error) throw result.error;
	if (result.status !== 0) {
		throw new Error(`npm install exited with status ${result.status ?? "unknown"}`);
	}
}

function writeManifest(version: string): void {
	const manifest: VersionManifest = { version, syncedAt: new Date().toISOString() };
	fs.writeFileSync(VERSION_MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

function parseArgs(): { version?: string; latest: boolean; force: boolean } {
	const args = process.argv.slice(2);
	let version: string | undefined;
	let latest = false;
	let force = false;
	for (let i = 0; i < args.length; i++) {
		if ((args[i] === "--version" || args[i] === "-v") && args[i + 1]) {
			version = args[++i].replace(/^v/, "");
		} else if (args[i] === "--latest") {
			latest = true;
		} else if (args[i] === "--force" || args[i] === "-f") {
			force = true;
		}
	}
	return { version, latest, force };
}

async function main(): Promise<void> {
	const { version: requestedVersion, latest, force } = parseArgs();

	const manifest = readCurrentManifest();

	// Only --latest calls the GitHub API; the default is the pinned built-in version.
	let targetVersion = requestedVersion ?? BUILT_IN_CORE_VERSION;
	if (latest) {
		try {
			targetVersion = await fetchLatestVersion();
		} catch (err) {
			if (manifest) {
				process.stdout.write(`sync-mmcore-source: ${(err as Error).message} — keeping existing ${manifest.version}\n`);
				return;
			}
			throw err;
		}
	}

	if (!force && manifest?.version === targetVersion) {
		process.stdout.write(`mmcore-source already at ${targetVersion} — skipping.\n`);
		return;
	}

	if (manifest) {
		process.stdout.write(`Updating mmcore-source: ${manifest.version} → ${targetVersion}\n`);
	} else {
		process.stdout.write(`Initializing mmcore-source with magicmirror@${targetVersion}\n`);
	}

	fs.mkdirSync(MMCORE_SOURCE_ROOT, { recursive: true });
	npmInstall(targetVersion);
	writeManifest(targetVersion);

	process.stdout.write(`magicmirror@${targetVersion} synced to mmcore-source/\n`);
}

main().catch((err: Error) => {
	process.stderr.write(
		`sync-mmcore-source: ${err instanceof Error ? err.message : String(err)}\n`
	);
	process.exit(1);
});
