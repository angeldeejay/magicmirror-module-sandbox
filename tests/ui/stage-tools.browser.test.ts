/**
 * Tool parity on the stage, which runs the active MagicMirror core.
 *
 * The sidebar tools (lifecycle controls, the notification emit and log, the
 * WebSocket, console and helper logs, the config save-and-reload, the
 * language switch and the style refresh) must keep working when the stage
 * runs the real MagicMirror core, and a panel whose hook point the core does
 * not offer must say so. Runs once per core in
 * `tests/_helpers/core-matrix.ts`.
 *
 * 2.37+ reject the fixture's `this._super()` in getDom, exactly as a real
 * mirror does, so on those cores the module renders nothing: every
 * assertion here reads the panels and the created instance, never the
 * module's own DOM.
 */
import { afterAll, describe, expect, inject, test } from "vitest";
import {
	closeSandbox,
	gotoSandbox,
	openDomain,
	openSidebarTab,
	pageClick,
	pageEvaluate,
	pageFill,
	pageText,
	pageVisible,
	readFixtureTextFile,
	selectSandboxLanguage,
	stageEvaluate,
	writeFixtureTextFile,
	writeModuleConfig
} from "../_helpers/helpers.browser.ts";
import { defaultPersistedModuleConfig } from "../_helpers/test-module-persistence-defaults.ts";

type StageModule = {
	identifier: string;
	hidden: boolean;
	config: Record<string, unknown>;
	lastEcho?: { argumentCount: number; senderIsUndefined: boolean };
	helperReply?: string;
	sendSocketNotification: (notification: string, payload: unknown) => void;
	translate: (key: string, variables?: Record<string, string>) => string;
};
type StageScope = typeof globalThis & {
	__moduleSandboxModule?: StageModule;
	__stageToolsPreReload?: boolean;
	Log?: { info: (...args: unknown[]) => void };
};
type ShellScope = typeof globalThis & {
	__MICROCORE__: {
		stageReady?: boolean;
		reloadStage: (version?: string) => boolean;
	};
};

const cores = inject("stageCoreMatrix");

/** Error the getDom-throwing fixture variant raises. */
const GETDOM_FAILURE = "stage-tools getDom failure";

/**
 * Whether a core uses the classic `Class.extend` modules (2.35-2.36), where
 * the fixture's `this._super()` works.
 */
function isClassicCore(version: string): boolean {
	const [major, minor] = version.split(".").map(Number);
	return major === 2 && minor <= 36;
}

/**
 * The core's `config` global. 2.35-2.36 declare it with a top-level `let` in
 * a classic script (a global lexical binding), so only a free identifier
 * reaches every core. Runs inside the stage frame.
 */
const coreLanguage = () =>
	(globalThis.eval("config") as { language?: string }).language;

afterAll(async () => {
	await closeSandbox();
});

/** Waits until the observer hooked the created instance and the shell is ready. */
async function waitForHookedInstance(): Promise<void> {
	await expect
		.poll(() =>
			stageEvaluate(() =>
				Boolean((globalThis as StageScope).__moduleSandboxModule)
			)
		)
		.toBe(true);
	await expect
		.poll(() =>
			pageEvaluate(() =>
				Boolean((globalThis as ShellScope).__MICROCORE__.stageReady)
			)
		)
		.toBe(true);
}

/** Boots the stage on one core with the default fixture state. */
async function boot(coreKey: string | null): Promise<void> {
	await gotoSandbox({ coreKey });
	await waitForHookedInstance();
}

/**
 * Marks the current stage document, runs `trigger` and waits for a new stage
 * document with a hooked instance. The mark tells the reloaded document apart
 * from the old one, which may still satisfy every other condition.
 */
async function reloadStageThrough(trigger: () => Promise<void>) {
	await stageEvaluate(() => {
		(globalThis as StageScope).__stageToolsPreReload = true;
	});
	await trigger();
	await expect
		.poll(() =>
			stageEvaluate(
				() =>
					(globalThis as StageScope).__stageToolsPreReload ===
					undefined
			)
		)
		.toBe(true);
	await waitForHookedInstance();
}

/**
 * Publishes observation gaps to the shell panels as the bridge does, for a
 * hook point no supported core lacks with the fixture.
 */
