/**
 * Dedicated mounted-module config editor.
 *
 * This starts as a fork of the generic sandbox JSON editor so the Config
 * domain can evolve independently without changing the other JSON editing
 * surfaces in the sandbox.
 */
(function defineModuleConfigEditor(globalScope) {
	/**
	 * Specialized custom element that renders the mounted-module config envelope.
	 */
	class ModuleConfigEditor extends HTMLElement {
		editor!: HTMLDivElement;
		indentSize!: number;
		lastValidationError!: string;
		lastFormattedString!: string;
		languageToken!: HTMLElement;
		moduleNameToken!: HTMLElement;
		headerLine!: HTMLElement;
		positionLine!: HTMLElement;
		classesLine!: HTMLElement;
		animateInLine!: HTMLElement;
		animateOutLine!: HTMLElement;
		hiddenOnStartupLine!: HTMLElement;
		disabledLine!: HTMLElement;

		constructor() {
			super();

			this.indentSize = 2;
			this.lastValidationError = "";
			this.lastFormattedString = "";

			const shadowRoot = this.attachShadow({ mode: "open" });
			const style = document.createElement("style");
			style.textContent = `
				:host {
					display: flex;
					flex: 1;
					flex-direction: column;
					width: 100%;
					height: 100%;
					min-height: 0;
					box-sizing: border-box;
				}

				#shell {
					display: flex;
					flex: 1;
					flex-direction: column;
					height: 100%;
					min-height: 0;
					overflow: hidden;
					box-sizing: border-box;
					border: 1px solid var(--sandbox-control-border, #343434);
					border-radius: var(--sandbox-control-radius, 6px);
					background: var(--sandbox-control-bg, #101010);
					color: var(--sandbox-control-text, #f3f3f3);
					font-family: Consolas, monospace;
					font-size: 12px;
					line-height: 1.5;
				}

				:host([data-valid="false"]) #shell {
					border-color: #7a2f2f;
				}

				.line {
					display: block;
					padding: 0 10px;
					white-space: pre;
				}

				.block {
					display: flex;
					flex-direction: column;
					gap: 0;
					margin-left: 12px;
					border-left: 1px solid #2b2b2b;
				}

				.block--fill {
					flex: 1;
					height: 0;
					min-height: 0;
					overflow: hidden;
				}

				.embedded {
					display: flex;
					flex: 1;
					flex-direction: column;
					height: 0;
					min-height: 0;
					overflow: hidden;
				}

				#editor {
					flex: 1;
					height: 0;
					min-height: 0;
					box-sizing: border-box;
					padding: 0 10px;
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

				.token-keyword {
					color: #e393ff;
				}

				.token-key {
					color: #ff6188;
				}

				.token-string {
					color: #78dce8;
				}

				.token-punctuation {
					color: #84aecc;
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

			const shell = document.createElement("div");
			shell.id = "shell";
			shell.append(
				this.createStaticLine([
					this.createStaticToken("token-keyword", "let"),
					document.createTextNode(" config "),
					this.createStaticToken("token-punctuation", "= {")
				])
			);

			const rootBlock = document.createElement("div");
			rootBlock.className = "block block--fill";

			const languageLine = this.createStaticLine([
				this.createStaticToken("token-key", "language"),
				this.createStaticToken("token-punctuation", ": ")
			]);
			this.languageToken = this.createStaticToken("token-string", '"en"');
			languageLine.append(
				this.languageToken,
				this.createStaticToken("token-punctuation", ",")
			);

			const modulesLine = this.createStaticLine([
				this.createStaticToken("token-key", "modules"),
				this.createStaticToken("token-punctuation", ": [{")
			]);

			const moduleEntryBlock = document.createElement("div");
			moduleEntryBlock.className = "block block--fill";
			const moduleLine = this.createStaticLine([
				this.createStaticToken("token-key", "module"),
				this.createStaticToken("token-punctuation", ": ")
			]);
			this.moduleNameToken = this.createStaticToken("token-string", '""');
			moduleLine.append(
				this.moduleNameToken,
				this.createStaticToken("token-punctuation", ",")
			);
			this.headerLine = this.createStaticFieldLine("header");
			this.positionLine = this.createStaticFieldLine("position");
			this.classesLine = this.createStaticFieldLine("classes");
			this.animateInLine = this.createStaticFieldLine("animateIn");
			this.animateOutLine = this.createStaticFieldLine("animateOut");
			this.hiddenOnStartupLine =
				this.createStaticFieldLine("hiddenOnStartup");
			this.disabledLine = this.createStaticFieldLine("disabled");
			moduleEntryBlock.append(
				moduleLine,
				this.headerLine,
				this.positionLine,
				this.classesLine,
				this.animateInLine,
				this.animateOutLine,
				this.hiddenOnStartupLine,
				this.disabledLine,
				this.createStaticLine([
					this.createStaticToken("token-key", "config"),
					this.createStaticToken("token-punctuation", ": {")
				])
			);

			const configValueBlock = document.createElement("div");
			configValueBlock.className = "block block--fill";
			const embedded = document.createElement("div");
			embedded.className = "embedded";
			this.editor = document.createElement("div");
			this.editor.id = "editor";
			this.editor.contentEditable = "true";
			this.editor.tabIndex = 0;
			this.editor.spellcheck = false;
			this.editor.setAttribute("role", "textbox");
			this.editor.setAttribute("aria-multiline", "true");
			embedded.append(this.editor);
			configValueBlock.append(embedded);
			moduleEntryBlock.append(
				configValueBlock,
				this.createStaticLine([
					this.createStaticToken("token-punctuation", "}")
				])
			);

			const modulesCloseLine = this.createStaticLine([
				this.createStaticToken("token-punctuation", "}]")
			]);

			rootBlock.append(
				languageLine,
				modulesLine,
				moduleEntryBlock,
				modulesCloseLine
			);
			shell.append(
				rootBlock,
				this.createStaticLine([
					this.createStaticToken("token-punctuation", "};")
				])
			);

			shadowRoot.append(style, shell);

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
			return [
				"value",
				"indent",
				"module-name",
				"language",
				"header",
				"position",
				"classes",
				"animate-in",
				"animate-out",
				"hidden-on-startup",
				"disabled"
			];
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
				return;
			}

			if (name === "module-name") {
				this.syncModuleName(newValue);
				return;
			}

			if (name === "language") {
				this.syncLanguage(newValue);
				return;
			}

			if (name === "header") {
				this.syncHeader(newValue);
				return;
			}

			if (name === "position") {
				this.syncPosition(newValue);
				return;
			}

			if (name === "classes") {
				this.syncClasses(newValue);
				return;
			}

			if (name === "animate-in") {
				this.syncAnimateIn(newValue);
				return;
			}

			if (name === "animate-out") {
				this.syncAnimateOut(newValue);
				return;
			}

			if (name === "hidden-on-startup") {
				this.syncHiddenOnStartup(newValue);
				return;
			}

			if (name === "disabled") {
				this.syncDisabled(newValue);
			}
		}

		connectedCallback() {
			this.indentSize = this.normalizeIndent(this.getAttribute("indent"));
			this.syncModuleName(this.getAttribute("module-name"));
			this.syncLanguage(this.getAttribute("language"));
			this.syncHeader(this.getAttribute("header"));
			this.syncPosition(this.getAttribute("position"));
			this.syncClasses(this.getAttribute("classes"));
			this.syncAnimateIn(this.getAttribute("animate-in"));
			this.syncAnimateOut(this.getAttribute("animate-out"));
			this.syncHiddenOnStartup(this.getAttribute("hidden-on-startup"));
			this.syncDisabled(this.getAttribute("disabled"));
			if (this.hasAttribute("value")) {
				this.value = this.getAttribute("value");
				return;
			}

			this.raw_string = "";
		}

		createStaticToken(className, text) {
			const span = document.createElement("span");
			span.className = className;
			span.textContent = text;
			return span;
		}

		createStaticLine(children) {
			const line = document.createElement("div");
			line.className = "line";
			line.append(...children);
			return line;
		}

		createStaticFieldLine(key) {
			const line = document.createElement("div");
			line.className = "line";
			line.hidden = true;
			line.dataset.field = key;
			return line;
		}

		isBareIdentifier(value) {
			return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(String(value || ""));
		}

		createKeyNode(key) {
			if (this.isBareIdentifier(key)) {
				return this.createToken("key", key);
			}

			const keyToken = document.createElement("span");
			keyToken.setAttribute("part", "key");
			keyToken.append(
				this.createToken("key_quotes", '"'),
				document.createTextNode(String(key)),
				this.createToken("key_quotes", '"')
			);
			return keyToken;
		}

		syncModuleName(value) {
			if (!this.moduleNameToken) {
				return;
			}

			const moduleName = String(value || "").trim() || "module_name";
			this.moduleNameToken.textContent = `"${moduleName}"`;
		}

		syncLanguage(value) {
			if (!this.languageToken) {
				return;
			}

			const language = String(value || "").trim() || "en";
			this.languageToken.textContent = `"${language}"`;
		}

		normalizeStaticString(value, fallback = "") {
			const normalized = String(value || "").trim();
			return normalized || fallback;
		}

		isTrueAttribute(value) {
			return (
				String(value || "")
					.trim()
					.toLowerCase() === "true"
			);
		}

		renderStaticFieldLine(line, key, valueNode, visible) {
			if (!line) {
				return;
			}

			line.hidden = !visible;
			if (!visible) {
				line.replaceChildren();
				return;
			}

			line.replaceChildren(
				this.createStaticToken("token-key", key),
				this.createStaticToken("token-punctuation", ": "),
				valueNode,
				this.createStaticToken("token-punctuation", ",")
			);
		}

		createStaticStringValueNode(value) {
			return this.createStaticToken(
				"token-string",
				JSON.stringify(String(value))
			);
		}

		createStaticBooleanValueNode(value) {
			return this.createToken(
				value ? "true" : "false",
				String(Boolean(value))
			);
		}

		syncHeader(value) {
			const header = this.normalizeStaticString(value);
			this.renderStaticFieldLine(
				this.headerLine,
				"header",
				this.createStaticStringValueNode(header),
				Boolean(header)
			);
		}

		syncPosition(value) {
			const position = this.normalizeStaticString(value, "middle_center");
			this.renderStaticFieldLine(
				this.positionLine,
				"position",
				this.createStaticStringValueNode(position),
				true
			);
		}

		syncClasses(value) {
			const classes = this.normalizeStaticString(value);
			this.renderStaticFieldLine(
				this.classesLine,
				"classes",
				this.createStaticStringValueNode(classes),
				Boolean(classes)
			);
		}

		syncAnimateIn(value) {
			const animateIn = this.normalizeStaticString(value);
			this.renderStaticFieldLine(
				this.animateInLine,
				"animateIn",
				this.createStaticStringValueNode(animateIn),
				Boolean(animateIn)
			);
		}

		syncAnimateOut(value) {
			const animateOut = this.normalizeStaticString(value);
			this.renderStaticFieldLine(
				this.animateOutLine,
				"animateOut",
				this.createStaticStringValueNode(animateOut),
				Boolean(animateOut)
			);
		}

		syncHiddenOnStartup(value) {
			const hiddenOnStartup = this.isTrueAttribute(value);
			this.renderStaticFieldLine(
				this.hiddenOnStartupLine,
				"hiddenOnStartup",
				this.createStaticBooleanValueNode(hiddenOnStartup),
				hiddenOnStartup
			);
		}

		syncDisabled(value) {
			const disabled = this.isTrueAttribute(value);
			this.renderStaticFieldLine(
				this.disabledLine,
				"disabled",
				this.createStaticBooleanValueNode(disabled),
				disabled
			);
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

		parseEditorValue(input) {
			const state = {
				text: String(input == null ? "" : input),
				index: 0
			};
			this.skipWhitespace(state);
			if (state.index >= state.text.length) {
				return {};
			}

			const output =
				state.text.charAt(state.index) === "{"
					? this.parseObject(state)
					: this.parseRootObjectBody(state);
			this.skipWhitespace(state);
			if (state.index < state.text.length) {
				throw new SyntaxError(
					`Unexpected token at position ${state.index + 1}.`
				);
			}
			return output;
		}

		parseRootObjectBody(state) {
			const output = {};
			while (state.index < state.text.length) {
				const key = this.parseObjectKey(state);
				this.skipWhitespace(state);
				this.expectCharacter(state, ":");
				const value = this.parseValue(state);
				output[key] = value;
				this.skipWhitespace(state);
				if (state.index >= state.text.length) {
					break;
				}

				if (state.text.charAt(state.index) !== ",") {
					throw new SyntaxError(
						`Expected "," at position ${state.index + 1}.`
					);
				}

				state.index += 1;
				this.skipWhitespace(state);
				if (state.index >= state.text.length) {
					break;
				}
			}

			return output;
		}

		parseObject(state) {
			const output = {};
			this.expectCharacter(state, "{");
			this.skipWhitespace(state);
			if (state.text.charAt(state.index) === "}") {
				state.index += 1;
				return output;
			}

			while (state.index < state.text.length) {
				const key = this.parseObjectKey(state);
				this.skipWhitespace(state);
				this.expectCharacter(state, ":");
				const value = this.parseValue(state);
				output[key] = value;
				this.skipWhitespace(state);
				const nextCharacter = state.text.charAt(state.index);
				if (nextCharacter === "}") {
					state.index += 1;
					return output;
				}
				if (nextCharacter !== ",") {
					throw new SyntaxError(
						`Expected "," at position ${state.index + 1}.`
					);
				}
				state.index += 1;
				this.skipWhitespace(state);
				if (state.text.charAt(state.index) === "}") {
					state.index += 1;
					return output;
				}
			}

			throw new SyntaxError("Unterminated object literal.");
		}

		parseArray(state) {
			const output = [];
			this.expectCharacter(state, "[");
			this.skipWhitespace(state);
			if (state.text.charAt(state.index) === "]") {
				state.index += 1;
				return output;
			}

			while (state.index < state.text.length) {
				output.push(this.parseValue(state));
				this.skipWhitespace(state);
				const nextCharacter = state.text.charAt(state.index);
				if (nextCharacter === "]") {
					state.index += 1;
					return output;
				}
				if (nextCharacter !== ",") {
					throw new SyntaxError(
						`Expected "," at position ${state.index + 1}.`
					);
				}
				state.index += 1;
				this.skipWhitespace(state);
				if (state.text.charAt(state.index) === "]") {
					state.index += 1;
					return output;
				}
			}

			throw new SyntaxError("Unterminated array literal.");
		}

		parseObjectKey(state) {
			this.skipWhitespace(state);
			const nextCharacter = state.text.charAt(state.index);
			if (nextCharacter === '"') {
				return this.parseString(state);
			}

			return this.parseIdentifier(state);
		}

		parseValue(state) {
			this.skipWhitespace(state);
			const nextCharacter = state.text.charAt(state.index);
			if (!nextCharacter) {
				throw new SyntaxError("Unexpected end of input.");
			}
			if (nextCharacter === "{") {
				return this.parseObject(state);
			}
			if (nextCharacter === "[") {
				return this.parseArray(state);
			}
			if (nextCharacter === '"') {
				return this.parseString(state);
			}
			if (nextCharacter === "-" || /[0-9]/.test(nextCharacter)) {
				return this.parseNumber(state);
			}
			if (state.text.startsWith("true", state.index)) {
				state.index += 4;
				return true;
			}
			if (state.text.startsWith("false", state.index)) {
				state.index += 5;
				return false;
			}
			if (state.text.startsWith("null", state.index)) {
				state.index += 4;
				return null;
			}

			throw new SyntaxError(
				`Unexpected token at position ${state.index + 1}.`
			);
		}

		parseString(state) {
			const start = state.index;
			this.expectCharacter(state, '"');
			let escaped = false;
			while (state.index < state.text.length) {
				const character = state.text.charAt(state.index);
				state.index += 1;
				if (escaped) {
					escaped = false;
					continue;
				}
				if (character === "\\") {
					escaped = true;
					continue;
				}
				if (character === '"') {
					return JSON.parse(state.text.slice(start, state.index));
				}
			}

			throw new SyntaxError("Unterminated string literal.");
		}

		parseIdentifier(state) {
			const start = state.index;
			while (state.index < state.text.length) {
				const character = state.text.charAt(state.index);
				if (!/[A-Za-z0-9_$]/.test(character)) {
					break;
				}
				state.index += 1;
			}
			const identifier = state.text.slice(start, state.index);
			if (!this.isBareIdentifier(identifier)) {
				throw new SyntaxError(`Invalid key at position ${start + 1}.`);
			}
			return identifier;
		}

		parseNumber(state) {
			const rest = state.text.slice(state.index);
			const match = rest.match(
				/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/
			);
			if (!match) {
				throw new SyntaxError(
					`Invalid number at position ${state.index + 1}.`
				);
			}
			state.index += match[0].length;
			return Number(match[0]);
		}

		skipWhitespace(state) {
			while (
				state.index < state.text.length &&
				/\s/.test(state.text.charAt(state.index))
			) {
				state.index += 1;
			}
		}

		expectCharacter(state, character) {
			this.skipWhitespace(state);
			if (state.text.charAt(state.index) !== character) {
				throw new SyntaxError(
					`Expected "${character}" at position ${state.index + 1}.`
				);
			}
			state.index += 1;
			this.skipWhitespace(state);
		}

		isPlainObject(value) {
			if (!value || typeof value !== "object" || Array.isArray(value)) {
				return false;
			}

			const prototype = Object.getPrototypeOf(value);
			return prototype === Object.prototype || prototype === null;
		}

		buildWrappedSource(input) {
			const body = String(input == null ? "" : input);
			const indentedBody = body
				.split("\n")
				.map((line) => `  ${line}`)
				.join("\n");

			return ["var _ = {", indentedBody, "};", "return _;"].join("\n");
		}

		evaluateConfigValue(input) {
			return new Function(this.buildWrappedSource(input))();
		}

		normalizeJsonValue(value, path = "config") {
			if (value === null) {
				return null;
			}

			if (typeof value === "string" || typeof value === "boolean") {
				return value;
			}

			if (typeof value === "number") {
				if (!Number.isFinite(value)) {
					throw new TypeError(
						`${path} must use finite JSON numbers.`
					);
				}
				return value;
			}

			if (Array.isArray(value)) {
				return value.map((entry, index) =>
					this.normalizeJsonValue(entry, `${path}[${index}]`)
				);
			}

			if (this.isPlainObject(value)) {
				const output = {};
				Object.keys(value).forEach((key) => {
					output[key] = this.normalizeJsonValue(
						value[key],
						`${path}.${key}`
					);
				});
				return output;
			}

			throw new TypeError(`${path} is not JSON-safe.`);
		}

		resolveConfigValue(input) {
			const rawValue = String(input == null ? "" : input);
			if (!rawValue.trim()) {
				return {};
			}

			try {
				const parsedValue = this.parseEditorValue(rawValue);
				if (this.isPlainObject(parsedValue)) {
					return this.normalizeJsonValue(parsedValue);
				}
			} catch (_error) {
				// Fall through to JavaScript evaluation.
			}

			const evaluatedValue = this.evaluateConfigValue(rawValue);
			if (!this.isPlainObject(evaluatedValue)) {
				throw new TypeError("Config must resolve to a plain object.");
			}

			return this.normalizeJsonValue(evaluatedValue);
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
				fragment.append(
					this.createKeyNode(key),
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

		formatRootObjectBody(input) {
			const keys = Object.keys(input);
			const fragment = document.createDocumentFragment();
			keys.forEach((key, index) => {
				fragment.append(
					this.createKeyNode(key),
					this.createToken("colon", ":"),
					document.createTextNode(" "),
					this.formatValue(input[key], 0)
				);
				if (index < keys.length - 1) {
					fragment.append(
						this.createToken("comma", ","),
						this.createLineBreak()
					);
				}
			});
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
				this.lastFormattedString = "{}";
				this.updateValidityState(true, "");
				return true;
			}

			let parsedValue;
			try {
				parsedValue = this.resolveConfigValue(rawValue);
			} catch (error) {
				this.updateValidityState(
					false,
					error && error.message ? error.message : "Config invalid."
				);
				return false;
			}

			const focusedBeforeRender = preserveCaret && this.hasEditorFocus();
			const caretPointer = focusedBeforeRender
				? this.getCaretPointer()
				: null;
			this.editor.replaceChildren(this.formatRootObjectBody(parsedValue));
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
			return this.resolveConfigValue(this.raw_string);
		}

		set json_value(input) {
			if (!input || typeof input !== "object" || Array.isArray(input)) {
				this.raw_string = "";
				return;
			}
			this.raw_string = JSON.stringify(input);
			this.renderFormattedValue({ preserveCaret: false });
		}

		get validation_error() {
			return this.lastValidationError;
		}

		is_valid() {
			const rawValue = this.raw_string;
			if (!rawValue.trim()) {
				return true;
			}

			try {
				this.resolveConfigValue(rawValue);
				return true;
			} catch (_error) {
				return false;
			}
		}
	}

	if (!globalScope.customElements.get("module-config-editor")) {
		globalScope.customElements.define(
			"module-config-editor",
			ModuleConfigEditor
		);
	}
})(window);
