# Changelog

## v1.2.0

- **Browser test suite optimizations** — net result vs baseline: integration suite **-41% wall-clock**, **-51% test time**; `core-fidelity` file **-63%** per-file:
    - Switched `page.goto()` `waitUntil` from `"networkidle"` to `"domcontentloaded"` — eliminates the idle-network wait that was the single largest per-navigation cost (-62% per `gotoSandbox()` call, -19% integration wall-clock).
    - Added **server pool** — each Vitest worker acquires a warm server on first use and holds it across all test sessions in that worker, skipping cold-start for every test after the first per file (-25% wall-clock, -24% ui wall-clock).
    - Added **`resetSandbox()` browser command** — fires `POST /__harness/restart` which triggers Socket.IO `harness:reload` → shell calls `core.reloadStage()` → stage iframe reloads without a full page navigation. Per-call cost drops from ~280 ms (`gotoSandbox`) to ~99 ms (-65%). Applied to the eight repeat-reset tests in `core-fidelity`.
    - Added **frame handle `WeakMap` cache** in `create-browser-commands.ts` — avoids repeated `page.frame()` lookups within a single test.
    - Switched `cleanupAllSandboxSessionRuntimes` to **parallel teardown** via `Promise.all` for concurrent session cleanup.
    - Excluded `.runtime-cache/` from the module file watcher — fixture stylesheet and state writes no longer trigger spurious `harness:reload` events during tests.
    - Fixed `publishStageReady` race in `stage-bridge.ts` — `request-stage-snapshot` handler now passes `Boolean(core.lifecycleState?.domCreated)` instead of a bare truthy check, eliminating a class of intermittent flaky failures.
- **Child process management hardening** — prevents orphan Node.js server processes from accumulating across test runs and on Ctrl+C:
    - Replaced internal `(stream as any)._handle?.unref?.()` / `._handle?.ref?.()` with the public `stream.unref()` / `stream.ref()` API on `child.stdout` and `child.stderr` (`net.Socket` instances). The internal `_handle` path was bypassing the public interface; the public path is stable, non-internal, and documented.
    - Added `stdout.destroy()` and `stderr.destroy()` after `terminateChildProcess` in the final pool teardown path — flushes the libuv `uv_pipe_t` handles so they release their event-loop ref immediately instead of waiting for the GC.
    - Registered `killAllPooledServers()` on `process.exit`, `SIGINT`, and `SIGTERM` with a `__poolCleanupRegistered` guard to prevent double-registration when both `integration` and `ui` projects import the module in the same Vitest worker process. Previously Ctrl+C mid-run left pooled servers alive in the background.
- **CI `act` compatibility** — local pipeline runs via `act` no longer fail on the coverage-publish step:
    - Added `!env.ACT` to the `Publish coverage artifacts branch` step condition. The `JamesIves/github-pages-deploy-action` requires `rsync` and GitHub deploy tooling that are absent from local `act` Docker images; the guard skips the step cleanly when running under `act`.
    - Updated `ci:act` script to pass `--rm` — containers are removed automatically after each run without requiring a separate Docker cleanup command.
- Upgraded `ignore` from `^5.3.2` to `^7.0.5`. Used in `server/watch.ts` for `.gitignore` pattern matching; API surface (`ignore()`, `.add()`, `.ignores()`) is unchanged across major versions.
- Excluded `client/styles/` from `npm run format` — all files in that directory are generated at build time and must not be reformatted.
- **Additional MagicMirror fidelity fixes** identified by a second-pass divergence audit:
    - **`module.data.path` now matches MM format** — `path` is now `modules/${name}/` (relative, trailing slash) matching `main.js`. Previously the sandbox used an absolute path with no trailing slash (`/modules/${name}`), causing `this.data.path + filename` concatenation to produce malformed URLs. `module.file()` is now implemented as `(this.data.path + filename).replace(/\/\//g, "/")`, a verbatim port of `module.js`.
    - **`lockStrings` protocol fully implemented** — `hide(speed, cb, {lockString})` now pushes the lock string onto `this.lockStrings`; `show(speed, cb, {lockString})` removes it and skips the show call when locks remain, matching `module.js`. Previously `this.lockStrings` was initialized but never read or written, so modules that hide via multiple independent actors (presence sensors, schedules, voice commands) would show prematurely on any `show()` call.
    - **`loadTemplates()` respects module overrides and pre-warms Nunjucks** — the base implementation now carries a `typeof instance.loadTemplates === "function"` guard (like `getTemplate` and `getTemplateData`) so a module that defines its own `loadTemplates()` is no longer silently overwritten. The default base implementation now pre-warms the Nunjucks template cache by rendering the file template with an empty data set before `start()` is called, matching `module.js` boot-phase behavior.
    - **`MM.getModules()` filter methods emit diagnostics on empty results** — `withClass()`, `exceptWithClass()`, and `exceptModule()` now log a `Log.warn` when they return an empty collection, explaining that the sandbox is a single-module environment and that the module's intent is recorded but cannot be simulated. Previously these methods silently returned empty arrays, making it opaque that the sandbox does not support sibling-module coordination.
