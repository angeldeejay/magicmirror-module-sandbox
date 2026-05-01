# Changelog

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
