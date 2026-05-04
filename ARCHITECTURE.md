# Architecture

Internal design notes for `magicmirror-module-sandbox`.

This document complements `README.md`: the README explains what the sandbox is
and how to use it, while this file explains how it is put together.

## Architecture summary

### Server side

- **Fastify** serves the host page, module files, runtime assets, and config APIs
- **Socket.IO** bridges frontend notifications to the real module helper
- **config-payloads.ts** validates mutable API payloads with Zod before writes
  hit the backend
- **helper-runtime.ts** reloads `node_helper.js` on watch restarts, instantiates
  core-style helper constructors, and injects sandbox helper compat resolution
- **startup-scripts.ts** owns optional consumer startup command lifecycles
- **watch.ts** exposes two independent watchers: a module watcher (always-on,
  stage scope) and a sandbox watcher (--watch mode only, shell scope), both
  emitting `harness:reload`
- **Eta templates** under `server/templates/` render the sandbox host HTML

### Browser side

- `client/app/` holds the Vite + Preact shell for the persistent host UI
- `client/app/harness-state.ts` is the typed shell bootstrap boundary and parses
  `window.__HARNESS__` with Zod
- `client/app/components/` owns the topbar, sidebar domains, footer, and shell
  iconography
- `client/runtime/*.ts` is the maintained browser-runtime source surface
- `client/generated/` is the browser-served output built from the shell bundle plus
  runtime/vendor TypeScript sources
- `client/runtime/shared.ts` creates shared runtime state
- `client/runtime/notifications.ts` provides the frontend notification bus + log
- `client/runtime/lifecycle.ts` provides startup ordering plus
  show/hide/suspend/resume behavior
- `client/runtime/assets.ts` loads scripts and styles
- `client/runtime/translations.ts` handles translation loading
- `client/runtime/debug-panel.ts` wires the sidebar notification + lifecycle
  console
- `client/runtime/module.ts` installs the MagicMirror-like globals and boots the
  module; `getDom()` is a verbatim port of the core base implementation and
  always returns `Promise<HTMLElement>` — no deferred-wrapper or preload layer
- `client/runtime.ts` is just the final bootstrap glue
- `client/scss/` holds the sandbox stylesheet sources and compiles to
  `client/styles/harness.css`
- `client/vendor/` holds hand-authored TypeScript browser components that ship
  as compiled assets but are not part of the Vite + Preact shell bundle:
  `module-config-editor.ts` is the custom element implementing the config editor;
  `ace-theme-harness.ts` is the Ace Editor theme definition

### Shims

- `shims/logger.ts` and `shims/node_helper.ts` are thin bare-module wrappers that
  resolve the synced core compatibility artifacts
- `shims/generated/magicmirror-core/` mirrors the current MagicMirror helper-side
  `js/class.js`, `js/logger.js`, `js/node_helper.js`, `js/http_fetcher.js`, and
  `js/server_functions.js` files without source patches; `logger.js` and
  `node_helper.js` receive sandbox postludes appended after sync; a package-scoped
  imports map keeps helper-side path-based requires aligned with current core
- `shims/generated/node_modules/express/` and `shims/generated/node_modules/undici/`
  bundle the dependencies from MagicMirror's own `node_modules` so `node_helper.js`
  can `require("express")` and `server_functions.js` can `require("undici")` via
  standard Node module resolution, without source patches and without adding them
  as sandbox dependencies

## Config editor architecture

The module config editor (`client/vendor/module-config-editor.ts`) is a
`HTMLElement` custom element (`<module-config-editor>`) rendered inside the
Config → Module sidebar pane.

### Three-editor layout

The editor splits the full MagicMirror config block into three stacked Ace
Editor instances inside a CSS flex column:

| Pane | Role | Ace mode |
|---|---|---|
| Prefix | Read-only envelope: `let config = { … config: {` | `readOnly: true`, auto-height |
| Editable | Inner config properties, scrollable | `readOnly: false`, `flex: 1` |
| Suffix | Read-only closing: `    },\n  }]\n};` | `readOnly: true`, auto-height |

