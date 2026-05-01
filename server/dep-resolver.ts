/**
 * Iterative BFS local dependency resolver for module entry points.
 */

import * as fs from "node:fs";
import { createRequire } from "node:module";
import * as path from "pathe";

export interface DepResolverOptions {
	/** Absolute paths to start resolution from. */
	entryPoints: string[];
	/** Absolute path that bounds resolution — files outside this root are ignored. */
	moduleRoot: string;
}

export interface DepResolutionResult {
	resolvedFiles: Set<string>;
	errors: Array<{ file: string; reason: string }>;
}

/**
 * Extracts relative specifiers from file content using a combined require/import regex.
 * A new RegExp instance is created per call to avoid shared mutable lastIndex state.
 */
function extractRelativeSpecifiers(content: string): string[] {
	const specifierRe =
		/(?:require|import)\s*\(\s*['"]([^'"]+)['"]\s*\)|from\s+['"]([^'"]+)['"]/g;
	const specifiers: string[] = [];
	let match: RegExpExecArray | null;
	while ((match = specifierRe.exec(content)) !== null) {
		const specifier = match[1] ?? match[2];
		if (typeof specifier === "string" && specifier.startsWith(".")) {
			specifiers.push(specifier);
		}
	}
	return specifiers;
}

/**
 * Resolves local file dependencies starting from the given entry points using
 * iterative BFS. Only files inside `moduleRoot` and outside `node_modules` are
 * tracked. Resolution errors are collected non-fatally.
 */
export function resolveLocalDeps(
	options: DepResolverOptions
): DepResolutionResult {
	const { entryPoints, moduleRoot } = options;
	const resolvedFiles = new Set<string>();
	const errors: Array<{ file: string; reason: string }> = [];
	const visited = new Set<string>();
	const queue: string[] = [];

	for (const entry of entryPoints) {
		const abs = path.resolve(entry);
		if (!visited.has(abs)) {
			visited.add(abs);
			queue.push(abs);
		}
	}

	while (queue.length > 0) {
		const current = queue.shift() as string;

		let content: string;
		try {
			content = fs.readFileSync(current, "utf8");
		} catch (err) {
			errors.push({
				file: current,
				reason: err instanceof Error ? err.message : String(err)
			});
			continue;
		}

		resolvedFiles.add(current);

		const specifiers = extractRelativeSpecifiers(content);
		const requireFromCurrent = createRequire(current);

		for (const specifier of specifiers) {
			let resolved: string;
			try {
				resolved = requireFromCurrent.resolve(specifier);
			} catch (err) {
				errors.push({
					file: current,
					reason: `Cannot resolve '${specifier}': ${err instanceof Error ? err.message : String(err)}`
				});
				continue;
			}

			if (!resolved.startsWith(moduleRoot)) {
				continue;
			}

			if (resolved.includes("node_modules")) {
				continue;
			}

			if (!visited.has(resolved)) {
				visited.add(resolved);
				queue.push(resolved);
			}
		}
	}

	return { resolvedFiles, errors };
}
