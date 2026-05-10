/**
 * Browser wrapper that exposes jsonc-parser as a global
 * so module-config-editor.ts can call window.jsoncParser methods.
 */
import { parse, stripComments, format, applyEdits } from "jsonc-parser";

(window as unknown as Record<string, unknown>).jsoncParser = {
	parse,
	stripComments,
	format,
	applyEdits
};