Line numbers are continuous across all three panes via Ace's `firstLineNumber`
option. The suffix pane recalculates its `firstLineNumber` on every editable
change through `_syncSuffixFirstLine()`.

### Indent depth

The editable pane always displays content at a minimum indent of depth 3 (6
spaces, `INNER_INDENT`). `_indentInner()` adds the prefix before display;
`_dedentInner()` strips it before storage or validation. The stored and
validated value is always at depth 0.

### Ace theme

`client/vendor/ace-theme-harness.ts` defines `ace/theme/harness` — a custom
Ace theme that reads all chrome and syntax base colors from the `--hns-*` CSS
custom property token set. Fixed syntax tokens (keywords, strings, booleans,
operators, functions) are overridden per `[data-theme]` attribute for each of
the four sandbox themes, so the editor adapts to theme switches without any
JavaScript intervention.

## Watch mode details

Watch mode is pragmatic, not fancy HMR. Two independent watchers handle separate
concerns:

**Module watcher** — always-on, regardless of `--watch`:

1. observes `repoRoot` only
2. restarts the helper on every change except CSS/SCSS and translation files
3. emits `harness:reload` with scope `"stage"` so only the iframe refreshes

**Sandbox watcher** — active only when `--watch` is passed:

1. observes harness-owned paths (client source, shims source, config files)
2. triggers `rebuildClientAssets` or `rebuildNodeCompat` when source changes
3. calls `restartHelper` only on sandbox config file changes
4. emits `harness:reload` with scope `"shell"` so the full shell reloads

Windows note:

- the watcher uses polling plus explicit config file paths because that is more
  reliable here than relying only on filesystem events

## CSS token system and theming

All sandbox shell colors are defined as `--hns-*` CSS custom properties on
`:root` in `client/scss/_abstracts.scss`. Roughly 60 tokens cover backgrounds,
borders, text, accents, status colors, scrollbars, and component-specific
surfaces. The existing `--sandbox-*` control variables (height, radius, border,
scrollbar) are preserved and derived from `--hns-*` tokens so no downstream SCSS
API changes were required.

Four themes override selected tokens through `[data-theme]` attribute selectors
in `client/scss/_themes.scss`:

| Theme | Key accent |
|---|---|
| `carbon-slate` | `#4ecdc4` teal/cyan |
| `obsidian-amber` | `#d4a843` golden amber |
| `violet-circuit` | `#a78bfa` lavender |
| `phosphor-green` | `#39d353` terminal green |

The server-rendered HTML sets `data-theme="carbon-slate"` on `<html>` to
establish the default without a flash. The theme switcher in the topbar shell
writes `document.documentElement.dataset.theme` and persists the choice to
`localStorage` under key `harness-theme`.

No JavaScript is needed for CSS updates — all theme logic runs through the
attribute selector chain.

## Loading backdrop

`harness-backdrop` is a full-viewport overlay shown during stage loads and
sandbox restarts. Two helpers on the shell microcore control it:

- `core.showBackdrop(label?)` — sets `data-visible="true"` and writes the label
- `core.hideBackdrop()` — sets `data-visible="false"`

The stage clears the backdrop automatically on `stage-ready`. The restart button
triggers it before posting to `/__harness/restart`.

## Static asset cache policy

All responses served under `/__harness/` carry `Cache-Control: no-store` so
watch-mode rebuilds take effect immediately without a hard browser refresh. This
applies to the compiled shell bundle, the SCSS-compiled stylesheet, and all
other harness static assets.

In addition, sandbox startup in `--watch` mode calls `runClientAssetsBuild()`
before the server opens so the operator shell always reflects the current SCSS
and runtime sources when the process comes up.

## Cache behavior

The sandbox isolates runtime cache under:

```text
.runtime-cache/
```

Runtime cache stays isolated from normal MagicMirror usage so sandbox runs do
not contaminate other environments.

