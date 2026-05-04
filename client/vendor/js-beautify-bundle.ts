/**
 * Thin browser wrapper that exposes js-beautify's JS formatter as a global
 * so module-config-editor.ts can call window.js_beautify(code, opts).
 */
import { js as beautifyJs } from "js-beautify";
(window as unknown as Record<string, unknown>).js_beautify = beautifyJs;
