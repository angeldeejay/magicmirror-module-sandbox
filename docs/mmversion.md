# 🔢 MM Version

The **MM Version** area lets you install, activate, and manage multiple
MagicMirror core installations — similar to how `nvm` manages Node.js versions.

![MM Version domain screenshot](https://raw.githubusercontent.com/angeldeejay/magicmirror-module-sandbox/coverage/screenshots/mmversion.png)

## What you will see

- **Active version indicator** — shows which MagicMirror version the sandbox is
  currently using (the topbar badge mirrors this at a glance)
- **Installed versions list** — all locally cached MagicMirror core
  installations, with per-version actions
- **Available releases** — releases fetched from the MagicMirror GitHub
  repository that can be downloaded and activated
- **Capability table** — details of the active version's runtime capabilities,
  including Express version, default modules directory, config loading strategy,
  and hook support flags

## Actions

### Activate a version

Click **Activate** next to any installed version to switch the sandbox to that
MagicMirror core. The sandbox restarts with the selected version's shims and
module compatibility artifacts. The topbar badge updates to reflect the newly
active version.

### Reset to built-in

Click **Reset to built-in** in the active version indicator to revert to the
MagicMirror version bundled with the sandbox. This is the safest fallback if a
custom version causes unexpected behavior.

### Download a release

Click **Download** next to any available release to fetch and cache it locally.
Downloaded versions appear in the installed list and can then be activated.

### Re-download a cached version

Click the re-download icon (↻) on an installed version to fetch a fresh copy
and rebuild the shims. Use this if a cached installation is corrupted or
incomplete.

### Delete a cached version

Click the delete icon (✕) on an installed version to remove it from local
storage. The active version cannot be deleted.

## Capability table

When a version is active and its capabilities are loaded, the sandbox surfaces a
read-only table:

| Capability | What it means |
| --- | --- |
| `loaded()` hook | Whether the version supports the `helperLoadedHook` lifecycle callback |
| `stop()` hook | Whether the version supports the `helperStopHook` lifecycle callback |
| Class extend system | Whether `Class.extend()` is available for inheritance |
| ES6 node helper | Whether the helper is authored as an ES6 class (may require extra compat) |
| HTTP fetcher | Whether `http_fetcher.js` is included in the core |
| CORS proxy | Whether a built-in CORS proxy is available |
| Express version | The Express.js major version bundled with the core |
| Default modules dir | The path used as the default modules directory |
| Config loading | How the core reads its configuration (`filesystem` or other strategy) |
| Config functions | Whether configuration allows function values |
| Socket namespace | The Socket.IO namespace the core expects |

A warning indicator (⚠) on a capability entry means the value may require
attention — for example, `es6NodeHelper: true` signals that the helper is
structured as an ES6 class, which some compatibility layers do not handle
automatically.

## When it helps most

Open MM Version when you want to:

- test your module against multiple MagicMirror releases without changing your
  system installation
- verify that your module works with both the latest and an older stable release
- understand which runtime capabilities are available in a given core version
- quickly switch back to the bundled version after an experiment with a custom
  installation

## Notes

- Version data is fetched from the GitHub API on panel load. If you are offline,
  the available releases list will be empty; already-installed versions still
  appear.
- The version store lives under `~/.mmvm/` and is shared across all sandbox
  instances on the machine.
- Activating a version triggers a sandbox restart; unsaved config changes should
  be saved before switching.
- The built-in version is always available as a fallback and cannot be deleted.
