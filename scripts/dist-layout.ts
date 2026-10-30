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
 * What `scripts/build-node-compat.ts` reads when the packaged sandbox builds
 * an activated mmvm version's helper shims (`server/mm-version-manager.ts`
 * `buildShimsForVersion`): the shim sources it compiles and the templates it
 * renders, at the same paths relative to its own file.
 */
export const distShimBuilderSources: readonly string[] = [
	path.join("shims", "logger.ts"),
	path.join("shims", "node_helper.ts"),
	path.join("scripts", "templates")
];

/**
 * Build scripts transpiled into `dist/scripts/` next to the server code: the
 * shim builder and the helpers it imports.
 */
export const distScriptSources: readonly string[] = [
	path.join("scripts", "build-node-compat.ts"),
	path.join("scripts", "shared.ts")
];

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
	path.join("scripts", "upstream-snapshots", "core"),
	...distShimBuilderSources
];
