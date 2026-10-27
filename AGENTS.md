# AGENTS.md

This file is the canonical instruction set for agent-driven work in `magicmirror-module-sandbox`.
Keep this file, `README.md`, `ARCHITECTURE.md`, `docs/`, `.github/CONTRIBUTING.md`, `CHANGELOG.md`, and `package.json` aligned.

## Commands

Run commands from the repository root. Install dependencies with `npm install` (or `npm ci`); the `prepare` lifecycle runs the full build and installs the husky hooks. Every other entry point is a `package.json` script and runs with `node --run <script>` (equivalent to `npm run <script>`, which the other docs and CI use).

```bash
# Build pipeline (`build` runs every step in this order)
node --run build
node --run build:00-sync-mmcore-source   # download the pinned MagicMirror core into mmcore-source/
node --run build:01-sync-mm-assets       # copy MM fonts/CSS/vendor assets into client/
node --run build:02-sync-analyzer        # vendor the Quality analyzer into server/vendor/check-modules/
node --run build:10-client               # shell (Vite), runtime/vendor bundles (esbuild), styles (sass)
node --run build:20-node-compat          # generate shims/generated/
node --run build:30-dist                 # assemble the published dist/
node --run client:shell
node --run client:runtime
node --run client:styles
node --run client:shell:watch
node --run client:styles:watch

# Run
node --run start                         # same as dev:start
node --run dev:start-preview             # maintainer --preview against the fixture module
node --run dev:watch
node --run dev:watch-preview

# Quality gates
node --run lint
node --run lint:fix
node --run typecheck                     # typecheck:client, :client-runtime, :node, :tests

# Tests
node --run test                          # unit coverage, integration, ui, e2e
node --run test-quick                    # fast loop without coverage
node --run test-quick:unit
node --run test:10-unit-coverage
node --run test:20-integration
node --run test:30-ui
node --run test:40-e2e
node --run test-headed
node --run test-headed:integration
node --run test-headed:ui
node --run test-smoke                    # packaged-install smoke (npx and devDependency flavours)
node --run test-ci                       # local GitHub Actions run through act + Docker

# Reports and docs
node --run report                        # coverage badges, journey badges, CI job summary
node --run docs:screenshots
```

Scripts prefixed with `_` (`_server`, `_server:preview`, `_server:watch`, `_server:watch-preview`) are internal; they map to the CLI flags `--preview` and `--watch`.

## Product scope

- Single-module MagicMirror sandbox, not a generic MagicMirror replacement
- Real frontend module + real `node_helper.js`
- Backend-owned config reads/writes
- Module config resolves with this precedence:
    1. `config.sandbox.json` in the mounted module root (watched even when gitignored)
    2. `package.json#sandbox.moduleConfig` of the mounted module (read-only seed; the first save promotes it to `config.sandbox.json`)
    3. Sandbox temp file `<tmp>/magicmirror-module-sandbox/module.config.<hash>.json`, keyed to mounted-module identity
- Runtime language/locale always persists in the temp file `runtime.config.<hash>.json`
- Mounted modules may declare `package.json#sandbox.startup` (npm scripts run before the helper starts), `sandbox.moduleConfig`, and `sandbox.mmVersion` (pins a MagicMirror core version, auto-activated at startup)

## Architecture

- `server/`: Fastify HTTP host, routes, watch loop, helper lifecycle, startup scripts, Eta-rendered HTML shell (`server/templates/`), config persistence with Zod payload parsing, the nvm-style MagicMirror version manager (`mm-version-manager.ts`, store under `~/.mmvm/`), Quality analysis (the vendored analyzer in `server/vendor/check-modules/` plus `official-eslint-check.ts` and `official-dependency-integrations.ts`, ports of the official worker guarded by `scripts/upstream-snapshots/`; repository-ignored paths are excluded as the one documented local deviation)
- `client/`: Preact shell app (`client/app/`), TypeScript browser runtime (`client/runtime/`), SCSS sources (`client/scss/`) compiled into `client/styles/`, generated bundles (`client/generated/`), hand-written editor and bundle components (`client/vendor/`), and fonts
- `config/`: contract, harness bootstrap config, MagicMirror language and module-option metadata, and default module/runtime JSON
- `docs/`: sandbox operator manuals, one per sidebar domain plus themes
- `shims/`: `logger` and `node_helper` compatibility shims plus the generated helper-compat root under `shims/generated/` (MagicMirror core files and `node_modules/{express,undici,ipaddr.js}`); an active `~/.mmvm/` version supplies its own shims from `~/.mmvm/shims/<version>/`
- `scripts/`: build, sync, screenshot, report, and pipeline-test scripts; `scripts/templates/` holds the logger and node_helper postludes
- `tests/`: `unit/`, `integration/`, `ui/`, `e2e/`, shared `_helpers/`, `_setup/`, and the `_fixtures/MMM-TestModule/` fixture module
- `bin/`: CLI entrypoint, `--preview` wiring, MagicMirror asset sync, and the `postinstall` install guard

