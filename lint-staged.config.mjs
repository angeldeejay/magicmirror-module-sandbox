// Files under these prefixes are verbatim copies of MagicMirror core files
// (and their sha256 manifest). Any formatter or autofixer would change their
// bytes and break the reviewed hashes, so they never reach eslint --fix.
// The pre-commit hook passes --config to this file because the fixtures contain MagicMirror's own package.json with a lint-staged block, which lint-staged would otherwise apply to them as the closest config.
const PROTECTED_PREFIX = "/tests/_fixtures/core-snippets/";

/**
 * lint-staged passes absolute paths (backslashes on Windows); normalise
 * before matching.
 * @param {string} file
 * @returns {boolean}
 */
const isProtected = (file) =>
	file.replaceAll("\\", "/").includes(PROTECTED_PREFIX);

/** @type {import("lint-staged").Configuration} */
export default {
	"*.{ts,tsx,js,mjs,cjs,json}": (files) => {
		const lintable = files.filter((file) => !isProtected(file));
		if (lintable.length === 0) return [];
		const args = lintable
			.map((file) => `"${file.replaceAll("\\", "/")}"`)
			.join(" ");
		return `node node_modules/eslint/bin/eslint.js --fix ${args}`;
	}
};
