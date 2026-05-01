// VENDORED from MagicMirrorOrg/MagicMirror-3rd-Party-Modules — do not edit directly.
// Update by running: npm run sync:module-analyzer

/**
 * Module analyzer with comprehensive text rules, README validation, and package.json checks.
 * Migrated from legacy Python implementation (check_modules.py).
 */

import { readFile } from "node:fs/promises";

interface TextRule {
  pattern: string;
  category: "Deprecated" | "Recommendation" | "Typo" | "Outdated" | "Warning";
  description: string;
}

interface AnalysisResult {
  issues: string[];
  recommendations: string[];
}

interface ModuleCheckExceptions {
  skipCodeOfConductCheck?: boolean;
  skipDependabotCheck?: boolean;
  skipEslintChecks?: boolean;
  skipReadmeChecks?: boolean;
}

const MODULE_CHECK_EXCEPTIONS: Record<string, ModuleCheckExceptions> = {
  // mmpm is a standalone management tool, not a classic MM module runtime package.
  // Some mirror-module README/community checks are not meaningful for it.
  "Bee-Mar/mmpm": {
    skipReadmeChecks: true,
    skipDependabotCheck: true,
    skipEslintChecks: true
  }
};

function getRepositoryId(moduleUrl: string): string | null {
  try {
    const url = new URL(moduleUrl);
    const segments = url.pathname.split("/").filter(Boolean);
    if (segments.length < 2) {
      return null;
    }

    const owner = segments[0];
    const repo = segments[1].replace(/\.git$/u, "");
    if (!owner || !repo) {
      return null;
    }

    return `${owner}/${repo}`;
  }
  catch {
    return null;
  }
}

