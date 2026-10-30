/**
 * Where the built-in MagicMirror core lives, shared by the stage
 * (`core-root.ts`, which serves it) and the version manager
 * (`getBuiltInMmVersion`, which reports its version), so both always name the
 * same core. Dependency-free: `core-root.ts` imports the version manager.
 */

import * as fs from "node:fs";
import * as path from "pathe";

/**
 * Directory, relative to the harness root, that holds the packaged built-in
 * core in a distribution install (`dist/core/`, written by
 * `scripts/build-dist.ts`). Its vendor packages sit in `core/node_modules/`,
 * so Node resolution from the core root finds them as in `mmcore-source/`.
 */
export const PACKAGED_CORE_DIRECTORY = "core";

/**
 * Built-in core roots in order of preference: the synced `mmcore-source/` in
 * the source repository, then the packaged copy of a distribution install.
 */
export function getBuiltInCoreRootCandidates(root: string): string[] {
	return [
		path.join(root, "mmcore-source", "node_modules", "magicmirror"),
		path.join(root, PACKAGED_CORE_DIRECTORY)
	];
}

/**
 * Returns the first built-in core root that holds a core page, or null.
 */
export function findBuiltInCoreRoot(root: string): string | null {
	return (
		getBuiltInCoreRootCandidates(root).find((candidate) =>
			fs.existsSync(path.join(candidate, "index.html"))
		) ?? null
	);
}
