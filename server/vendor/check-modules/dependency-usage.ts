// VENDORED from MagicMirrorOrg/MagicMirror-3rd-Party-Modules — do not edit directly.
// Update by running: npm run sync:module-analyzer

import { builtinModules } from "node:module";
import path from "node:path";

export { MISSING_DEPENDENCY_RULE_ID } from "./missing-dependency-rule.ts";

type DependencyIgnoreInput = string | string[] | Set<string> | undefined;

interface DetectDependencyOptions {
  ignore?: DependencyIgnoreInput;
}

type DependencySection = Record<string, string> | null | undefined;

interface PackageSummaryLike {
  dependencies?: DependencySection;
  devDependencies?: DependencySection;
  peerDependencies?: DependencySection;
  optionalDependencies?: DependencySection;
}

interface MissingDependencyCheckInput {
  usedDependencies?: Set<string>;
  declaredDependencies?: Set<string>;
}

type StripState = "code" | "singleLineComment" | "multiLineComment" | "string" | "template";

const SOURCE_FILE_EXTENSIONS = new Set([
  ".cjs",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".mts",
  ".ts",
  ".tsx"
]);

const IGNORED_PATH_SEGMENTS = new Set([
  "build",
  "coverage",
  "dist",
  "docs",
  "documentation",
  "examples",
  "example",
  "fixtures",
  "vendor",
  "vendors"
]);

const BUILTIN_DEPENDENCIES = new Set([
  ...builtinModules,
  ...builtinModules.map(name => `node:${name}`)
]);

const DEFAULT_IGNORED_DEPENDENCIES = new Set(["express", "node_helper", "logger"]);

const DEPENDENCY_CAPTURE_PATTERNS = Object.freeze([
  /\brequire\s*\(\s*["']([^"']+)["']\s*\)/gu,
  /\bfrom\s+["']([^"']+)["']/gu,
  /\bimport\s+["']([^"']+)["']/gu,
  /\bimport\s*\(\s*["']([^"']+)["']\s*\)/gu
]);

function isRelativeModule(specifier: unknown): boolean {
  if (typeof specifier !== "string") {
    return false;
  }
  const trimmed = specifier.trim();
  return trimmed.startsWith(".") || trimmed.startsWith("/");
}

function isBuiltinModule(specifier: unknown): boolean {
  if (typeof specifier !== "string" || specifier.length === 0) {
    return false;
  }

  const trimmed = specifier.trim();
  if (BUILTIN_DEPENDENCIES.has(trimmed)) {
    return true;
  }

  const withoutNodePrefix = trimmed.replace(/^node:/u, "");
  const [firstSegment] = withoutNodePrefix.split("/");
  if (!firstSegment) {
    return false;
  }

  return BUILTIN_DEPENDENCIES.has(firstSegment) || BUILTIN_DEPENDENCIES.has(`node:${firstSegment}`);
}

function toPackageName(specifier: unknown): string | null {
  if (typeof specifier !== "string") {
    return null;
  }

  const trimmed = specifier.trim();
  if (trimmed.length === 0 || isRelativeModule(trimmed) || isBuiltinModule(trimmed)) {
    return null;
  }

  const withoutNodePrefix = trimmed.replace(/^node:/u, "");

  if (withoutNodePrefix.startsWith("@")) {
    const segments = withoutNodePrefix.split("/");
    if (segments.length >= 2) {
      return `${segments[0]}/${segments[1]}`;
    }
    return withoutNodePrefix;
  }

  const slashIndex = withoutNodePrefix.indexOf("/");
  if (slashIndex === -1) {
    return withoutNodePrefix;
  }

  return withoutNodePrefix.slice(0, slashIndex);
}

/**
 * Strip JavaScript comments from source code to avoid false positives
 * when detecting imports/requires in comments.
 *
 * Handles:
 * - Single-line comments (//)
 * - Multi-line comments (/* *\/)
 * - Strings (preserves them)
 * - Template literals (preserves them)
 *
 * @param {string} content - The source code content
 * @returns {string} Content with comments removed
 */
