# Breadboard Visual & Architecture Critique

> Audit date: 2026-04-07

---

## Table of Contents

1. [Rendering Overview](#rendering-overview)
2. [Visual Issues](#visual-issues)
3. [Performance Bottlenecks](#performance-bottlenecks)
4. [Architecture Concerns](#architecture-concerns)
5. [Interaction UX Issues](#interaction-ux-issues)
6. [State Management](#state-management)
7. [Recommendations](#recommendations)

---

## Rendering Overview

The breadboard uses **SVG-based rendering** inside a single `<svg>` element with camera transforms for zoom/pan. The layer stack (back to front):

1. Static board background (grid, holes, power rails, labels)
2. Wire layer
3. Component layer
4. Circuit analysis overlay
5. Drag/ghost previews
6. Wire placement previews
7. Mode indicator text

**11 component renderers** handle type-specific visuals (LED, resistor, button, capacitor, IC, servo, Arduino Uno, buzzer, potentiometer, LCD, generic fallback).

**Key files:**
- `breadboard-canvas.tsx` (~950 lines) — main canvas, interaction, rendering
- `breadboard-grid.ts` (~604 lines) — grid math, coordinate conversion, net resolution
- `breadboard-camera.ts` — zoom/pan singleton
- `breadboard-interaction.ts` — XState interaction mode machine
- `component-renderers/` — 11 type-specific SVG renderers

---

## Visual Issues

### CRITICAL: Mixed Scaling Strategy

Component renderers use an inconsistent mix of hardcoded pixel sizes and grid-relative sizing. This creates visual inconsistency at different zoom levels.

| Component | Sizing Approach | Scales with Zoom? |
|-----------|----------------|-------------------|
| Resistor | Relative to pin distance (`pinB.x - pinA.x * 0.55`) | Yes |
| Button | Relative to footprint (`bottomLeft.y - topLeft.y + 8`) | Partially |
| IC | Relative to HOLE_SPACING | Yes |
| LED | Hardcoded `domeRadius = 7` | No |
| Servo | Hardcoded `bodyHeight = 22` | No |
| Generic fallback | Hardcoded `28x16px` | No |

**Impact:** LEDs and servos appear proportionally wrong at extreme zoom levels. All component sizes should derive from `HOLE_SPACING`.

### CRITICAL: Text Does Not Scale with Zoom

Font sizes are hardcoded throughout:
- Mode indicator: `fontSize={11}` (breadboard-canvas.tsx)
- Pin labels: `fontSize={5}` (pin-label.tsx)
- Component labels: various hardcoded sizes

At 5x zoom, text is illegible. At 0.2x zoom, text dominates the view. Text should either scale inversely with zoom or use a fixed screen-space size.

### HIGH: Wire Layer Always Behind Components

SVG renders in document order. Wires render before components, so wires that pass under a component are:
1. Visually hidden
2. Unclickable (component `<g>` captures the pointer event)

This is a usability problem for dense circuits where wires connect to pins on opposite sides of a component.

### HIGH: Pin Hole Radius Inconsistency

- Breadboard hole: `HOLE_RADIUS = 2.8`
- Arduino pin hit area: `r={8}`
- LED dome: `domeRadius = 7`

No unified scale constant ties component visuals to the breadboard grid. Components don't align perfectly with hole positions.

### MEDIUM: Opacity Stacking

Multiple opacity layers compound unpredictably:
- Ghost preview: `opacity={0.4}`
- Drag ghost: `opacity={0.6}`
- Selection highlight: `opacity={0.5}`

A selected + dragging component reaches `~0.18` effective opacity — nearly invisible. Use a single opacity state per element instead of stacking.

### MEDIUM: Inconsistent Wire Colors

Power/ground detection uses fragile string comparison against multiple color variants:
```
isPower = wire.color === "#ef4444" || wire.color === "#ff0000" || wire.color === "red"
```
Two different reds (`#ef4444` vs `#ff0000`) means wires of the same semantic type can look different.

### LOW: Power Rail Stripe Magic Numbers

Top/bottom power rail Y positions use unexplained `-2` / `+2` pixel offsets. These are brittle and will break if padding or grid constants change.

### LOW: Selection Highlight Renders Behind Component

The selection `<rect>` is inside the same `<g>` as the component and appears before it in source order. The highlight peeks out as a border rather than a clear overlay.

---

## Performance Bottlenecks

### CRITICAL: Inline Event Handlers in ComponentLayer

```tsx
// breadboard-canvas.tsx, ComponentLayer
onClick={(e) => { e.stopPropagation(); onSelect(comp.id); }}
onPointerDown={(e) => { ... onDragStart(comp.id, e); }}
```

New closures are created **per component per render**. This defeats `React.memo` on `ComponentLayer` since every child receives a new function reference. With 50+ components this causes unnecessary re-renders on every state change.

**Fix:** Wrap handlers in `useCallback` or use event delegation on the parent `<g>`.

### HIGH: LED Filter Regenerated Every Render

Each active LED creates a new SVG `<filter>` element with a unique ID and dynamic `stdDeviation`:
```tsx
<filter id={`led-glow-${component.id}`}>
  <feGaussianBlur stdDeviation={glowBlur} />
</filter>
```

Filter creation is expensive for the browser's compositing pipeline. With 10 LEDs, this means 10 filter recalculations per frame.

**Fix:** Share a small set of pre-defined glow filters (e.g., 5 brightness levels) and snap LEDs to the nearest level.

### HIGH: No Throttling on Pointer Move

`handlePointerMove` fires on every pointer event (~60-120Hz). While grid snapping prevents unnecessary state updates when the grid position hasn't changed, during **pan mode** `setCamera()` is called on every pixel of movement, triggering a full SVG re-render each time.

**Fix:** Use `requestAnimationFrame` gating for pan updates. Only apply camera changes once per frame.

### MEDIUM: Duplicate Iteration Over Components

`ComponentLayer` iterates `Object.values(components)` twice:
1. Once to render component `<g>` elements (line ~333)
2. Once to render occupied-hole indicators (line ~384)

**Fix:** Merge into a single pass or lift hole indicators into each renderer.

### MEDIUM: Repeated `gridToPixel()` in Wire Preview

The wire preview section calls `gridToPixel()` 6+ times for the same points in a single render. While `gridToPixel` uses a pre-computed cache (good), the repeated calls still create intermediate objects.

**Fix:** Store computed positions in local variables.

### MEDIUM: Large `components` Object in useEffect Dependencies

```tsx
useEffect(() => {
  window.addEventListener("keydown", handleKeyDown);
  return () => window.removeEventListener("keydown", handleKeyDown);
}, [interactionMode, selectedId, components, send]);
```

Including the full `components` Record in the dependency array causes the keydown listener to be torn down and re-attached on every component change (place, move, delete, property update).

**Fix:** Move `components` access into a ref, or remove it from the dependency array if unused in the handler.

### LOW: String Concatenation for SVG Transforms

```tsx
transform={`rotate(${rot * 90}, ${cx}, ${cy})`}
```

Template strings are allocated per component per render even when rotation hasn't changed. Minor but avoidable with memoization.

---

## Architecture Concerns

### The 950-Line God Component

`breadboard-canvas.tsx` is a single ~950-line file that handles:
- Camera/zoom state
- Interaction mode dispatch
- Drag start/move/end
- Wire drawing (two modes)
- Component placement
- Ghost preview rendering
- Selection management
- Keyboard shortcuts
- SVG layer composition

This violates single-responsibility and makes the file hard to navigate, test, or modify safely. Changes to wire drawing risk breaking drag behavior because they share pointer event handlers.

**Recommendation:** Extract into focused modules:
- `use-breadboard-drag.ts` — drag gesture logic
- `use-breadboard-wire.ts` — wire drawing logic
- `use-breadboard-camera.ts` — zoom/pan hook
- `breadboard-layers.tsx` — SVG layer composition
- `breadboard-canvas.tsx` — orchestrator (~200 lines)

### Mixed State Storage

Interaction state is split across three different systems with no clear boundary:

| Data | Storage | Location |
|------|---------|----------|
| Interaction mode | XState machine | `breadboard-interaction.ts` |
| Ghost position | `useState` | `breadboard-canvas.tsx` |
| Drag state | `useRef` | `breadboard-canvas.tsx` |
| Wire start point | `useRef` | `breadboard-canvas.tsx` |
| Camera | Module singleton | `breadboard-camera.ts` |
| Board data | XState machine | `board-machine.ts` |

Refs are invisible to React's rendering cycle, which is intentional for performance but makes debugging difficult — you can't inspect drag state in React DevTools. The camera singleton is a global mutable that can't be tested in isolation.

### No Per-Component Selectors

Every component renderer receives the full `components` Record via the parent. Moving a single component triggers a re-render of **all** components because the parent's `components` reference changes.

A `useComponent(id)` selector that returns a single component by ID would limit re-renders to the moved component only.

### Circuit Analysis Coupling

`useCircuitAnalysis()` subscribes to `components`, `wires`, and `pinStates`. Any pin state change (which happens continuously during simulation at ~60Hz) re-triggers the circuit solver. The 200ms throttle helps, but during active simulation this still means 5 SPICE analyses per second — each iterating all components and wires.

**Fix:** Separate simulation-driven pin updates from user-driven circuit changes. Only re-analyze on structural changes (add/remove component/wire), not pin state updates.

---

## Interaction UX Issues

### Wire Click Target Too Generous

Wires have a 12px invisible hit area. When wires run close together (common in dense circuits), clicking selects the wrong wire. There's no visual affordance showing which wire will be selected on hover.

**Fix:** Add hover highlighting to wires, and reduce hit area to 8px.

### No Constraints on Off-Board Placement

Components can be placed at negative grid coordinates or beyond row 30. Nothing prevents dragging a component into empty space where it has no electrical connection.

**Fix:** Clamp placement to valid board bounds, or show a warning.

### Two-Click Wire Model Lacks Feedback

The two-click wiring flow (click start hole, click end hole) shows a dashed preview line, but:
- No tooltip explains the mode
- The mode indicator text at the bottom is small (`fontSize={11}`) and easy to miss
- No way to cancel mid-wire except pressing Escape

### No Hover State on Breadboard Holes

Holes don't highlight on hover, making it hard to tell which exact hole the cursor is targeting — especially at lower zoom levels where holes are small.

### Escape Cancels Placement but Doesn't Deselect

Pressing Escape while a component is selected does deselect (via app.tsx global handler), but within the breadboard interaction machine, Escape only cancels the current placement/wiring mode. These are separate systems that happen to both respond to Escape.

---

## State Management

### Snapshot Strategy Gaps

| Action | Auto-Snapshots? | Risk |
|--------|-----------------|------|
| PLACE_COMPONENT | Yes | None |
| REMOVE_COMPONENT | Yes | None |
| ADD_WIRE | Yes | None |
| REMOVE_WIRE | Yes | None |
| UPDATE_SKETCH | Yes | None |
| MOVE_COMPONENT | **No** | Undo skips back to placement, not pre-drag position |
| UPDATE_COMPONENT | **No** | Property changes (e.g., resistance value) not undoable unless caller sends SNAPSHOT |

The caller is responsible for sending `SNAPSHOT` before drag gestures. If any code path forgets this, undo behavior is broken silently — there's no warning or assertion.

**Fix:** Either auto-snapshot on MOVE_COMPONENT (debounced), or add a dev-mode assertion that SNAPSHOT was called within the last N events before MOVE_COMPONENT.

### Full-State History Copies

Each undo snapshot stores a complete copy of `{ components, wires, sketchCode, pinStates, libraryState, customLibraries }`. With 50 components, 30 wires, and a non-trivial sketch, each snapshot is ~2-5KB. At 100 snapshots (the max), this is 200-500KB — acceptable today, but grows linearly with board complexity.

A structural sharing approach (e.g., Immer patches) would reduce memory to only the diff per snapshot.

### Pin State Array Rebuild

`SET_PIN_STATE` rebuilds the entire 20-element `pinStates` array via `.map()` on every pin update. During simulation this fires at 60Hz per active pin. While 20 elements is small, the pattern creates unnecessary GC pressure.

**Fix:** Use index-based update: `pinStates[event.pin] = { ...pinStates[event.pin], ...event.changes }` with a new array wrapper.

---

## Recommendations

### Priority 1 — Fixes That Unblock Usability

1. **Fix wire z-ordering** — Render a clickable wire overlay layer above components, or implement SVG `pointer-events` to allow click-through on component backgrounds
2. **Add SNAPSHOT before drag** — Audit all drag-start code paths to ensure `SNAPSHOT` is sent before `MOVE_COMPONENT`
3. **Constrain placement to board bounds** — Clamp grid coordinates in `pixelToGrid()` or reject out-of-bounds placements

### Priority 2 — Performance Wins

4. **Event delegation for component clicks** — Replace per-component inline handlers with a single handler on the component layer `<g>` that resolves target via `data-id` attribute
5. **Shared LED glow filters** — Pre-define 5 filter levels in a `<defs>` block, snap brightness to nearest level
6. **RAF-gate pan updates** — Wrap `setCamera()` in `requestAnimationFrame` to limit to once per frame
7. **Extract per-component selectors** — `useComponent(id)` hook to prevent all-component re-renders on single-component changes

### Priority 3 — Architecture Refactors

8. ~~**Break up breadboard-canvas.tsx**~~ **DONE** — Extracted into `use-breadboard-camera.ts`, `use-breadboard-drag.ts`, `use-breadboard-wire.ts`. Canvas is now an orchestrator (~350 lines) that delegates to focused hooks.
9. ~~**Unify sizing constants**~~ **DONE** — Added derived constants (`LED_DOME_RADIUS`, `SERVO_BODY_WIDTH/HEIGHT`, `KNOB_RADIUS`, `GENERIC_BODY_WIDTH/HEIGHT`, `LABEL_FONT_SIZE`, `ANNOTATION_FONT_SIZE`) in `breadboard-constants.ts`, all derived from `HOLE_SPACING`. Updated all component renderers.
10. ~~**Consolidate interaction state**~~ **DONE** — Added `gridRow`/`gridCol`, `placingRotation`, `wireStartSet`, `dragStartRow`/`dragStartCol` to the XState interaction machine. Hooks now read from the machine via `useSelector` instead of local `useState`/`useRef`.
11. ~~**Decouple circuit analysis from pin updates**~~ **DONE** — `useCircuitAnalysis` now only re-triggers on structural changes (`components`, `wires`). Pin states are read via a ref at analysis time, eliminating ~60Hz re-analysis during simulation.

### Priority 4 — Visual Polish

12. **Zoom-aware text sizing** — Scale font sizes inversely with camera zoom, or render text in a non-transformed overlay layer
13. **Hover states on holes and wires** — CSS `:hover` on SVG elements or tracked via pointer position
14. **Standardize wire colors** — Use a single color constant per semantic category (power, ground, digital, analog, PWM)
15. **Fix opacity stacking** — Use a single computed opacity per element state (dragging, selected, ghost) rather than multiplying layers
