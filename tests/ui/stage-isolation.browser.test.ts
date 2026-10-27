/**
 * Browser-backed coverage for the real-core stage isolation stylesheet
 * (`client/scss/stage-isolation.scss`, maintainer flag `--real-core-stage`).
 *
 * The view is "isolated": only the mounted module's region and its ancestor
 * containers are visible, inside the version's real DOM and CSS. The sheet
 * changes presentation only, so geometry must equal the core's own. Runs once
 * per core in `tests/_helpers/core-matrix.ts`.
 */
import { afterAll, describe, expect, inject, test } from "vitest";
import {
	closeSandbox,
	gotoRealCoreStage,
	openSidebarTab,
	pageCheck,
	pageClick,
	pageSelect,
	pageUncheck,
	stageEvaluate
} from "../_helpers/helpers.browser.ts";

type StageScope = typeof globalThis & {
	__moduleSandboxModule?: { identifier: string };
};

const cores = inject("stageCoreMatrix");

/**
 * The core's `MM` object. 2.35-2.36 declare it as a global lexical binding,
 * 2.37+ assign it to `globalThis`, so only a free identifier reaches both.
 * Runs inside the stage frame.
 */
const moduleCount = () =>
	(globalThis.eval("MM") as { getModules: () => unknown[] }).getModules()
		.length;

/** Whether the fixture's `getDom` renders (`this._super()` works up to 2.36). */
function rendersFixture(version: string): boolean {
	const [major, minor] = version.split(".").map(Number);
	return major === 2 && minor <= 36;
}

afterAll(async () => {
	await closeSandbox();
});

/**
 * Boots the stage on a core with the given saved module settings, through the
 * Config panel, and waits for the document to carry them.
 */
async function bootWith(
	coreKey: string | null,
	settings: {
		position: string;
		hiddenOnStartup?: boolean;
		disabled?: boolean;
	}
): Promise<void> {
	await gotoRealCoreStage({ coreKey });
	await openSidebarTab("config", "general");
	await pageSelect("#config-position", settings.position);
	for (const [selector, on] of [
		["#config-hidden-on-startup", settings.hiddenOnStartup === true],
		["#config-disabled", settings.disabled === true]
	] as const) {
		await (on ? pageCheck(selector) : pageUncheck(selector));
	}
	// A disabled module never reaches stage-ready, so wait on the document
	// attributes the observer sets before the core boots.
	// Mark the current stage document so the reload Save triggers can be told
	// apart from it: when the saved values equal the booted ones (for example
	// middle_center), the attributes below already match on the old document.
	await stageEvaluate(() => {
		(globalThis as Record<string, unknown>).__isolationPreSave = true;
	});
	await pageClick("#module-config-save");
	await expect
		.poll(() =>
			stageEvaluate(
				() =>
					(globalThis as Record<string, unknown>)
						.__isolationPreSave === undefined
			)
		)
		.toBe(true);
	await expect
		.poll(() =>
			stageEvaluate(() => {
				const { dataset } = globalThis.document.documentElement;
				return {
					position: dataset.sandboxPosition,
					disabled: dataset.sandboxDisabled
				};
			})
		)
		.toEqual({
			position: settings.position,
			disabled: String(settings.disabled === true)
		});
	if (settings.disabled !== true) {
		await expect.poll(() => stageEvaluate(moduleCount)).toBeGreaterThan(0);
	}
}

