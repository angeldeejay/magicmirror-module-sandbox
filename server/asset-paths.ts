/**
 * Resolve runtime asset locations shared by the Fastify host and build flows.
 */

import * as path from "pathe";
import { createRequire } from "node:module";
import { harnessRoot } from "./paths.ts";

const nodeRequire = createRequire(
	typeof __filename === "string" ? __filename : import.meta.url
);

/**
 * Resolves animate css.
 */
export function resolveAnimateCss(): string {
	return nodeRequire.resolve("animate.css/animate.min.css");
}

/**
 * Resolves font awesome css.
 */
export function resolveFontAwesomeCss(): string {
	return path.join(harnessRoot, "client", "styles", "font-awesome.css");
}

/**
 * Resolves webfonts root.
 */
export function resolveWebfontsRoot(): string {
	return path.join(harnessRoot, "client", "webfonts");
}

/**
 * Resolves croner path.
 */
export function resolveCronerPath(): string {
	return path.join(
		harnessRoot,
		"client",
		"generated",
		"vendor",
		"croner.js"
	);
}

/**
 * Resolves moment path.
 */
export function resolveMomentPath(): string {
	return path.join(
		harnessRoot,
		"client",
		"generated",
		"vendor",
		"moment.js"
	);
}

/**
 * Resolves moment timezone path.
 */
export function resolveMomentTimezonePath(): string {
	return path.join(
		harnessRoot,
		"client",
		"generated",
		"vendor",
		"moment-timezone.js"
	);
}
