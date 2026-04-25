/**
 * Headed-browser inspection helpers shared by the browser-backed Vitest projects.
 */

type BrowserInspectionEnv = Record<string, string | undefined>;

type BrowserInspectionOptions = {
	headed: boolean;
	headless: boolean;
	showCursor: boolean;
	slowMo: number;
};

type BrowserWorkerConfig = {
	fileParallelism: boolean;
	maxWorkers: number;
	minWorkers: number;
};

const trueValues = new Set(["1", "true", "yes", "on"]);
const falseValues = new Set(["0", "false", "no", "off"]);

/**
 * Parses boolean env.
 */
function parseBooleanEnv(
	env: BrowserInspectionEnv,
	name: string
): boolean | undefined {
	const rawValue = env[name];
	if (rawValue === undefined) {
		return undefined;
	}

	const normalizedValue = rawValue.trim().toLowerCase();
	if (trueValues.has(normalizedValue)) {
		return true;
	}
	if (falseValues.has(normalizedValue)) {
		return false;
	}

	throw new Error(
		`${name} must be one of: ${Array.from(trueValues)
			.concat(Array.from(falseValues))
			.join(", ")}. Received "${rawValue}".`
	);
}

/**
 * Parses integer env.
 */
function parseIntegerEnv(
	env: BrowserInspectionEnv,
	name: string
): number | undefined {
	const rawValue = env[name];
	if (rawValue === undefined) {
		return undefined;
	}

	if (!/^\d+$/.test(rawValue.trim())) {
		throw new Error(
			`${name} must be a non-negative integer. Received "${rawValue}".`
		);
	}

	return Number.parseInt(rawValue, 10);
}

/**
 * Gets browser inspection options.
 */
export function getBrowserInspectionOptions(
	env: BrowserInspectionEnv = process.env
): BrowserInspectionOptions {
	const inspect =
		parseBooleanEnv(env, "MODULE_SANDBOX_BROWSER_INSPECT") ?? false;
	const headed =
		parseBooleanEnv(env, "MODULE_SANDBOX_BROWSER_HEADED") ?? inspect;
	const showCursor =
		parseBooleanEnv(env, "MODULE_SANDBOX_BROWSER_CURSOR") ?? inspect;
	const slowMo =
		parseIntegerEnv(env, "MODULE_SANDBOX_BROWSER_SLOW_MO") ??
		(inspect ? 150 : 0);

	return {
		headed,
		headless: !headed,
		showCursor,
		slowMo
	};
}

/**
 * Gets browser worker config.
 */
export function getBrowserWorkerConfig(
	defaultConfig: BrowserWorkerConfig,
	inspectionOptions: BrowserInspectionOptions
): BrowserWorkerConfig {
	if (!inspectionOptions.headed) {
		return defaultConfig;
	}

	return {
		fileParallelism: false,
		maxWorkers: 1,
		minWorkers: 1
	};
}

export const browserInspectionCursorInitScript = String.raw`
(() => {
	if (globalThis.__moduleSandboxInspectionCursorInstalled) {
		return;
	}

	globalThis.__moduleSandboxInspectionCursorInstalled = true;

	const cursorId = "__module-sandbox-inspection-cursor";
	const styleId = "__module-sandbox-inspection-cursor-style";

	const ensureCursor = () => {
		const documentRef = globalThis.document;
		if (!documentRef || !documentRef.documentElement) {
			return null;
		}

		if (!documentRef.getElementById(styleId)) {
			const style = documentRef.createElement("style");
			style.id = styleId;
			style.textContent = [
				"#" + cursorId + "{position:fixed;left:0;top:0;width:18px;height:18px;border:2px solid #ff4d6d;border-radius:9999px;",
				"background:rgba(255,77,109,.22);box-shadow:0 0 0 1px rgba(17,24,39,.7);pointer-events:none;z-index:2147483647;",
				"transform:translate(-9999px,-9999px);transition:transform .03s linear,opacity .12s ease,scale .08s ease;opacity:0;}",
				"#" + cursorId + "[data-down=\\"true\\"]{scale:.88;background:rgba(255,77,109,.35);}"
			].join("");
			documentRef.documentElement.appendChild(style);
		}

		let cursor = documentRef.getElementById(cursorId);
		if (!cursor) {
			cursor = documentRef.createElement("div");
			cursor.id = cursorId;
			documentRef.documentElement.appendChild(cursor);
		}

		return cursor;
	};

		const updateCursor = (event) => {
		const cursor = ensureCursor();
		if (!cursor) {
			return;
		}

		cursor.style.opacity = "1";
		cursor.style.transform = "translate(" + event.clientX + "px," + event.clientY + "px)";
	};

	const setPressed = (pressed) => {
		const cursor = ensureCursor();
		if (!cursor) {
			return;
		}
		if (pressed) {
			cursor.setAttribute("data-down", "true");
			return;
		}
		cursor.removeAttribute("data-down");
	};

	globalThis.addEventListener("mousemove", updateCursor, {
		capture: true,
		passive: true
	});
	globalThis.addEventListener("mousedown", () => setPressed(true), {
		capture: true,
		passive: true
	});
	globalThis.addEventListener("mouseup", () => setPressed(false), {
		capture: true,
		passive: true
	});

	ensureCursor();
})();
`;