function stripComments(content: string): string {
  if (typeof content !== "string" || content.length === 0) {
    return content;
  }

  let result = "";
  let state: StripState = "code";
  let stringDelimiter = "";
  let escaped = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    const nextChar = content[index + 1] || "";

    if (state === "code") {
      // Check for string start
      if (char === "\"" || char === "'") {
        state = "string";
        stringDelimiter = char;
        result += char;
      }
      else if (char === "`") {
        // Template literal start
        state = "template";
        result += char;
      }
      else if (char === "/" && nextChar === "/") {
        // Single-line comment start
        state = "singleLineComment";
        index += 1; // Skip '/'
      }
      else if (char === "/" && nextChar === "*") {
        // Multi-line comment start
        state = "multiLineComment";
        index += 1; // Skip '*'
      }
      else {
        result += char;
      }
    }
    else if (state === "string") {
      result += char;
      if (escaped) {
        escaped = false;
      }
      else if (char === "\\") {
        escaped = true;
      }
      else if (char === stringDelimiter) {
        state = "code";
        stringDelimiter = "";
      }
    }
    else if (state === "template") {
      result += char;
      if (escaped) {
        escaped = false;
      }
      else if (char === "\\") {
        escaped = true;
      }
      else if (char === "`") {
        state = "code";
      }
    }
    else if (state === "singleLineComment") {
      if (char === "\n" || char === "\r") {
        state = "code";
        result += char; // Preserve newline
      }
      // Otherwise skip comment content
    }
    else if (state === "multiLineComment") {
      if (char === "*" && nextChar === "/") {
        state = "code";
        index += 1; // Skip '/'
      }
      // Otherwise skip comment content
    }
  }

  return result;
}

function extractImportedModuleSpecifiers(content: string): Set<string> {
  const modules = new Set<string>();
  if (typeof content !== "string" || content.length === 0) {
    return modules;
  }

  // Strip comments to avoid false positives from commented-out code
  const contentWithoutComments = stripComments(content);

  for (const pattern of DEPENDENCY_CAPTURE_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(contentWithoutComments)) !== null) {
      const [, specifier] = match;
      if (typeof specifier === "string" && specifier.length > 0) {
        modules.add(specifier);
      }
    }
  }

  return modules;
}

function buildIgnoreSet(maybeIgnore: DependencyIgnoreInput): Set<string> {
  const ignore = new Set<string>(DEFAULT_IGNORED_DEPENDENCIES);
  if (!maybeIgnore) {
    return ignore;
  }

  const values: string[] = [];
  if (Array.isArray(maybeIgnore)) {
    values.push(...maybeIgnore);
  }
  else if (maybeIgnore instanceof Set) {
    values.push(...maybeIgnore);
  }
  else {
    values.push(maybeIgnore);
  }

  for (const entry of values) {
    if (typeof entry === "string" && entry.length > 0) {
      ignore.add(entry.toLowerCase());
    }
  }

  return ignore;
}

function normalizePathSegments(relativePath: string): string[] {
  return relativePath
    .split(path.sep)
    .map(segment => segment.trim().toLowerCase())
    .filter(segment => segment.length > 0);
}

export function shouldAnalyzeFileForDependencyUsage(relativePath: string): boolean {
  if (typeof relativePath !== "string" || relativePath.length === 0) {
    return false;
  }

  const segments = normalizePathSegments(relativePath);
  if (segments.some(segment => IGNORED_PATH_SEGMENTS.has(segment))) {
    return false;
  }

  const extension = path.extname(relativePath).toLowerCase();
  return SOURCE_FILE_EXTENSIONS.has(extension);
}

export function detectUsedDependencies(content: string, options: DetectDependencyOptions = {}): Set<string> {
  const detected = new Set<string>();
  const ignore = buildIgnoreSet(options.ignore);

  const specifiers = extractImportedModuleSpecifiers(content);
  for (const specifier of specifiers) {
    const packageName = toPackageName(specifier);
    if (packageName) {
      const normalized = packageName.toLowerCase();
      if (!ignore.has(normalized)) {
        detected.add(packageName);
      }
    }
  }

  return detected;
}

export function extractDeclaredDependencyNames(packageSummary: PackageSummaryLike | null | undefined): Set<string> {
  const declared = new Set<string>();
  if (!packageSummary || typeof packageSummary !== "object") {
    return declared;
  }

  const sections = [
    packageSummary.dependencies,
    packageSummary.devDependencies,
    packageSummary.peerDependencies,
    packageSummary.optionalDependencies
  ];

  for (const section of sections) {
    if (section && typeof section === "object") {
      for (const name of Object.keys(section)) {
        if (typeof name === "string" && name.length > 0) {
          declared.add(name.toLowerCase());
        }
      }
    }
  }

  return declared;
}

export function findMissingDependencies({
  usedDependencies,
  declaredDependencies
}: MissingDependencyCheckInput): string[] {
  const declared = declaredDependencies ?? new Set();
  const used = usedDependencies ?? new Set();
  const missing = new Set<string>();

  for (const name of used) {
    const normalized = typeof name === "string" ? name.toLowerCase() : null;
    if (normalized && !declared.has(normalized)) {
      missing.add(name);
    }
  }

  return Array.from(missing).sort((a, b) => a.localeCompare(b));
}
