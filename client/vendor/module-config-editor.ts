/**
 * Mounted-module config editor backed by three Ace Editor instances.
 *
 * External contract (consumed by debug-panel.ts):
 *   Properties : raw_string (get/set), json_value (get/set),
 *                validation_error (get), string_value (get/set), value (get/set)
 *   Methods    : is_valid(), renderFormattedValue(), applyBeautify(),
 *                getFullDisplayText()
 *   Attributes : value, indent, module-name, language, header, position,
 *                classes, animate-in, animate-out, hidden-on-startup, disabled
 *   Events     : "input", "json-editor:state"
 *   data-valid : "true" | "false" attribute on the element
 *
 * Three Ace editors are stacked vertically inside .mce-shell:
 *
 *   [mce-prefix-container]   readOnly — shows the config envelope prefix
 *   [mce-editable-container] editable — shows only the inner config block
 *   [mce-suffix-container]   readOnly — shows the config envelope suffix
 *
 * Line numbers are kept continuous across all three editors: the editable
 * editor's firstLineNumber = prefixLines + 1, and the suffix editor's
 * firstLineNumber = prefixLines + editableLines + 1 (updated on every change).
 *
 * Ace is loaded as a global (window.ace) from the vendor script tag.
 * Workers are disabled; validation uses the embedded relaxed-JS parser.
 */
