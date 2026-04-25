/**
 * Vitest browser-command augmentation for the shared sandbox command vocabulary.
 */

declare module "vitest/browser" {
	interface BrowserCommands {
		sandboxApplyFixtureStyleScenario(scenarioName: string): Promise<void>;
		sandboxClickAndWaitForStageReady(selector: string): Promise<void>;
		sandboxClickAndWaitForStylesRefreshed(selector: string): Promise<void>;
		sandboxClose(): Promise<void>;
		sandboxGoto(): Promise<void>;
		sandboxOpenDomain(domain: string): Promise<void>;
		sandboxOpenSidebarTab(domain: string, tab: string): Promise<void>;
		sandboxPageAttribute(
			selector: string,
			attributeName: string
		): Promise<string | null>;
		sandboxPageCheck(selector: string): Promise<void>;
		sandboxPageClick(selector: string): Promise<void>;
		sandboxPageCount(selector: string): Promise<number>;
		sandboxPageDisabled(selector: string): Promise<boolean>;
		sandboxPageEvaluate<TArg, TResult>(
			source: string,
			arg?: TArg
		): Promise<TResult>;
		sandboxPageFill(selector: string, value: string): Promise<void>;
		sandboxPageSelect(selector: string, value: string): Promise<void>;
		sandboxPageUncheck(selector: string): Promise<void>;
		sandboxPageUrl(): Promise<string>;
		sandboxPageValue(selector: string): Promise<string>;
		sandboxPageVisible(selector: string): Promise<boolean>;
		sandboxReadFixtureTextFile(
			fixtureRelativePath: string
		): Promise<string>;
		sandboxReadModuleConfigEditorText(): Promise<string>;
		sandboxReadTextFile(relativePath: string): Promise<string>;
		sandboxRestoreDefaultsAndWait(): Promise<void>;
		sandboxSelectLanguage(languageCode: string): Promise<void>;
		sandboxStageAttribute(
			selector: string,
			attributeName: string
		): Promise<string | null>;
		sandboxStageClick(selector: string): Promise<void>;
		sandboxStageEvaluate<TArg, TResult>(
			source: string,
			arg?: TArg
		): Promise<TResult>;
		sandboxStageText(selector: string): Promise<string>;
		sandboxStageVisible(selector: string): Promise<boolean>;
		sandboxWriteFixtureTextFile(
			fixtureRelativePath: string,
			content: string
		): Promise<void>;
		sandboxWriteModuleConfig(nextConfig: object): Promise<void>;
		sandboxWriteTextFile(
			relativePath: string,
			content: string
		): Promise<void>;
	}

	export const commands: BrowserCommands;
}
