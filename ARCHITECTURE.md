# Architecture

Internal design notes for `magicmirror-module-sandbox`.

This document complements `README.md`: the README explains what the sandbox is
and how to use it, while this file explains how it is put together.

## Architecture summary

### Server side

- **Fastify** serves the host page, module files, runtime assets, and config APIs
- **The stage** (`server/stage/`) serves the active MagicMirror core under
  `/__stage/`: `core-root.ts` resolves the core root (an mmvm version, the
  synced `mmcore-source/`, or the packaged `dist/core/` of a distribution
  install) and maps request paths into it; `stage-routes.ts` serves the core's
  own `index.html` and static files verbatim, generates `config/basepath.js`,
  `js/positions.js` and the `/config/` JSON in memory, answers `env`,
  `startup`, `version` and `cors` with the version's own
  `js/server_functions.js`, and mounts the module at `modules/<ModuleName>/`;
  `core-handlers.ts` holds those per-version ports and `core-variants.ts` the
  reviewed drift guard (`scripts/upstream-snapshots/core/`)
- **Socket.IO** runs two servers on the same HTTP server: the shell's own on
  `/socket.io`, and the stage's on `/__stage/socket.io` (`stage-socket.ts`),
  where the core connects its root namespace (`RELOAD`) and the module
  namespace the real `node_helper` uses. Module traffic on the stage server is
  mirrored to the shell's WebSocket panel from the server side
- **config-payloads.ts** validates mutable API payloads with Zod before writes
  hit the backend
- **helper-runtime.ts** reloads `node_helper.js` on watch restarts, instantiates
  core-style helper constructors, and injects sandbox helper compat resolution
- **mm-version-manager.ts** implements the nvm-style MagicMirror version store
  under `~/.mmvm/`; exposes install, activate, delete, re-download, and
  capability-introspection operations consumed by the mm-versions API routes
- **startup-scripts.ts** owns optional consumer startup command lifecycles
- **watch.ts** exposes two independent watchers: a module watcher (always-on,
  stage scope) and a sandbox watcher (--watch mode only, shell scope), both
  emitting `harness:reload`; a stage reload also sends the core its own
  root-namespace `RELOAD` (see "Watch mode details")
- **Eta templates** under `server/templates/` render the sandbox host HTML,
  including `sidebar-mmversion.eta` for the MM Version sidebar partial

### Browser side

- `client/app/` holds the Vite + Preact shell for the persistent host UI
- `client/app/harness-state.ts` is the typed shell bootstrap boundary and parses
  `window.__HARNESS__` with Zod
- `client/app/components/` owns the topbar (including domain navigation dropdown
  and `MmVersionBadge` for the active core version), sidebar (with toggle
  behavior), sidebar domains including `MmVersionDomain`, footer, and shell
  iconography
- The stage iframe runs the active MagicMirror core itself (`/__stage/`); the
  sandbox only observes and controls it from outside. There is no browser
  re-implementation of `module.js`, `main.js`, `loader.js` or `translator.js`
- `client/stage-observer/` is the one script injected into the core page,
  bundled as a classic script (`client/generated/stage-observer.js`) that works
  for the classic (2.35-2.36), hybrid (2.37) and ESM (2.38+) cores: it sets the
  `data-sandbox-*` attributes the isolation stylesheet keys on, wraps the
  browser `console` before `js/logger.js` binds it, hooks the created module
  instance (`notificationReceived`, `socketNotificationReceived`, `hide`,
  `show`, `suspend`, `resume`), re-fetches the module's own stylesheets for
  "Refresh styles", and exposes the `window.__MICROCORE__` facade the stage
  bridge reads
- `client/runtime/*.ts` is the shell tooling: `shared.ts` holds the shell's
  mirrored logs and lifecycle state, `shell-stage.ts` the shell side of the
  stage bridge (reload, backdrop, mirrored logs, version badge input),
  `stage-bridge.ts` the stage side (bundled into the observer),
  `debug-panel*.ts` and `quality-panel.ts` the sidebar panels
- `client/scss/stage-isolation.scss` hides every region except the module's
  and its ancestors, and draws the "module disabled" notice; it changes no
  geometry
- `client/generated/` is the browser-served output built from the shell bundle,
  the runtime/vendor TypeScript sources, the stage observer and the isolation
  stylesheet
- `client/scss/` holds the sandbox stylesheet sources and compiles to
  `client/styles/harness.css`
- `client/vendor/` holds hand-authored TypeScript browser components that ship
  as compiled assets but are not part of the Vite + Preact shell bundle:
  `module-config-editor.ts` is the custom element implementing the config editor;
  `ace-theme-harness.ts` is the Ace Editor theme definition;
  `jsonc-parser-bundle.ts` bundles the `jsonc-parser` library as
  `window.jsoncParser` for use in the config editor's comment-aware parsing

### Shims

- `shims/logger.ts` and `shims/node_helper.ts` are thin bare-module wrappers that
  resolve the synced core compatibility artifacts
