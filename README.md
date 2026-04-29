# MagicMirror Module Sandbox

[![Coverage: Statements](https://raw.githubusercontent.com/angeldeejay/magicmirror-module-sandbox/coverage/badges/statements.svg)](https://github.com/angeldeejay/magicmirror-module-sandbox/actions/workflows/ci.yml)
[![Coverage: Branches](https://raw.githubusercontent.com/angeldeejay/magicmirror-module-sandbox/coverage/badges/branches.svg)](https://github.com/angeldeejay/magicmirror-module-sandbox/actions/workflows/ci.yml)
[![Coverage: Functions](https://raw.githubusercontent.com/angeldeejay/magicmirror-module-sandbox/coverage/badges/functions.svg)](https://github.com/angeldeejay/magicmirror-module-sandbox/actions/workflows/ci.yml)
[![Coverage: Lines](https://raw.githubusercontent.com/angeldeejay/magicmirror-module-sandbox/coverage/badges/lines.svg)](https://github.com/angeldeejay/magicmirror-module-sandbox/actions/workflows/ci.yml)
[![Journeys UI](https://raw.githubusercontent.com/angeldeejay/magicmirror-module-sandbox/coverage/journey-badges/journeys-ui.svg)](https://github.com/angeldeejay/magicmirror-module-sandbox/actions/workflows/ci.yml)
[![Transitions UI](https://raw.githubusercontent.com/angeldeejay/magicmirror-module-sandbox/coverage/journey-badges/transitions-ui.svg)](https://github.com/angeldeejay/magicmirror-module-sandbox/actions/workflows/ci.yml)
[![Outcomes UI](https://raw.githubusercontent.com/angeldeejay/magicmirror-module-sandbox/coverage/journey-badges/outcomes-ui.svg)](https://github.com/angeldeejay/magicmirror-module-sandbox/actions/workflows/ci.yml)
[![Journeys Integration](https://raw.githubusercontent.com/angeldeejay/magicmirror-module-sandbox/coverage/journey-badges/journeys-integration.svg)](https://github.com/angeldeejay/magicmirror-module-sandbox/actions/workflows/ci.yml)
[![Transitions Integration](https://raw.githubusercontent.com/angeldeejay/magicmirror-module-sandbox/coverage/journey-badges/transitions-integration.svg)](https://github.com/angeldeejay/magicmirror-module-sandbox/actions/workflows/ci.yml)
[![Outcomes Integration](https://raw.githubusercontent.com/angeldeejay/magicmirror-module-sandbox/coverage/journey-badges/outcomes-integration.svg)](https://github.com/angeldeejay/magicmirror-module-sandbox/actions/workflows/ci.yml)

`@angeldeejay/magicmirror-module-sandbox` is a standalone, single-module MagicMirror
development sandbox.

It mounts **one real third-party module at a time**, keeps real
`node_helper.js` wiring in place, and gives you a persistent browser shell for:

- Runtime controls
- Config editing
- Notification inspection
- Helper and browser debug output
- Quick product context while you work

The goal is simple: give a MagicMirror module author a narrow, practical place
to develop and inspect a real module without pretending to be a full
MagicMirror replacement.

## ✨ What you get

- **Fastify host** for the local HTTP surface and config APIs
- **Vite + Preact shell** for the persistent sandbox UI
- **Backend-owned persistence** in temp files keyed to the mounted module
  identity, without writing sandbox-owned config into the mounted module tree
- **Dist-first packaging** so consumer installs run packaged runtime artifacts
- **Core-coupled helper compatibility wrappers** for `require("logger")` and
  `require("node_helper")`
- **A synced MagicMirror compatibility root** under helper-side
  `global.root_path` so core-style path-based requires can reach
  `js/class.js`, `js/logger.js`, `js/node_helper.js`, `js/http_fetcher.js`, and
  `js/server_functions.js`
- **Template/runtime compatibility guards** for browser-side Nunjucks plus
  `getDom()` overrides that call `this._super()` and expect a wrapper
  immediately
- **Operator docs** under `docs/` that mirror the current sidebar domains

## 🚀 Choose the install style that fits your workflow

There are two normal ways to use the sandbox as a consumer.

### ⚡ Option 1: one-off usage with `npx`

Use this when you want a quick run from a module repository without keeping the
package installed locally.

```bash
npx @angeldeejay/magicmirror-module-sandbox@latest
```

This is the lightest way to try the sandbox, verify behavior, or do a quick
manual check from a real module repo.

### 🧰 Option 2: local tool install as a devDependency

Use this when the sandbox is part of your regular module workflow and you want
the command version pinned in your project.

```bash
npm install --save-dev @angeldeejay/magicmirror-module-sandbox
npx magicmirror-module-sandbox
```

This is the recommended path when you come back to the same module often or
want the sandbox available as part of your normal local tooling.

### 🌐 After startup

Open `http://127.0.0.1:3010`.

From there you can:

- Inspect the mounted module in the stage
- Open one sidebar domain at a time from the topbar
- Edit config through the sandbox UI
- Inspect notifications and debug output without leaving the page

## 🧭 How the sandbox decides what to mount

The sandbox supports two explicit bootstrap flows.

### 👤 Consumer flow

Run the sandbox from a real MagicMirror module repository so the mounted module
can be autodiscovered.

If you need to point at a module root explicitly, set:

```bash
MM_SANDBOX_MOUNTED_MODULE_ROOT=<path-to-your-module>
```

### 🛠️ Maintainer preview flow

From this source repository, use the preview commands to boot the internal
`MMM-TestModule` fixture:

```bash
npm run start:preview
```

or:

```bash
npm run watch:preview
```

If neither flow resolves a real mounted module, startup fails clearly instead
of inventing a fallback identity.

## 🔧 Local maintainer workflow

If you are working inside this repository itself:

```bash
npm install
npm run build
npm start
```

Useful maintainer commands:

- `npm run build:client-assets`
- `npm run build:client-runtime`
- `npm run build:node-compat`
- `npm run watch`
- `npm run start:preview`
- `npm run watch:preview`
- `npm run typecheck`
- `npm test`

For browser-backed inspection during maintenance:

- `npm run test:ui:headed`
- `npm run test:integration:headed`
- `npm run test:browser:headed`

The headed browser scripts are maintainer inspection tools. They switch the
Vitest browser suites to headed Chromium, run more slowly, and keep the visible
flow easy to inspect while designing or reviewing a spec. You can pass a file
path after `--` to focus a single test file.

## 🎯 What the product intentionally is

- A **single mounted module** sandbox, not a generic multi-module MagicMirror
  replacement
- A sandbox that preserves **real frontend module + real `node_helper.js`**
  behavior for the supported slice
- A tool where **config writes stay in the backend**
- A workflow with pragmatic **watch mode** and iframe-first reload behavior
- A product that aims for **supported-slice compatibility**, not broad
  one-to-one parity with every MagicMirror core behavior

## 🗂️ Project shape

- `server/`: Fastify host, routes, helper lifecycle, startup scripts, and watch loop
- `client/app/`: Preact shell app and typed bootstrap boundary
- `client/runtime/`: TypeScript stage/runtime adapters that keep the real module flow
- `client/generated/`: built browser assets emitted from the maintained runtime and shell
- `config/`: harness config, contracts, language metadata, and module option metadata
- `docs/`: operator manuals by sidebar domain
- `tests/`: unit, integration, UI, and packaged-install smoke coverage
- `bin/`: CLI entrypoint plus maintainer/runtime helpers

## 📚 Documentation

- Operator manual: [`docs/README.md`](docs/README.md)
- Architecture notes: [`ARCHITECTURE.md`](ARCHITECTURE.md)
- Contribution policy: [`.github/CONTRIBUTING.md`](.github/CONTRIBUTING.md)
- Change history: [`CHANGELOG.md`](CHANGELOG.md)

## 📦 Release publishing

`.github/workflows/publish.yml` publishes the package to both `npmjs.org` and
GitHub Packages.

- `npmjs.org` uses npm trusted publishing from GitHub Actions, so the workflow
  path must stay aligned with the npm trusted-publisher configuration.
- GitHub Packages publishes through the workflow `GITHUB_TOKEN`, so releases and
  manual dispatches mirror the same package version to `npm.pkg.github.com`.
