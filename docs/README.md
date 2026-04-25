# 📚 Sandbox manual

These pages walk through the main parts of the MagicMirror Module Sandbox UI.

![Runtime domain screenshot](screenshots/runtime-lifecycle.png)

## What you will find here

The sidebar is organized into five main areas:

- [Runtime](runtime.md)
- [Config](config.md)
- [Notifications](notifications.md)
- [Debug](debug.md)
- [About](about.md)

These guides describe the sandbox as it exists today. They are meant to help
you use the product, not to promise broad compatibility outside the supported
slice.

## Screenshot index

- [Runtime](runtime.md): `Lifecycle`
  ![Runtime lifecycle screenshot](screenshots/runtime-lifecycle.png)
- [Config](config.md): `General` and `Module`
  ![Config General screenshot](screenshots/config-general.png)
  ![Config Module screenshot](screenshots/config-module.png)
- [Notifications](notifications.md): `Emit`, `Log`, and `WebSocket`
  ![Notifications Emit screenshot](screenshots/notifications-emit.png)
  ![Notifications Log screenshot](screenshots/notifications-log.png)
  ![Notifications WebSocket screenshot](screenshots/notifications-websocket.png)
- [Debug](debug.md): `Helper Log` and `Console Log`
  ![Debug Helper Log screenshot](screenshots/debug-helper-log.png)
  ![Debug Console Log screenshot](screenshots/debug-console-log.png)
- [About](about.md)
  ![About screenshot](screenshots/about.png)

## A simple way to use the sandbox

1. Start the sandbox from the consumer module root with either `npx @angeldeejay/magicmirror-module-sandbox@latest` or a locally installed `npx magicmirror-module-sandbox`.
2. Open `http://127.0.0.1:3010`.
3. Use the topbar to open one sidebar domain at a time.
4. Interact with the mounted module in the stage while inspecting logs and state from the sidebar.

## A few helpful notes

- Mounted-module config persistence stays in the backend and writes sandbox-owned temp files like `module.config.<hash>.json`.
- Runtime language/locale persistence stays beside it in temp as `runtime.config.<hash>.json`.
- Each module repo keeps its own saved config by default; switching projects does not silently reuse another module's persisted editor state.
- `node_helper.js` is optional. Frontend-only modules still mount as long as the frontend entry can be detected.
- Watch mode emits reload events with fresh versioned stage URLs so stage-local changes refresh the iframe without keeping stale browser-cached assets.
- The sandbox mounts one real MagicMirror module at a time, not a multi-module layout.
- The screenshots in this manual are maintained from the preview fixture so they track the current sandbox UI rather than a stale mockup.