- `shims/generated/magicmirror-core/` mirrors the current MagicMirror helper-side
  `js/logger.js`, `js/node_helper.js`, `js/http_fetcher.js`, and
  `js/server_functions.js` files (plus `js/class.js` for cores before 2.37.0)
  without source patches; `logger.js` and `node_helper.js` receive sandbox
  postludes appended after sync; a package-scoped imports map keeps helper-side
  path-based requires aligned with current core
- the `node_helper` postlude only clears the previous helper instance's
  `connection` listener before delegating to the core `setSocketIO`, so socket
  semantics (including the per-module secret allowlist that 2.38.0 reads from
  `global.configRedacted`, which the helper runtime seeds from the mounted
  module config) always come from the active core version
- `shims/generated/node_modules/{express,undici,ipaddr.js}/` bundle the
  dependencies from MagicMirror's own `node_modules` so the copied core files
  resolve them via standard Node module resolution, without source patches and
  without adding them as sandbox dependencies; mmvm shims under
  `~/.mmvm/shims/<version>/` rely on this because they have no parent
  `node_modules`

### TypeScript configuration

The TypeScript surface is split into four targeted roots:

| Config file                     | Covers                                                           |
| ------------------------------- | ---------------------------------------------------------------- |
| `tsconfig.json`                 | Server, shims, bin, and shared sources                           |
| `tsconfig.node.json`            | Scripts and build helpers                                        |
| `tsconfig.config.json`          | Config-layer sources (`config/`)                                 |
| `client/tsconfig.json`          | Vite + Preact shell (`client/app/`)                              |
| `client/tsconfig.runtime.json`  | Shell tooling, vendor and stage observer sources (`client/runtime/`, `client/vendor/`, `client/stage-observer/`) |
| `tests/tsconfig.testfiles.json` | Test-file sources for type checking                              |

`tsconfig.client-runtime.json` at the repo root was removed; the two client-scoped configs under `client/` replace it.

## Sidebar toggle and domain navigation

The sidebar is collapsible. Clicking the active `.harness-sidebar-tab` closes the sidebar panel; clicking any tab while the sidebar is closed opens it. The toggle mechanism lives in `client/app/components/Sidebar.tsx` and requires no extra state beyond the active-tab tracking already present.

The topbar exposes a **domain navigation dropdown** for switching sidebar domains. The dropdown opens on click, closes on outside click or selection, and reflects the active domain label. The dropdown is implemented in `client/app/components/Topbar.tsx`.

## Config editor architecture

The module config editor (`client/vendor/module-config-editor.ts`) is a
`HTMLElement` custom element (`<module-config-editor>`) rendered inside the
Config → Module sidebar pane.

### Three-editor layout

The editor splits the full MagicMirror config block into three stacked Ace
Editor instances inside a CSS flex column:

| Pane     | Role                                             | Ace mode                      |
| -------- | ------------------------------------------------ | ----------------------------- |
| Prefix   | Read-only envelope: `let config = { … config: {` | `readOnly: true`, auto-height |
| Editable | Inner config properties, scrollable              | `readOnly: false`, `flex: 1`  |
| Suffix   | Read-only closing: `    },\n  }]\n};`            | `readOnly: true`, auto-height |

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
3. emits `harness:reload` with scope `"stage"` so only the iframe refreshes.
   The reload itself is the core's own: the stage socket server sends
   `RELOAD` on the root namespace, which `main.js` answers by reloading the
   page, exactly as on a mirror. When no core page listens (the core never
   reached `modulesStarted`), the shell reloads the frame instead; when the
   core took the reload but the stage document does not even start unloading
   within 5 s, the shell reloads the frame as a fallback. The fallback is
   cancelled on the old document's `pagehide`, not on the new one's `load`, so
   a slow core page never boots twice, and a core-driven `harness:reload` that
   reaches the shell after the stage already reloaded (the two sockets are not
   ordered) is ignored. Saves, restarts and version switches use the same
   path, so each reloads the stage exactly once

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

| Theme            | Key accent               |
| ---------------- | ------------------------ |
| `carbon-slate`   | `#4ecdc4` teal/cyan      |
| `obsidian-amber` | `#d4a843` golden amber   |
| `violet-circuit` | `#a78bfa` lavender       |
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

The stage page (`/__stage/`) is served with `Cache-Control: no-store`, and the
core and module files under it are revalidated (ETag) on every load, so saves
and watch reloads never run stale module scripts or styles. The shell's own
runtime asset URLs carry a cache-busting version token.

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
`npm run client:styles` for a one-off stylesheet rebuild, `npm run build:10-client`
for the full maintained browser output, `npm run client:runtime` for the
runtime/vendor slice only, `npm run build:20-node-compat` for generated CommonJS
shim wrappers, or `npm run client:styles:watch` while iterating on SCSS.

That publish build also minifies the distributed browser JavaScript under
`dist/client/`, while maintainer source files remain readable in the repo.

