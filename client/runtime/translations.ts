/**
 * Translation loading and lookup helpers for the browser runtime.
 */
(function initMicroCoreTranslations(globalScope) {
	const core = globalScope.__MICROCORE__;

	/**
	 * Load a JSON file via fetch.
	 *
	 * @param {string} file
	 * @returns {Promise<object|null>}
	 */
	async function loadJSON(file) {
		try {
			const response = await fetch(file);
			if (!response.ok) {
				throw new Error(
					`Unexpected response status: ${response.status}`
				);
			}
			return await response.json();
		} catch (_error) {
			core.log("error", `Loading json file =${file} failed`);
			return null;
		}
	}

	const Translator = {
		coreTranslations: {},
		coreTranslationsFallback: {},
		translations: {},
		translationsFallback: {},

		/**
		 * Load a translation for a given key for a given module.
		 *
		 * @param {object} instance
		 * @param {string} key
		 * @param {object} [variables]
		 * @returns {string}
		 */
		translate(instance, key, variables = {}) {
			const moduleName = instance && instance.name ? instance.name : "";
			const moduleTranslations = this.translations[moduleName];
			const moduleFallbackTranslations =
				this.translationsFallback[moduleName];
			const source =
				(moduleTranslations &&
					key in moduleTranslations &&
					moduleTranslations[key]) ||
				(key in this.coreTranslations && this.coreTranslations[key]) ||
				(moduleFallbackTranslations &&
					key in moduleFallbackTranslations &&
					moduleFallbackTranslations[key]) ||
				(key in this.coreTranslationsFallback &&
					this.coreTranslationsFallback[key]) ||
				key;

			return core.interpolate(source, variables);
		},

		/**
		 * Load one module translation file.
		 *
		 * @param {object} instance
		 * @param {string} file
		 * @param {boolean} isFallback
		 * @returns {Promise<void>}
		 */
		async load(instance, file, isFallback) {
			core.log(
				"log",
				`[translator] ${instance.name} - Load translation${isFallback ? " fallback" : ""}: ${file}`
			);

			if (this.translationsFallback[instance.name]) {
				return;
			}

			const json = await loadJSON(instance.file(file));
			const property = isFallback
				? "translationsFallback"
				: "translations";
			this[property][instance.name] = json;
		},

		/**
		 * Load core translations for the configured language.
		 *
		 * @param {string} language
		 * @returns {Promise<void>}
		 */
		async loadCoreTranslations(language) {
			const coreTranslationMap =
				globalScope.translations &&
				typeof globalScope.translations === "object"
					? globalScope.translations
					: {};

			if (language in coreTranslationMap) {
				core.log(
					"log",
					`[translator] Loading core translation file: ${coreTranslationMap[language]}`
				);
				this.coreTranslations =
					(await loadJSON(coreTranslationMap[language])) || {};
			} else {
				core.log(
					"log",
					"[translator] Configured language not found in core translations."
				);
			}

			await this.loadCoreTranslationsFallback();
		},

		/**
		 * Load fallback core translations.
		 *
		 * @returns {Promise<void>}
		 */
		async loadCoreTranslationsFallback() {
			const coreTranslationMap =
				globalScope.translations &&
				typeof globalScope.translations === "object"
					? globalScope.translations
					: {};
			const firstLanguage = Object.keys(coreTranslationMap)[0];
			if (!firstLanguage) {
				this.coreTranslationsFallback = {};
				return;
			}

			core.log(
				"log",
				`[translator] Loading core translation fallback file: ${coreTranslationMap[firstLanguage]}`
			);
			this.coreTranslationsFallback =
				(await loadJSON(coreTranslationMap[firstLanguage])) || {};
		}
	};

	/**
	 * Load all translations for one module like MagicMirror's Module.loadTranslations().
	 *
	 * @param {object} instance
	 * @returns {Promise<void>}
	 */
	core.loadTranslations = async function loadTranslations(instance) {
		const moduleTranslations =
			typeof instance.getTranslations === "function"
				? instance.getTranslations() || {}
				: {};
		const language = String(
			globalScope.config.language || "en"
		).toLowerCase();
		const languages = Object.keys(moduleTranslations);
		const fallbackLanguage = languages[0];

		if (!languages.length) {
			return;
		}

		const translationFile = moduleTranslations[language];
		const fallbackFile = moduleTranslations[fallbackLanguage];

		if (!translationFile) {
			await Translator.load(instance, fallbackFile, true);
			return;
		}

		await Translator.load(instance, translationFile, false);
		if (translationFile !== fallbackFile) {
			await Translator.load(instance, fallbackFile, true);
		}
	};

	/**
	 * Translates.
	 */
	core.translate = function translate(instance, key, variables) {
		return Translator.translate(instance, key, variables);
	};

	core.Translator = Translator;
	globalScope.Translator = Translator;
})(window);
