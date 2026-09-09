# Third-party attributions

This file records third-party software and 3D assets shipped with Breadbox.
It is the release-facing source of truth for credits; code comments are useful
for implementation context but are not sufficient attribution records.

## Circuit simulation

- **spicey** — the browser-side SPICE netlist parser and solver, pinned at
  `spicey@0.0.14` and locally patched in
  [`patches/spicey@0.0.14.patch`](../patches/spicey@0.0.14.patch).
  Source: [tscircuit/spicey](https://github.com/tscircuit/spicey).
- **ngspice** — used only as an independent reference engine in cross-check
  tests; it is not bundled with the application. Source:
  [ngspice](https://ngspice.sourceforge.io/).

## 3D assets

| Shipped assets | Source / creator | Notes |
| --- | --- | --- |
| All built-in GLBs in `packages/app/src/assets/` — Arduino, breadboard, LEDs, servo, stepper, power module, displays, and sensors | [Robotica Parana on Sketchfab](https://sketchfab.com/roboticaparana) | Models used in the interactive 3D breadboard scene. |

The Sketchfab URL above is the creator/source page supplied for every bundled
GLB. A creator profile does **not** establish a model's redistribution terms.
Before a release containing a newly imported or replaced GLB, add the
individual model URL and its exact license to this table.

## Maintaining this record

1. Add an attribution entry in the same change that imports a third-party asset
   or dependency.
2. Preserve the original source URL and license; do not replace them with a
   generic marketplace or search link.
3. If provenance or licensing cannot be confirmed, mark the asset as pending
   and do not distribute it until the record is complete.
