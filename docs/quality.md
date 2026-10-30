# 🔍 Quality

The **Quality** area runs a static analysis of your mounted module against
MagicMirror 3rd-party module criteria and shows the results in one place.

![Quality screenshot](https://raw.githubusercontent.com/angeldeejay/magicmirror-module-sandbox/coverage/screenshots/quality.png)

## What you will see

Findings are organized by severity:

- **Errors** — issues that are likely to break or block the module
- **Warnings** — patterns that can cause unexpected behavior
- **Recommendations** — suggestions aligned with MagicMirror 3rd-party criteria

Each finding includes a short description. The severity filter checkboxes let
you narrow the list to the category you care about.

The footer shows when the last analysis ran. A stale note appears briefly
during helper restarts while a fresh result is on the way.

## Running an analysis

The **Analyze module** button triggers a fresh analysis on demand. In watch
mode the sandbox also re-analyzes automatically when module files change.

## When it helps most

Open Quality when you want to:

- get a quick read on common module issues before publishing or sharing
- work through errors and warnings one category at a time using the filters
- confirm that a fix resolved a specific finding without running a separate
  linter or check outside the sandbox

## Notes

- Analysis runs against the mounted module's source files, not a built bundle.
- Results reflect the criteria from the MagicMirror 3rd-party module
  repository at the time the sandbox was built. The sandbox runs the same two
  passes as the official module check: the text/README/package analyzer and
  the official ESLint pass (`eslint.testconfig.js`), with the official
  defaults. The built-in MagicMirror rules always run; general ESLint
  findings appear grouped under **ESLint issues**.
- Like the official check, Quality also runs `npm-check-updates` and
  `npm-deprecated-check` when the module has few enough other findings (the
  official issue budget). Both need network access; when it is unavailable
  they are skipped without failing the analysis.
- Files your repository ignores (per `.gitignore`, `.git/info/exclude` and
  your global git excludes) are not analyzed. The official check never sees
  them because it analyzes a fresh clone.
- The ESLint pass uses only the official configuration. ESLint configs in the
  module repository are never loaded, and inline `eslint-disable` comments
  are ignored, exactly as in the official check.
- Quality is a diagnostic aid, not a strict pass/fail gate. Errors are
  worth fixing; warnings and recommendations are worth reviewing.
- The panel shows results for one module at a time — whichever module is
  currently mounted.
