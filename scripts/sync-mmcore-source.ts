#!/usr/bin/env tsx

/**
 * Maintainer-mode MagicMirror core source sync.
 *
 * Downloads the latest (or specified) stable MM release from npm using the official
 * magicmirror package directly into mmcore-source/, replacing the magicmirror devDependency.
 *
 * Usage:
 *   tsx scripts/sync-mmcore-source.ts                # latest stable
 *   tsx scripts/sync-mmcore-source.ts --version 2.36.0
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

function parseArgs(): { version?: string; force: boolean } {
	const args = process.argv.slice(2);
	let version: string | undefined;
	let force = false;
	for (let i = 0; i < args.length; i++) {
		if ((args[i] === "--version" || args[i] === "-v") && args[i + 1]) {
			version = args[++i].replace(/^v/, "");
		} else if (args[i] === "--force" || args[i] === "-f") {
			force = true;
		}
	}
	return { version, force };
}

async function main(): Promise<void> {
	const { version: pinnedVersion, force } = parseArgs();

	const manifest = readCurrentManifest();

	// Skip network call entirely when a manifest exists and no explicit version or force flag
	if (!pinnedVersion && !force && manifest) {
		process.stdout.write(`mmcore-source already at ${manifest.version} — skipping.\n`);
		return;
	}

	let targetVersion: string;
	try {
		targetVersion = pinnedVersion ?? (await fetchLatestVersion());
	} catch (err) {
		if (manifest) {
			process.stdout.write(`sync-mmcore-source: ${(err as Error).message} — keeping existing ${manifest.version}\n`);
			return;
		}
		throw err;
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
