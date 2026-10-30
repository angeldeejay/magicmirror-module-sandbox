# ⚙️ Runtime

The **Runtime** area is where you poke at the mounted module's lifecycle and
quickly see what state it is in.

It reflects the module the sandbox picked up from your current project. The
viewport runs the active MagicMirror version's own browser core, so every
control here calls that core's real API on the created module instance.

![Runtime lifecycle screenshot](https://raw.githubusercontent.com/angeldeejay/magicmirror-module-sandbox/coverage/screenshots/runtime-lifecycle.png)

## Always-visible host summary

Runtime opens with a small host summary above the tabbed content:

- current sandbox URL
- config editing location (`sandbox UI`)
- watch mode state

This stays visible because it is handy from the first second the page opens.

## Panels

### Lifecycle

This panel shows and controls the lifecycle pieces the sandbox supports:

- **Visibility** toggles the module between shown and hidden through the
  core's own `hide()` / `show()`.
- **Activity** toggles the module between running and suspended through its
  `suspend()` / `resume()`.
- **DOM ready** reports whether the core created the module's DOM
  (`DOM_OBJECTS_CREATED`).
- **Lifecycle started** reports whether the core started the module.
- **Disabled in saved config** is surfaced explicitly when the mounted module is configured not to boot.
- visibility/activity controls operate on the stage iframe without reloading the surrounding shell UI
- if the active core's module instance lacks one of the observed methods, the
  panel names it instead of pretending the control works

## When it helps most

Open Runtime when you want to:

- confirm which sandbox host instance you are looking at
- verify `show()` / `hide()` behavior inside the mounted-module viewport
- verify `suspend()` / `resume()` hooks without reloading the shell UI
- confirm that the startup lifecycle completed before debugging something else
- confirm when a saved `disabled` state is what prevented the module from booting
- confirm whether you are looking at a frontend-only module run or one that also booted a helper

## Notes

- The viewport shows only the module's own region, inside the core's real DOM
  and CSS, with the geometry MagicMirror gives it in a window of that size.
- It is great for quick manual checks before you reach for heavier automation.
- `animateIn` / `animateOut` effects configured from **Config** are applied by
  the core itself (Animate.css) during `show()` / `hide()`.
