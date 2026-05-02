# AGENTS.md

This file is the canonical instruction set for agent-driven work in `magicmirror-module-sandbox`.
Keep this file, `README.md`, `docs/`, `.github/CONTRIBUTING.md`, `CHANGELOG.md`, and `package.json` aligned.

## Commands

Run commands from the repository root.

```bash
node --run install
node --run build
node --run build:client-assets
node --run build:client-shell
node --run build:client-runtime
node --run build:node-compat
node --run sync:mm-assets
node --run start
node --run start:preview
node --run watch
node --run watch:preview
node --run typecheck
node --run test
node --run test:unit
node --run test:unit:coverage
node --run test:integration
node --run test:integration:headed
node --run test:e2e
node --run test:ui
node --run test:ui:headed
node --run test:browser:headed
node --run styles
node --run lint
node --run format
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
- Validate JS/TS changes with `node --run lint`, `node --run typecheck`, and the relevant test commands.
- Keep node --run publishing on the GitHub Actions trusted-publishing path defined by `.github/workflows/publish.yml` unless the node --run package settings are updated in lockstep.
- Keep automated regression coverage sandbox-owned: Vitest unit tests with a minimum 80% instrumented coverage threshold, Vitest packaged-install e2e coverage under `tests/e2e/`, and Vitest browser-backed coverage under `tests/integration/` and `tests/ui/`.
- Keep browser-backed sandbox coverage on the shared Vitest + Playwright-provider stack, with reusable cross-suite helpers in `tests/_helpers/` and per-suite specs under `tests/integration/` and `tests/ui/`.
- Keep maintainer browser inspection on the same Vitest + Playwright-provider stack: headed inspection runs should stay opt-in, single-worker, and close automatically when the suite ends.
- Keep only suite-wide helpers in `tests/_helpers/`; suite-local helpers belong in `tests/<suite>/helpers.js`.
- Keep user-facing env overrides narrow: allow explicit mounted-module root selection via `MM_SANDBOX_MOUNTED_MODULE_ROOT`, but derive module identity and runtime semantics from the mounted module plus persisted config instead of behavior-changing env vars.
- Keep compiled UI assets flowing through the package build/publish phase, and publish only the distributable sandbox runtime rather than development sources.
- Keep MagicMirror iframe CSS/assets synced from the local `magicmirror` devDependency during source-repo maintenance, but do not require that dependency in distribution installs.
- Keep the shell UI on the Vite + Preact boundary and validate new shared browser/server contracts with Zod when a typed boundary is introduced.
- Preserve the explicit split between user autodiscovery and maintainer `--preview`; if neither resolves a real mounted module, fail clearly instead of inventing a fallback identity.

## Browser runtime contract — non-negotiable

The sandbox browser runtime (`client/runtime/`) must behave exactly like the MagicMirror core:

- **Primary sources**: `node_modules/magicmirror/js/module.js`, `main.js`, and `logger.js`.
- **Invariant**: if a behavior causes a module to fail in real MagicMirror, it MUST fail identically in the sandbox. The sandbox must never mask a real bug by being more permissive than the core.
- **No defensive divergence**: do not add "defensive" behavior that makes sandbox more tolerant than core. A module that crashes in core must crash in sandbox. A module that works in core must work in sandbox.
- **Known permanent limitation**: `config` global exposes only `language`, `locale`, and `basePath`. Full MM config properties are unavailable without a real MM server. All other behaviors must match core exactly.

See `ARCHITECTURE.md` "Browser runtime contract" section for the full rationale.

### Core-fidelity hardening tests

`tests/integration/core-fidelity.browser.test.ts` locks in the corrected behaviors from v1.2.0. Each test is annotated with the exact source file and line from the MagicMirror core.

**Rule: do NOT alter assertions in `core-fidelity.browser.test.ts` to make a failing test pass.**

If a test fails, fix the sandbox implementation (`client/runtime/`) to match the core. Weakening or removing an assertion is never the right fix. If you believe an assertion is genuinely wrong, add a comment explaining why and open a discussion — do not silently change it.

The behaviors covered are:

| ID  | Behavior                                                                                                            | Source                |
| --- | ------------------------------------------------------------------------------------------------------------------- | --------------------- |
| D1  | base `getDom()` returns `Promise<HTMLElement>`                                                                      | `module.js:82-107`    |
| D3  | `suspend()` fires inside `hide()` animation callback                                                                | `module.js:367-413`   |
| D4  | `resume()` fires inside `show()` animation callback                                                                 | `module.js:367-413`   |
| D5  | `module.hidden=true` set immediately on hide; `false` only inside show callback                                     | `main.js:721,729-731` |
| D6  | header rendered via `innerHTML` (HTML markup allowed)                                                               | `main.js:253`         |
| D7  | `notificationReceived` receives original payload reference, not a clone                                             | `main.js:98-101`      |
| D8  | `Log` exposes all methods from `logger.js`                                                                          | `logger.js`           |
| D9  | `MM.getModules()` result carries `withClass`/`exceptWithClass`/`exceptModule`/`enumerate` as non-enumerable methods | `main.js:501-585`     |

## Pending direction

- The config editor now supports draft-state feedback plus local revert/format actions, but it is not fully finished yet.
- Future refinement should keep moving config editing closer to a real MagicMirror config authoring feel.

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