- **D8 test suite no longer produces console noise** — the VM context for the `installGlobals creates Log` test block now receives a silent no-op console so `Log.*` method invocations during the test do not write to stdout/stderr.
- **Browser runtime now matches MagicMirror core behavior exactly** across all divergences identified by a full contract audit (`client/runtime/module.ts`, `lifecycle.ts`, `notifications.ts`):
    - **`getDom()` always returns `Promise<HTMLElement>`** — the base implementation is now a verbatim port of `module.js:82-107`. Previously the sandbox returned a synchronous `HTMLElement` (or a deferred wrapper) when `getDom` was called via `this._super()`, masking bugs that surfaced only in real MagicMirror.
    - **`hide()` and `show()` suspend/resume timing** — `suspend()` and `resume()` now fire inside the animation callback after the transition completes, matching `module.js:367-413`. Previously they fired before the animation began.
    - **`module.hidden` asymmetry** — `MM.hideModule` sets `module.hidden = true` immediately before the animation (matching `main.js:721`); `MM.showModule` sets `module.hidden = false` only after the animation completes (matching `main.js:729-731`).
    - **Header rendered as `innerHTML`** — `getHeader()` return values are now inserted via `innerHTML`, not `textContent`, matching `main.js:253`. Modules that return HTML markup in `getHeader()` now render correctly.
    - **`getHeader()` default** simplified to `return this.data.header` — matches `module.js:115-116`. The previous sandbox-specific false/empty-string handling diverged from core.
    - **`Log` object now complete** — `Log.debug`, `Log.group`, `Log.groupCollapsed`, `Log.groupEnd`, `Log.time`, `Log.timeEnd`, `Log.timeStamp`, and `Log.setLogLevel` are now exposed, matching `logger.js`. Previously calling any of these threw `TypeError: Log.X is not a function`.
    - **`MM.getModules()` filter methods** — the returned array now carries `.withClass()`, `.exceptWithClass()`, `.exceptModule()`, and `.enumerate()` as non-enumerable properties, matching `main.js:501-585`. Previously the sandbox returned a plain array without these helpers.
    - **`notificationReceived()` receives the original payload** — the sandbox previously passed a JSON clone of the payload. The original object reference is now forwarded, matching `main.js:98-101`. The clone is still used for the debug log entry only.
    - **Template preloading layer removed** — `loadTemplates()` now resolves immediately. The deferred-wrapper and sync-preload machinery (`createDeferredGetDomWrapper`, `preloadTemplateDependencyTree`, `seedTemplateLoaderCache`, `renderPreloadedTemplate`, `attachDeferredDomReady`, `hasPreloadedTemplate`, `readTemplateSource`, `extractTemplateDependencies`, `resolveTemplateDependencyPath`, `isGetDomSuperCall`) has been deleted. The nunjucks `WebLoader` handles async template fetching as it does in core.

## v1.1.1

