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

## Active handoff

`HANDOFF.md` exists at the repo root. Read it before making any architectural decisions.
It contains: established definitions for defensive protection vs divergence, the MM core coupling layer analysis, known technical debt, and planned corrections not yet implemented.
Delete the reference here and the file itself once all planned corrections are implemented and validated.

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
