# Changelog

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