- Added **`@fastify/rate-limit`** as a global plugin and applied per-route `config.rateLimit` on the five static vendor asset routes (`/moment.js`, `/animate.css`, `/croner.js`, `/moment-timezone.js`, `/font-awesome.css`) to satisfy CodeQL `js/missing-rate-limiting` (CWE-307/400/770) alerts.
- Switched the **harness UI font** from `"Roboto"` (inherited from MagicMirror) to **Open Sans** via `@fontsource/open-sans`. Latin and latin-ext subsets (weights 300/400/600/700, normal style) are now copied to `client/webfonts/` at build time and served at `/webfonts/`. This makes the operator shell visually independent from the module under test. The `@fontsource` SCSS mixin (deprecated, generated build warnings) was replaced with a hand-authored `_open-sans.scss` partial containing direct `@font-face` declarations — zero warnings at build time.
- Removed **generated build artifacts** (`client/webfonts/`, `client/styles/font-awesome.css`, `client/styles/magicmirror-fonts.css`, `client/styles/magicmirror-stage.css`) from git tracking. These files are now gitignored and regenerated on every build, reducing repository binary bloat.
- Trimmed the **npm package** `files` list: only `bin/install-guard.js` is now shipped from `bin/`; the four TypeScript source files (`magicmirror-module-sandbox.ts`, `preview.ts`, `sync-magicmirror-assets.ts`, `helpers/css-bundler.ts`) that were previously included unnecessarily are excluded.
- Added **Dependabot configuration** (`.github/dependabot.yml`) with weekly npm and GitHub Actions update checks, grouped by ecosystem (fastify, testing, typescript, vite, magicmirror).
- Added **`npm audit --omit=dev --audit-level=high`** step to both `ci.yml` and `publish.yml` so high/critical vulnerabilities in production dependencies block CI and releases. Dev-only dependency chains are excluded to avoid false positives.
- Added **`SECURITY.md`** with a vulnerability reporting policy via GitHub Security Advisories.
- Added **`.github/CODEOWNERS`** to auto-assign `@angeldeejay` as reviewer on all pull requests including Dependabot updates.

## v1.1.0