Browser-facing stage and local runtime asset URLs also receive cache-busting
version tokens during save/watch reloads so module scripts, module styles, and
stage HTML do not stay stale behind browser caches.

## UI asset build

The sandbox loads compiled CSS from:

```text
client/styles/harness.css
```

Source SCSS lives under:

```text
client/scss/
```

The browser-served JavaScript runtime lives under:

```text
client/generated/
```

Those generated files are rebuilt from the maintained TypeScript sources before
source-repo start/watch/build flows and are the only browser runtime artifacts
copied into `dist/`.

Maintainers build the distributable package with `npm run build`, and
`npm pack` / `npm publish` trigger that step through `prepack`. The published
package ships the prebuilt sandbox under `dist/`, so consumers install only
runtime artifacts instead of development sources like `client/scss/`. Use
`npm run styles` for a one-off stylesheet rebuild, `npm run build:client-assets`
for the full maintained browser output, `npm run build:client-runtime` for the
runtime/vendor slice only, `npm run build:node-compat` for generated CommonJS
shim wrappers, or `npm run styles:watch` while iterating on SCSS.

That publish build also minifies the distributed browser JavaScript under
`dist/client/`, while maintainer source files remain readable in the repo.

Inside this repository, `npm start` and `npm run watch` still run against the
source tree for maintainer workflows. The CLI falls back to `dist/` only when
the package is installed without source files.

## Browser runtime contract

The sandbox browser runtime (`client/runtime/`) is a faithful port of
`node_modules/magicmirror/js/module.js` and `main.js`. Every behavioral
decision is anchored to the upstream source. Known deviations from a full
MagicMirror deployment that cannot be resolved without a real MM server:

- `config` global exposes only `language`, `locale`, and `basePath`. Full MM
  config properties (`timeFormat`, `units`, `timezone`, `location`, etc.) are
  not available because the sandbox has no MM config endpoint.

All other behaviors — `getDom()` return type, `_super()` semantics, hide/show
lifecycle ordering, header rendering, notification payload routing, and the
`MM.getModules()` filter API — match the core exactly.

The non-negotiable invariant: if a behavior causes a module to fail in real
MagicMirror, it must fail identically in the sandbox. The sandbox must never
mask a real bug by being more permissive than the core.

## Asset sync

MagicMirror iframe-facing CSS and font assets are synchronized through
`bin/sync-magicmirror-assets.ts`.

- CSS is parsed with `css-tree`, not pattern-matched
- nested `@import` rules are inlined before final output is written
- copied asset cleanup is driven by a manifest under `client/fonts/` instead of
  filename heuristics
- published installs consume the generated assets; maintainers refresh them from
  the local `magicmirror` devDependency

## Mounted-module autodiscovery

When the sandbox is mounted from another module repository, it auto-detects the
real module root from the current working directory and nearby package layout.
Frontend entry autodiscovery prefers:

1. `<module-name>.js`
2. `package.json.main`
3. one root `MMM-*.js` file
4. one root `.js` file containing `Module.register(...)`

No environment variables are required for the standard consumer flow. The only
user-facing env hook is `MM_SANDBOX_MOUNTED_MODULE_ROOT` when the caller wants
to point the sandbox at one explicit module root.

## Bootstrap flow split

The sandbox keeps two startup flows explicit:

1. **user flow:** resolve a real mounted module from the caller or
   `MM_SANDBOX_MOUNTED_MODULE_ROOT`, then read `package.json.sandbox.startup` from
   that module before launching startup scripts
2. **maintainer flow:** `bin/preview.ts` provides the preview wiring and the
   source-repo `bin/magicmirror-module-sandbox.ts` entrypoint points the process
   at the internal `tests/_fixtures/MMM-TestModule` fixture through
   `MM_SANDBOX_MOUNTED_MODULE_ROOT`, while published installs expose the compiled
   `dist/bin/magicmirror-module-sandbox.js` CLI

If neither flow resolves a real module, bootstrap fails with a clear error
instead of fabricating a dummy module identity.
