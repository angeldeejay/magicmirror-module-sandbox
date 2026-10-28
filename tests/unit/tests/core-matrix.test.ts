/**
 * Unit tests for the test-run core matrix (tests/_helpers/core-matrix.ts).
 */
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("../../../server/mm-version-manager.ts", () => ({
	areShimsBuilt: vi.fn(),
	getBuiltInMmVersion: vi.fn(),
	getInstalledMmVersion: vi.fn(),
	isVersionInstalled: vi.fn(),
	sanitizeVersion: (version: string) =>
		version.replace(/[^a-zA-Z0-9._-]/g, "-")
}));

import * as mmvm from "../../../server/mm-version-manager.ts";
import {
	availableCores,
	TEST_CORE_VERSION_ENV
} from "../../_helpers/core-matrix.ts";

const builtIn = { version: "2.36.0", key: null };

beforeEach(() => {
	vi.mocked(mmvm.getBuiltInMmVersion).mockReturnValue("2.36.0");
	vi.mocked(mmvm.isVersionInstalled).mockReturnValue(true);
	vi.mocked(mmvm.areShimsBuilt).mockReturnValue(true);
	vi.mocked(mmvm.getInstalledMmVersion).mockReturnValue("2.38.0");
});

describe("availableCores without a requested core", () => {
	test("returns the built-in core alone when the env var is unset", () => {
		expect(availableCores({})).toEqual([builtIn]);
		expect(mmvm.isVersionInstalled).not.toHaveBeenCalled();
	});

	test("treats a blank env var as unset", () => {
		expect(availableCores({ [TEST_CORE_VERSION_ENV]: "  " })).toEqual([
			builtIn
		]);
	});
});

describe("availableCores with a requested core", () => {
	test("adds an installed core with its shims", () => {
		expect(availableCores({ [TEST_CORE_VERSION_ENV]: "2.38.0" })).toEqual([
			builtIn,
			{ version: "2.38.0", key: "2.38.0" }
		]);
	});

	test("adds develop under the version its package reports", () => {
		vi.mocked(mmvm.getInstalledMmVersion).mockReturnValue("2.39.0-develop");
		expect(availableCores({ [TEST_CORE_VERSION_ENV]: "develop" })).toEqual([
			builtIn,
			{ version: "2.39.0-develop", key: "develop" }
		]);
	});

	test("throws when the requested core is not installed", () => {
		vi.mocked(mmvm.isVersionInstalled).mockReturnValue(false);
		expect(() =>
			availableCores({ [TEST_CORE_VERSION_ENV]: "2.38" })
		).toThrow(
			'MM_SANDBOX_TEST_CORE_VERSION=2.38: version "2.38" is not installed in mmvm'
		);
	});

	test("throws when the requested core has no shims", () => {
		vi.mocked(mmvm.areShimsBuilt).mockReturnValue(false);
		expect(() =>
			availableCores({ [TEST_CORE_VERSION_ENV]: "2.38.0" })
		).toThrow("is installed but its shims are not built");
	});

	test("throws when the installed package version cannot be read", () => {
		vi.mocked(mmvm.getInstalledMmVersion).mockReturnValue(null);
		expect(() =>
			availableCores({ [TEST_CORE_VERSION_ENV]: "2.38.0" })
		).toThrow("has no readable MagicMirror package version");
	});

	test("throws when a release key holds a different release", () => {
		vi.mocked(mmvm.getInstalledMmVersion).mockReturnValue("2.37.0");
		expect(() =>
			availableCores({ [TEST_CORE_VERSION_ENV]: "2.38.0" })
		).toThrow('version "2.38.0" holds MagicMirror 2.37.0');
	});
});
