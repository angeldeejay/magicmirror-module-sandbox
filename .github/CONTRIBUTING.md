## Contribution Policy for magicmirror-module-sandbox

Thanks for contributing to `magicmirror-module-sandbox`!

This package is intentionally narrow: it is a single-module MagicMirror
development sandbox with a real frontend module, a real `node_helper.js`, and a
backend-owned config flow. Contributions should keep it useful as a standalone
sandbox product, not grow it into a generic MagicMirror replacement.

## Scope expectations

We hold contributions to these product rules:

- keep the sandbox single-module-oriented
- preserve real module + real helper wiring
- keep config persistence owned by the backend
- document supported behavior explicitly instead of implying broad compatibility
- keep package docs and metadata aligned with the actual sandbox behavior

## Linters and formatting

Run commands from the repository root.

### Run Prettier

We use [Prettier](https://prettier.io/) for repository formatting.

```bash
npm run format
```

### Run ESLint

We use [ESLint](https://eslint.org) for JavaScript linting.

```bash
npm run lint
```

## Runtime verification

If your change affects runtime behavior, start the sandbox locally:

```bash
npm start
```

Use that default command from a real module repo for the normal user flow. When
working on the sandbox itself with no mounted consumer module available, use the
maintainer fixture flow instead:

```bash
npm run start:preview
```

For watch-mode behavior:

```bash
npm run watch
npm run watch:preview
```

For sandbox stylesheet work:

```bash
npm run styles
npm run styles:watch
```

For package/distribution changes:

```bash
npm run build
npm pack --dry-run
```

Published releases go through `.github/workflows/publish.yml`, which publishes
to npmjs via trusted publishing and to GitHub Packages via `GITHUB_TOKEN`. Keep
the workflow path stable unless you also update the trusted-publisher
configuration on npmjs.org.

For automated sandbox regression coverage:

```bash
npm test
```

The sandbox CI workflow runs the same validation path as local maintainer work:
install dependencies, provision Playwright Chromium, then run lint, build, and
`npm test` from one validation step.

Or run the layers separately:

```bash
npm run typecheck
npm run test:unit
npm run test:unit:coverage
npm run test:ui
npm run test:ui:headed
npm run test:integration
npm run test:integration:headed
npm run test:e2e
```

The `*:headed` browser scripts are for maintainer inspection, not CI: they open
headed Chromium, serialize browser-backed execution to one file at a time, add
slow motion, and keep a visible cursor overlay so you can evaluate whether a
spec really matches the UI flow you intended. Append `-- <path-to-spec>` to
focus one browser file while reviewing or designing it.

Keep the test layout contributor-friendly:

- group Node tests under `tests/unit/` by internal sandbox module family
- split Vitest browser UI specs under `tests/ui/` by sandbox domain
- keep controlled fixture-module integration coverage under `tests/integration/`
- keep shared browser flows in `tests/_helpers/`
- prefer env-driven fixture mounting over patching the runtime loader when a controlled integration scenario needs another module/config root
- prefer resolver stubs or fixture files over behavior-changing env vars when tests need non-default runtime semantics
- when one domain changes, prefer updating only that domain's smoke spec instead of growing a catch-all UI file

## Documentation alignment

Keep these files aligned when the product surface changes:

- `README.md`
- `docs/`
- `.github/CONTRIBUTING.md`
- `AGENTS.md`
- `CHANGELOG.md`
- `package.json`

Version headings in `CHANGELOG.md` should follow release-tag format like
`v1.0.0`.

## Change boundaries

Good contributions usually look like this:

- small focused modules instead of growing long files further
- explicit supported behavior instead of silent partial support
- backend-owned disk reads/writes
- operator-facing flows that feel predictable and productized
- sandbox-owned regression coverage for product behavior, including UI smoke where it matters

Avoid changes like these:

- expanding the sandbox into a generic multi-module MagicMirror replacement
- moving config persistence into the frontend
- coupling the sandbox to project-specific mock services or parent-repo-only assumptions
- documenting behavior the sandbox does not actually support

## Current known direction

- The config editor now has draft-state feedback plus local revert/format actions, but it is intentionally not finished yet.
- Future refinement should make config editing feel visually closer to editing a real MagicMirror config.
- The sandbox should remain productized and self-describing even while still evolving internally.
