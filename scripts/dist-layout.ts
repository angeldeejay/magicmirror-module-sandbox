/**
 * Side-effect-free description of the published `dist/` layout, shared by
 * `build-dist.ts` and the tests that pin it.
 */
import * as path from "pathe";

/**
 * Where the built-in core's browser files go inside `dist/`. The server
 * resolves the built-in core there when `mmcore-source/` is absent
 * (`server/stage/built-in-core.ts` `PACKAGED_CORE_DIRECTORY`, pinned equal by
 * `tests/unit/scripts/dist-layout.test.ts`).
 */
export const distCoreDirectory = "core";

/**
 * Repository paths copied verbatim into `dist/` at the same relative path.
 * `scripts/upstream-snapshots/core` holds the reviewed core drift hashes that
 * `server/stage/core-variants.ts` reads at runtime through a path relative to
 * its own file, so it must sit at the same place inside `dist/`.
 */
export const distCopyTargets: readonly string[] = [
	path.join("server", "templates"),
	path.join("client", "fonts"),
	path.join("client", "generated"),
	path.join("client", "styles"),
	path.join("client", "webfonts"),
	path.join("shims", "generated"),
	path.join("scripts", "upstream-snapshots", "core")
];
