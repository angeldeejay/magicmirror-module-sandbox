# ⚙️ Runtime

The **Runtime** area is where you poke at the mounted module's lifecycle and
quickly see what state it is in.

It reflects the module the sandbox picked up from your current project.

![Runtime lifecycle screenshot](screenshots/runtime-lifecycle.png)

## Always-visible host summary

Runtime opens with a small host summary above the tabbed content:

- current sandbox URL
- config editing location (`sandbox UI`)
- watch mode state

This stays visible because it is handy from the first second the page opens.

## Panels

### Lifecycle

This panel shows and controls the lifecycle pieces the sandbox supports:

- **Visibility** toggles the mounted module viewport between shown and hidden.
- **Activity** toggles the mounted module viewport between running and suspended.
- **DOM ready** reports whether the stage-level DOM hooks are available.
- **Lifecycle started** reports whether the startup sequence has completed.
- **Disabled in saved config** is surfaced explicitly when the mounted module is configured not to boot.
- visibility/activity controls operate on the stage iframe without reloading the surrounding shell UI

## When it helps most

Open Runtime when you want to:

- confirm which sandbox host instance you are looking at
- verify `show()` / `hide()` behavior inside the mounted-module viewport
- verify `suspend()` / `resume()` hooks without reloading the shell UI
- confirm that the startup lifecycle completed before debugging something else
- confirm when a saved `disabled` state is what prevented the module from booting
- confirm whether you are looking at a frontend-only module run or one that also booted a helper

## Notes

- This is still a deliberately narrow slice of the MagicMirror lifecycle.
- It is great for quick manual checks before you reach for heavier automation.
- `animateIn` / `animateOut` effects configured from **Config** are applied in the stage runtime through Animate.css during `show()` / `hide()`.
