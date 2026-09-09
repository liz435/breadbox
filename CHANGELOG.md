# Changelog

All notable Breadbox changes are recorded here. The current entry is a release
candidate and should be reviewed before the GitHub Release is published.

## [0.2.0] — 2026-09-08 · release candidate

Breadbox v0.2.0 makes the circuit workflow substantially more physical: parts
are represented at real scale in 2D and 3D, powered circuits can be checked
against a solved electrical model, and supported moving parts can be exercised
in a physics-enabled scene.

### Added

- Physical Test workspace with a Rapier-based scene runtime.
- Interactive 3D motion for servos, potentiometers, DC motors, relays, and
  other supported peripherals.
- Physics showcase boxes that can be dropped into the scene and struck by
  moving parts.
- Obstacle-aware 3D wire routing with curved tube wires and modeled connector
  ends.
- Full-size, calibrated breadboard and component placement based on real pin
  and socket geometry.
- HW-131 power module model and external-power handling for powered servos.
- 28BYJ-48 stepper motor and ULN2003 driver in the component catalog.
- Board-scoped power analysis and SPICE-backed electrical checks.
- Shared physical-envelope auto-layout to reduce overlap between 2D, schematic,
  and 3D views.
- Release-facing asset and dependency attributions.

### Improved

- Agent proposals now handle powered servo circuits with supply and common
  ground connections.
- Power-module pins and servo power requirements are represented consistently
  in the board model, schematic, and 3D scene.
- Schematic generation, topology handling, electrical-rule checks, and layout
  regression coverage were expanded.
- The root README now reflects the current feature set and target support.

### Known limitations

- AVR is the high-fidelity in-browser firmware runner. RP2040 has a best-effort
  browser runner with GPIO/PWM/ADC support; full PLL/USB-CDC behavior requires
  the optional vendored bootrom.
- 3D physical interactions cover supported showcase parts; they are not a
  general-purpose rigid-body simulation for every catalog component.
- The release workflow produces macOS Apple Silicon, macOS Intel, and Windows
  desktop artifacts. Linux is not included in the matrix.

### Verification

Before publishing, run:

```bash
bun install
bun run typecheck
bun run test
bun run build:cli
git diff --check
```

Then verify the 2D circuit, schematic, 3D assembly, Physical Test scene, and
desktop installers from the generated draft release.
