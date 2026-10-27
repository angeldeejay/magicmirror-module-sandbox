/**
 * Pins the published dist/ layout for files the server reads at runtime
 * through paths relative to its own sources.
 */
import * as fs from "node:fs";
import * as path from "pathe";
import { expect, test } from "vitest";
import { distCopyTargets } from "../../../scripts/dist-layout.ts";
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
