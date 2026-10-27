/**
 * Core drift guard for the stage endpoints the sandbox ports from the
 * MagicMirror server.
 *
 * Each ported piece (the `/config` closure in `js/server.js`, `getHtml` in
 * `js/server_functions.js`, and in `js/utils.js` the `loadConfig` redaction
 * block plus the `config/basepath.js` and `js/positions.js` writers) is located in the active core, hashed, and looked
 * up in the reviewed snapshots under `scripts/upstream-snapshots/core/`. A
 * hash nobody reviewed falls back to the newest known variant and is reported
 * in `unreviewed`, so the stage keeps booting and the UI can warn about it.
 */

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import { fileURLToPath } from "node:url";
import * as path from "pathe";
import { z } from "zod";
import type { ActiveCore } from "./core-root.ts";

export type CoreVariants = {
	/** `/config` serializer: plain JSON (2.35) or `__mmFunction` tagging (2.36+). */
	config: "plain" | "mmFunction";
	/**
	 * Secret redaction: only with `hideConfigSecrets` (2.35–2.37) or always
	 * (2.38+). `always` requires both the `/config` closure and the
	 * `loadConfig` redaction block to redact unconditionally.
	 */
	redaction: "whenHidden" | "always";
	/** `config/basepath.js`: `let config` (2.35–2.37) or `globalThis.config` (2.38+). */
	basepath: "classic" | "global";
	/** `js/positions.js`: plain `const` (2.35–2.37) or also `globalThis` (2.38+). */
	positions: "classic" | "global";
	/** Pieces whose source hash matches no reviewed snapshot. */
	unreviewed: string[];
};

export type CorePiece =
	| "config"
	| "redaction"
	| "html"
	| "basepath"
	| "positions";

export const CORE_PIECES: readonly CorePiece[] = [
	"config",
	"redaction",
	"html",
	"basepath",
	"positions"
];

/** Allowed snapshot values per piece; anything else counts as unreviewed. */
const VARIANT_SCHEMAS = {
	config: z.enum([
		"plain:whenHidden",
		"mmFunction:whenHidden",
		"mmFunction:always"
	]),
	redaction: z.enum(["whenHidden", "always"]),
	html: z.enum(["standard"]),
	basepath: z.enum(["classic", "global"]),
	positions: z.enum(["classic", "global"])
} satisfies Record<CorePiece, z.ZodType<string>>;

type PieceVariant<P extends CorePiece> = z.infer<(typeof VARIANT_SCHEMAS)[P]>;
type ResolvedVariants = { [P in CorePiece]: PieceVariant<P> };

/** Variant used for a piece whose source matches no reviewed snapshot. */
const NEWEST_VARIANT: ResolvedVariants = {
	config: "mmFunction:always",
	redaction: "always",
	html: "standard",
	basepath: "global",
	positions: "global"
};

const snapshotFileSchema = z.record(z.string(), z.unknown());

// Resolved from this file rather than server/paths.ts: paths.ts imports the
// version manager, which imports this module.
const stageDir = path.dirname(
	/* v8 ignore next */
	typeof __filename === "string" ? __filename : fileURLToPath(import.meta.url)
);

export const coreSnapshotDir = path.join(
	stageDir,
	"..",
	"..",
	"scripts",
	"upstream-snapshots",
	"core"
);

/**
 * Returns the block that starts at the first line matching `start` and ends at
 * the first later line closing it at the same indentation (`}` or `};`).
 */
function extractBlock(lines: string[], start: RegExp): string | null {
	const first = lines.findIndex((line) => start.test(line));
	if (first === -1) {
		return null;
	}
	const indent = /^\s*/.exec(lines[first])?.[0] ?? "";
	for (let index = first + 1; index < lines.length; index += 1) {
		const line = lines[index];
		if (line === `${indent}}` || line === `${indent}};`) {
			return lines.slice(first, index + 1).join("\n");
		}
	}
	return null;
}

/**
 * Returns the lines from the first match of `start` through the first later
 * line matching `end`.
 */
function extractLines(
	lines: string[],
	start: RegExp,
	end: RegExp
): string | null {
	const first = lines.findIndex((line) => start.test(line));
	if (first === -1) {
		return null;
	}
	const last = lines.findIndex(
		(line, index) => index >= first && end.test(line)
	);
	return last === -1 ? null : lines.slice(first, last + 1).join("\n");
}