// Comprehensive TEXT_RULES with all deprecated APIs, typos, and recommendations
const TEXT_RULES: Record<string, TextRule> = {
  "new Buffer(": {
    pattern: "new Buffer(",
    category: "Deprecated",
    description: "This is deprecated. Please update. [See here for more information](https://nodejs.org/api/buffer.html).",
  },
  "fs.F_OK": {
    pattern: "fs.F_OK",
    category: "Deprecated",
    description: "Replace it with `fs.constants.F_OK`.",
  },
  "fs.R_OK": {
    pattern: "fs.R_OK",
    category: "Deprecated",
    description: "Replace it with `fs.constants.R_OK`.",
  },
  "fs.W_OK": {
    pattern: "fs.W_OK",
    category: "Deprecated",
    description: "Replace it with `fs.constants.W_OK`.",
  },
  "fs.X_OK": {
    pattern: "fs.X_OK",
    category: "Deprecated",
    description: "Replace it with `fs.constants.X_OK`.",
  },
  "Magic Mirror": {
    pattern: "Magic Mirror",
    category: "Typo",
    description: "Replace it with `MagicMirror²`.",
  },
  "MagicMirror2": {
    pattern: "MagicMirror2",
    category: "Typo",
    description: "Replace it with `MagicMirror²`.",
  },
  "[MagicMirror]": {
    pattern: "[MagicMirror]",
    category: "Typo",
    description: "Replace it with `[MagicMirror²]`.",
  },
  "<sub>2</sub>": {
    pattern: "<sub>2</sub>",
    category: "Typo",
    description: "Replace it with `²`.",
  },
  'require("request")': {
    pattern: 'require("request")',
    category: "Deprecated",
    description: "Replace it with built-in fetch ([documentation](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch); [example module with fetch implemented](https://github.com/KristjanESPERANTO/MMM-ApothekenNotdienst/blob/main/node_helper.js)).",
  },
  "require('request')": {
    pattern: "require('request')",
    category: "Deprecated",
    description: "Replace it with built-in fetch ([documentation](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch); [example module with fetch implemented](https://github.com/KristjanESPERANTO/MMM-ApothekenNotdienst/blob/main/node_helper.js)).",
  },
  'require("request-promise")': {
    pattern: 'require("request-promise")',
    category: "Deprecated",
    description: "Replace it with built-in fetch ([documentation](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch); [example module with fetch implemented](https://github.com/KristjanESPERANTO/MMM-ApothekenNotdienst/blob/main/node_helper.js)).",
  },
  "require('request-promise')": {
    pattern: "require('request-promise')",
    category: "Deprecated",
    description: "Replace it with built-in fetch ([documentation](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch); [example module with fetch implemented](https://github.com/KristjanESPERANTO/MMM-ApothekenNotdienst/blob/main/node_helper.js)).",
  },
  'require("native-request")': {
    pattern: 'require("native-request")',
    category: "Deprecated",
    description: "Replace it with built-in fetch ([documentation](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch); [example module with fetch implemented](https://github.com/KristjanESPERANTO/MMM-ApothekenNotdienst/blob/main/node_helper.js)).",
  },
  'require("http")': {
    pattern: 'require("http")',
    category: "Recommendation",
    description: 'Replace "http" by "node:http".',
  },
  "require('http')": {
    pattern: "require('http')",
    category: "Recommendation",
    description: "Replace 'http' by 'node:http'.",
  },
  'require("https")': {
    pattern: 'require("https")',
    category: "Recommendation",
    description: 'Replace "https" by "node:https".',
  },
  "require('https')": {
    pattern: "require('https')",
    category: "Recommendation",
    description: "Replace 'https' by 'node:https'.",
  },
  "'node-fetch'": {
    pattern: "'node-fetch'",
    category: "Recommendation",
    description: "Replace it with built-in fetch ([documentation](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch); [example module with fetch implemented](https://github.com/KristjanESPERANTO/MMM-ApothekenNotdienst/blob/main/node_helper.js)).",
  },
  '"node-fetch"': {
    pattern: '"node-fetch"',
    category: "Recommendation",
    description: "Replace it with built-in fetch ([documentation](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch); [example module with fetch implemented](https://github.com/KristjanESPERANTO/MMM-ApothekenNotdienst/blob/main/node_helper.js)).",
  },
  'require("fetch")': {
    pattern: 'require("fetch")',
    category: "Recommendation",
    description: "Replace it with built-in fetch ([documentation](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch); [example module with fetch implemented](https://github.com/KristjanESPERANTO/MMM-ApothekenNotdienst/blob/main/node_helper.js)).",
  },
  "require('fetch')": {
    pattern: "require('fetch')",
    category: "Recommendation",
    description: "Replace it with built-in fetch ([documentation](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch); [example module with fetch implemented](https://github.com/KristjanESPERANTO/MMM-ApothekenNotdienst/blob/main/node_helper.js)).",
  },
  "axios": {
    pattern: "axios",
    category: "Recommendation",
    description: "Replace it with built-in fetch ([documentation](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch); [example module with fetch implemented](https://github.com/KristjanESPERANTO/MMM-ApothekenNotdienst/blob/main/node_helper.js)).",
  },
  "omxplayer": {
    pattern: "omxplayer",
    category: "Deprecated",
    description: "Try to replace it with `mplayer` or `vlc`.",
  },
  "XMLHttpRequest": {
    pattern: "XMLHttpRequest",
    category: "Recommendation",
    description: "Replace it with built-in fetch ([documentation](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch); [example module with fetch implemented](https://github.com/KristjanESPERANTO/MMM-ApothekenNotdienst/blob/main/node_helper.js)).",
  },
  "uses: actions/checkout@v2": {
    pattern: "uses: actions/checkout@v2",
    category: "Recommendation",
    description: "Replace it with v5.",
  },
  "uses: actions/checkout@v3": {
    pattern: "uses: actions/checkout@v3",
    category: "Recommendation",
    description: "Replace it with v5.",
  },
  "uses: actions/checkout@v4": {
    pattern: "uses: actions/checkout@v4",
    category: "Recommendation",
    description: "Replace it with v5.",
  },
  "uses: actions/setup-node@v3": {
    pattern: "uses: actions/setup-node@v3",
    category: "Recommendation",
    description: "Replace it with v4.",
  },
  "node-version: [14": {
    pattern: "node-version: [14",
    category: "Deprecated",
    description: "Update to current version.",
  },
  "node-version: 16": {
    pattern: "node-version: 16",
    category: "Deprecated",
    description: "Update to current version.",
  },
  "node-version: [16": {
    pattern: "node-version: [16",
    category: "Deprecated",
    description: "Update to current version.",
  },
  "node-version: 18": {
    pattern: "node-version: 18",
    category: "Deprecated",
    description: "Update to current version.",
  },
  "node-version: [18": {
    pattern: "node-version: [18",
    category: "Deprecated",
    description: "Update to current version.",
  },
  "npm run": {
    pattern: "npm run",
    category: "Recommendation",
    description: "Replace it with `node --run`. This is a more modern way to run scripts, without the need for npm.",
  },
  "jshint": {
    pattern: "jshint",
    category: "Recommendation",
    description: 'Replace "jshint" by "eslint".',
  },
  "getYear()": {
    pattern: "getYear()",
    category: "Deprecated",
    description: "Replace `getYear()` by `getFullYear()`.",
  },
  "MichMich/MagicMirror": {
    pattern: "MichMich/MagicMirror",
    category: "Outdated",
    description: "Replace it by `MagicMirrorOrg/MagicMirror`.",
  },
  "/_/husky.sh": {
    pattern: "/_/husky.sh",
    category: "Outdated",
    description: "Since husky v9 you may not need this anymore.",
  },
  "npm install electron-rebuild": {
    pattern: "npm install electron-rebuild",
    category: "Deprecated",
    description: "Replace it with `@electron/rebuild`",
  },
  "api.openweathermap.org/data/2.5": {
    pattern: "api.openweathermap.org/data/2.5",
    category: "Deprecated",
    description: "OpenWeather API 2.5 is deprecated since June 2024. Please update to 3.0.",
  },
  "https://cdnjs.cloudflare.com": {
    pattern: "https://cdnjs.cloudflare.com",
    category: "Recommendation",
    description: "It looks like a package is loaded via CDN. It would be better if the package were installed locally via npm.",
  },
  "https://cdn.jsdelivr.net": {
    pattern: "https://cdn.jsdelivr.net",
    category: "Recommendation",
    description: "It looks like a package is loaded via CDN. It would be better if the package were installed locally via npm.",
  },
  "eslint .": {
    pattern: "eslint .",
    category: "Recommendation",
    description: "The period at the end of the command is not necessary since v9. It is recommended to remove it.",
  },
  "eslint --fix .": {
    pattern: "eslint --fix .",
    category: "Recommendation",
    description: "The period at the end of the command is not necessary since v9. It is recommended to remove it.",
  },
  "git checkout": {
    pattern: "git checkout",
    category: "Recommendation",
    description: "Replace it with `git switch`. It's not a drop-in replacement, so make sure to check the documentation.",
  },
};

