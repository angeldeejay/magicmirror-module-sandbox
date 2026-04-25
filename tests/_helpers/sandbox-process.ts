/**
 * Sandbox process lifecycle helpers for browser-backed and smoke test suites.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { sandboxRoot } from "./sandbox-test-environment.ts";

/**
 * Resolve the direct sandbox server entrypoint used by in-repo test helpers.
 *
 * Browser-backed test helpers should launch the real server entrypoint directly
 * instead of the stable JS wrapper, because that wrapper shells out through a
 * blocking `spawnSync()` bridge and complicates teardown signal handling.
 *
 * @returns {{ command: string, args: string[] }}
 */
export function getSandboxServerInvocation() {
	const sourceEntrypointCandidates = [
		path.join(sandboxRoot, "server", "index.ts"),
		path.join(sandboxRoot, "server", "index.js")
	];
	const distEntrypoint = path.join(
		sandboxRoot,
		"dist",
		"server",
		"index.cjs"
	);
	const entrypoint =
		sourceEntrypointCandidates.find((candidate) =>
			fs.existsSync(candidate)
		) || distEntrypoint;

	if (entrypoint.endsWith(".ts")) {
		return {
			command: process.execPath,
			args: ["--experimental-strip-types", entrypoint]
		};
	}

	return {
		command: process.execPath,
		args: [entrypoint]
	};
}