- Added **Quality sidebar domain** with real-time module analysis against MagicMirror 3rd-party criteria. Findings are grouped by severity (errors, warnings, recommendations) with per-severity filter checkboxes and an on-demand **Analyze module** button. Results update automatically in watch mode. Backed by a new `VendorModuleAnalyzer` in `server/module-analysis.ts`, an always-on analysis watcher in `server/analysis-watcher.ts`, and the `quality-panel.ts` browser runtime.
- Introduced **upstream vendor sync** for the module analyzer. Four files (`module-analyzer.ts`, `dependency-usage.ts`, `missing-dependency-rule.ts`, `rule-registry.ts`) are now auto-synced from `MagicMirrorOrg/MagicMirror-3rd-Party-Modules` at build time via `sync:module-analyzer`, gitignored from this repo, and regenerated on every `npm run build`.
- Applied **no-patch shim fidelity**: `logger.js` and `node_helper.js` from MagicMirror core are now copied verbatim during sync; sandbox behavior is injected only through appended postludes. The previous source-patch templates (`core-logger-replacements.json`, `core-node-helper-replacements.json`) and the `SourceReplacement` machinery have been removed.
- Bundled **Express and undici directly from MagicMirror's own `node_modules`** via esbuild into `shims/generated/node_modules/express/` and `shims/generated/node_modules/undici/`. `node_helper.js` can now `require('express')` and `server_functions.js` can `require('undici')` via standard Node module resolution without any source patches and without adding them as sandbox dependencies. Removed `serve-static` and `undici` from `package.json` dependencies.
- Split the file watcher into **two independent watchers**: a module watcher (always-on, stage-scoped reloads, restarts helper on non-style/non-translation changes, respects the mounted module's `.gitignore`) and a sandbox watcher (active only under `--watch`, shell-scoped reloads, triggers `rebuildClientAssets` and `rebuildNodeCompat` for source changes, calls `restartHelper` only on config changes).
- Added **build pipeline contract tests** (`tests/unit/shims/build-pipeline-contracts.test.ts`) that verify each expected shim artifact exists after the build, validate the Express and undici bundles by shape (`use`/`get` methods, `express.static`, `fetch`/`request` exports), and confirm both bundles resolve correctly from the `magicmirror-core` context via the standard Node module walk.
- Added **shell hydration parity tests** (`tests/unit/server/shell-hydration-parity.test.ts`) and extended route and watcher unit coverage across `routes.test.ts` and `watch.test.ts`.
- Added seven new **UI domain navigation journeys** to the journey coverage catalog covering the Quality domain and domain navigation ordering.
- Replaced `peaceiris/actions-gh-pages` with `JamesIves/github-pages-deploy-action@v4` in CI to resolve the Node 20 deprecation warning under `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24`.
- Introduced a **CSS custom property token system** (`--hns-*` namespace, ~60 tokens) as the single source of truth for all sandbox shell colors. All hardcoded hex values in `_shell.scss`, `_shared.scss`, `_runtime.scss`, `_debug.scss`, `_notifications.scss`, and `_quality.scss` are replaced with `var(--hns-*)` references. Existing `--sandbox-*` control variables are preserved and re-derived from `--hns-*` tokens so no downstream consumer API changes.
- Shipped **four built-in themes** (Carbon Slate, Obsidian Amber, Violet Circuit, Phosphor Green) via a new `_themes.scss` partial. Themes are activated by `[data-theme]` on `<html>` — no JavaScript required for CSS updates. Carbon Slate is the default, applied server-side to prevent FOUC.
- Added a **theme switcher** to the topbar: a brush icon button opens a Bootstrap-style dropdown listing all four themes with color-swatch previews, theme names, and a check mark on the active selection. The chosen theme persists across sessions via `localStorage`. Dropdown closes on any outside click.
- Added a **loading/restart backdrop** overlay (`harness-backdrop`) shown during stage loads and sandbox restarts. `core.showBackdrop(label)` / `core.hideBackdrop()` are exposed on the shell microcore so other runtime scripts can trigger it.
- Applied `Cache-Control: no-store` on all `/__harness/` static assets so watch-mode reloads always serve fresh builds without requiring a hard browser refresh.
- Forced `runClientAssetsBuild()` at sandbox startup in watch mode so the operator shell is always up to date when the server comes online.
- Updated **documentation**: added `docs/quality.md` for the new Quality domain, corrected `ARCHITECTURE.md` (removed stale patch references, documented two-watcher split, added CSS token system and backdrop sections), updated `docs/README.md` to list six sidebar domains, and retook all screenshots at 1366×1024.

## v1.0.1

- Added MagicMirror-style browser-side Nunjucks template support through `getTemplate()`, `getTemplateData()`, and `nunjucksEnvironment()`.
- Synced the Nunjucks, Moment, Moment Timezone, and Croner browser vendor assets from the local `magicmirror` dependency into the sandbox client build so published installs keep working without requiring `magicmirror` at runtime.
- Added `_super()` binding compatibility in the browser runtime so overridden module methods stay closer to MagicMirror behavior.
- Replaced the old synchronous template-cache workaround with a runtime adapter for `getDom()` + `this._super()` so overriding modules receive an immediate wrapper while deferred template content still resolves before the sandbox commits the render.
- Removed the duplicate early stage-module script injection path so mounted modules no longer fail with `Module is not defined` before the sandbox runtime boots.
- Overrode MagicMirror's hidden-cursor default inside the sandbox shell styles so the operator UI remains usable in normal browsers.
- Aligned the server-rendered Config sidebar markup with the hydrated Preact shell so button ids, layout, and hydration stay consistent.
- Fixed mounted-module `sandbox.startup` scripts on Windows so consumer npm scripts launch reliably without blocking sandbox startup when child process creation fails.
- Added shell SSR parity unit coverage across the hydrated Eta/Preact topbar, sidebar domains, and footer, plus fallback branch coverage that keeps the unit coverage threshold green.
- Updated the fixture module to exercise `.njk` template rendering plus the integrated `getDom()` + `_super()` adapter path and keep integration coverage aligned with real third-party module patterns.

## v1.0.0

- Initial public release of the single-module MagicMirror sandbox package.
- Fastify host, Vite + Preact operator shell, and real `node_helper.js` wiring.
- Sandbox helper compatibility now syncs MagicMirror core `js/class.js`, `js/logger.js`, `js/node_helper.js`, `js/http_fetcher.js`, and `js/server_functions.js` into a compat root so bare and path-based helper requires stay closer to current core behavior inside the sandbox.
- Backend-owned mounted-module config persistence with sandbox-managed editing tools.
- Sidebar domains for runtime controls, config editing, notifications, debug logs, and about metadata.
- Eta-based host templates and iframe-backed stage isolation so shell reloads stay separate from mounted-module reloads.
- TypeScript-maintained client/runtime sources with published compiled `dist/` artifacts for package consumers.
- MagicMirror asset synchronization, local preview flows, install guards, and packaged-install smoke coverage.
- Vitest-based unit, integration, UI, and e2e coverage, including headed maintainer inspection workflows.
- GitHub Actions CI now publishes a unified job summary for v8 + journey coverage, plus README badges from the coverage branch, and browser-backed journey coverage emits suite-specific badges for `ui` and `integration`.
- Refreshed docs, screenshots, CI on Node 24, and GitHub Actions publish automation for npm with trusted publishing/provenance plus mirrored GitHub Packages releases.