const PACKAGE_JSON_RULES: Record<string, TextRule> = {
  '"electron-rebuild"': {
    pattern: '"electron-rebuild"',
    category: "Deprecated",
    description: "Replace it with `@electron/rebuild`",
  },
  "eslint-config-airbnb": {
    pattern: "eslint-config-airbnb",
    category: "Deprecated",
    description: "Replace it with modern ESLint configuration.",
  },
  '"eslint-plugin-json"': {
    pattern: '"eslint-plugin-json"',
    category: "Recommendation",
    description: "Replace it by `@eslint/json`.",
  },
  "eslint-plugin-jsonc": {
    pattern: "eslint-plugin-jsonc",
    category: "Recommendation",
    description: "Replace it by `@eslint/json`.",
  },
  '"grunt"': {
    pattern: '"grunt"',
    category: "Deprecated",
    description: "Grunt is practically unmaintained. Move on to something better.",
  },
  "husky install": {
    pattern: "husky install",
    category: "Outdated",
    description: "Since husky v9 you may not need this anymore.",
  },
  '"needle"': {
    pattern: '"needle"',
    category: "Recommendation",
    description: "Replace it with built-in fetch ([documentation](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch); [example module with fetch implemented](https://github.com/KristjanESPERANTO/MMM-ApothekenNotdienst/blob/main/node_helper.js)).",
  },
  "rollup-plugin-banner": {
    pattern: "rollup-plugin-banner",
    category: "Deprecated",
    description: "Replace it with built-in banner.",
  },
  "stylelint-config-prettier": {
    pattern: "stylelint-config-prettier",
    category: "Deprecated",
    description: "Update `stylelint` and remove `stylelint-config-prettier`.",
  },
};