Generated or cached paths, never edited by hand: `mmcore-source/`, `client/generated/`, `client/webfonts/`, the generated CSS in `client/styles/` (everything except files compiled from `client/scss/`), `shims/generated/`, `server/vendor/check-modules/`, `dist/`, `coverage/`, and `.runtime-cache/`.

## Rules

- Prefer small focused modules over growing long files further.
- Do not let the frontend own disk writes; config persistence stays in the backend.
- Keep paths, docs, and package metadata aligned with the repository root package layout.
- Preserve LF line endings and tab indentation unless a file already requires otherwise.
- Validate JS/TS changes with `node --run lint`, `node --run typecheck`, and the relevant test commands. CI runs lint, build, test, and report but not typecheck; the husky pre-commit hook runs lint-staged and typecheck.
- Keep npm publishing on the GitHub Actions trusted-publishing path defined by `.github/workflows/publish.yml` (OIDC, `npm publish --provenance`) unless the npmjs.org trusted-publisher settings are updated in lockstep. GitHub Packages publishing in the same workflow uses `GITHUB_TOKEN`.
- Keep automated regression coverage sandbox-owned: Vitest unit tests with a minimum 80% lines/functions/branches/statements threshold (enforced by `test:10-unit-coverage`), Vitest packaged-install e2e coverage under `tests/e2e/`, and Vitest browser-backed coverage under `tests/integration/` and `tests/ui/`.
- Keep browser-backed sandbox coverage on the shared Vitest + Playwright-provider stack, with reusable cross-suite helpers in `tests/_helpers/` and per-suite specs under `tests/integration/` and `tests/ui/`.
- Keep maintainer browser inspection on the same Vitest + Playwright-provider stack: headed inspection runs stay opt-in (`.env.vitest-browser-headed`), single-worker, and close automatically when the suite ends.
- Keep only suite-wide helpers in `tests/_helpers/`; suite-local helpers belong in `tests/<suite>/helpers.ts`.
- Keep user-facing env overrides narrow: `MM_SANDBOX_MOUNTED_MODULE_ROOT` selects the mounted-module root explicitly, and `MM_SANDBOX_HOST` / `MM_SANDBOX_PORT` set the listen address. Derive module identity and runtime semantics from the mounted module, its `package.json#sandbox` block, and persisted config instead of behavior-changing env vars.
- Keep compiled UI assets flowing through the package build/publish phase, and publish only the distributable sandbox runtime (`dist`, `docs`, `README.md`, plus `bin/install-guard.ts` for `postinstall`) rather than development sources.
- Keep MagicMirror iframe CSS/assets and helper shims synced from `mmcore-source/` (filled by `build:00-sync-mmcore-source`, version recorded in `mmcore-source/version.json`) during source-repo maintenance, but never require it in distribution installs.
- Keep Quality aligned with the official MagicMirror-3rd-Party-Modules check: vendor what it executes and port only what cannot be vendored. When upstream changes a check, adapt to it; never keep or restore checks upstream dropped. `build:02-sync-analyzer` fails on drift of the ported pieces (`scripts/upstream-snapshots/`).
- Copy MagicMirror core `logger.js` and `node_helper.js` verbatim; sandbox-specific behavior lives only in `scripts/templates/*-postlude.js`.
- Keep the shell UI on the Vite + Preact boundary (runtime and vendor bundles use esbuild, styles use sass) and validate new shared browser/server contracts with Zod when a typed boundary is introduced.
- Preserve the explicit split between user autodiscovery and maintainer `--preview`; if neither resolves a real mounted module, fail clearly instead of inventing a fallback identity.

## Browser runtime contract — non-negotiable

The sandbox browser runtime (`client/runtime/`) must behave exactly like the MagicMirror core:

- **Primary sources**: `mmcore-source/node_modules/magicmirror/js/module.js`, `main.js`, and `logger.js` (the pinned core version, currently 2.36.0).
- **Invariant**: if a behavior causes a module to fail in real MagicMirror, it MUST fail identically in the sandbox. The sandbox must never mask a real bug by being more permissive than the core.
- **No defensive divergence**: do not add "defensive" behavior that makes the sandbox more tolerant than core. A module that crashes in core must crash in the sandbox. A module that works in core must work in the sandbox.
- **Known permanent limitation**: the `config` global exposes only `language`, `locale`, and `basePath` (plus a separate `mmVersion` global). Full MM config properties are unavailable without a real MM server. All other behaviors must match core exactly.

