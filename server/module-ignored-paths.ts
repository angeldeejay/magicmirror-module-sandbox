/**
 * Resolves which paths of the mounted module its repository ignores.
 *
 * The official module check analyzes a fresh clone, which never contains
 * ignored files. Locally the working tree does (build output, editor and
 * tool caches, config.sandbox.json), so Quality excludes them to analyze what
 * the official check would see. This is a deliberate local deviation.
 */

import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "pathe";
import ignore from "ignore";

export type RepositoryIgnoredPaths = {
	/** True when a module-relative path (forward slashes) is ignored. */
	isIgnored: (relativePath: string) => boolean;
	/** ESLint flat-config `ignores` globs covering the same paths. */
	eslintIgnores: string[];
};

const NO_IGNORED_PATHS: RepositoryIgnoredPaths = {
	isIgnored: () => false,
	eslintIgnores: []
};

/**
 * Lists ignored paths through git, which honours nested .gitignore files,
 * .git/info/exclude and the user's global excludes. Directories come back
 * collapsed with a trailing slash. Returns null outside a git work tree or
 * when git is unavailable.
 */
function listGitIgnoredPaths(moduleRoot: string): string[] | null {
	try {
		const output = execFileSync(
			"git",
			[
				"ls-files",
				"-z",
				"--others",
				"--ignored",
				"--exclude-standard",
				"--directory"
			],
			{
				cwd: moduleRoot,
				encoding: "utf8",
				stdio: ["ignore", "pipe", "ignore"],
				timeout: 10_000
			}
		);
		const entries = output.split("\0").filter(Boolean);
		// The module directory itself is ignored by an enclosing repository:
		// git has nothing useful to say about its contents.
		return entries.includes("./") ? null : entries;
	} catch {
		return null;
	}
}

/**
 * Builds a matcher from git-reported ignored paths.
 */
function fromGitIgnoredPaths(entries: string[]): RepositoryIgnoredPaths {
	const directories = entries.filter((entry) => entry.endsWith("/"));
	const files = new Set(entries.filter((entry) => !entry.endsWith("/")));
	return {
		isIgnored: (relativePath) =>
			files.has(relativePath) ||
			directories.some((directory) => relativePath.startsWith(directory)),
		eslintIgnores: [
			...directories.map((directory) => `${directory}**`),
			...files
		]
	};
}

/**
 * Fallback for modules that are not git work trees: the root .gitignore.
 */
function fromRootGitignore(moduleRoot: string): RepositoryIgnoredPaths {
	const gitignorePath = path.join(moduleRoot, ".gitignore");
	if (!fs.existsSync(gitignorePath)) {
		return NO_IGNORED_PATHS;
	}
	const matcher = ignore().add(fs.readFileSync(gitignorePath, "utf8"));
	const eslintIgnores: string[] = [];
	const walk = (relativeDir: string): void => {
		let entries: fs.Dirent[];
		try {
			entries = fs.readdirSync(path.join(moduleRoot, relativeDir), {
				withFileTypes: true
			});
		} catch {
			return;
		}
		for (const entry of entries) {
			if (entry.name === "node_modules" || entry.name === ".git") {
				continue;
			}
			const relativePath = relativeDir
				? `${relativeDir}/${entry.name}`
				: entry.name;
			if (entry.isDirectory()) {
				if (matcher.ignores(`${relativePath}/`)) {
					eslintIgnores.push(`${relativePath}/**`);
				} else {
					walk(relativePath);
				}
			} else if (matcher.ignores(relativePath)) {
				eslintIgnores.push(relativePath);
			}
		}
	};
	walk("");
	return {
		isIgnored: (relativePath) => matcher.ignores(relativePath),
		eslintIgnores
	};
}

/**
 * Resolves the paths the mounted module's repository ignores.
 */
export function resolveRepositoryIgnoredPaths(
	moduleRoot: string
): RepositoryIgnoredPaths {
	const gitEntries = listGitIgnoredPaths(moduleRoot);
	return gitEntries
		? fromGitIgnoredPaths(gitEntries)
		: fromRootGitignore(moduleRoot);
}
