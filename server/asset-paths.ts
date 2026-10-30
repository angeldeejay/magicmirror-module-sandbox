/**
 * Resolve runtime asset locations shared by the Fastify host and build flows.
 */

import * as path from "pathe";
import { harnessRoot } from "./paths.ts";

/**
 * Resolves webfonts root.
 */
export function resolveWebfontsRoot(): string {
	return path.join(harnessRoot, "client", "webfonts");
}
