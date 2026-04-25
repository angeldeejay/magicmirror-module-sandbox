/**
 * ESLint configuration for the sandbox package.
 *
 * Node-side files use CommonJS globals while browser runtime files stay in
 * script mode with DOM globals and the Socket.IO client exposed.
 */
import js from "@eslint/js";
import globals from "globals";

export default [
	{
		ignores: [
			"dist/**",
			"node_modules/**",
			".runtime-cache/**",
			"client/fonts/**"
		]
	},
	js.configs.recommended,
	{
		files: [
			"bin/**/*.js",
			"config/**/*.js",
			"scripts/**/*.js",
			"server/**/*.js",
			"shims/**/*.js",
			"tests/**/*.js"
		],
		languageOptions: {
			ecmaVersion: 2021,
			sourceType: "commonjs",
			globals: {
				...globals.node,
				afterAll: "readonly",
				afterEach: "readonly",
				beforeAll: "readonly",
				beforeEach: "readonly",
				describe: "readonly",
				expect: "readonly",
				it: "readonly",
				test: "readonly",
				vi: "readonly"
			}
		},
		rules: {
			"no-unused-vars": [
				"error",
				{
					argsIgnorePattern: "^_",
					caughtErrorsIgnorePattern: "^_",
					varsIgnorePattern: "^_"
				}
			],
			"no-undef": "error"
		}
	},
	{
		files: ["tests/**/*.mjs"],
		languageOptions: {
			ecmaVersion: 2022,
			sourceType: "module",
			globals: {
				...globals.node,
				afterAll: "readonly",
				afterEach: "readonly",
				beforeAll: "readonly",
				beforeEach: "readonly",
				describe: "readonly",
				expect: "readonly",
				it: "readonly",
				test: "readonly",
				vi: "readonly"
			}
		},
		rules: {
			"no-unused-vars": [
				"error",
				{
					argsIgnorePattern: "^_",
					caughtErrorsIgnorePattern: "^_",
					varsIgnorePattern: "^_"
				}
			],
			"no-undef": "error"
		}
	},
	{
		files: ["client/**/*.js"],
		languageOptions: {
			ecmaVersion: 2021,
			sourceType: "script",
			globals: {
				...globals.browser,
				...globals.node,
				io: "readonly"
			}
		},
		rules: {
			"no-redeclare": "off",
			"no-unused-vars": [
				"error",
				{
					argsIgnorePattern: "^_",
					caughtErrorsIgnorePattern: "^_",
					varsIgnorePattern: "^_"
				}
			],
			"no-undef": "error"
		}
	}
];