const publishObservationGaps = (unavailableHooks: string[]) =>
	pageEvaluate((hooks) => {
		globalThis.dispatchEvent(
			new CustomEvent("module-sandbox:observation-gaps-updated", {
				detail: {
					unavailableHooks: hooks,
					unobservedNotifications: ["ALL_MODULES_STARTED"]
				}
			})
		);
	}, unavailableHooks);

/** Reloads the stage iframe from the shell. */
const reloadStage = () =>
	reloadStageThrough(async () => {
		await pageEvaluate(() => {
			(globalThis as ShellScope).__MICROCORE__.reloadStage();
		});
	});

describe.each(cores)("core $version", ({ version, key }) => {
	test("the lifecycle panel drives hide/show and suspend/resume", async () => {
		await boot(key);
		await openDomain("runtime");

		await expect.poll(() => pageText("#lifecycle-started")).toBe("Yes");
		await expect
			.poll(() => pageText("#lifecycle-dom-ready"))
			.toBe(isClassicCore(version) ? "Yes" : "No");
		// The fixture has every observed method, so no hook is missing.
		expect(await pageVisible("#lifecycle-observation-notice")).toBe(false);
		// A core whose instance lacks a hook point gets a visible notice.
		await publishObservationGaps(["suspend", "resume"]);
		await expect
			.poll(() => pageText("#lifecycle-observation-notice"))
			.toContain("Unavailable on this core: suspend, resume.");
		expect(await pageVisible("#lifecycle-observation-notice")).toBe(true);
		await publishObservationGaps([]);
		await expect
			.poll(() => pageVisible("#lifecycle-observation-notice"))
			.toBe(false);

		await pageClick("#lifecycle-visibility-action");
		await expect
			.poll(() => pageText("#lifecycle-visibility-status"))
			.toContain("Hidden");
		expect(
			await stageEvaluate(
				() => (globalThis as StageScope).__moduleSandboxModule?.hidden
			)
		).toBe(true);
		await pageClick("#lifecycle-visibility-action");
		await expect
			.poll(() => pageText("#lifecycle-visibility-status"))
			.toContain("Visible");

		await pageClick("#lifecycle-activity-action");
		await expect
			.poll(() => pageText("#lifecycle-activity-status"))
			.toContain("Suspended");
		await pageClick("#lifecycle-activity-action");
		await expect
			.poll(() => pageText("#lifecycle-activity-status"))
			.toContain("Running");
	});

	test("the notification emit reaches the instance and the log names what it cannot see", async () => {
		await boot(key);
		await openDomain("notifications");
		await openSidebarTab("notifications", "emit");

		await pageFill("#notification-name", "TEST_MODULE_ECHO");
		await pageClick("#notification-send");
		await expect
			.poll(() => pageText("#notification-status"))
			.toContain("Notification emitted");
		await expect
			.poll(() =>
				stageEvaluate(
					() =>
						(globalThis as StageScope).__moduleSandboxModule
							?.lastEcho ?? null
				)
			)
			.toEqual({ argumentCount: 3, senderIsUndefined: true });

		await openSidebarTab("notifications", "log");
		await expect
			.poll(() => pageText("#notification-log"))
			.toContain("TEST_MODULE_ECHO");
		await expect
			.poll(() => pageVisible("#notification-observation-notice"))
			.toBe(true);
		expect(await pageText("#notification-observation-notice")).toContain(
			"ALL_MODULES_STARTED is sent by the core before the sandbox can observe it"
		);
	});

	test("the WebSocket and helper logs show the helper round trip", async () => {
		await boot(key);
		await stageEvaluate(() => {
			(
				globalThis as StageScope
			).__moduleSandboxModule?.sendSocketNotification(
				"TEST_MODULE_PING",
				{ message: "stage tools ping" }
			);
		});
		await expect
			.poll(() =>
				stageEvaluate(
					() =>
						(globalThis as StageScope).__moduleSandboxModule
							?.helperReply ?? ""
				)
			)
			.toBe("stage tools ping");

		await openDomain("notifications");
		await openSidebarTab("notifications", "websocket");
		await expect
			.poll(() => pageText("#websocket-log"))
			.toContain("TEST_MODULE_PING (sent)");
		await expect
			.poll(() => pageText("#websocket-log"))
			.toContain("TEST_MODULE_PONG (received)");

		await openDomain("debug");
		await openSidebarTab("debug", "helper-log");
		await expect
			.poll(() => pageText("#helper-log"))
			.toContain("test module helper received ping");
	});

	test("the console log shows the stage's Log output", async () => {
		await boot(key);
		await stageEvaluate(() => {
			(globalThis as StageScope).Log?.info("stage tools console probe");
		});

		await openDomain("debug");
		await openSidebarTab("debug", "console-log");
		await expect
			.poll(() => pageText("#console-log"))
			.toContain("stage tools console probe");
		if (!isClassicCore(version)) {
			// The core's own report of the fixture's rejected `_super()`.
			await expect
				.poll(() => pageText("#console-log"))
				.toContain("_super");
		}
	});

	test("config save reloads the stage with the saved module config", async () => {
		await boot(key);
		await openDomain("config");
		await openSidebarTab("config", "module");
		await writeModuleConfig({
			...defaultPersistedModuleConfig.config,
			operatorName: "Stage Tools Operator"
		});

		await reloadStageThrough(() => pageClick("#module-config-save"));
		await expect
			.poll(() =>
				stageEvaluate(
					() =>
						(globalThis as StageScope).__moduleSandboxModule?.config
							.operatorName
				)
			)
			.toBe("Stage Tools Operator");
		await expect
			.poll(() => pageText("#module-config-status"))
			.toContain("Viewport reloaded");
	});

	test("the language switch reloads the stage in the new language", async () => {
		await boot(key);
		await openDomain("config");
		await openSidebarTab("config", "general");
		// The fixture persists `es`.
		expect(await stageEvaluate(coreLanguage)).toBe("es");

		await reloadStageThrough(() => selectSandboxLanguage("en"));
		await expect
			.poll(() =>
				stageEvaluate(() => {
					const scope = globalThis as StageScope;
					return {
						language: (
							globalThis.eval("config") as { language?: string }
						).language,
						greeting: scope.__moduleSandboxModule?.translate(
							"GREETING",
							{ operator: "Ada" }
						)
					};
				})
			)
			.toEqual({
				language: "en",
				greeting: "Hello Ada from the test module fixture."
			});
	});

	test("Refresh styles re-fetches the module stylesheet the core loaded", async () => {
		await boot(key);
		await openDomain("config");
		await openSidebarTab("config", "module");
		const moduleStylesheets = () =>
			stageEvaluate(() =>
				Array.from(
					globalThis.document.querySelectorAll<HTMLLinkElement>(
						'link[rel="stylesheet"]'
					)
				)
					.map((link) => new URL(link.href))
					.filter((url) =>
						url.pathname.includes("/modules/MMM-TestModule/")
					)
					.map((url) => `${url.pathname}${url.search}`)
			);
		const before = await moduleStylesheets();
		expect(before).toEqual(["/__stage/modules/MMM-TestModule/MMM-TestModule.css"]);

		await pageClick("#module-config-refresh-styles");
		await expect
			.poll(() => pageText("#module-config-status"))
			.toBe("Mounted module styles refreshed.");
		const after = await moduleStylesheets();
		// Same file, still one link, fetched again with a cache-busting query.
		expect(after).toHaveLength(1);
		expect(after[0]).toMatch(
			/^\/__stage\/modules\/MMM-TestModule\/MMM-TestModule\.css\?refresh=/
		);
	});

	// Review Focus 1: the core's own handling of a getDom that throws stays
	// visible, and the tools keep reporting.
	test("module that throws in getDom under the real core", async () => {
		await boot(key);
		const original = await readFixtureTextFile("MMM-TestModule.js");
		const throwing = original.replace(
			"async getDom() {",
			`getDom() {\n\t\tthrow new Error(${JSON.stringify(GETDOM_FAILURE)});\n\t},\n\n\tasync unusedGetDom() {`
		);
		expect(throwing).not.toBe(original);

		try {
			await writeFixtureTextFile("MMM-TestModule.js", throwing);
			await reloadStage();

			await openDomain("debug");
			await openSidebarTab("debug", "console-log");
			await expect
				.poll(() => pageText("#console-log"))
				.toContain(GETDOM_FAILURE);

			await openDomain("runtime");
			await expect.poll(() => pageText("#lifecycle-started")).toBe("Yes");
			expect(await pageText("#lifecycle-dom-ready")).toBe("No");
			await pageClick("#lifecycle-activity-action");
			await expect
				.poll(() => pageText("#lifecycle-activity-status"))
				.toContain("Suspended");
		} finally {
			await writeFixtureTextFile("MMM-TestModule.js", original);
		}
	});
});
