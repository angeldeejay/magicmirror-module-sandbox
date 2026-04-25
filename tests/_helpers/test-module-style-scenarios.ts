/**
 * Named stylesheet scenarios used by browser suites to vary the fixture module CSS deterministically.
 */

export const fixtureStyleSelector = "#test-module-style-probe";

export const fixtureStyleScenarios = {
	default: {
		probeColor: "rgb(48, 170, 122)",
		fontWeight: "700"
	},
	refreshed: {
		probeColor: "rgb(255, 99, 71)",
		fontWeight: "700"
	}
};
