/**
 * Local JSON editor web component adapted from native-json-editor.
 *
 * Changes for this sandbox:
 * - avoid stale "last valid" getters
 * - expose honest validation state and errors
 * - emit plain-text editing events from the host element
 * - render syntax highlighting with DOM nodes instead of dynamic innerHTML
 */
(function defineJsonEditor(globalScope) {
	/**
	 * Lightweight JSON editor custom element used by sandbox forms.
	 */
	class JSONEditor extends HTMLElement {
		editor!: HTMLDivElement;
		indentSize!: number;
		lastValidationError!: string;
		lastFormattedString!: string;

		constructor() {
			super();

			this.indentSize = 2;
			this.lastValidationError = "";
			this.lastFormattedString = "";

			const shadowRoot = this.attachShadow({ mode: "open" });
			const style = document.createElement("style");
			style.textContent = `
				:host {
					display: block;
					width: 100%;
					min-height: 168px;
					height: 100%;
					box-sizing: border-box;
					border: 1px solid var(--sandbox-control-border, #343434);
					border-radius: var(--sandbox-control-radius, 6px);
					background: var(--sandbox-control-bg, #101010);
					color: var(--sandbox-control-text, #f3f3f3);
					font-family: Consolas, monospace;
					font-size: 12px;
					line-height: 1.5;
				}

				:host([data-valid="false"]) {
					border-color: #7a2f2f;
				}

				#editor {
					min-height: 168px;
					height: 100%;
					box-sizing: border-box;
					padding: 10px;
					outline: 0;
					overflow: auto;
					white-space: pre-wrap;
					word-break: break-word;
					tab-size: 2;
					caret-color: var(--sandbox-control-text, #f3f3f3);
					scrollbar-width: thin;
					scrollbar-color:
						var(--sandbox-scrollbar-thumb, #3f3f3f)
						var(--sandbox-scrollbar-track, #101010);
				}

				#editor::-webkit-scrollbar {
					width: var(--sandbox-scrollbar-size, 10px);
					height: var(--sandbox-scrollbar-size, 10px);
				}

				#editor::-webkit-scrollbar-track {
					background: var(--sandbox-scrollbar-track, #101010);
				}

				#editor::-webkit-scrollbar-thumb {
					background: var(--sandbox-scrollbar-thumb, #3f3f3f);
					border: 2px solid var(--sandbox-scrollbar-track, #101010);
					border-radius: 999px;
				}

				#editor::-webkit-scrollbar-thumb:hover {
					background: var(--sandbox-scrollbar-thumb-hover, #595959);
				}

				#editor::-webkit-scrollbar-corner {
					background: var(--sandbox-scrollbar-track, #101010);
				}

				*[part="number"] { color: #a9dc76; }
				*[part="braces"] { color: #84aecc; }
				*[part="brackets"] { color: #d26a6a; }
				*[part="colon"] { color: #ffffff; }
				*[part="comma"] { color: #ffff25; }
				*[part="string"] { color: #78dce8; }
				*[part="string_quotes"] { color: #e393ff; }
				*[part="key"] { color: #ff6188; }
				*[part="key_quotes"] { color: #fc9867; }
				*[part="null"] { color: #cccccc; }
				*[part="true"] { color: #c2e69f; }
				*[part="false"] { color: #e69fc2; }
			`;

			this.editor = document.createElement("div");
			this.editor.id = "editor";
			this.editor.contentEditable = "true";
			this.editor.tabIndex = 0;
			this.editor.spellcheck = false;
			this.editor.setAttribute("role", "textbox");
			this.editor.setAttribute("aria-multiline", "true");

			shadowRoot.append(style, this.editor);

			this.editor.addEventListener("input", () => {
				this.handleEditorInput();
			});
			this.editor.addEventListener("keydown", (event) => {
				this.handleKeyDown(event);
			});
			this.editor.addEventListener("paste", (event) => {
				this.handlePaste(event);
			});

			this.updateValidityState(true, "");
		}

		static get observedAttributes() {
			return ["value", "indent"];
		}

		attributeChangedCallback(name, _oldValue, newValue) {
			if (name === "indent") {
				this.indentSize = this.normalizeIndent(newValue);
				if (this.raw_string.trim()) {
					this.renderFormattedValue({ preserveCaret: false });
				}
				return;
			}

			if (name === "value" && newValue !== this.raw_string) {
				this.value = newValue;
			}
		}

		connectedCallback() {
			this.indentSize = this.normalizeIndent(this.getAttribute("indent"));
			if (this.hasAttribute("value")) {
				this.value = this.getAttribute("value");
				return;
			}

			this.raw_string = "";
		}

		normalizeIndent(value) {
			const parsed = Number(value);
			if (!Number.isFinite(parsed) || parsed < 1) {
				return 2;
			}

			return Math.floor(parsed);
		}

		hasEditorFocus() {
			const shadowRoot = this.shadowRoot;
			return (
				document.activeElement === this ||
				document.activeElement === this.editor ||
				(shadowRoot && shadowRoot.activeElement === this.editor)
			);
		}

		getSelection() {
			const shadowRoot = this.shadowRoot as
				| (ShadowRoot & {
						getSelection?: () => Selection | null;
				  })
				| null;
			if (shadowRoot && typeof shadowRoot.getSelection === "function") {
				return shadowRoot.getSelection();
			}

			return globalScope.getSelection();
		}

		getCaretPointer() {
			const selection = this.getSelection();
			if (!selection || selection.rangeCount === 0) {
				return null;
			}

			const range = selection.getRangeAt(0);
			const caretRange = range.cloneRange();
			caretRange.selectNodeContents(this.editor);
			caretRange.setEnd(range.endContainer, range.endOffset);

			const section = caretRange.toString();
			const character = section.charAt(section.length - 1);
			if (!character) {
				return null;
			}

			return {
				character,
				occurrence: this.getNumberOfOccurrences(section, character)
			};
		}

		setCaretFromPointer(pointer) {
			if (!pointer) {
				return;
			}

			const selection = globalScope.getSelection();
			if (!selection) {
				return;
			}

			const textNodes = this.getTextNodes(this.editor);
			if (!textNodes.length) {
				return;
			}

			let occurrence = pointer.occurrence;
			let nodeIndex = 0;
			let offset = -1;

			for (; nodeIndex < textNodes.length; nodeIndex += 1) {
				const node = textNodes[nodeIndex];
				offset = this.getPositionOfOccurrence(
					node.textContent || "",
					pointer.character,
					occurrence
				);
				if (offset >= 0) {
					break;
				}

				occurrence -= this.getNumberOfOccurrences(
					node.textContent || "",
					pointer.character
				);
			}

			const targetNode =
				textNodes[Math.min(nodeIndex, textNodes.length - 1)];
			if (!targetNode) {
				return;
			}

			const safeOffset =
				offset >= 0
					? Math.min(offset + 1, targetNode.textContent.length)
					: targetNode.textContent.length;
			const range = document.createRange();
			range.setStart(targetNode, safeOffset);
			range.setEnd(targetNode, safeOffset);
			selection.removeAllRanges();
			selection.addRange(range);
		}

		getTextNodes(element) {
			const walker = document.createTreeWalker(
				element,
				NodeFilter.SHOW_TEXT
			);
			const nodes = [];
			let nextNode = walker.nextNode();
			while (nextNode) {
				nodes.push(nextNode);
				nextNode = walker.nextNode();
			}
			return nodes;
		}

		readNodeText(node) {
			if (!node) {
				return "";
			}

			if (node.nodeType === Node.TEXT_NODE) {
				return node.textContent || "";
			}

			if (node.nodeType !== Node.ELEMENT_NODE) {
				return "";
			}

			const tagName = node.tagName;
			if (tagName === "BR") {
				return "\n";
			}

			let output = "";
			node.childNodes.forEach((childNode) => {
				output += this.readNodeText(childNode);
			});

			if (
				(tagName === "DIV" || tagName === "P") &&
				output &&
				!output.endsWith("\n")
			) {
				output += "\n";
			}

			return output;
		}

		getPositionOfOccurrence(string, subString, occurrence) {
			if (!subString || occurrence < 1) {
				return -1;
			}

			let index = -1;
			let fromIndex = 0;
			for (let count = 0; count < occurrence; count += 1) {
				index = string.indexOf(subString, fromIndex);
				if (index === -1) {
					return -1;
				}
				fromIndex = index + subString.length;
			}
			return index;
		}

		getNumberOfOccurrences(string, subString) {
			if (!subString) {
				return 0;
			}

			let count = 0;
			let index = 0;
			while (index < string.length) {
				const nextIndex = string.indexOf(subString, index);
				if (nextIndex === -1) {
					break;
				}
				count += 1;
				index = nextIndex + subString.length;
			}
			return count;
		}

		createToken(part, text) {
			const span = document.createElement("span");
			span.setAttribute("part", part);
			span.textContent = text;
			return span;
		}

		createLineBreak() {
			return document.createElement("br");
		}

		formatPrimitive(value) {
			if (value === null) {
				return this.createToken("null", "null");
			}

			if (typeof value === "string") {
				const wrapper = document.createElement("span");
				wrapper.setAttribute("part", "string");
				wrapper.append(
					this.createToken("string_quotes", '"'),
					document.createTextNode(value),
					this.createToken("string_quotes", '"')
				);
				return wrapper;
			}

			if (typeof value === "number") {
				return this.createToken("number", String(value));
			}

			if (typeof value === "boolean") {
				return this.createToken(String(value), String(value));
			}

			return document.createTextNode(String(value));
		}

		formatValue(value, depth = 0) {
			if (Array.isArray(value)) {
				return this.formatArray(value, depth);
			}

			if (value && typeof value === "object") {
				return this.formatObject(value, depth);
			}

			return this.formatPrimitive(value);
		}

		formatObject(input, depth = 0) {
			const keys = Object.keys(input);
			if (!keys.length) {
				const empty = document.createDocumentFragment();
				empty.append(
					this.createToken("braces", "{"),
					this.createToken("braces", "}")
				);
				return empty;
			}

			const fragment = document.createDocumentFragment();
			fragment.append(
				this.createToken("braces", "{"),
				this.createLineBreak()
			);

			keys.forEach((key, index) => {
				fragment.append(
					document.createTextNode(" ".repeat(depth + this.indentSize))
				);

				const keyToken = document.createElement("span");
				keyToken.setAttribute("part", "key");
				keyToken.append(
					this.createToken("key_quotes", '"'),
					document.createTextNode(key),
					this.createToken("key_quotes", '"')
				);

				fragment.append(
					keyToken,
					this.createToken("colon", ":"),
					document.createTextNode(" ")
				);
				fragment.append(
					this.formatValue(input[key], depth + this.indentSize)
				);

				if (index < keys.length - 1) {
					fragment.append(this.createToken("comma", ","));
				}

				fragment.append(this.createLineBreak());
			});

			fragment.append(
				document.createTextNode(" ".repeat(depth)),
				this.createToken("braces", "}")
			);
			return fragment;
		}

		formatArray(input, depth = 0) {
			if (!input.length) {
				const empty = document.createDocumentFragment();
				empty.append(
					this.createToken("brackets", "["),
					this.createToken("brackets", "]")
				);
				return empty;
			}

			const fragment = document.createDocumentFragment();
			fragment.append(
				this.createToken("brackets", "["),
				this.createLineBreak()
			);

			input.forEach((value, index) => {
				fragment.append(
					document.createTextNode(" ".repeat(depth + this.indentSize))
				);
				fragment.append(
					this.formatValue(value, depth + this.indentSize)
				);
				if (index < input.length - 1) {
					fragment.append(this.createToken("comma", ","));
				}
				fragment.append(this.createLineBreak());
			});

			fragment.append(
				document.createTextNode(" ".repeat(depth)),
				this.createToken("brackets", "]")
			);
			return fragment;
		}

		updateValidityState(isValid, errorMessage) {
			this.dataset.valid = isValid ? "true" : "false";
			this.lastValidationError = errorMessage || "";
			this.dispatchEvent(
				new CustomEvent("json-editor:state", {
					bubbles: true,
					composed: true,
					detail: {
						rawString: this.raw_string,
						isValid,
						errorMessage: this.lastValidationError
					}
				})
			);
		}

		emitInputEvent() {
			this.dispatchEvent(
				new Event("input", {
					bubbles: true,
					composed: true
				})
			);
		}

		renderFormattedValue({ preserveCaret = true } = {}) {
			const rawValue = this.raw_string;
			const trimmedValue = rawValue.trim();

			if (!trimmedValue) {
				this.lastFormattedString = "";
				this.updateValidityState(true, "");
				return true;
			}

			let parsedValue;
			try {
				parsedValue = JSON.parse(rawValue);
			} catch (error) {
				this.updateValidityState(false, error.message);
				return false;
			}

			const focusedBeforeRender = preserveCaret && this.hasEditorFocus();
			const caretPointer = focusedBeforeRender
				? this.getCaretPointer()
				: null;
			this.editor.replaceChildren(this.formatValue(parsedValue));
			this.lastFormattedString = JSON.stringify(parsedValue);
			this.updateValidityState(true, "");

			if (focusedBeforeRender) {
				this.editor.focus();
			}

			if (caretPointer && focusedBeforeRender) {
				this.setCaretFromPointer(caretPointer);
			}

			return true;
		}

		handleEditorInput() {
			this.renderFormattedValue({ preserveCaret: true });
			this.emitInputEvent();
		}

		insertTextAtSelection(text) {
			const selection = this.getSelection();
			if (!selection || selection.rangeCount === 0) {
				this.editor.append(document.createTextNode(text));
				this.handleEditorInput();
				return;
			}

			const range = selection.getRangeAt(0);
			range.deleteContents();
			const textNode = document.createTextNode(text);
			range.insertNode(textNode);
			range.setStartAfter(textNode);
			range.setEndAfter(textNode);
			selection.removeAllRanges();
			selection.addRange(range);
			this.handleEditorInput();
		}

		handlePaste(event) {
			event.preventDefault();
			const text = event.clipboardData
				? event.clipboardData.getData("text/plain")
				: "";
			this.insertTextAtSelection(text);
		}

		handleKeyDown(event) {
			if (event.key !== "Tab") {
				return;
			}

			event.preventDefault();
			this.insertTextAtSelection(" ".repeat(this.indentSize));
		}

		get raw_string() {
			return this.readNodeText(this.editor)
				.replaceAll("\r\n", "\n")
				.replaceAll("\xa0", " ")
				.replace(/\n$/, "");
		}

		set raw_string(input) {
			const nextValue = String(input == null ? "" : input);
			this.editor.textContent = nextValue;
			this.renderFormattedValue({ preserveCaret: false });
		}

		get string_value() {
			return this.raw_string;
		}

		set string_value(input) {
			this.raw_string = input;
		}

		get value() {
			return this.string_value;
		}

		set value(input) {
			this.string_value = input;
		}

		get json_value() {
			return JSON.parse(this.raw_string);
		}

		set json_value(input) {
			this.raw_string = JSON.stringify(input);
			this.renderFormattedValue({ preserveCaret: false });
		}

		get validation_error() {
			return this.lastValidationError;
		}

		is_valid() {
			if (!this.raw_string.trim()) {
				return false;
			}

			try {
				JSON.parse(this.raw_string);
				return true;
			} catch (_error) {
				return false;
			}
		}
	}

	if (!globalScope.customElements.get("json-editor")) {
		globalScope.customElements.define("json-editor", JSONEditor);
	}
})(window);
