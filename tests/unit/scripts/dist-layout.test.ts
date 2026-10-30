/**
 * Pins the published dist/ layout for files the server reads at runtime
 * through paths relative to its own sources.
 */
import * as fs from "node:fs";
import * as path from "pathe";
import { expect, test } from "vitest";
import {
	distCopyTargets,
	distCoreDirectory,
	distScriptSources,
	distShimBuilderSources
} from "../../../scripts/dist-layout.ts";
import { PACKAGED_CORE_DIRECTORY } from "../../../server/stage/built-in-core.ts";
import {
	CORE_PIECES,
	coreSnapshotDir
} from "../../../server/stage/core-variants.ts";

const repoRoot = path.resolve(import.meta.dirname, "../../..");

test("dist copies the reviewed core snapshots where core-variants resolves them", () => {
	// build-dist transpiles server/ file by file into dist/server/, so the
	// snapshot dir resolves to the same repo-relative path inside dist/.
	const relativeSnapshotDir = path.relative(repoRoot, coreSnapshotDir);
	expect(relativeSnapshotDir).toBe(
		path.join("scripts", "upstream-snapshots", "core")
	);
	expect(distCopyTargets).toContain(relativeSnapshotDir);

	const distRoot = path.join(repoRoot, "dist");
	const distStageDir = path.join(distRoot, "server", "stage");
	expect(path.resolve(distStageDir, "..", "..", relativeSnapshotDir)).toBe(
		path.join(distRoot, relativeSnapshotDir)
	);
});

test("every core piece has a reviewed snapshot file to ship", () => {
	for (const piece of CORE_PIECES) {
		expect(fs.existsSync(path.join(coreSnapshotDir, `${piece}.json`))).toBe(
			true
		);
	}
});

test("dist packages the built-in core where the server looks for it", () => {
	expect(distCoreDirectory).toBe(PACKAGED_CORE_DIRECTORY);
});

test("dist ships the shim builder with every file it reads and imports", () => {
	for (const source of [...distShimBuilderSources, ...distScriptSources]) {
		expect(fs.existsSync(path.join(repoRoot, source))).toBe(true);
	}
	expect(distCopyTargets).toEqual(
		expect.arrayContaining([...distShimBuilderSources])
	);
	// Every sandbox file the builder imports must be transpiled next to it.
	const builder = fs.readFileSync(
		path.join(repoRoot, "scripts", "build-node-compat.ts"),
		"utf8"
	);
	const relativeImports = [...builder.matchAll(/from "(\.[^"]+)"/g)].map(
		(match) => path.join("scripts", match[1])
	);
	expect(relativeImports.length).toBeGreaterThan(0);
	expect(distScriptSources).toEqual(expect.arrayContaining(relativeImports));
	// The shim sources and templates it compiles, as it names them.
	expect(builder).toContain('["logger.ts", "node_helper.ts"]');
	expect(builder).toContain('path.join(root, "scripts", "templates")');
});