See the `ARCHITECTURE.md` "Browser runtime contract" section for the full rationale.

### Core-fidelity hardening tests

`tests/integration/core-fidelity.browser.test.ts` locks in the corrected behaviors from v1.2.0. Each test is annotated with the MagicMirror core source it mirrors.

**Rule: do NOT alter assertions in `core-fidelity.browser.test.ts` to make a failing test pass.**

If a test fails, fix the sandbox implementation (`client/runtime/`) to match the core. Weakening or removing an assertion is never the right fix. If you believe an assertion is genuinely wrong, add a comment explaining why and open a discussion — do not silently change it.

The behaviors covered are listed below. Sources are cited by function, because line numbers drift between core versions. There has never been a D2.

| ID  | Behavior                                                                                                            | Source                                                   |
| --- | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| D1  | base `getDom()` returns `Promise<HTMLElement>`                                                                      | `module.js` `getDom`                                     |
| D3  | `suspend()` fires inside `hide()` animation callback                                                                | `module.js` `hide`                                       |
| D4  | `resume()` fires inside `show()` animation callback                                                                 | `module.js` `show`                                       |
| D5  | `module.hidden` updates synchronously on hide and show; `lockStrings` veto show (dedup, `force`, `onError`)         | `main.js` `hideModule` / `showModule`                    |
| D6  | header rendered via `innerHTML` (HTML markup allowed); empty header falls back to the module name, `false` hides it | `main.js` `createDomObjects`                             |
| D7  | `notificationReceived` receives original payload reference, not a clone                                             | `main.js` `sendNotification`                             |
| D8  | `Log` exposes all methods from `logger.js`                                                                          | `logger.js`                                              |
| D9  | `MM.getModules()` result carries `withClass`/`exceptWithClass`/`exceptModule`/`enumerate` as non-enumerable methods | `main.js` `getModules` / `setSelectionMethodsForModules` |

**D5 correction (2026-10-27, maintainer-approved).** D5 used to assert that `hidden=false` is deferred to the show callback, which no core release since at least 2.30.0 does. The assertion was corrected, lockString coverage was added, and the lock handling moved from `module.ts` into `core.hideModule` / `core.showModule` (`client/runtime/lifecycle.ts`), where `main.js` keeps it.

## Config editor

The config editor is complete. It offers:

- a read-only MagicMirror `config.js`-style envelope around the editable `config` block, built from three Ace instances;
- relaxed JS/JSONC input;
- draft and validity state;
- Format, Revert draft, and Save and reload;
- General-tab options that sync into the envelope.

Known residual issues:

- **Syntax error marker lands on the first editable row.** `_applyErrorHighlight` (`client/vendor/module-config-editor.ts`) only finds a real row when the message contains `position N`. Errors from the `new Function` fallback carry no position, and the offsets from jsonc-parser are discarded.
- **Format strips comments.** This is by design and documented in `docs/config.md`.
- **Save and reload stays enabled without pending changes.** In `client/runtime/debug-panel.ts` the save button tracks validity only; dirty state only toggles Revert.
- **The temp file path is reported even when `config.sandbox.json` is the write target.** This happens in the startup log (`server/index.ts`), the save API `moduleConfigPath`, and the `harness:reload` event (`server/routes.ts`). Cause: `getModuleConfigPath()` always returns the temp file, while saves go through `getModuleConfigWritePath()`.

Future refinement should keep moving config editing closer to a real MagicMirror config authoring feel.

## Delegation rules

1. **Delegate by default.** Delegate every task that can be handled by a specialized subagent, unless the user explicitly says not to delegate a specific task or plan.
2. **Always ask before delegating.** Before delegating any task, present the viable delegation options with the recommended default marked. The user can pick a different agent or deny delegation entirely.
3. **"No delegate" option is mandatory.** Every delegation prompt must include an explicit option to not delegate.
4. **Split multi-agent tasks.** When a task requires multiple concerns (e.g., implementation + tests + review), delegate each concern to its most appropriate subagent separately.
5. **Phrase trigger — stop delegating.** If the user says "de aquí en adelante no delegarás" or semantically equivalent, stop delegating entirely until the user re-enables it. The inverse applies: a phrase like "vuelve a delegar" re-enables delegation.
6. **Delegate runs in background.** The purpose of delegating to subagents is to parallelize work. Always spawn delegated agents in the background (`run_in_background: true`) so multiple fronts can proceed concurrently. Handle agent responses asynchronously — do not block waiting for one agent before starting another.

### Delegation prompt format

When about to delegate, always show:

```
Delegar a: [AgentName] (default) | [AlternativeAgent] | No delegar
Tarea: <one-line description>
```

Wait for confirmation before spawning the agent.
