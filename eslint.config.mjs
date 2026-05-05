// @ts-check
import js from "@eslint/js";
import prettierRecommended from "eslint-plugin-prettier/recommended";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import globals from "globals";

/** @type {import("eslint").Linter.Config[]} */
const config = [
	{
		ignores: [
			".claude/worktree/**",
			".runtime-cache/**",
			"client/generated/**",
			"client/styles/**",
			"client/webfonts/**",
			"codeql-db/**",
			"coverage/**",
			"dist/**",
			"playwright-report/**",
			"scripts/templates/**",
			"shims/generated/**",
			"test-results/**"
		]
	},
	js.configs.recommended,
	prettierRecommended,
	{
		plugins: {
			"simple-import-sort": simpleImportSort
		},
		rules: {
			"simple-import-sort/imports": "error",
			"simple-import-sort/exports": "error"
		}
	},
	{
		files: ["tests/**/*.js"],
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
		files: ["tests/_fixtures/**/*.js"],
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

export default config;
