/**
 * Browser-side asset loading helpers.
 */
(function initMicroCoreAssets(globalScope) {
	const core = globalScope.__MICROCORE__;
	const { harness } = core;

	/**
	 * Appends asset version.
	 */
	core.appendAssetVersion = function appendAssetVersion(url) {
		if (typeof url !== "string" || !url.trim()) {
			return url;
		}
		if (/^(https?:)?\/\//.test(url)) {
			return url;
		}

		const assetVersion =
			typeof harness.assetVersion === "string" && harness.assetVersion
				? harness.assetVersion
				: "";
		if (!assetVersion) {
			return url;
		}

		return `${url}${url.includes("?") ? "&" : "?"}v=${encodeURIComponent(assetVersion)}`;
	};

	/**
	 * Resolve a script file declared by the mounted module to a public URL.
	 *
	 * @param {string} file
	 * @returns {string | null}
	 */
	core.resolveScriptPath = function resolveScriptPath(file) {
		if (typeof file !== "string" || !file.trim()) {
			return null;
		}

		if (/^(https?:)?\/\//.test(file)) {
			return file;
		}
		if (file.startsWith("/")) {
			return core.appendAssetVersion(file);
		}

		if (file === "moment.js") {
			return "/moment.js";
		}

		if (file === "moment-timezone.js") {
			return "/moment-timezone.js";
		}

		if (file === "croner.js") {
			return "/croner.js";
		}

		const normalizedFile = file.replace(/^\/+/, "");
		const normalizedModulePath = String(harness.modulePath || "").replace(
			/^\/+/,
			""
		);
		if (
			normalizedFile.startsWith("modules/") ||
			(normalizedModulePath &&
				normalizedFile.startsWith(normalizedModulePath))
		) {
			return core.appendAssetVersion(`/${normalizedFile}`);
		}

		return core.appendAssetVersion(
			`${harness.modulePath}/${normalizedFile}`
		);
	};

	/**
	 * Resolve a stylesheet file declared by the mounted module to a public URL.
	 *
	 * @param {string} file
	 * @returns {string | null}
	 */
	core.resolveStylePath = function resolveStylePath(file) {
		if (typeof file !== "string" || !file.trim()) {
			return null;
		}

		if (/^(https?:)?\/\//.test(file)) {
			return file;
		}
		if (file.startsWith("/")) {
			return core.appendAssetVersion(file);
		}

		if (file === "font-awesome.css") {
			return "/font-awesome.css";
		}

		return core.appendAssetVersion(`${harness.modulePath}/${file}`);
	};

	/**
	 * Load one browser script once.
	 *
	 * @param {string} file
	 * @returns {Promise<void>}
	 */
	core.loadScript = function loadScript(file) {
		const src = core.resolveScriptPath(file);
		if (!src || core.loadedScripts.has(src)) {
			return Promise.resolve();
		}

		return new Promise<void>((resolve, reject) => {
			const script = document.createElement("script");
			script.src = src;
			script.async = false;
			/**
			 * Internal helper for onload.
			 */
			script.onload = () => {
				core.loadedScripts.add(src);
				resolve();
			};
			/**
			 * Internal helper for onerror.
			 */
			script.onerror = () =>
				reject(new Error(`Failed to load script: ${src}`));
			document.head.appendChild(script);
		});
	};

	/**
	 * Load one browser stylesheet once.
	 *
	 * @param {string} file
	 * @returns {Promise<void>}
	 */
	core.loadStyle = function loadStyle(file) {
		return core.loadStyleWithOptions(file, {});
	};

	/**
	 * Loads style with options.
	 */
	core.loadStyleWithOptions = function loadStyleWithOptions(
		file,
		options: { forceReload?: boolean } = {}
	) {
		const href = core.resolveStylePath(file);
		const forceReload = Boolean(options.forceReload);
		if (!href || (!forceReload && core.loadedStyles.has(href))) {
			return Promise.resolve();
		}

		const existingEntry = core.loadedStyleEntries.get(file);
		if (
			forceReload &&
			existingEntry &&
			existingEntry.link &&
			existingEntry.link.parentNode
		) {
			existingEntry.link.parentNode.removeChild(existingEntry.link);
			core.loadedStyles.delete(existingEntry.href);
		}

		const requestHref = forceReload
			? `${href}${href.includes("?") ? "&" : "?"}refresh=${Date.now().toString(36)}`
			: href;

		return new Promise<void>((resolve, reject) => {
			const link = document.createElement("link");
			link.rel = "stylesheet";
			link.href = requestHref;
			link.dataset.moduleStyle = "true";
			link.dataset.moduleStyleSource = file;
			/**
			 * Internal helper for onload.
			 */
			link.onload = () => {
				core.loadedStyles.add(href);
				core.loadedStyleEntries.set(file, {
					href,
					link
				});
				resolve();
			};
			/**
			 * Internal helper for onerror.
			 */
			link.onerror = () =>
				reject(new Error(`Failed to load stylesheet: ${requestHref}`));
			document.head.appendChild(link);
		});
	};

	/**
	 * Internal helper for reload module styles.
	 */
	core.reloadModuleStyles = function reloadModuleStyles() {
		if (
			!core.moduleInstance ||
			typeof core.moduleInstance.getStyles !== "function"
		) {
			return Promise.resolve(false);
		}

		return core.moduleInstance
			.loadDependencies("getStyles", (file) => {
				return core.loadStyleWithOptions(file, {
					forceReload: true
				});
			})
			.then(() => true);
	};
})(window);
