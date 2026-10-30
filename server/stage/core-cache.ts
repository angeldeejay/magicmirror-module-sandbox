/**
 * In-process caches of MagicMirror core server code, and how to drop them.
 *
 * The stage loads a core's own server files (`js/defaults.js`,
 * `js/server_functions.js`, its bundled `express`) through `require`, and
 * keeps one express sub-app per core root. When a core is replaced on disk
 * (redownloaded, or deleted and installed again under the same key), those
 * caches still hold the old code, so the backend would stop matching the
 * frontend the stage serves from disk. `forgetCoreInstall` drops both.
 */

import { createRequire } from "node:module";

const nodeRequire = createRequire(
	/* v8 ignore next */
	typeof __filename === "string" ? __filename : import.meta.url
);

type CoreForgottenListener = (installPrefix: string) => void;

const listeners = new Set<CoreForgottenListener>();

/**
 * Normalises a path to forward slashes with one trailing slash, the form
 * used to compare `require.cache` keys and core roots across platforms.
 */
export function toInstallPrefix(directory: string): string {
	const normalized = directory.replace(/\\/g, "/").replace(/\/+$/, "");
	return `${normalized}/`;
}

/**
 * Whether `target` lies inside the directory `installPrefix` names
 * (`toInstallPrefix` form). Compared case-insensitively on Windows, whose
 * file system ignores case.
 */
export function isInsideInstall(installPrefix: string, target: string): boolean {
	const candidate = toInstallPrefix(target);
	if (process.platform === "win32") {
		return candidate.toLowerCase().startsWith(installPrefix.toLowerCase());
	}
	return candidate.startsWith(installPrefix);
}

/**
 * Registers a listener called with the install prefix of every forgotten
 * core. Returns the unsubscribe function.
 */
export function onCoreForgotten(listener: CoreForgottenListener): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

/**
 * Drops every cached piece of server code loaded from a core install
 * directory: its `require.cache` entries (core files and the packages it
 * bundles, such as `express`) and, through the registered listeners, the
 * stage's per-core express sub-apps. The next stage request loads that
 * core's code from disk again.
 *
 * @param {string} installDirectory - the core's install directory (an mmvm
 *   `versions/<key>/`, or any core root)
 */
export function forgetCoreInstall(installDirectory: string): void {
	const installPrefix = toInstallPrefix(installDirectory);
	for (const cacheKey of Object.keys(nodeRequire.cache)) {
		if (isInsideInstall(installPrefix, cacheKey)) {
			delete nodeRequire.cache[cacheKey];
		}
	}
	for (const listener of listeners) {
		listener(installPrefix);
	}
}
