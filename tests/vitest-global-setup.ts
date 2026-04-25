/**
 * Global Vitest setup that prepares node-compat shims before suite execution.
 */
import { buildNodeCompat } from "../scripts/build-node-compat.ts";

/**
 * Build generated CommonJS compatibility shims before any Vitest project runs.
 */
export async function setup() {
	buildNodeCompat();
}
