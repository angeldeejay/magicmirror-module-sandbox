# AGENTS.md

This file is the canonical instruction set for agent-driven work in `magicmirror-module-sandbox`.
Keep this file, `README.md`, `docs/`, `.github/CONTRIBUTING.md`, `CHANGELOG.md`, and `package.json` aligned.

## Commands

Run commands from the repository root.

```bash
npm install
npm run build
npm run build:client-assets
npm run build:client-shell
npm run build:client-runtime
npm run build:node-compat
npm run sync:mm-assets
npm start
npm run start:preview
npm run watch
npm run watch:preview
npm run typecheck
npm test
npm run test:unit
npm run test:unit:coverage
npm run test:integration
npm run test:integration:headed
npm run test:e2e
npm run test:ui
npm run test:ui:headed
npm run test:browser:headed
npm run styles
npm run lint
npm run format
```

## Product scope

- Single-module MagicMirror sandbox, not a generic MagicMirror replacement
- Real frontend module + real `node_helper.js`
- Backend-owned config reads/writes
- Sandbox-owned persisted config lives in temp files keyed to mounted-module identity, not inside the mounted module tree

## Architecture

- `server/`: Fastify HTTP host, routes, watch loop, helper lifecycle, startup scripts, and HTML shell
- `client/`: Preact shell app, TypeScript browser runtime, styles, generated assets, vendor editors, and fonts
- `config/`: contract and harness bootstrap config
- `docs/`: sandbox operator manuals split by sidebar domain
- `shims/`: `logger` and `node_helper` compatibility shims plus a synced MagicMirror helper-compat root under `shims/generated/magicmirror-core/`
- `tests/`: unit contracts, Vitest browser-backed UI/integration coverage, packaged-install smoke coverage, and controlled fixture-module integration coverage
- `bin/`: CLI entrypoint

## Rules

- Prefer small focused modules over growing long files further.
- Do not let the frontend own disk writes; config persistence stays in the backend.
- Keep paths, docs, and package metadata aligned with the repository root package layout.
- Preserve LF line endings and tab indentation unless a file already requires otherwise.
- Validate JS/TS changes with `npm run lint`, `npm run typecheck`, and the relevant test commands.
- Keep npm publishing on the GitHub Actions trusted-publishing path defined by `.github/workflows/publish.yml` unless the npm package settings are updated in lockstep.
- Keep automated regression coverage sandbox-owned: Vitest unit tests with a minimum 80% instrumented coverage threshold, Vitest packaged-install e2e coverage under `tests/e2e/`, and Vitest browser-backed coverage under `tests/integration/` and `tests/ui/`.
- Keep browser-backed sandbox coverage on the shared Vitest + Playwright-provider stack, with reusable cross-suite helpers in `tests/_helpers/` and per-suite specs under `tests/integration/` and `tests/ui/`.
- Keep maintainer browser inspection on the same Vitest + Playwright-provider stack: headed inspection runs should stay opt-in, single-worker, and close automatically when the suite ends.
- Keep only suite-wide helpers in `tests/_helpers/`; suite-local helpers belong in `tests/<suite>/helpers.js`.
- Keep user-facing env overrides narrow: allow explicit mounted-module root selection via `MM_SANDBOX_MOUNTED_MODULE_ROOT`, but derive module identity and runtime semantics from the mounted module plus persisted config instead of behavior-changing env vars.
- Keep compiled UI assets flowing through the package build/publish phase, and publish only the distributable sandbox runtime rather than development sources.
- Keep MagicMirror iframe CSS/assets synced from the local `magicmirror` devDependency during source-repo maintenance, but do not require that dependency in distribution installs.
- Keep the shell UI on the Vite + Preact boundary and validate new shared browser/server contracts with Zod when a typed boundary is introduced.
- Preserve the explicit split between user autodiscovery and maintainer `--preview`; if neither resolves a real mounted module, fail clearly instead of inventing a fallback identity.

## Pending direction

- The config editor now supports draft-state feedback plus local revert/format actions, but it is not fully finished yet.
- Future refinement should keep moving config editing closer to a real MagicMirror config authoring feel.
