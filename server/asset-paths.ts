/**
 * Resolve runtime asset locations shared by the Fastify host and build flows.
 */

import * as path from "node:path";
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
	const packageRoot = path.dirname(
		nodeRequire.resolve("@fortawesome/fontawesome-free/package.json")
	);
	return path.join(packageRoot, "css", "all.min.css");
}

/**
 * Resolves webfonts root.
 */
export function resolveWebfontsRoot(): string {
	const packageRoot = path.dirname(
		nodeRequire.resolve("@fortawesome/fontawesome-free/package.json")
	);
	return path.join(packageRoot, "webfonts");
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
