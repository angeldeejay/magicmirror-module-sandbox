/**
 * Thin bare-module wrapper that resolves the sandbox's core-coupled `node_helper` artifact.
 */

import * as path from "node:path";
import { createRequire } from "node:module";

const nodeRequire = createRequire(
	typeof __filename === "string" ? __filename : import.meta.url
);
const moduleSandboxGlobal = globalThis as typeof globalThis & {
	root_path?: string;
};

/**
 * Resolves one synced core node helper instance.
 */
function resolveCoreNodeHelper(): unknown {
	if (
		typeof moduleSandboxGlobal.root_path !== "string" ||
		!moduleSandboxGlobal.root_path
	) {
		throw new Error(
			"global.root_path must be set before requiring the sandbox node_helper compatibility module."
		);
	}

	return nodeRequire(
		path.join(moduleSandboxGlobal.root_path, "js", "node_helper.js")
	);
}

const NodeHelper = resolveCoreNodeHelper();

export default NodeHelper;
