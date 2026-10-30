/**
 * "Refresh styles" for the stage: re-fetches the mounted module's own
 * stylesheets without reloading the core page.
 *
 * The core loader adds one `<link rel="stylesheet">` per `getStyles()` file
 * (`js/loader.js` `loadFile`). Module files resolve to
 * `modules/<ModuleName>/...` (`module.file`); vendor and absolute files do
 * not, and stay as they are. Each module link is replaced by a copy with a
 * cache-busting `refresh` query, inserted right after it so the cascade
 * order is unchanged, and the old link is removed once the new one loaded.
 * No core object is touched: this is the same presentation-only step a
 * developer does by hand in the browser's devtools.
 */

/**
 * Whether a stylesheet URL is one of the module's own files.
 */
function isModuleStylesheet(href: string, moduleName: string): boolean {
	try {
		const { pathname } = new URL(href);
		return pathname.includes(`/modules/${encodeURIComponent(moduleName)}/`);
	} catch {
		return false;
	}
}

/**
 * Replaces one link with a freshly fetched copy.
 */
function replaceLink(
	link: HTMLLinkElement,
	refreshToken: string
): Promise<void> {
	const url = new URL(link.href);
	url.searchParams.set("refresh", refreshToken);
	const next = link.cloneNode(false) as HTMLLinkElement;
	next.href = url.href;
	return new Promise((resolve, reject) => {
		const settle = (loaded: boolean) => {
			next.removeEventListener("load", onLoad);
			next.removeEventListener("error", onError);
			if (loaded) {
				link.remove();
				resolve();
				return;
			}
			next.remove();
			reject(new Error(`Failed to load stylesheet: ${url.href}`));
		};
		const onLoad = () => settle(true);
		const onError = () => settle(false);
		next.addEventListener("load", onLoad);
		next.addEventListener("error", onError);
		link.after(next);
	});
}

/**
 * Re-fetches every stylesheet of `moduleName` in `doc`. Resolves to false
 * when the module has none loaded (nothing to refresh).
 */
export function refreshModuleStylesheets(
	doc: Document,
	moduleName: string,
	refreshToken: string = Date.now().toString(36)
): Promise<boolean> {
	const links = Array.from(
		doc.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')
	).filter((link) => isModuleStylesheet(link.href, moduleName));
	if (links.length === 0) {
		return Promise.resolve(false);
	}
	return Promise.all(
		links.map((link) => replaceLink(link, refreshToken))
	).then(() => true);
}
