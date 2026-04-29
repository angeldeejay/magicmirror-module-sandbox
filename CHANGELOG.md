# Changelog

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
