/**
 * Transparent hooks on the module instance the real MagicMirror core creates,
 * plus the discovery of that instance and of core globals.
 *
 * Fidelity rules (see docs/superpowers/specs/2026-10-27-per-version-stage-design.md):
 * - hooks attach to the created instance only, never to `Module.prototype` or
 *   to module definitions (2.35-2.36 `Class.extend` detects `_super` in the
 *   definition source, so wrapping a definition breaks it);
 * - a wrapper calls through first and records after, with the same
 *   arguments, `this`, return value, exception and timing (sync stays sync).
 */

/** Instance methods the observer records. */
export const OBSERVED_INSTANCE_METHODS = [
	"notificationReceived",
	"hide",
	"show",
	"suspend",
	"resume"
] as const;

export type ObservedMethod = (typeof OBSERVED_INSTANCE_METHODS)[number];

export type InstanceHookCallbacks = {
	/** Runs right before the call; its return value reaches `after`. */
	before?: (method: ObservedMethod, args: unknown[]) => unknown;
	/** Runs after a call that returned; never after one that threw. */
	after: (
		method: ObservedMethod,
		instance: object,
		args: unknown[],
		result: unknown,
		token: unknown
	) => void;
};

/**
 * Report an observer failure without letting it reach the core call.
 */
function reportObserverError(error: unknown): void {
	console.error("[module-sandbox] stage observer hook failed", error);
}

/**
 * Replaces each observed method present on `instance` with a transparent
 * wrapper stored as an own property of the instance. Methods the instance
 * does not have are left alone and returned, so the panels can say which
 * hooks are unavailable.
 */
export function hookInstance(
	instance: Record<string, unknown>,
	callbacks: InstanceHookCallbacks,
	methods: readonly ObservedMethod[] = OBSERVED_INSTANCE_METHODS
): ObservedMethod[] {
	const unavailable: ObservedMethod[] = [];
	for (const method of methods) {
		const original = instance[method];
		if (typeof original !== "function") {
			unavailable.push(method);
			continue;
		}

		instance[method] = function observedMethod(
			this: object,
			...args: unknown[]
		) {
			let token: unknown;
			if (callbacks.before) {
				try {
					token = callbacks.before(method, args);
				} catch (error) {
					reportObserverError(error);
				}
			}
			const result = original.apply(this, args);
			try {
				callbacks.after(method, this, args, result, token);
			} catch (error) {
				reportObserverError(error);
			}
			return result;
		};
	}
	return unavailable;
}

/**
 * Captures the first assignment of a global property through a one-shot
 * accessor. The observer uses it only for `MM` (`globalThis.MM = MM` in
 * 2.37+); the console is hooked directly instead (`log-hooks.ts`).
 * On assignment the accessor is replaced by the plain data property a normal
 * assignment creates, so later reads and writes behave natively.
 *
 * Returns a `release` function that removes the accessor when nothing was
 * assigned, for versions that never assign the property (2.35-2.36 declare
 * `MM` as a global lexical binding instead).
 */
export function captureGlobalAssignment(
	scope: object,
	name: string,
	onAssign: (value: unknown) => void
): () => void {
	const existing = Object.getOwnPropertyDescriptor(scope, name);
	if (existing) {
		if ("value" in existing && existing.value !== undefined) {
			onAssign(existing.value);
		}
		return () => {};
	}

	let assigned = false;
	Object.defineProperty(scope, name, {
		configurable: true,
		enumerable: false,
		get() {
			return undefined;
		},
		set(value: unknown) {
			assigned = true;
			Object.defineProperty(scope, name, {
				configurable: true,
				enumerable: true,
				writable: true,
				value
			});
			try {
				onAssign(value);
			} catch (error) {
				reportObserverError(error);
			}
		}
	});

	return () => {
		if (!assigned) {
			delete (scope as Record<string, unknown>)[name];
		}
	};
}

/**
 * Watches for the core's `MM` object becoming available and returns a reader
 * for it.
 *
 * - 2.35-2.36 declare `MM` with a top-level `const` in a classic script (a
 *   global lexical binding, not a property): every classic core script has
 *   run by `DOMContentLoaded`, so `readLexicalMM` finds it there and the
 *   capture accessor is dropped, leaving `window.MM` as it natively is.
 * - 2.37+ assign `globalThis.MM` from the `js/main.js` module script. That
 *   can happen after `DOMContentLoaded`, and even after `load`: from 2.38 the
 *   `main.js` module graph has a top-level await (`js/socketclient.js` awaits
 *   the socket.io client import), so its body runs once that import resolves.
 *   The accessor therefore stays until the core assigns, then turns into the
 *   plain data property the assignment would have created.
 *
 * `onAvailable` runs once, at that point. If the core never provides `MM`
 * (its scripts failed), it never runs and the configurable, non-enumerable
 * accessor stays, reading `undefined` as an absent property would. A
 * `readLexicalMM` that throws (a 2.35-2.36 `MM` in its temporal dead zone)
 * counts as no `MM`.
 */
export function watchCoreMM(
	scope: object,
	doc: Document,
	readLexicalMM: () => unknown,
	onAvailable: (mm: unknown) => void
): () => unknown {
	let mm: unknown;
	let available = false;
	// A 2.35-2.36 core whose `const MM` initializer threw leaves the binding
	// uninitialized for good, and even `typeof MM` throws in that dead zone.
	// The core already raised that error; the observer adds none.
	const readLexical = () => {
		try {
			return readLexicalMM();
		} catch {
			return undefined;
		}
	};
	const settle = (value: unknown) => {
		if (available) {
			return;
		}
		available = true;
		mm = value;
		try {
			onAvailable(value);
		} catch (error) {
			reportObserverError(error);
		}
	};
	const release = captureGlobalAssignment(scope, "MM", settle);
	const readLexicalAfterClassicScripts = () => {
		if (available) {
			return;
		}
		const lexical = readLexical();
		if (lexical !== undefined) {
			release();
			settle(lexical);
		}
	};
	if (doc.readyState === "loading") {
		doc.addEventListener(
			"DOMContentLoaded",
			readLexicalAfterClassicScripts,
			{ once: true }
		);
	} else {
		readLexicalAfterClassicScripts();
	}
	return () => (available ? mm : readLexical());
}

type CoreMM = {
	getModules?: () => Array<{ identifier?: unknown }>;
};

/**
 * Waits for the core to append the first module wrapper (`<div id="module_*">`
 * in `createDomObjects`, synchronously after `modulesStarted`) and hands the
 * matching created instance from `MM.getModules()` to `onInstance`. The
 * mutation callback runs as a microtask, before the core's `updateDom`
 * resolves, so `MODULE_DOM_CREATED` is observed.
 *
 * Returns a function that stops watching.
 */
export function watchForModuleInstance(
	root: Node,
	resolveMM: () => unknown,
	onInstance: (instance: Record<string, unknown>) => void
): () => void {
	const observer = new MutationObserver((records) => {
		for (const record of records) {
			for (const node of Array.from(record.addedNodes)) {
				const id = (node as Element).id;
				if (typeof id !== "string" || !id.startsWith("module_")) {
					continue;
				}
				const mm = resolveMM() as CoreMM | undefined;
				if (!mm || typeof mm.getModules !== "function") {
					continue;
				}
				const instance = Array.from(mm.getModules()).find(
					(module) => module && module.identifier === id
				);
				if (instance) {
					observer.disconnect();
					onInstance(instance as Record<string, unknown>);
					return;
				}
			}
		}
	});
	observer.observe(root, { childList: true, subtree: true });
	return () => observer.disconnect();
}