(function defineModuleConfigEditor(globalScope) {
	/* eslint-disable @typescript-eslint/no-explicit-any */
	type AceEditorInstance = any;

	class ModuleConfigEditor extends HTMLElement {
		_prefixEditor!: AceEditorInstance;
		_editableEditor!: AceEditorInstance;
		_suffixEditor!: AceEditorInstance;
		_prefixContainer!: HTMLDivElement;
		_editableContainer!: HTMLDivElement;
		_suffixContainer!: HTMLDivElement;
		_indentSize: number = 2;
		_lastValidationError: string = "";
		_lastFormattedString: string = "";
		_pendingInner: string = "";
		_suppressChange: boolean = false;
		_resizeObserver: ResizeObserver | undefined;
		_lastMarkerId: number = -1;
		_AceRange: any = null;

		constructor() {
			super();
			this._buildDOM();
		}

		// ── DOM ───────────────────────────────────────────────────────────────

		_buildDOM(): void {
			const shell = document.createElement("div");
			shell.className = "mce-shell";
			this._prefixContainer = document.createElement("div");
			this._prefixContainer.className = "mce-prefix-container";
			this._editableContainer = document.createElement("div");
			this._editableContainer.className = "mce-editable-container";
			this._suffixContainer = document.createElement("div");
			this._suffixContainer.className = "mce-suffix-container";
			shell.append(this._prefixContainer, this._editableContainer, this._suffixContainer);
			this.append(shell);
		}

		// ── Prefix / suffix ───────────────────────────────────────────────────

		_buildPrefix(): string {
			const lang = (this.getAttribute("language") || "en").trim() || "en";
			const mod = (this.getAttribute("module-name") || "").trim() || "module_name";
			const pos = (this.getAttribute("position") || "middle_center").trim() || "middle_center";

			// Each level is indented 2 spaces further than its parent.
			const l1 = "  "; // inside let config = {
			const l2 = "    "; // inside modules: [{

			const lines: string[] = [
				"let config = {",
				`${l1}language: ${JSON.stringify(lang)},`,
				`${l1}modules: [{`,
				`${l2}module: ${JSON.stringify(mod)},`,
			];

			const header = this.getAttribute("header");
			if (header !== null && header.trim() !== "") {
				if (header.trim().toLowerCase() === "false") {
					lines.push(`${l2}header: false,`);
				} else {
					lines.push(`${l2}header: ${JSON.stringify(header.trim())},`);
				}
			}

			lines.push(`${l2}position: ${JSON.stringify(pos)},`);

			const classes = (this.getAttribute("classes") || "").trim();
			if (classes) lines.push(`${l2}classes: ${JSON.stringify(classes)},`);

			const animateIn = (this.getAttribute("animate-in") || "").trim();
			if (animateIn) lines.push(`${l2}animateIn: ${JSON.stringify(animateIn)},`);

			const animateOut = (this.getAttribute("animate-out") || "").trim();
			if (animateOut) lines.push(`${l2}animateOut: ${JSON.stringify(animateOut)},`);

			if ((this.getAttribute("hidden-on-startup") || "").trim().toLowerCase() === "true") {
				lines.push(`${l2}hiddenOnStartup: true,`);
			}

			if ((this.getAttribute("disabled") || "").trim().toLowerCase() === "true") {
				lines.push(`${l2}disabled: true,`);
			}

			lines.push(`${l2}config: {`);
			return lines.join("\n");
		}

		get _suffix(): string {
			return "    },\n  }]\n};";
		}

		// ── Inner content helpers ─────────────────────────────────────────────

		// Indentation of inner content inside the envelope (3 levels × 2 spaces).
		static readonly INNER_INDENT = "      ";

		/** Indents every line of the inner content to depth 3 for display in the editable editor. */
		_indentInner(inner: string): string {
			if (!inner.trim()) return "";
			return inner
				.split("\n")
				.map((line) => (line.trim() ? ModuleConfigEditor.INNER_INDENT + line : ""))
				.join("\n");
		}

		/** Strips the fixed leading indent added by _indentInner. */
		_dedentInner(indented: string): string {
			const pfx = ModuleConfigEditor.INNER_INDENT;
			return indented
				.split("\n")
				.map((line) => (line.startsWith(pfx) ? line.slice(pfx.length) : line.trimStart()))
				.join("\n");
		}

		_beautifyInner(inner: string): string {
			if (!inner.trim()) return inner;
			const beautify = (globalScope as any).js_beautify as ((code: string, opts: object) => string) | undefined;
			if (!beautify) return inner;
			// Wrap in ({\n...\n}) so js-beautify treats top-level key: val pairs as object
			// properties rather than label statements, which would misalign siblings.
			// The leading newline also ensures a leading comment line is not absorbed
			// into the opening ({ token and then silently stripped by the line slicer.
			const wrapped = "({\n" + inner + "\n})";
			const result = beautify(wrapped, {
				indent_size: 2,
				indent_char: " ",
				max_preserve_newlines: 1,
				preserve_newlines: true,
				brace_style: "collapse",
				keep_array_indentation: false,
				end_with_newline: false,
				wrap_line_length: 0
			});
			// Strip the wrapper lines and remove their 2-space indent from each body line.
			const lines = result.split("\n");
			return lines
				.slice(1, lines.length - 1)
				.map((line) => (line.startsWith("  ") ? line.slice(2) : line.trimStart()))
				.join("\n")
				.trim();
		}

		_extractInner(): string {
			if (!this._editableEditor) return this._pendingInner;
			return this._dedentInner(this._editableEditor.getValue() as string);
		}

		_setFullText(inner: string): void {
			if (!this._editableEditor) {
				this._pendingInner = inner;
				return;
			}
			const beautified = this._beautifyInner(inner);
			this._suppressChange = true;
			this._editableEditor.setValue(this._indentInner(beautified), -1);
			this._suppressChange = false;
			this._syncSuffixFirstLine();
		}

		_refreshPrefix(): void {
			if (!this._prefixEditor) return;
			const prefixText = this._buildPrefix();
			const prefixLines = prefixText.split("\n").length;
			this._prefixEditor.setValue(prefixText, -1);
			this._prefixEditor.setOption("minLines", prefixLines);
			this._prefixEditor.setOption("maxLines", prefixLines);
			if (this._editableEditor) {
				this._editableEditor.setOption("firstLineNumber", prefixLines + 1);
			}
			this._syncSuffixFirstLine();
		}

		_syncSuffixFirstLine(): void {
			if (!this._suffixEditor || !this._editableEditor) return;
			const prefixLines = this._buildPrefix().split("\n").length;
			const editableLines = this._editableEditor.session.getLength();
			this._suffixEditor.setOption("firstLineNumber", prefixLines + editableLines + 1);
		}

		// ── Error highlighting ────────────────────────────────────────────────

		_clearErrorHighlight(): void {
			if (!this._editableEditor) return;
			this._editableEditor.session.setAnnotations([]);
			if (this._lastMarkerId !== -1) {
				this._editableEditor.session.removeMarker(this._lastMarkerId);
				this._lastMarkerId = -1;
			}
		}

		_applyErrorHighlight(errorMessage: string): void {
			if (!this._editableEditor || !this._AceRange) return;
			const posMatch = errorMessage.match(/position (\d+)/i);
			let row = 0;
			if (posMatch) {
				const charPos = parseInt(posMatch[1], 10) - 1;
				const dedented = this._extractInner();
				row = Math.max(0, dedented.substring(0, charPos).split("\n").length - 1);
			}
			this._editableEditor.session.setAnnotations([{
				row,
				column: 0,
				text: errorMessage,
				type: "error"
			}]);
			if (this._lastMarkerId !== -1) {
				this._editableEditor.session.removeMarker(this._lastMarkerId);
			}
			this._lastMarkerId = this._editableEditor.session.addMarker(
				new this._AceRange(row, 0, row, Infinity),
				"ace-error-line",
				"fullLine"
			);
		}

		// ── Ace ───────────────────────────────────────────────────────────────

		_initAce(): void {
			const ace = (globalScope as any).ace;
			if (!ace) return;
			this._AceRange = ace.require("ace/range").Range;

			const prefixText = this._buildPrefix();
			const prefixLines = prefixText.split("\n").length;
			const suffixText = this._suffix;
			const suffixLines = suffixText.split("\n").length;

			const commonOpts = {
				showGutter: true,
				showPrintMargin: false,
				highlightActiveLine: false,
				displayIndentGuides: true,
				tabSize: 2,
				useSoftTabs: true,
				wrap: true,
				fontSize: 12,
				fontFamily: "Consolas, \"Courier New\", monospace",
			};

			// ── Prefix editor (readonly) ──────────────────────────────────────
			this._prefixEditor = ace.edit(this._prefixContainer);
			this._prefixEditor.setTheme("ace/theme/harness");
			this._prefixEditor.session.setMode("ace/mode/javascript");
			this._prefixEditor.session.setUseWorker(false);
			this._prefixEditor.setOptions({
				...commonOpts,
				readOnly: true,
				minLines: prefixLines,
				maxLines: 100,
				firstLineNumber: 1,
			});
			this._prefixEditor.setValue(prefixText, -1);
			this._prefixEditor.renderer.setScrollMargin(0, 3);
			this._prefixEditor.textInput.getElement().tabIndex = -1;

			// ── Suffix editor (readonly) ──────────────────────────────────────
			this._suffixEditor = ace.edit(this._suffixContainer);
			this._suffixEditor.setTheme("ace/theme/harness");
			this._suffixEditor.session.setMode("ace/mode/javascript");
			this._suffixEditor.session.setUseWorker(false);
			this._suffixEditor.setOptions({
				...commonOpts,
				readOnly: true,
				minLines: suffixLines,
				maxLines: 20,
				firstLineNumber: prefixLines + 1,
			});
			this._suffixEditor.setValue(suffixText, -1);
			this._suffixEditor.renderer.setScrollMargin(0, 3);
			this._suffixEditor.textInput.getElement().tabIndex = -1;

			// ── Editable editor ───────────────────────────────────────────────
			this._editableEditor = ace.edit(this._editableContainer);
			this._editableEditor.setTheme("ace/theme/harness");
			this._editableEditor.session.setMode("ace/mode/javascript");
			this._editableEditor.session.setUseWorker(false);
			this._editableEditor.setOptions({
				...commonOpts,
				highlightActiveLine: true,
				behavioursEnabled: true,
				scrollPastEnd: 0,
				firstLineNumber: prefixLines + 1,
			});

			this._editableEditor.session.on("change", () => {
				if (this._suppressChange) return;
				this._syncSuffixFirstLine();
				this._handleEditorChange();
			});

			// Load initial content
			this._setFullText(this._pendingInner);
			this._syncSuffixFirstLine();
		}

		// ── Change handling ───────────────────────────────────────────────────

		_handleEditorChange(): void {
			const inner = this._extractInner();
			if (!inner.trim()) {
				this._lastFormattedString = "{}";
				this._updateValidityState(true, "");
			} else {
				try {
					const parsed = this.resolveConfigValue(inner);
					this._lastFormattedString = JSON.stringify(parsed);
					this._updateValidityState(true, "");
				} catch (err: any) {
					this._updateValidityState(
						false,
						err?.message ? String(err.message) : "Config invalid."
					);
				}
			}
			this._emitInputEvent();
		}

		// ── Validation & events ───────────────────────────────────────────────

		_updateValidityState(isValid: boolean, errorMessage: string): void {
			this.setAttribute("data-valid", isValid ? "true" : "false");
			this._lastValidationError = isValid ? "" : errorMessage;
			if (isValid) {
				this._clearErrorHighlight();
			} else {
				this._applyErrorHighlight(errorMessage);
			}
			this.dispatchEvent(new CustomEvent("json-editor:state", {
				bubbles: true,
				composed: true,
				detail: { valid: isValid, error: errorMessage }
			}));
		}

		_emitInputEvent(): void {
			this.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
		}

		// ── Lifecycle ─────────────────────────────────────────────────────────

		connectedCallback(): void {
			this._indentSize = this._normalizeIndent(this.getAttribute("indent"));
			this._initAce();

			if (this.hasAttribute("value")) {
				this.value = this.getAttribute("value");
			}

			this._handleEditorChange();

			this._resizeObserver = new ResizeObserver(() => {
				this._prefixEditor?.resize();
				this._editableEditor?.resize();
				this._suffixEditor?.resize();
			});
			this._resizeObserver.observe(this);
		}

		disconnectedCallback(): void {
			this._resizeObserver?.disconnect();
			this._resizeObserver = undefined;
			this._prefixEditor?.destroy();
			this._editableEditor?.destroy();
			this._suffixEditor?.destroy();
		}

		static get observedAttributes(): string[] {
			return [
				"value", "indent", "module-name", "language", "header",
				"position", "classes", "animate-in", "animate-out",
				"hidden-on-startup", "disabled"
			];
		}

		attributeChangedCallback(name: string, _old: string | null, next: string | null): void {
			if (name === "indent") {
				this._indentSize = this._normalizeIndent(next);
				return;
			}
			if (name === "value") {
				if (next !== this.raw_string) this.value = next;
				return;
			}
			// All other attributes affect the prefix
			this._refreshPrefix();
		}

		// ── Public API ────────────────────────────────────────────────────────

		applyBeautify(): void {
			if (!this._editableEditor) return;
			const inner = this._extractInner();
			const stripped = this.stripComments(inner);

			const oldText = this._editableEditor.getValue() as string;
			const cursor = this._editableEditor.getCursorPosition();
			const hasSelection = !this._editableEditor.selection.isEmpty();
			const selRange = hasSelection ? this._editableEditor.selection.getRange() : null;

			this._setFullText(stripped);
			this._handleEditorChange();

			try {
				const newText = this._editableEditor.getValue() as string;

				const posToOffset = (text: string, row: number, col: number): number => {
					const lines = text.split("\n");
					let off = 0;
					for (let i = 0; i < row && i < lines.length; i++) off += lines[i].length + 1;
					return off + Math.min(col, (lines[row] ?? "").length);
				};

				const offsetToPos = (text: string, off: number): { row: number; column: number } => {
					const before = text.substring(0, Math.max(0, off));
					const lines = before.split("\n");
					return { row: lines.length - 1, column: lines[lines.length - 1].length };
				};

				const buildPattern = (text: string, offset: number): RegExp | null => {
					const ctx = text.substring(Math.max(0, offset - 40), offset);
					if (!ctx.trim()) return null;
					// Strip quotes from identifier keys: "key": → key:
					const normalized = ctx.replace(/"([A-Za-z_$][A-Za-z0-9_$]*)"\s*:/g, "$1:");
					// Escape regex special chars then make whitespace flexible
					const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
					const pattern = escaped.replace(/\s+/g, "\\s*");
					try { return new RegExp(pattern); } catch { return null; }
				};

				const findBestOffset = (pattern: RegExp, oldOffset: number): number => {
					const g = new RegExp(pattern.source, "g");
					const hits: number[] = [];
					let m: RegExpExecArray | null;
					while ((m = g.exec(newText)) !== null) hits.push(m.index + m[0].length);
					if (hits.length === 0) return -1;
					if (hits.length === 1) return hits[0];
					// Pick hit closest to proportionally scaled position
					const target = (oldOffset / oldText.length) * newText.length;
					return hits.reduce((best, h) =>
						Math.abs(h - target) < Math.abs(best - target) ? h : best
					);
				};

				if (hasSelection && selRange) {
					const startOff = posToOffset(oldText, selRange.start.row, selRange.start.column);
					const endOff = posToOffset(oldText, selRange.end.row, selRange.end.column);
					const startPat = buildPattern(oldText, startOff);
					const endPat = buildPattern(oldText, endOff);
					const newStart = startPat ? findBestOffset(startPat, startOff) : -1;
					const newEnd = endPat ? findBestOffset(endPat, endOff) : -1;
					if (newStart !== -1 && newEnd !== -1 && newEnd >= newStart) {
						this._editableEditor.selection.setRange({
							start: offsetToPos(newText, newStart),
							end: offsetToPos(newText, newEnd)
						});
						return;
					}
				}

				// Cursor only (no selection, or selection restore failed)
				const cursorOff = posToOffset(oldText, cursor.row, cursor.column);
				const cursorPat = buildPattern(oldText, cursorOff);
				const newCursorOff = cursorPat ? findBestOffset(cursorPat, cursorOff) : -1;
				if (newCursorOff !== -1) {
					this._editableEditor.moveCursorToPosition(offsetToPos(newText, newCursorOff));
					this._editableEditor.clearSelection();
				}
			} catch {
				// leave cursor where setValue placed it
			}
		}

		/** Returns the full display text across all three editors (for tests and copy). */
		getFullDisplayText(): string {
			const prefix = this._prefixEditor
				? (this._prefixEditor.getValue() as string)
				: this._buildPrefix();
			const inner = this._extractInner();
			const suffix = this._suffix;
			const parts = [prefix];
			if (inner) parts.push(inner);
			parts.push(suffix);
			return parts.join("\n");
		}

		get raw_string(): string {
			return this._extractInner();
		}

		set raw_string(input: string | null) {
			const next = String(input ?? "");
			this._setFullText(next);
			this._handleEditorChange();
		}

		get string_value(): string { return this.raw_string; }
		set string_value(v: string | null) { this.raw_string = v; }

		get value(): string { return this.raw_string; }
		set value(v: string | null) { this.raw_string = v; }

		get json_value(): Record<string, unknown> {
			return this.resolveConfigValue(this.raw_string);
		}

		set json_value(input: unknown) {
			if (!input || typeof input !== "object" || Array.isArray(input)) {
				this.raw_string = "";
				return;
			}
			this.raw_string = this._innerJs(input as Record<string, unknown>);
		}

		get validation_error(): string {
			return this._lastValidationError;
		}

		is_valid(): boolean {
			const raw = this.raw_string;
			if (!raw.trim()) return true;
			try { this.resolveConfigValue(raw); return true; } catch { return false; }
		}

		renderFormattedValue(): boolean {
			const raw = this.raw_string;
			if (!raw.trim()) {
				this._lastFormattedString = "{}";
				this._updateValidityState(true, "");
				this.raw_string = "";
				return true;
			}
			try {
				const parsed = this.resolveConfigValue(raw);
				const inner = this._innerJs(parsed);
				this.raw_string = inner;
				this._lastFormattedString = JSON.stringify(parsed);
				this._updateValidityState(true, "");
				return true;
			} catch (err: any) {
				this._updateValidityState(
					false,
					err?.message ? String(err.message) : "Config invalid."
				);
				return false;
			}
		}

		// ── JS formatter ──────────────────────────────────────────────────────

		_formatJsValue(val: unknown, depth: number): string {
			if (val === null) return "null";
			if (typeof val === "boolean" || typeof val === "number") return String(val);
			if (typeof val === "string") return JSON.stringify(val);
			if (Array.isArray(val)) {
				if (val.length === 0) return "[]";
				const pad = " ".repeat(this._indentSize * (depth + 1));
				const closePad = " ".repeat(this._indentSize * depth);
				const items = val.map((v) => `${pad}${this._formatJsValue(v, depth + 1)}`);
				return `[\n${items.join(",\n")}\n${closePad}]`;
			}
			if (val && typeof val === "object") {
				const keys = Object.keys(val as object);
				if (keys.length === 0) return "{}";
				const pad = " ".repeat(this._indentSize * (depth + 1));
				const closePad = " ".repeat(this._indentSize * depth);
				const entries = keys.map((k) => {
					const keyStr = this.isBareIdentifier(k) ? k : JSON.stringify(k);
					return `${pad}${keyStr}: ${this._formatJsValue((val as Record<string, unknown>)[k], depth + 1)}`;
				});
				return `{\n${entries.join(",\n")}\n${closePad}}`;
			}
			return String(val);
		}

		_innerJs(obj: Record<string, unknown>): string {
			const keys = Object.keys(obj);
			if (keys.length === 0) return "";
			return keys
				.map((k) => {
					const keyStr = this.isBareIdentifier(k) ? k : JSON.stringify(k);
					return `${keyStr}: ${this._formatJsValue(obj[k], 0)}`;
				})
				.join(",\n");
		}

		// ── Parser ────────────────────────────────────────────────────────────

		_normalizeIndent(value: string | null): number {
			const parsed = Number(value);
			if (!Number.isFinite(parsed) || parsed < 1) return 2;
			return Math.floor(parsed);
		}

		isBareIdentifier(value: unknown): boolean {
			return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(String(value ?? ""));
		}

		isPlainObject(value: unknown): boolean {
			if (!value || typeof value !== "object" || Array.isArray(value)) return false;
			const proto = Object.getPrototypeOf(value);
			return proto === Object.prototype || proto === null;
		}

		buildWrappedSource(input: string): string {
			const body = String(input ?? "");
			const indentedBody = body.split("\n").map((line) => `  ${line}`).join("\n");
			return ["var _ = {", indentedBody, "};", "return _;"].join("\n");
		}

		evaluateConfigValue(input: string): unknown {
			return new Function(this.buildWrappedSource(input))();
		}

		normalizeJsonValue(value: unknown, path = "config"): unknown {
			if (value === null) return null;
			if (typeof value === "string" || typeof value === "boolean") return value;
			if (typeof value === "number") {
				if (!Number.isFinite(value)) throw new TypeError(`${path} must use finite JSON numbers.`);
				return value;
			}
			if (Array.isArray(value)) {
				return value.map((entry, i) => this.normalizeJsonValue(entry, `${path}[${i}]`));
			}
			if (this.isPlainObject(value)) {
				const output: Record<string, unknown> = {};
				for (const key of Object.keys(value as object)) {
					output[key] = this.normalizeJsonValue((value as Record<string, unknown>)[key], `${path}.${key}`);
				}
				return output;
			}
			throw new TypeError(`${path} is not JSON-safe.`);
		}

		stripComments(text: string): string {
			let result = "";
			let i = 0;
			const len = text.length;
			while (i < len) {
				if (text[i] === "/" && i + 1 < len) {
					if (text[i + 1] === "/") {
						while (i < len && text[i] !== "\n") i++;
						continue;
					}
					if (text[i + 1] === "*") {
						i += 2;
						while (i < len && !(text[i] === "*" && i + 1 < len && text[i + 1] === "/")) i++;
						i += 2;
						continue;
					}
				}
				if (text[i] === '"') {
					result += text[i++];
					while (i < len) {
						if (text[i] === "\\" && i + 1 < len) { result += text[i++]; result += text[i++]; continue; }
						if (text[i] === '"') { result += text[i++]; break; }
						result += text[i++];
					}
					continue;
				}
				result += text[i++];
			}
			return result;
		}

		resolveConfigValue(input: string | null): Record<string, unknown> {
			const raw = String(input ?? "");
			if (!raw.trim()) return {};
			const stripped = this.stripComments(raw);
			try {
				const parsed = this.parseEditorValue(stripped);
				if (this.isPlainObject(parsed)) return this.normalizeJsonValue(parsed) as Record<string, unknown>;
			} catch {
				// fall through to JS evaluation
			}
			const evaluated = this.evaluateConfigValue(stripped);
			if (!this.isPlainObject(evaluated)) throw new TypeError("Config must resolve to a plain object.");
			return this.normalizeJsonValue(evaluated) as Record<string, unknown>;
		}

		parseEditorValue(input: string): unknown {
			const state = { text: String(input ?? ""), index: 0 };
			this.skipWhitespace(state);
			if (state.index >= state.text.length) return {};
			const output = state.text.charAt(state.index) === "{"
				? this.parseObject(state)
				: this.parseRootObjectBody(state);
			this.skipWhitespace(state);
			if (state.index < state.text.length) throw new SyntaxError(`Unexpected token at position ${state.index + 1}.`);
			return output;
		}

		parseRootObjectBody(state: { text: string; index: number }): Record<string, unknown> {
			const output: Record<string, unknown> = {};
			while (state.index < state.text.length) {
				const key = this.parseObjectKey(state);
				this.skipWhitespace(state);
				this.expectCharacter(state, ":");
				const value = this.parseValue(state);
				output[key] = value;
				this.skipWhitespace(state);
				if (state.index >= state.text.length) break;
				if (state.text.charAt(state.index) !== ",") throw new SyntaxError(`Expected "," at position ${state.index + 1}.`);
				state.index++;
				this.skipWhitespace(state);
				if (state.index >= state.text.length) break;
			}
			return output;
		}

		parseObject(state: { text: string; index: number }): Record<string, unknown> {
			const output: Record<string, unknown> = {};
			this.expectCharacter(state, "{");
			this.skipWhitespace(state);
			if (state.text.charAt(state.index) === "}") { state.index++; return output; }
			while (state.index < state.text.length) {
				const key = this.parseObjectKey(state);
				this.skipWhitespace(state);
				this.expectCharacter(state, ":");
				const value = this.parseValue(state);
				output[key] = value;
				this.skipWhitespace(state);
				const next = state.text.charAt(state.index);
				if (next === "}") { state.index++; return output; }
				if (next !== ",") throw new SyntaxError(`Expected "," at position ${state.index + 1}.`);
				state.index++;
				this.skipWhitespace(state);
				if (state.text.charAt(state.index) === "}") { state.index++; return output; }
			}
			throw new SyntaxError("Unterminated object literal.");
		}

		parseArray(state: { text: string; index: number }): unknown[] {
			const output: unknown[] = [];
			this.expectCharacter(state, "[");
			this.skipWhitespace(state);
			if (state.text.charAt(state.index) === "]") { state.index++; return output; }
			while (state.index < state.text.length) {
				output.push(this.parseValue(state));
				this.skipWhitespace(state);
				const next = state.text.charAt(state.index);
				if (next === "]") { state.index++; return output; }
				if (next !== ",") throw new SyntaxError(`Expected "," at position ${state.index + 1}.`);
				state.index++;
				this.skipWhitespace(state);
				if (state.text.charAt(state.index) === "]") { state.index++; return output; }
			}
			throw new SyntaxError("Unterminated array literal.");
		}

		parseObjectKey(state: { text: string; index: number }): string {
			this.skipWhitespace(state);
			return state.text.charAt(state.index) === '"' ? this.parseString(state) : this.parseIdentifier(state);
		}

		parseValue(state: { text: string; index: number }): unknown {
			this.skipWhitespace(state);
			const ch = state.text.charAt(state.index);
			if (!ch) throw new SyntaxError("Unexpected end of input.");
			if (ch === "{") return this.parseObject(state);
			if (ch === "[") return this.parseArray(state);
			if (ch === '"') return this.parseString(state);
			if (ch === "-" || /[0-9]/.test(ch)) return this.parseNumber(state);
			if (state.text.startsWith("true", state.index)) { state.index += 4; return true; }
			if (state.text.startsWith("false", state.index)) { state.index += 5; return false; }
			if (state.text.startsWith("null", state.index)) { state.index += 4; return null; }
			throw new SyntaxError(`Unexpected token at position ${state.index + 1}.`);
		}

		parseString(state: { text: string; index: number }): string {
			const start = state.index;
			this.expectCharacter(state, '"');
			let escaped = false;
			while (state.index < state.text.length) {
				const ch = state.text.charAt(state.index++);
				if (escaped) { escaped = false; continue; }
				if (ch === "\\") { escaped = true; continue; }
				if (ch === '"') return JSON.parse(state.text.slice(start, state.index));
			}
			throw new SyntaxError("Unterminated string literal.");
		}

		parseIdentifier(state: { text: string; index: number }): string {
			const start = state.index;
			while (state.index < state.text.length && /[A-Za-z0-9_$]/.test(state.text.charAt(state.index))) state.index++;
			const id = state.text.slice(start, state.index);
			if (!this.isBareIdentifier(id)) throw new SyntaxError(`Invalid key at position ${start + 1}.`);
			return id;
		}

		parseNumber(state: { text: string; index: number }): number {
			const match = state.text.slice(state.index).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);
			if (!match) throw new SyntaxError(`Invalid number at position ${state.index + 1}.`);
			state.index += match[0].length;
			return Number(match[0]);
		}

		skipWhitespace(state: { text: string; index: number }): void {
			while (state.index < state.text.length && /\s/.test(state.text.charAt(state.index))) state.index++;
		}

		expectCharacter(state: { text: string; index: number }, character: string): void {
			this.skipWhitespace(state);
			if (state.text.charAt(state.index) !== character) {
				throw new SyntaxError(`Expected "${character}" at position ${state.index + 1}.`);
			}
			state.index++;
			this.skipWhitespace(state);
		}
	}

	if (!globalScope.customElements.get("module-config-editor")) {
		globalScope.customElements.define("module-config-editor", ModuleConfigEditor);
	}
})(window);
