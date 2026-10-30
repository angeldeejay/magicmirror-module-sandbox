/**
 * Pins tests/_fixtures/core-snippets to the reviewed MagicMirror tag bytes so
 * a formatter (eslint --fix, prettier) silently rewriting them is caught.
 */
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "pathe";
import { describe, expect, test } from "vitest";

const snippetsRoot = path.resolve(
	import.meta.dirname,
	"../../_fixtures/core-snippets"
);

interface Manifest {
	files: Record<string, string>;
}

const manifest = JSON.parse(
	fs.readFileSync(path.join(snippetsRoot, "MANIFEST.sha256.json"), "utf8")
) as Manifest;

function listFixtures(dir: string, prefix = ""): string[] {
	return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
		return entry.isDirectory()
			? listFixtures(path.join(dir, entry.name), rel)
			: [rel];
	});
}

describe("core-snippets fixtures", () => {
	test.each(Object.entries(manifest.files))(
		"%s matches the MagicMirror tag hash",
		(relPath, expected) => {
			const actual = createHash("sha256")
				.update(fs.readFileSync(path.join(snippetsRoot, relPath)))
				.digest("hex");
			expect(
				actual,
				`fixture reformatted: restore it from the MagicMirror tag (${relPath})`
			).toBe(expected);
		}
	);

	test("no fixture is missing from the manifest", () => {
		const onDisk = listFixtures(snippetsRoot)
			.filter((file) => file !== "MANIFEST.sha256.json")
			.sort();
		expect(onDisk).toEqual(Object.keys(manifest.files).sort());
	});
});