const PACKAGE_LOCK_RULES: Record<string, TextRule> = {
  '"lockfileVersion": 1': {
    pattern: '"lockfileVersion": 1',
    category: "Deprecated",
    description: "Run `npm update` to update to lockfileVersion 3.",
  },
  '"lockfileVersion": 2': {
    pattern: '"lockfileVersion": 2',
    category: "Deprecated",
    description: "Run `npm update` to update to lockfileVersion 3.",
  },
};

function searchRegexInFile(content: string, pattern: RegExp): boolean {
  try {
    return pattern.test(content);
  } catch {
    return false;
  }
}

/**
 * Analyze a module for issues and recommendations.
 * This is the core analysis function for the parallel-processing stage.
 */
export async function analyzeModule(
  modulePath: string,
  moduleName: string,
  moduleUrl: string,
  files: string[]
): Promise<AnalysisResult> {
  const issues: string[] = [];
  const moduleRepoId = getRepositoryId(moduleUrl);
  const moduleExceptions = moduleRepoId ? MODULE_CHECK_EXCEPTIONS[moduleRepoId] ?? {} : {};

  // Filter out files in node_modules and .git directories.
  // Use path segments instead of substring matching so ".github" files are not excluded.
  const relevantFiles = files.filter(
    (f) => {
      const segments = f.split("/");
      return !segments.includes("node_modules") && !segments.includes(".git");
    }
  );

  // Check for each file
  for (const filePath of relevantFiles) {
    const content = await readFile(filePath, "utf-8").catch(() => "");
    const filename = filePath.split("/").pop() ?? "";
    const filenameLower = filename.toLowerCase();
    const isChangelogFile = filenameLower === "changelog" || filenameLower.startsWith("changelog.");
    const isPackageLockFile = filenameLower === "package-lock.json";

    // Check TEXT_RULES
    for (const [, rule] of Object.entries(TEXT_RULES)) {
      // CHANGELOG entries are historical context and produce low-quality findings.
      if (isChangelogFile) {
        continue;
      }

      // lockfiles should only be checked via lockfile-specific rules.
      if (isPackageLockFile) {
        continue;
      }

      if (content.includes(rule.pattern)) {
        issues.push(
          `${rule.category}: Found \`${rule.pattern}\` in file \`${filePath.split("/").pop()}\`: ${rule.description}`
        );
      }
    }

    if (filePath.toLowerCase().includes("stylelint") && content.includes("prettier/prettier")) {
      issues.push(
        `Recommendation: Found \`prettier/prettier\` in file \`${filePath.split("/").pop()}\`: Config would be cleaner using 'stylelint-prettier/recommended'. [See here](https://github.com/prettier/stylelint-prettier).`
      );
    }

    // Package.json specific rules
    if (filePath.endsWith("package.json")) {
      for (const [, rule] of Object.entries(PACKAGE_JSON_RULES)) {
        if (content.includes(rule.pattern)) {
          issues.push(
            `${rule.category}: Found \`${rule.pattern}\` in file \`package.json\`: ${rule.description}`
          );
        }
      }
    }

    // Package-lock.json rules
    if (isPackageLockFile) {
      for (const [, rule] of Object.entries(PACKAGE_LOCK_RULES)) {
        if (content.includes(rule.pattern)) {
          issues.push(
            `${rule.category}: Found \`${rule.pattern}\` in file \`package-lock.json\`: ${rule.description}`
          );
        }
      }
    }

    // README.md validations (only top-level module README, matching legacy behavior)
    const relativePath = filePath.startsWith(modulePath)
      ? filePath.slice(modulePath.length).replace(/^\/+/, "")
      : filePath;
    if (relativePath === "README.md" && !moduleExceptions.skipReadmeChecks) {
      // Check for update section
      if (!content.includes("## Updat")) {
        issues.push(
          "Recommendation: The README seems not to have an update section (like `## Update`). Please add one ([basic instructions](https://github.com/MagicMirrorOrg/MagicMirror-3rd-Party-Modules/blob/main/guides/readme_bestpractices.md#Update-Instructions))."
        );
      }

      // Check for install section
      if (!content.includes("## Install")) {
        issues.push(
          "Recommendation: The README seems not to have an install section (like `## Installation`). Please add one ([basic instructions](https://github.com/MagicMirrorOrg/MagicMirror-3rd-Party-Modules/blob/main/guides/readme_bestpractices.md#Installation-Instructions))."
        );
      }

      // Check for modules array
      const falsePositivesModulesArray = ["MMM-pages", "MMM-WebSpeechTTS"];
      if (content.includes("modules: [") && !falsePositivesModulesArray.includes(moduleName)) {
        issues.push(
          "Recommendation: The README seems to have a modules array (Found `modules: [`). This is usually not necessary. Please remove it if it is not needed ([basic instructions](https://github.com/MagicMirrorOrg/MagicMirror-3rd-Party-Modules/blob/main/guides/readme_bestpractices.md#Config-Instructions))."
        );
      }

      // Check for config example
      const configRegex = /\{\s*[^}]*?\s*config:\s*\{\s*[^}]*\}(?:[,\s]\s*[^}]*?)}/;
      const hasConfigExample = searchRegexInFile(content, configRegex);

      if (!hasConfigExample) {
        const falsePositivesConfig = ["MMM-CalendarExt2"];
        if (!content.includes("modules: [") && !falsePositivesConfig.includes(moduleName)) {
          issues.push(
            "Recommendation: The README seems not to have a config example. Please add one ([basic instructions](https://github.com/MagicMirrorOrg/MagicMirror-3rd-Party-Modules/blob/main/guides/readme_bestpractices.md#Config-Instructions))."
          );
        }
      } else {
        // Check for trailing comma
        const trailingCommaRegex = /\{\s*[^}]*?\s*config:\s*\{\s*[^}]*\}(?:[,\s]\s*[^}]*?)},/;
        const hasTrailingComma = searchRegexInFile(content, trailingCommaRegex);
        const falsePositivesTrailing = ["MMM-MealieMenu", "MMM-Remote-Control"];
        if (!hasTrailingComma && !falsePositivesTrailing.includes(moduleName)) {
          issues.push(
            "Recommendation: The README seems to have a config example without a trailing comma. Please add one ([basic instructions](https://github.com/MagicMirrorOrg/MagicMirror-3rd-Party-Modules/blob/main/guides/readme_bestpractices.md#Config-Instructions))."
          );
        }
      }

      // Check clone instructions
      if (!content.includes("git clone")) {
        issues.push("Recommendation: The README seems not to have clone instructions.");
      } else {
        if (!content.includes(`git clone ${moduleUrl}`)) {
          issues.push("Recommendation: The README seems to have incorrect clone instructions. Please check the URL.");
        }
      }
    }
  }

  // File existence checks
  const filenames = new Set(relevantFiles.map((f) => f.split("/").pop()?.toUpperCase() ?? ""));

  if (!filenames.has("LICENSE") && !filenames.has("LICENSE.MD")) {
    issues.push(
      "Warning: No LICENSE file ([example LICENSE file](https://github.com/KristjanESPERANTO/MMM-WebSpeechTTS/blob/main/LICENSE.md))."
    );
  }

  if (!filenames.has("CHANGELOG") && !filenames.has("CHANGELOG.MD")) {
    issues.push(
      "Recommendation: There is no CHANGELOG file. It is recommended to add one ([example CHANGELOG file](https://github.com/KristjanESPERANTO/MMM-ApothekenNotdienst/blob/main/CHANGELOG.md))."
    );
  }

  if (!moduleExceptions.skipCodeOfConductCheck && !filenames.has("CODE_OF_CONDUCT") && !filenames.has("CODE_OF_CONDUCT.MD")) {
    issues.push(
      "Recommendation: There is no CODE_OF_CONDUCT file. It is recommended to add one ([example CODE_OF_CONDUCT file](https://github.com/KristjanESPERANTO/MMM-ApothekenNotdienst/blob/main/CODE_OF_CONDUCT.md))."
    );
  }

  if (!moduleExceptions.skipDependabotCheck && !filenames.has("DEPENDABOT.YAML") && !filenames.has("DEPENDABOT.YML")) {
    issues.push(
      "Recommendation: There is no dependabot configuration file. It is recommended to add one ([example dependabot file](https://github.com/KristjanESPERANTO/MMM-ApothekenNotdienst/blob/main/.github/dependabot.yaml))."
    );
  }

  // Linting setup checks (ESLint or Biome)
  if (!moduleExceptions.skipEslintChecks) {
    const hasOldEslintrc = filenames.has("ESLINTRC") || filenames.has("ESLINTRC.JSON") || filenames.has("ESLINTRC.JS") || filenames.has("ESLINTRC.YML") || filenames.has("ESLINTRC.YAML");
    const hasNewEslint = filenames.has("ESLINT.CONFIG.JS") || filenames.has("ESLINT.CONFIG.MJS");
    const hasBiome = filenames.has("BIOME.JSON") || filenames.has("BIOME.JSONC");

    if (hasOldEslintrc) {
      issues.push("Recommendation: Replace eslintrc by new flat config.");
    } else if (!hasNewEslint && !hasBiome) {
      issues.push(
        "Recommendation: No linter configuration was found. A linter is very helpful, it is worth using one even for small projects. You can use ESLint or Biome ([ESLint guide](https://github.com/MagicMirrorOrg/MagicMirror-3rd-Party-Modules/blob/main/guides/eslint.md), [Biome guide](https://github.com/MagicMirrorOrg/MagicMirror-3rd-Party-Modules/blob/main/guides/biome.md))."
      );
    } else if (hasNewEslint) {
      // Check if ESLint is in package.json dependencies
      const packageJsonFiles = relevantFiles.filter((f) => f.endsWith("package.json"));
      for (const pkgFile of packageJsonFiles) {
        const pkgContent = await readFile(pkgFile, "utf-8").catch(() => "{}");
        try {
          const pkg = JSON.parse(pkgContent);
          if (
            !pkg.dependencies?.eslint &&
            !pkg.devDependencies?.eslint
          ) {
            issues.push(
              "Recommendation: ESLint is not in the dependencies or devDependencies. It is recommended to add it to one of them."
            );
          }

          // Check lint script
          if (pkg.scripts) {
            if (!pkg.scripts.lint) {
              issues.push("Recommendation: No lint script found in package.json. It is recommended to add one.");
            } else if (!pkg.scripts.lint.includes("eslint")) {
              issues.push(
                "Recommendation: The lint script in package.json does not contain `eslint`. It is recommended to add it."
              );
            }
          }
        } catch {
          // Silently ignore JSON parse errors
        }
      }

      // Check for defineConfig in eslint.config.js
      const eslintConfigFiles = relevantFiles.filter(
        (f) => f.endsWith("eslint.config.js") || f.endsWith("eslint.config.mjs")
      );
      for (const configFile of eslintConfigFiles) {
        const configContent = await readFile(configFile, "utf-8").catch(() => "");
        if (!configContent.includes("defineConfig")) {
          issues.push(
            `Recommendation: The ESLint configuration file \`${configFile.split("/").pop()}\` does not contain \`defineConfig\`. It is recommended to use it.`
          );
        }
      }
    }
  }

  // Check for node_modules in directory list (not files)
  if (relevantFiles.some((f) => f.endsWith("/node_modules"))) {
    issues.push(
      "Found directory `node_modules`. This shouldn't be uploaded. Add `node_modules/`to `.gitignore`."
    );
  }

  return {
    issues,
    recommendations: [], // Recommendations are mixed into issues for compatibility
  };
}
