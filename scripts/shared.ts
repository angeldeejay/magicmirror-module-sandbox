/**
 * Shared utilities used across build scripts.
 */

import * as fs from "node:fs";
import { createRequire } from "node:module";
import * as path from "pathe";

const nodeRequire = createRequire(import.meta.url);

/**
 * Normalizes a Windows path to forward slashes.
 */
export function fromOS(p: string): string {
	return p.replace(/\\/g, "/");
}

/**
 * Ensures directory exists, creating it recursively if needed.
 */
export function ensureDirectory(directoryPath: string): void {
	fs.mkdirSync(directoryPath, { recursive: true });
}

/**
 * Resolves the root directory of the MagicMirror package.
 * Prefers mmcore-source/ (populated by sync-mmcore-source.ts) over the
 * magicmirror devDependency so the devDep can be removed once sync runs.
 *
 * @param repoRoot — absolute path to the sandbox repo root used as resolution base
 */
export function resolveMagicMirrorRoot(repoRoot: string): string {
	const mmcoreSourcePath = path.join(repoRoot, "mmcore-source", "node_modules", "magicmirror");
	if (fs.existsSync(path.join(mmcoreSourcePath, "package.json"))) {
		return mmcoreSourcePath;
	}
	const magicMirrorEntryPath = nodeRequire.resolve("magicmirror", {
		paths: [repoRoot]
	});
	return path.resolve(path.dirname(magicMirrorEntryPath), "..");
}