Distribution installs have no `mmcore-source/`, so `build:30-dist` packages
the built-in core's browser files as `dist/core/` (`scripts/package-core.ts`):
`index.html`, `package.json`, `favicon.svg`, `js/`, `css/`, `translations/`,
`defaultmodules/utils.js` and `defaultmodules/defaultmodules.js`, plus every
`node_modules/...` file the core page can request (the closure of `index.html`,
`js/vendor.js` and stylesheet references) with each package's
`package.json` and license, in the hoisted layout `resolveCoreStaticPath`
resolves. The server-side bundles of `undici` and `ipaddr.js`, which the
core's `js/server_functions.js` requires, ship next to it. `dist/core/` is
copied verbatim (no minification). `resolveBuiltInCoreRoot` uses it when
`mmcore-source/` is absent (`server/stage/built-in-core.ts` holds the shared
candidate list, so the version badge reads the same core). Known limitation:
only the vendor files the core references ship, so a module that links an
unreferenced file inside those packages directly (for example a Font Awesome
SVG) gets a 404 in a distribution install, while the source repository and
mmvm versions serve whole packages. Everywhere, `/__stage/node_modules/`
serves only the entries core `js/server.js` serves: the `js/vendor.js`
packages (read as text) plus `animate.css`, `@fontsource`, `@fortawesome` and
`suncalc`, never any other package Node can resolve from the core root.

A core replaced on disk under the same mmvm key (Redownload, or Delete cache
and install again) is forgotten in-process by `deleteVersionCache`
(`server/stage/core-cache.ts`): the `require.cache` entries under its install
directory (`js/defaults.js`, `js/server_functions.js`, its `express`) and the
stage's express sub-app for that root. The next stage request loads the new
code, so the backend keeps matching the browser files without a restart.

Inside this repository, `npm start` and `npm run dev:watch` still run against the
source tree for maintainer workflows. The CLI falls back to `dist/` only when
the package is installed without source files.

## Browser runtime contract

The stage runtime **is** the active MagicMirror core: its own `index.html`,
`js/`, `css/`, `translations/`, `defaultmodules/` support files and vendor
packages, served verbatim from the core root (`server/stage/`). Switching the
MagicMirror version in the MM Version domain switches the viewport too, so the
frontend and the backend (`node_helper`, shims) always run the same version.

Core files are never modified on disk or in transit. `index.html` receives
only the substitutions core `getHtml` applies (`#VERSION#`, `#TESTMODE#`) and
one sandbox injection point before the first core `<script>`: the isolation
stylesheet, the inline stage state and the observer. `config/basepath.js`,
`js/positions.js` and `/config/` are generated in memory with the version's
own logic, and the `config` global is the real MagicMirror config built from
the mounted module's saved config (core defaults, the sandbox language and
locale, `basePath: "/__stage/"`, and `modules: [<module envelope>]`), with
secrets redacted as that version redacts them.

The observer follows four rules:

- **Transparent wrappers.** Each wrapper calls through first and records
  after, with the same arguments, `this`, return value and exceptions;
  synchronous stays synchronous. Console arguments that are objects are
  serialized for the Console panel in a later task, so their `toJSON`,
  getters and Proxy traps never run inside the module's `console.*`/`Log.*`
  call. One documented residual: a notification payload is copied with
  `JSON.stringify` during the delivery, so the log shows it as delivered even
  when the module mutates it; that copy runs the payload's own `toJSON` and
  getters at that point.
- **Instance-only hooks.** Hooks attach to the created module instance, never
  to `Module.prototype`, definitions or `MM`: 2.37+ assign module methods as
  instance properties, and wrapping a definition breaks `_super` in 2.35-2.36.
  A hook point a version lacks is named in the panel, never faked.
- **Emit with sender undefined.** The Notifications panel delivers with
  `instance.notificationReceived(notification, payload, undefined)`, exactly as
  the core delivers its own system notifications.
- **`RELOAD` is the reload mechanism.** Saves, restarts and version switches
  reload the stage through the core's root-namespace `RELOAD`; the shell only
  reloads the frame when no core page listens, or when the stage document
  has not started unloading after a 5 s fallback.

The non-negotiable invariant: if a behavior causes a module to fail in real
MagicMirror, it must fail identically in the sandbox. The sandbox must never
mask a real bug by being more permissive than the core. Fidelity is checked
per version: cross-version transparency tests and version-pinned tests (see
`AGENTS.md`).

## Asset sync

MagicMirror CSS and font assets for the shell are synchronized through
`bin/sync-magicmirror-assets.ts`. The stage serves the core's own CSS and
fonts instead.

- CSS is parsed with `css-tree`, not pattern-matched
- nested `@import` rules are inlined before final output is written
- copied asset cleanup is driven by a manifest under `client/fonts/` instead of
  filename heuristics
- published installs consume the generated assets; maintainers refresh them from
  `mmcore-source/`, which `build:00-sync-mmcore-source` fills with the pinned
  MagicMirror release

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
