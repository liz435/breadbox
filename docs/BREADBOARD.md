# Breadboard

Everything related to the virtual breadboard: grid geometry, connectivity
rules, net resolution, and how components plug into both UI and simulation.

## Grid model

File: `packages/app/src/breadboard/breadboard-grid.ts`

The board is a 30-row half-size breadboard plus an Arduino Uno on the left.
Grid points use `{ row, col }`. Special column values encode the power rails:

```
  col = -2   left  "+" rail (red)
  col = -1   left  "-" rail (blue)
  col =  0..4   left terminal strip  (a–e)
  col =  5..9   right terminal strip (f–j)
  col = 10   right "+" rail
  col = 11   right "-" rail
```

Arduino pins aren't on the grid. Wires originating at an Arduino pin use
the sentinel `fromRow === -999` and store the Arduino pin number in
`fromCol` (so `fromCol === 14` means A0, `-1` means 5V, `-3` means GND).
Everything walking the wire list special-cases this sentinel.

The `getComponentFootprint(type, row, col, rotation, properties)` function
returns a `ComponentFootprint = { points: GridPoint[], width, height }`.
Footprints are the source of truth for "where are this component's pins on
the grid?". The registry's `footprint()` callback delegates to
`footprintFromPins(type, row, col, w, h, props)` which resolves pins via
the canonical resolver in `@dreamer/schemas/component-pins.ts`.

### `areConnected(a, b)`

`breadboard-grid.ts:736`. The rules are simple:

1. Same point.
2. Same row, both cols in `[0..4]` (left terminal strip).
3. Same row, both cols in `[5..9]` (right terminal strip).
4. Same col, col is one of `{-2, -1, 10, 11}` (same power rail).

Anything else is disconnected by default — wires bridge them.

### `resolveNets(components, wires)`

`breadboard-grid.ts:827`. Classic union-find:

1. Seed every terminal-strip row: join col 0..4 into one root, col 5..9 into
   another.
2. Seed every power rail column.
3. For each component, union its footprint points (components bridge across
   the gap or across rows; the resolver doesn't assume anything about a
   component's internal topology beyond "all footprint points share a net").
4. For each wire, union `(fromRow,fromCol)` and `(toRow,toCol)`.
5. For each Arduino-pin wire (`fromRow === -999`), union `(toRow,toCol)` into
   a synthetic node keyed by the pin number.

Result is `Net[]` with `{ id, points, arduinoPins }`. Used by the netlist
builder, the chat route's wire validation, and the inspector's "which pin
is this component on?" hover.

## Component registry

File: `packages/app/src/components/registry.tsx`

A flat array `COMPONENT_REGISTRY: ComponentDefinition[]`. Each entry owns
everything the app needs to know about a component type — rendering, SPICE
behavior, sketch autogen, palette icon.

```ts
type ComponentDefinition = {
  type: ComponentType
  label: string
  category: 'input' | 'output' | 'passive' | 'sensor' | 'display' | ...
  description: string
  defaultPins: Record<string, number | null>
  defaultProperties: Record<string, unknown>
  accentColor: string
  footprint: (row, col, rotation?, properties?) => ComponentFootprint
  paletteIcon: React.ReactNode
  spicePrefix: 'D' | 'R' | 'V' | ...
  buildNetlist: (comp, { footprint, resolveNode }) => NetlistContribution
  computeElectricalState: (comp, { voltageDrop, currentMa }) => ElectricalOutput
  generateSketch: (comp) => { setupLines, loopLines, hasPin } | null
  schematicSymbol: string
  schematicValue: (comp) => string
  customRenderer?: React.FC<RenderProps>
  // ... more fields per component
}
```

### Adding a new component

The header comment at `components/registry.tsx:1` is the canonical recipe.
Short form:

1. **Schema**: add the literal to `componentTypeSchema` in
   `packages/schemas/src/arduino.ts`. This gates it through the wire op
   validator and the board state schema.
2. **Pin resolver**: add a case in `packages/schemas/src/component-pins.ts`
   mapping logical pin names (`anode`, `cathode`, `trig`, `echo`, …) to
   grid offsets. The same resolver is used by the API's `propose_circuit`
   layout engine and by the frontend's footprint computation — so adding
   pins here once keeps them in sync everywhere.
3. **Registry entry**: push a `ComponentDefinition` into `COMPONENT_REGISTRY`.
   Use `footprintFromPins(type, row, col, w, h, props)` so the footprint
   matches the pin resolver by construction.
4. **Renderer** (optional): if the default "rect with dots" look isn't good
   enough, add a React component in `breadboard/component-renderers/` and
   register it as the `customRenderer`.
5. **Simulation behavior**: if the component needs simulated runtime state
   (beyond "pin voltages → LED brightness"), add a peripheral. See
   [SIMULATION.md — adding a new peripheral](./SIMULATION.md#adding-a-new-peripheral).
6. **Inspector** (optional): edit `panels/inspector.tsx` if the component
   has user-adjustable runtime inputs (e.g. ultrasonic distance slider).
7. **Tests**: add a snapshot or behavior test under
   `packages/app/src/components/__tests__/` and
   `packages/app/src/simulator/peripherals/__tests__/`.

### Ground-truth hierarchy

1. `schemas/src/component-pins.ts` — pin name → grid offset.
2. `components/registry.tsx` — everything else about the component.
3. `simulator/peripherals/*.ts` — runtime behavior in the simulator.

If two files disagree about pin positions, **the schema wins**. The
registry's `footprintFromPins` exists specifically to prevent that drift.

## Wires

Wires are a `BoardComponent`-adjacent value; they live in
`BoardState.wires: Record<string, Wire>`. Schema in
`packages/schemas/src/arduino.ts`:

```ts
type Wire = {
  id: string
  type: 'wire'
  fromRow: number   // -999 = virtual Arduino pin
  fromCol: number   // (when fromRow === -999) Arduino pin number
  toRow: number
  toCol: number
  color: string     // always set — see AGENT.md system prompt contract
}
```

The chat/agent path requires `color` on every wire (the system prompt
enforces red=5V, black=GND, distinct colors for signals). The BoardContext
doesn't enforce this — it's an agent-facing convention, not a schema
constraint.

## Rendering

`breadboard/breadboard-canvas.tsx` renders the board using DOM + SVG
overlays. No PixiJS on the breadboard surface. Sub-layers:

- Static board chrome (rails, holes, Arduino outline).
- Wire layer — each `Wire` becomes an SVG path. Wire endpoints snap to
  grid via `gridToPixel`.
- Component layer — either the registry's `customRenderer` or a default
  rect.
- `circuit-overlay.tsx` — draws active current paths and warning indicators
  on top of the board, driven by the live `CircuitAnalysis`.
- `simulation-overlay.tsx` — LED glow, servo arm, LCD text overlay, etc.
  Reads from the board machine's `libraryState`.
- `environment-overlay.tsx` — obstacles (ultrasonic targets), ambient
  light/temperature inspector widgets.

Camera / panning state lives in `breadboard-camera.ts` and
`use-breadboard-camera.ts`. Drag + wire creation use
`use-breadboard-drag.ts` and `use-breadboard-wire.ts`.

## Pin resolution at component placement

`breadboard/component-pin-resolver.ts` exposes a frontend-side helper that
takes a `BoardComponent` and returns the grid-point each logical pin is
currently at. It is a thin wrapper over the schema's `resolveComponentPin`
that also applies rotation.

Use this wherever you need "where is this component's `signal` pin right
now?" — do not compute grid offsets manually; always go through the shared
resolver.