/**
 * Reads a core file as LF-normalized lines, or null when it is missing.
 */
function readCoreLines(
	core: ActiveCore,
	relativePath: string
): string[] | null {
	try {
		return fs
			.readFileSync(path.join(core.root, relativePath), "utf8")
			.replace(/\r\n?/g, "\n")
			.split("\n");
	} catch {
		return null;
	}
}

/**
 * Extracts the source of every ported piece from a core. A piece that cannot
 * be located is null.
 */
export function extractCorePieces(
	core: ActiveCore
): Record<CorePiece, string | null> {
	const server = readCoreLines(core, "js/server.js");
	const functions = readCoreLines(core, "js/server_functions.js");
	const utils = readCoreLines(core, "js/utils.js");

	// loadConfig: from reading config.js through building redactedConf and
	// fullConf, which decides whether the redacted config is redacted at all.
	const redaction = utils
		? extractLines(
				utils,
				/^\s*(?:const|let) configContent = fs\.readFileSync\(configFilename/,
				/^\s*fullConf: Object\.assign\(/
			)
		: null;

	let positions: string | null = null;
	if (utils) {
		const regex = utils.find((line) => /^const regionRegEx = /.test(line));
		const scan = extractBlock(utils, /^\s*const getModulePositions = /);
		positions = regex && scan ? `${regex}\n${scan}` : null;
	}

	return {
		config: server
			? extractBlock(server, /^\s*const getConfig = \(req, res\) => \{$/)
			: null,
		redaction,
		html: functions
			? extractBlock(
					functions,
					/^\s*(?:function getHtml \(|const getHtml = \()/
				)
			: null,
		basepath: utils
			? extractLines(utils, /^\s*const cfg = `/, /config\/basepath\.js/)
			: null,
		positions
	};
}

/**
 * Hashes a piece's source (sha256 over LF-normalized text).
 */
export function hashCorePiece(source: string): string {
	return crypto
		.createHash("sha256")
		.update(source.replace(/\r\n?/g, "\n"))
		.digest("hex");
}

/**
 * Reads the reviewed `{ "<sha256>": "<variant>" }` snapshot of a piece. An
 * unreadable or malformed file yields an empty snapshot.
 */
function readSnapshot(
	snapshotDir: string,
	piece: CorePiece
): Record<string, unknown> {
	try {
		const parsed = snapshotFileSchema.safeParse(
			JSON.parse(
				fs.readFileSync(path.join(snapshotDir, `${piece}.json`), "utf8")
			)
		);
		return parsed.success ? parsed.data : {};
	} catch {
		return {};
	}
}

/**
 * Returns the reviewed variant of a piece's source, or null when the source
 * is missing, its hash is unknown, or the snapshot value is not an allowed
 * variant for that piece.
 */
function lookupVariant<P extends CorePiece>(
	snapshotDir: string,
	piece: P,
	source: string | null
): PieceVariant<P> | null {
	if (!source) {
		return null;
	}
	const parsed = VARIANT_SCHEMAS[piece].safeParse(
		readSnapshot(snapshotDir, piece)[hashCorePiece(source)]
	);
	return parsed.success ? (parsed.data as PieceVariant<P>) : null;
}

/**
 * Classifies the active core's ported pieces against the reviewed snapshots
 * (`snapshotDir` is overridable for tests).
 */
export function detectCoreVariants(
	core: ActiveCore,
	snapshotDir: string = coreSnapshotDir
): CoreVariants {
	const pieces = extractCorePieces(core);
	const unreviewed: string[] = [];
	const resolved = { ...NEWEST_VARIANT };

	for (const piece of CORE_PIECES) {
		const reviewed = lookupVariant(snapshotDir, piece, pieces[piece]);
		if (reviewed) {
			(resolved as Record<CorePiece, string>)[piece] = reviewed;
		} else {
			unreviewed.push(piece);
		}
	}

	const [config, serverRedaction] = resolved.config.split(":") as [
		CoreVariants["config"],
		CoreVariants["redaction"]
	];
	return {
		config,
		redaction:
			serverRedaction === "always" && resolved.redaction === "always"
				? "always"
				: "whenHidden",
		basepath: resolved.basepath,
		positions: resolved.positions,
		unreviewed
	};
}
