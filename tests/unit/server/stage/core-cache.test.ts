/**
 * Unit tests for server/stage/core-cache.ts: forgetting the server code of a
 * core install loaded in this process.
 */
import * as fs from "node:fs";
import { createRequire } from "node:module";
import * as os from "node:os";
import * as path from "pathe";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
	forgetCoreInstall,
	isInsideInstall,
	onCoreForgotten,
	toInstallPrefix
} from "../../../../server/stage/core-cache.ts";

const nodeRequire = createRequire(import.meta.url);
const temporaryDirectories: string[] = [];

afterEach(() => {
	for (const directory of temporaryDirectories.splice(0)) {
		fs.rmSync(directory, { recursive: true, force: true });
	}
});

function makeInstall(): string {
	const directory = fs.realpathSync(
		fs.mkdtempSync(path.join(os.tmpdir(), "core-cache-"))
	);
	temporaryDirectories.push(directory);
	return directory;
}

describe("install prefixes", () => {
	test("toInstallPrefix uses forward slashes and one trailing slash", () => {
		expect(toInstallPrefix("C:\\Users\\me\\.mmvm\\versions\\2.38.0")).toBe(
			"C:/Users/me/.mmvm/versions/2.38.0/"
		);
		expect(toInstallPrefix("/home/me/.mmvm/versions/develop//")).toBe(
			"/home/me/.mmvm/versions/develop/"
		);
	});

	test("isInsideInstall matches the directory and its files, not siblings", () => {
		const prefix = toInstallPrefix("/home/me/.mmvm/versions/2.38.0");
		expect(
			isInsideInstall(prefix, "/home/me/.mmvm/versions/2.38.0")
		).toBe(true);
		expect(
			isInsideInstall(
				prefix,
				"/home/me/.mmvm/versions/2.38.0/node_modules/magicmirror/js/defaults.js"
			)
		).toBe(true);
		expect(
			isInsideInstall(prefix, "/home/me/.mmvm/versions/2.38.0-rc/js/a.js")
		).toBe(false);
		expect(isInsideInstall(prefix, "/home/me/.mmvm/shims/2.38.0/a.js")).toBe(
			false
		);
	});

	test.runIf(process.platform === "win32")(
		"isInsideInstall ignores case on Windows",
		() => {
			expect(
				isInsideInstall(
					toInstallPrefix("C:/Users/Me/.mmvm/versions/develop"),
					"c:\\users\\me\\.mmvm\\versions\\develop\\js\\defaults.js"
				)
			).toBe(true);
		}
	);
});

describe("forgetCoreInstall", () => {
	test("drops the require.cache entries under the install and only those", () => {
		const install = makeInstall();
		const other = makeInstall();
		const insideFile = path.join(install, "defaults.js");
		const otherFile = path.join(other, "defaults.js");
		fs.writeFileSync(insideFile, "module.exports = { release: 'old' };");
		fs.writeFileSync(otherFile, "module.exports = { release: 'kept' };");
		expect(nodeRequire(insideFile)).toEqual({ release: "old" });
		expect(nodeRequire(otherFile)).toEqual({ release: "kept" });

		fs.writeFileSync(insideFile, "module.exports = { release: 'new' };");
		fs.writeFileSync(otherFile, "module.exports = { release: 'changed' };");
		forgetCoreInstall(install);

		expect(nodeRequire(insideFile)).toEqual({ release: "new" });
		expect(nodeRequire(otherFile)).toEqual({ release: "kept" });
	});

	test("notifies listeners with the install prefix until they unsubscribe", () => {
		const listener = vi.fn();
		const unsubscribe = onCoreForgotten(listener);
		forgetCoreInstall("/home/me/.mmvm/versions/develop");
		expect(listener).toHaveBeenCalledWith("/home/me/.mmvm/versions/develop/");

		unsubscribe();
		forgetCoreInstall("/home/me/.mmvm/versions/develop");
		expect(listener).toHaveBeenCalledTimes(1);
	});
});