describe.each(cores)("core $version", ({ version, key }) => {
	test("only the module region and its ancestors are visible", async () => {
		await bootWith(key, { position: "top_left" });

		const regions = await stageEvaluate(() =>
			Array.from(globalThis.document.querySelectorAll(".region")).map(
				(region) => ({
					classes: region.className,
					display: getComputedStyle(region).display
				})
			)
		);
		expect(regions.length).toBeGreaterThan(1);
		const visible = regions
			.filter((region) => region.display !== "none")
			.map((region) => region.classes.split(/\s+/).sort().join(" "))
			.sort();
		expect(visible).toEqual(["bar region top", "left region top"]);

		// The bar's own container belongs to the bar, not to top_left.
		const barContainer = await stageEvaluate(() => {
			const container = globalThis.document.querySelector(
				".region.top.bar > .container"
			);
			return container ? getComputedStyle(container).display : "";
		});
		expect(barContainer).toBe("none");

		if (!rendersFixture(version)) {
			return;
		}
		const box = await stageEvaluate(() => {
			const module = globalThis.document.querySelector(
				".region.top.left .module"
			);
			const margin = Number.parseFloat(
				getComputedStyle(globalThis.document.body).marginTop
			);
			const rect = module?.getBoundingClientRect();
			return rect
				? { top: rect.top, left: rect.left, bodyMargin: margin }
				: null;
		});
		expect(box).not.toBeNull();
		// Within the core body margin of the viewport's top-left corner.
		expect(box?.top).toBeLessThanOrEqual(
			(box?.bodyMargin ?? 0) + 60 /* body gap fallback */
		);
		expect(box?.left).toBeLessThanOrEqual((box?.bodyMargin ?? 0) + 60);
	});

	test("fullscreen_above fills the viewport", async () => {
		await bootWith(key, { position: "fullscreen_above" });

		const result = await stageEvaluate(() => {
			const region = globalThis.document.querySelector(
				".region.fullscreen.above"
			) as HTMLElement;
			const rect = region.getBoundingClientRect();
			return {
				coversViewport:
					rect.left <= 0 &&
					rect.top <= 0 &&
					rect.right >= globalThis.innerWidth &&
					rect.bottom >= globalThis.innerHeight,
				others: Array.from(
					globalThis.document.querySelectorAll(".region")
				)
					.filter((other) => other !== region)
					.map((other) => getComputedStyle(other).display)
			};
		});
		expect(result.coversViewport).toBe(true);
		expect(result.others.every((display) => display === "none")).toBe(true);
	});

	// One loaded stage, attribute switched in place: the sheet is keyed on
	// `data-sandbox-position` alone and this reads computed `display` only,
	// so 13 full restarts per core would add boot time without adding signal.
	test("every position shows only its module region and ancestors", async () => {
		await bootWith(key, { position: "middle_center" });

		const expected: Record<string, string[]> = {
			top_bar: ["bar region top"],
			top_left: ["bar region top", "left region top"],
			top_center: ["bar region top", "center region top"],
			top_right: ["bar region top", "region right top"],
			upper_third: ["region third upper"],
			middle_center: ["center middle region"],
			lower_third: ["lower region third"],
			bottom_left: ["bar bottom region", "bottom left region"],
			bottom_center: ["bar bottom region", "bottom center region"],
			bottom_right: ["bar bottom region", "bottom region right"],
			bottom_bar: ["bar bottom region"],
			fullscreen_above: ["above fullscreen region"],
			fullscreen_below: ["below fullscreen region"]
		};
		const visibleByPosition = await stageEvaluate((positions) => {
			const result: Record<string, string[]> = {};
			for (const position of positions) {
				globalThis.document.documentElement.dataset.sandboxPosition =
					position;
				result[position] = Array.from(
					globalThis.document.querySelectorAll(".region")
				)
					.filter(
						(region) => getComputedStyle(region).display !== "none"
					)
					.map((region) =>
						region.className.split(/\s+/).sort().join(" ")
					)
					.sort();
			}
			return result;
		}, Object.keys(expected));
		for (const names of Object.values(expected)) {
			names.sort();
		}
		expect(visibleByPosition).toEqual(expected);
	});

	test.each([
		{
			position: "top_left",
			region: ".region.top.left",
			ancestor: ".region.top.bar"
		},
		{
			position: "middle_center",
			region: ".region.middle.center",
			ancestor: null
		}
	])(
		"geometry is unchanged by the isolation sheet at $position",
		async ({ position, region, ancestor }) => {
			await bootWith(key, { position });

			// Ancestor bar and module wrapper too: a sub-region is absolutely
			// positioned against its bar, so only the bar's own rect would show
			// a stretched container. Both states are read synchronously inside
			// one task, after fonts and animations settle, so a late font load,
			// opacity transition or module re-render cannot land between them.
			const { withSheet, withoutSheet } = await stageEvaluate(
				async (targets) => {
					const describe = (selector: string | null) => {
						const element = selector
							? (globalThis.document.querySelector(
									selector
								) as HTMLElement | null)
							: null;
						if (!element) {
							return null;
						}
						const style = getComputedStyle(element);
						const rect = element.getBoundingClientRect();
						return {
							width: style.width,
							height: style.height,
							textAlign: style.textAlign,
							margin: style.margin,
							position: style.position,
							top: style.top,
							left: style.left,
							transform: style.transform,
							rect: [rect.x, rect.y, rect.width, rect.height]
						};
					};
					const read = () => ({
						region: describe(targets.region),
						ancestor: describe(targets.ancestor),
						wrapper: describe(`${targets.region} .module`)
					});
					const nextFrame = () =>
						new Promise((resolve) =>
							globalThis.requestAnimationFrame(resolve)
						);
					await globalThis.document.fonts.ready;
					// Let pending transitions/animations finish, then two frames.
					for (let attempt = 0; attempt < 50; attempt += 1) {
						const running = globalThis.document
							.getAnimations()
							.filter(
								(animation) =>
									animation.pendingFinish === false &&
									animation.playState === "running"
							);
						if (running.length === 0) {
							break;
						}
						await Promise.allSettled(
							running.map((animation) => animation.finished)
						);
					}
					await nextFrame();
					await nextFrame();

					const links = Array.from(
						globalThis.document.querySelectorAll<HTMLLinkElement>(
							'link[href*="stage-isolation.css"]'
						)
					);
					// No await below: reads force layout back to back.
					const on = read();
					for (const link of links) {
						link.disabled = true;
					}
					const off = read();
					for (const link of links) {
						link.disabled = false;
					}
					return { withSheet: on, withoutSheet: off };
				},
				{ region, ancestor }
			);
			expect(withSheet).toEqual(withoutSheet);
			expect(withSheet.region?.position).toBe("absolute");
			expect(Boolean(withSheet.ancestor)).toBe(ancestor !== null);
			if (rendersFixture(version)) {
				expect(withSheet.wrapper).not.toBeNull();
			}
		}
	);

	test("hiddenOnStartup keeps the module hidden", async () => {
		await bootWith(key, { position: "top_left", hiddenOnStartup: true });

		await expect
			.poll(() =>
				stageEvaluate(() => {
					const scope = globalThis as StageScope;
					const identifier =
						scope.__moduleSandboxModule?.identifier ?? "";
					const wrapper = identifier
						? globalThis.document.getElementById(identifier)
						: null;
					return wrapper
						? {
								hiddenClass:
									wrapper.classList.contains("hidden"),
								opacity: getComputedStyle(wrapper).opacity
							}
						: null;
				})
			)
			.toEqual({ hiddenClass: true, opacity: "0" });
	});

	test("disabled shows the sandbox disabled state and the core never loads modules", async () => {
		await bootWith(key, { position: "top_left", disabled: true });

		const state = await stageEvaluate(() => {
			const before = getComputedStyle(
				globalThis.document.body,
				"::before"
			);
			const after = getComputedStyle(globalThis.document.body, "::after");
			return {
				disabled:
					globalThis.document.documentElement.dataset.sandboxDisabled,
				modules: (
					globalThis.eval("MM") as { getModules: () => unknown[] }
				).getModules().length,
				title: before.content,
				copy: after.content,
				titleDisplay: before.display,
				titleVisibility: before.visibility
			};
		});
		expect(state.disabled).toBe("true");
		expect(state.modules).toBe(0);
		expect(state.title).toBe('"Module disabled"');
		expect(state.copy).toBe(
			'"The mounted module is disabled in the saved config. Re-enable it from Config to boot the viewport again."'
		);
		expect(state.titleDisplay).not.toBe("none");
		expect(state.titleVisibility).toBe("visible");
	});
});
