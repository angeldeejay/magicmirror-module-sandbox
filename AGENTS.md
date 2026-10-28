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
node --run build:30-dist                 # assemble the published dist/ (incl. the built-in core in dist/core/)
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

Browser tests open the sandbox with `gotoSandbox()` from `tests/_helpers/helpers.browser.ts`; the stage iframe always runs the active MagicMirror core from `/__stage/` (`server/stage/`). Every test server runs under an isolated home under `.runtime-cache/core-homes/`, so runs are deterministic and never read or write the maintainer's own `~/.mmvm/active`: `gotoSandbox()` runs the built-in core, and `gotoSandbox({ coreKey })` pins another one. Cross-version stage tests run once per core from `availableCores()` (`tests/_helpers/core-matrix.ts`): the built-in core, plus the version in the test-only env var `MM_SANDBOX_TEST_CORE_VERSION` when it is installed in mmvm. The packaged-install e2e runs its server under an empty temporary home, so it always serves the packaged `dist/core/`.

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

- `server/`: Fastify HTTP host, routes, watch loop, helper lifecycle, startup scripts, Eta-rendered HTML shell (`server/templates/`), the stage (`server/stage/`: serves the active MagicMirror core under `/__stage/` from an mmvm version, `mmcore-source/` or the packaged `dist/core/`, generates its `config/`, `config/basepath.js` and `js/positions.js` in memory, runs the version's own `server_functions.js` endpoints, hosts the second socket.io server at `/__stage/socket.io`, and guards the ported pieces with reviewed snapshots in `scripts/upstream-snapshots/core/`), config persistence with Zod payload parsing, the nvm-style MagicMirror version manager (`mm-version-manager.ts`, store under `~/.mmvm/`), Quality analysis (the vendored analyzer in `server/vendor/check-modules/` plus `official-eslint-check.ts` and `official-dependency-integrations.ts`, ports of the official worker guarded by `scripts/upstream-snapshots/`; repository-ignored paths are excluded as the one documented local deviation)
- `client/`: Preact shell app (`client/app/`), shell tooling (`client/runtime/`: the shell and stage sides of the stage bridge, the Debug and Quality panels), the stage observer injected into the core page (`client/stage-observer/`), SCSS sources (`client/scss/`, including the stage isolation sheet) compiled into `client/styles/` and `client/generated/`, generated bundles (`client/generated/`), hand-written editor and bundle components (`client/vendor/`), and fonts
- `config/`: contract, harness bootstrap config, MagicMirror language and module-option metadata, and default module/runtime JSON
- `docs/`: sandbox operator manuals, one per sidebar domain plus themes
- `shims/`: `logger` and `node_helper` compatibility shims plus the generated helper-compat root under `shims/generated/` (MagicMirror core files and `node_modules/{express,undici,ipaddr.js}`); an active `~/.mmvm/` version supplies its own shims from `~/.mmvm/shims/<version>/`
- `scripts/`: build, sync, packaging (`package-core.ts` writes `dist/core/`), screenshot, report, and pipeline-test scripts; `scripts/templates/` holds the logger and node_helper postludes; `scripts/upstream-snapshots/` holds the reviewed drift hashes
- `tests/`: `unit/`, `integration/`, `ui/`, `e2e/`, shared `_helpers/`, `_setup/`, and the `_fixtures/MMM-TestModule/` fixture module
- `bin/`: CLI entrypoint, `--preview` wiring, MagicMirror asset sync, and the `postinstall` install guard

Generated or cached paths, never edited by hand: `mmcore-source/`, `client/generated/` (including `stage-observer.js` and `stage-isolation.css`), `client/webfonts/`, the generated CSS in `client/styles/` (everything except files compiled from `client/scss/`), `shims/generated/`, `server/vendor/check-modules/`, `dist/` (including the packaged core in `dist/core/`), `coverage/`, and `.runtime-cache/`.

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
- Keep MagicMirror shell CSS/assets and helper shims synced from `mmcore-source/` (filled by `build:00-sync-mmcore-source`, version recorded in `mmcore-source/version.json`) during source-repo maintenance, but never require it in distribution installs: they run the built-in core from `dist/core/`, which `build:30-dist` packages.
- Keep Quality aligned with the official MagicMirror-3rd-Party-Modules check: vendor what it executes and port only what cannot be vendored. When upstream changes a check, adapt to it; never keep or restore checks upstream dropped. `build:02-sync-analyzer` fails on drift of the ported pieces (`scripts/upstream-snapshots/`).
- Copy MagicMirror core `logger.js` and `node_helper.js` verbatim; sandbox-specific behavior lives only in `scripts/templates/*-postlude.js`.
- Keep the shell UI on the Vite + Preact boundary (runtime and vendor bundles use esbuild, styles use sass) and validate new shared browser/server contracts with Zod when a typed boundary is introduced.
- Preserve the explicit split between user autodiscovery and maintainer `--preview`; if neither resolves a real mounted module, fail clearly instead of inventing a fallback identity.

## Browser runtime contract — non-negotiable

The stage runtime **is** the active MagicMirror core. The stage iframe loads that version's own `index.html`, `js/`, `css/`, `translations/`, `defaultmodules/` support files and vendor packages from `/__stage/` (`server/stage/`); the sandbox only observes and controls it from outside (`client/stage-observer/`). There is no sandbox re-implementation of `module.js`, `main.js`, `loader.js` or `translator.js`.

- **Primary sources**: the active core itself. The built-in core is `mmcore-source/node_modules/magicmirror/` (the pinned version, currently 2.36.0; `dist/core/` in a distribution install); an mmvm version lives in `~/.mmvm/versions/<key>/node_modules/magicmirror/`.
- **Invariant**: if a behavior causes a module to fail in real MagicMirror, it MUST fail identically in the sandbox, on every supported version. The sandbox must never mask a real bug by being more permissive than the core.
- **Core files are served verbatim.** `index.html` gets only the core's own `getHtml` substitutions (`#VERSION#`, `#TESTMODE#`) and one sandbox injection point (the isolation stylesheet, the stage state and the observer). `config/basepath.js`, `js/positions.js` and `/config/` are generated in memory with the version's own logic. No other edits, on disk or in transit.
- **The `config` global is the real MagicMirror config**: the version's `js/defaults.js`, the sandbox language and locale, `basePath: "/__stage/"`, and `modules: [<mounted module envelope>]` from the saved config, with secrets redacted as that version redacts them.
- **No defensive divergence**: do not add behavior that makes the sandbox more tolerant than the core. A module that crashes in the core must crash in the sandbox.

The observer obeys four rules:

1. **Transparent wrappers.** A wrapper calls through first and records after: same arguments, same `this`, same return value, same exceptions, same timing (synchronous stays synchronous). It never swallows an error the core would throw.
2. **Instance-only hooks.** Hooks attach to the created module instance (found through `MM.getModules()` once the core creates its DOM), never to `Module.prototype`, module definitions or `MM`. From 2.37 module methods are instance properties, and wrapping a definition breaks `_super` in 2.35-2.36. A hook point a version does not offer is named in its panel, never faked.
3. **Emit with sender undefined.** The Notifications panel calls `instance.notificationReceived(notification, payload, undefined)`, exactly as the core delivers its own system notifications. `MM.sendNotification` is never used for it.
4. **`RELOAD` reloads the stage.** Saves, restarts, watcher reloads and version switches reload the stage through the core's own root-namespace `RELOAD` on `/__stage/socket.io`, as a mirror reloads. The shell reloads the frame itself only when no core page listens, or when no document loads within the 5 s fallback.

See the `ARCHITECTURE.md` "Browser runtime contract" section for the full rationale.

### Core-fidelity tests (decided by the owner)

The stage runs each MagicMirror version's own core, so fidelity is checked per version. The suite splits in two:

- **Cross-version tests**, in `tests/integration/stage-transparency.browser.test.ts`. They check observer transparency: the sandbox alters nothing. They run once per core in the matrix and must pass identically on every supported version.
- **Version-pinned tests**, in `tests/integration/core-fidelity/pinned/<version>.browser.test.ts` (today `2.36.0` and `2.38.0`). Their expected results are fixed per version. Each assertion cites the file and line in that version's core (`git show v<version>:js/<file>` in the MagicMirror repo). Each file runs on the stage with its own core, through public behaviour only (`MM`, `Module`, the module instance API, the DOM). It is skipped, with the reason in the suite name, when its core is not in the run.

**Rule: do NOT alter assertions in these files to make a failing test pass.** If a test fails, fix the sandbox (the stage server or the observer) so the core runs unaltered. A pinned expectation changes only when that version's core says otherwise, citing the file:line. It never changes to make a failing run green. When a new release changes a behaviour, it gets its own pinned file; the old version's file stays as it is. If you believe an assertion is genuinely wrong, add a comment explaining why and open a discussion — do not silently change it.

The pinned files cover these behaviors, cited by function because line numbers drift between core versions. There has never been a D2.

| ID  | Behavior                                                                                                              | Source                                                   |
| --- | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| D1  | base `getDom()` returns `Promise<HTMLElement>`; `this._super()` resolves in 2.35-2.36 and fails from 2.37             | `module.js` `getDom`                                     |
| D3  | `suspend()` fires inside `hide()` animation callback                                                                  | `module.js` `hide`                                       |
| D4  | `resume()` fires inside `show()` animation callback                                                                   | `module.js` `show`                                       |
| D5  | `module.hidden` updates synchronously on hide and show; `lockStrings` veto show (dedup, `force`, `onError`)           | `main.js` `hideModule` / `showModule`                    |
| D6  | header rendered via `innerHTML` (HTML markup allowed); an empty, `false` or missing header hides it                   | `main.js` `createDomObjects` / `updateModuleContent`     |
| D7  | `notificationReceived` receives original payload reference, not a clone                                               | `main.js` `sendNotification`                             |
| D8  | `Log` exposes all methods from `logger.js`                                                                            | `logger.js`                                              |
| D9  | `MM.getModules()` result carries `withClass`/`exceptWithClass`/`exceptModule`/`enumerate`; the module name is a class | `main.js` `getModules` / `setSelectionMethodsForModules` |

The core matrix (`tests/_helpers/core-matrix.ts`) is the built-in core, plus the mmvm version named by the test-only env `MM_SANDBOX_TEST_CORE_VERSION` when it is installed with its shims. Install one with `npx tsx scripts/install-test-core.ts <version>`. CI's `core-matrix` job does this for `2.38.0` (blocking; the installed release is cached, the shims are rebuilt every run with `--rebuild-shims`) and `develop` (non-blocking, never cached), then runs `test:20-integration`. A requested core that is missing makes the run fail rather than skip; only an unset `MM_SANDBOX_TEST_CORE_VERSION` skips the pinned files of other cores. If the built-in core is ever bumped past a pinned version, add that version to the CI core matrix so its pinned file keeps running.

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
