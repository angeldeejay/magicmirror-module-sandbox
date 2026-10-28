/**
 * Browser-backed integration coverage for the stage socket server: module
 * traffic on `/__stage/socket.io` reaches the shell WebSocket panel from the
 * server side.
 */
import { afterAll, expect, test } from "vitest";
import {
	closeSandbox,
	gotoSandbox,
	pageEvaluate,
	stageEvaluate,
	stageText
} from "../_helpers/helpers.browser.ts";

afterAll(async () => {
	await closeSandbox();
});

/**
 * Read the text content of one shell element.
 */
const pageText = (selector: string) => {
	return pageEvaluate((selectorValue) => {
		return (
			globalThis.document.querySelector(selectorValue)?.textContent ?? ""
		);
	}, selector);
};

test("websocket log reaches the shell from the server side", async () => {
	await gotoSandbox();
	// The panel content is read from the DOM, so the domain does not need to be
	// opened.

	await expect
		.poll(() => stageText("#test-module-helper-ping"))
		.toBe("Ping helper");
	await stageEvaluate(() => {
		globalThis.document.getElementById("test-module-helper-ping")?.click();
	});

	// The helper answers with sendSocketNotification, which broadcasts through
	// io.of(namespace).emit; the PONG entry therefore covers the broadcast path.
	await expect
		.poll(() => stageText("#test-module-helper-reply"))
		.toBe("Helper: fixture ping");
	await expect
		.poll(() => pageText("#websocket-log"))
		.toContain("TEST_MODULE_PING");
	await expect
		.poll(() => pageText("#websocket-log"))
		.toContain("TEST_MODULE_PONG");
});
