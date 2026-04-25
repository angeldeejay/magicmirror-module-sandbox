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
- **watch.ts** watches sandbox and mounted-module files and emits
  `harness:reload`
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
- `client/runtime/module.ts` installs the narrow MagicMirror-like globals and
  boots the module
- `client/runtime.ts` is just the final bootstrap glue
- `client/scss/` holds the sandbox stylesheet sources and compiles to
  `client/styles/harness.css`

### Shims

- `shims/logger.ts` and `shims/node_helper.ts` are thin bare-module wrappers that
  resolve the synced core compatibility artifacts
- `shims/generated/magicmirror-core/` mirrors the current MagicMirror helper-side
  `js/class.js`, `js/logger.js`, `js/node_helper.js`, `js/http_fetcher.js`, and
  `js/server_functions.js` files, with sandbox adaptation patches applied during
  sync plus a package-scoped imports map so helper-side path-based requires
  behave like current core

## Watch mode details

Watch mode is pragmatic, not fancy HMR.

Behavior:

1. detect file changes
2. restart backend pieces when needed
3. emit a reload event with a fresh stage/shell version token
4. let the persistent shell refresh only the iframe when the change is
   stage-local
5. fall back to a full shell reload only when shell-owned UI files changed

Windows note:

- the watcher uses polling plus explicit config file paths because that is more
  reliable here than relying only on filesystem events

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
