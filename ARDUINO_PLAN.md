# Arduino Simulator — Execution Plan

> Converting Dreamer (sprite game editor) into an interactive Arduino simulator.
> Work happens on the `arduino-simulator` branch.

---

## Table of Contents

- [Overview](#overview)
- [Architecture Mapping](#architecture-mapping)
- [Risk Register & Design Decisions](#risk-register--design-decisions)
- [Phase 0: Branch Setup & Cleanup](#phase-0-branch-setup--cleanup)
- [Phase 1: Arduino Domain Schemas](#phase-1-arduino-domain-schemas)
- [Phase 2: Board State Machine](#phase-2-board-state-machine)
- [Phase 3: Breadboard Canvas](#phase-3-breadboard-canvas)
- [Phase 4: Arduino Graph Nodes](#phase-4-arduino-graph-nodes)
- [Phase 5: Arduino VM](#phase-5-arduino-vm)
- [Phase 6: Simulation Viewport & Serial Monitor](#phase-6-simulation-viewport--serial-monitor)
- [Phase 7: AI Agent Conversion](#phase-7-ai-agent-conversion)
- [Phase 8: Code Editor Panel](#phase-8-code-editor-panel)
- [Phase 9: Graph-to-Code Generation](#phase-9-graph-to-code-generation)
- [Phase 10: Polish & Persistence](#phase-10-polish--persistence)
- [Phase Dependency Graph](#phase-dependency-graph)

---

## Overview

### What We're Building

An interactive Arduino simulator where users can:

1. **Place components** on a virtual breadboard (LEDs, buttons, resistors, sensors, servos, LCDs, buzzers, potentiometers, wires)
2. **Write Arduino sketches** (C/C++ code) or use a visual block/node editor to generate code
3. **Run the simulation** — execute `setup()` once, `loop()` repeatedly, see components react in real-time
4. **Use AI chat** to get help writing Arduino code, debugging, and placing components
5. **See a serial monitor** output panel
6. **View pin states** in an inspector panel

### Simulation Depth

- Visual simulation (LED on/off/brightness, servo angle, LCD text, button press)
- **NOT** full electrical simulation (no voltage/current/resistance solver)
- Timing simulation (`millis()`, `delay()`, `micros()`)
- Digital and analog pin I/O
- Serial communication (print to monitor)
- Basic interrupt support (`attachInterrupt`)

---

## Architecture Mapping

| Dreamer (Current)              | Arduino Simulator (Target)                      |
| ------------------------------ | ----------------------------------------------- |
| `Sprite`                       | `BoardComponent` (LED, button, resistor, etc.)  |
| `SceneState` (sprites array)   | `BoardState` (components, wires, pin states)     |
| PixiJS Canvas                  | SVG Breadboard Renderer                          |
| Graph node types (sprite, shader, audio...) | Arduino nodes (digital_write, delay, serial_print...) |
| Script sandbox (JS runtime)    | Arduino VM (C-like transpiler: setup/loop)       |
| Entity store                   | Pin state store + component state store          |
| Tilemap                        | Breadboard grid                                  |
| Game viewport                  | Simulation viewport (animated components)        |
| Scene ops (create_entity, etc.)| Board ops (place_component, connect_wire, etc.)  |

### What Gets Reused

- Dockview panel layout (`app.tsx`)
- XState v5 state machines (pattern, not content)
- XyFlow visual node graph (editor infra)
- Elysia API server + routes structure
- Vercel AI SDK chat integration
- Project persistence pattern
- Tailwind + Base UI styling

---

## Risk Register & Design Decisions

Issues identified during plan review, with resolutions baked into each phase.

### DR-1: C++ Transpiler Complexity (HIGH)

**Problem**: A regex-based C++ → JS transpiler is fragile. Real Arduino code has nested scopes, structs, pointer arithmetic, macros with token substitution, templates, and `#include` chains. Regex can't handle this reliably.

**Decision**: Use **[avr8js](https://github.com/nicktomlin/avr8js)** — an existing AVR microcontroller emulator that runs in the browser. It executes compiled AVR machine code, not transpiled JS. Pair it with a **lightweight C-to-JS transpiler as a fallback** for the subset of Arduino C++ that covers 90% of beginner sketches (variable declarations, function calls, control flow, Arduino API). The transpiler is _not_ a full C++ compiler — it handles the "Arduino language" subset only.

**Fallback ladder**:
1. Try avr8js (most accurate, handles real .hex if we add compilation)
2. Fall back to subset transpiler for live-edit/instant-feedback mode
3. Display clear error: "This sketch uses unsupported C++ features" with guidance

**Impact**: Phase 5 is restructured around this decision.

### DR-2: `delay()` Blocking Semantics (HIGH)

**Problem**: Arduino `delay()` is blocking. User code like `while(true) { delay(100); }` or `delay()` inside nested `for` loops is extremely common. Transpiling blocking semantics into cooperative async is a compiler-level problem (coroutines/continuations).

**Decision**: Use a **step-based interpreter that yields after each statement**. The simulation loop executes N statements per frame, with `delay()` implemented as "skip M steps worth of time." This avoids the async/await problem entirely.

**Implementation**:
- Transpiled code is broken into a flat list of "steps" (one per statement)
- A program counter tracks the current step
- `delay(ms)` sets a `resumeAt` timestamp; the loop skips until `millis() >= resumeAt`
- Nested delays/loops work naturally because the PC just pauses
- **Instruction limit**: max 100,000 steps per frame to prevent infinite loop browser freeze

**If using avr8js**: delay is handled natively by the AVR instruction cycle counter — no special handling needed.

### DR-3: SVG Performance (MEDIUM)

**Problem**: 830 breadboard holes + components + wires + glow filters + animations, all SVG with React re-renders, could get sluggish.

**Decision**: Mitigate with:
1. **`React.memo`** on every component renderer — props are simple values, cheap to compare
2. **Breadboard grid is static SVG** rendered once (not reactive to state). Only component overlays and wires re-render.
3. **CSS-only animations** (glow, pulse) via class toggles, not React state
4. **`useMemo`** for wire path calculations
5. **Virtualization**: if > 50 wires, batch into a single `<path>` element
6. **Escape hatch**: if SVG proves too slow after Phase 3, swap the breadboard grid layer to `<canvas>` (keep component overlays as SVG positioned absolutely). The grid is the most expensive part (830 circles) and benefits most from canvas batch rendering.

### DR-4: Phase 0 Cleanup Safety (MEDIUM)

**Problem**: The delete list assumes we know all dead code. Shared utilities, hooks, or types used across boundaries might break silently.

**Decision**: Iterative cleanup guided by `bun run typecheck`:
1. Delete the obvious directories (character, canvas, interaction, ecs, sprite agent, character agent)
2. Run `bun run typecheck` — it will surface every broken import
3. Fix each broken import: delete the dead code, or keep if still used
4. Repeat until clean

The Phase 0 file list is a _starting point_, not a definitive manifest. The checkpoint is what matters.

### DR-5: Graph Codegen and Cycles (MEDIUM)

**Problem**: Topological sort assumes a DAG, but `loop()` is inherently cyclic, and users might create feedback loops in data connections.

**Decision**:
- `setup` and `loop` are **entry point nodes**, not part of the flow graph. They are roots that start separate subgraph walks.
- Within each subgraph (setup's body, loop's body), enforce a DAG — reject cycles with a user-visible error: "Circular connection detected between X and Y"
- `loop()` being called repeatedly is handled by the simulation loop, not the graph topology
- Data-only connections (no flow edges) are evaluated lazily per-read, not walked — no cycle issue

### DR-6: Pin State Model Depth (MEDIUM)

**Problem**: Flat `pinStates[20]` doesn't capture interrupt ISR references, library object state (Servo position, LCD text buffer), or PWM frequency (tone vs analogWrite).

**Decision**: Extend the model:

```ts
pinStateSchema = z.object({
  pin: z.number().int().min(0).max(19),
  mode: pinModeSchema,
  digitalValue: z.number().int().min(0).max(1),
  analogValue: z.number().int().min(0).max(1023),
  pwmValue: z.number().int().min(0).max(255),
  isPwm: z.boolean(),
  pwmFrequency: z.number().default(490),          // Hz, distinguishes tone() vs analogWrite()
  interruptMode: z.enum(["RISING", "FALLING", "CHANGE", "LOW", "NONE"]).default("NONE"),
})

// Separate library object state (not per-pin):
libraryStateSchema = z.object({
  servos: z.record(z.string(), z.object({       // keyed by variable name
    pin: z.number(),
    angle: z.number().min(0).max(180),
  })),
  lcd: z.object({
    pins: z.array(z.number()),
    cols: z.number(),
    rows: z.number(),
    cursorCol: z.number(),
    cursorRow: z.number(),
    textBuffer: z.array(z.string()),             // one string per row
  }).nullable(),
  serialBaud: z.number().default(0),
})
```

ISR function references live in the VM runtime, not the state schema (they're JS closures, not serializable).

### DR-7: VM Error Boundaries (MEDIUM)

**Problem**: User code that throws or infinite-loops will freeze the browser.

**Decision**:
- **Web Worker** for sketch execution. The main thread sends pin state updates; the worker runs the interpreter.
- **Instruction counter**: max 100,000 steps per `loop()` iteration. If exceeded → `RUNTIME_ERROR` event with message "Possible infinite loop detected. Check your code for missing delays or exit conditions."
- **Timeout**: if a single `loop()` call takes > 2 seconds wall time → kill and error
- **Try/catch** around every `loop()` call in the simulation loop. Errors surface in the Serial Monitor as `[ERROR] line N: message`

### DR-8: Wire Net Connectivity (MEDIUM)

**Problem**: Wires are point-to-point, but we need to resolve which component pins are actually electrically connected through the breadboard's internal bus + wires.

**Decision**: Add a **union-find (disjoint set)** connectivity resolver in `breadboard-grid.ts`:

```ts
export function resolveNets(
  components: Record<string, BoardComponent>,
  wires: Record<string, Wire>,
): Net[]
// Net = { id: string; points: GridPoint[]; arduinoPins: number[] }
```

1. Initialize: each breadboard row of 5 holes is one set. Each power rail is one set.
2. For each wire: `union(fromPoint, toPoint)`
3. For each component: map its grid position to component pins, then to the set
4. Result: groups of connected points, each annotated with which Arduino pins are in the group

This runs on every wire/component change (fast — union-find is O(α(n)) ≈ O(1)). The simulation uses nets to determine "is this LED's anode connected to pin 13?"

### DR-9: Testing Strategy

**Problem**: 10 phases, zero tests. The VM/transpiler and codegen are pure-function transforms that are easy to test and easy to break.

**Decision**: Add tests alongside the code, using Bun's test runner (`bun test`).

| Phase | What to Test |
| --- | --- |
| Phase 1 | Schema validation: valid/invalid BoardComponent, Wire, BoardOp roundtrips |
| Phase 2 | Board machine: dispatch events → assert state transitions, undo/redo |
| Phase 3 | Grid logic: `gridToPixel`/`pixelToGrid` roundtrip, `areConnected`, `snapToGrid`, `resolveNets` |
| Phase 5 | **Transpiler**: input C++ → expected JS for each pattern. **VM**: blink sketch pin toggles, delay timing, Serial output, millis accuracy. **Instruction limit**: infinite loop triggers error. |
| Phase 9 | **Codegen**: graph node configs → expected C++ output strings |

Test files live alongside source: `breadboard-grid.test.ts`, `arduino-transpiler.test.ts`, `arduino-vm.test.ts`, `arduino-codegen.test.ts`, `board-machine.test.ts`.

Phases 3, 6, 7, 8 are UI-heavy — manual testing via checkpoints is sufficient. The critical pure-logic phases (1, 2, 3-grid, 5, 9) must have automated tests.

### DR-10: Code Editor Choice

**Problem**: A `<textarea>` with no autocomplete or error squiggles will feel toy-like for an Arduino IDE.

**Decision**: Use **CodeMirror 6** with `@codemirror/lang-cpp`:
- Syntax highlighting for C/C++ out of the box
- Line numbers, bracket matching, code folding
- Lightweight (~100KB gzipped) and tree-shakeable
- Custom linting extension for Arduino-specific errors (undefined `setup`/`loop`, wrong pin numbers)
- Custom autocomplete for Arduino API (`digitalWrite`, `Serial.print`, etc.)

Install: `bun add codemirror @codemirror/lang-cpp @codemirror/view @codemirror/state @codemirror/autocomplete @codemirror/lint`

### DR-11: Phase Ordering Clarity

**Problem**: Phase 7 (AI Agent) is numbered after Phase 5 (VM) but doesn't depend on it.

**Decision**: The phase _numbers_ are a suggested serial order. The dependency graph (at the bottom) is the actual constraint. To make this explicit, each phase header now notes its dependencies. The AI agent (Phase 7) depends only on Phase 1 + 2 and can start as soon as those are done, in parallel with Phases 3-5.

---

## Phase 0: Branch Setup & Cleanup

> **Dependencies**: None

**Objective**: Create the branch and strip all game-engine-specific code.

### 0.1 Create Branch

No need to create addition branch, this peoject is on arduino branch 

### 0.2 Delete Directories (Round 1 — obvious removals)

| Path                                    | Reason                              |
| --------------------------------------- | ----------------------------------- |
| `packages/app/src/character/`           | PixelLab character generation       |
| `packages/app/src/canvas/`              | PixiJS sprite renderer              |
| `packages/app/src/interaction/`         | Sprite drag/resize/rotate           |
| `packages/app/src/ecs/`                 | Entity Component System             |
| `packages/api/src/agents/character/`    | Character image gen agent           |
| `packages/api/src/agents/sprite/`       | Sprite specialist agent             |
| `packages/api/src/routes/character-chat.ts`   | Character chat route          |
| `packages/api/src/routes/character-assets.ts` | Character asset route         |
| `packages/api/src/db/schemas/character-session.ts` | Character persistence  |
| `packages/schemas/src/character.ts`     | Character schemas                   |

### 0.3 Iterative Cleanup (see DR-4)

This is **not** a one-shot delete. After the obvious removals:

1. Run `bun run typecheck`
2. Fix each broken import — either delete the newly-dead code or stub it
3. Repeat until clean
4. Known files that will need import cleanup:

| File                               | Change                                                   |
| ---------------------------------- | -------------------------------------------------------- |
| `packages/app/src/app.tsx`         | Remove `Canvas`, `CharacterPanel` imports + registrations |
| `packages/api/src/index.ts`        | Remove `characterChatRoutes`, `characterAssetRoutes`     |
| `packages/schemas/src/index.ts`    | Remove character schema re-exports                       |
| `packages/app/src/types.ts`        | Gut: remove `Sprite`, `TilemapData`, `SceneState`, `HandleId`, `InteractionMode` |

Other files will surface via typecheck — handle them as they appear.

### 0.4 Remove Unused Dependencies

```bash
# In packages/app/
bun remove pixi.js @pixi/react three @types/three
```

### 0.5 Checkpoint

- [ ] `bun run typecheck` passes (iterative — may take multiple rounds)
- [ ] Dev server starts and shows Dockview layout (empty center panel)
- [ ] Commit: `"chore: strip game-engine code for Arduino simulator"`

---

## Phase 1: Arduino Domain Schemas

> **Dependencies**: Phase 0

**Objective**: Define the core Arduino data model as zod schemas in `packages/schemas`.

### 1.1 New File: `packages/schemas/src/arduino.ts`

```ts
import { z } from "zod"

// ── Component Types ──────────────────────────────────────────────
export const componentTypeSchema = z.enum([
  "led",
  "rgb_led",
  "button",
  "resistor",
  "potentiometer",
  "buzzer",
  "servo",
  "lcd_16x2",
  "seven_segment",
  "photoresistor",
  "temperature_sensor",
  "ultrasonic_sensor",
  "wire",
  "arduino_uno",
])
export type ComponentType = z.infer<typeof componentTypeSchema>

// ── Pin Mode ─────────────────────────────────────────────────────
export const pinModeSchema = z.enum(["INPUT", "OUTPUT", "INPUT_PULLUP", "UNSET"])
export type PinMode = z.infer<typeof pinModeSchema>

// ── Pin State (see DR-6 for rationale) ───────────────────────────
export const interruptModeSchema = z.enum(["RISING", "FALLING", "CHANGE", "LOW", "NONE"])
export type InterruptMode = z.infer<typeof interruptModeSchema>

export const pinStateSchema = z.object({
  pin: z.number().int().min(0).max(19), // 0-13 digital, A0-A5 = 14-19
  mode: pinModeSchema,
  digitalValue: z.number().int().min(0).max(1),
  analogValue: z.number().int().min(0).max(1023),
  pwmValue: z.number().int().min(0).max(255),
  isPwm: z.boolean(),
  pwmFrequency: z.number().default(490),          // Hz — distinguishes tone() vs analogWrite()
  interruptMode: interruptModeSchema.default("NONE"),
})
export type PinState = z.infer<typeof pinStateSchema>

// ── Library Object State (separate from per-pin) ────────────────
export const servoStateSchema = z.object({
  pin: z.number(),
  angle: z.number().min(0).max(180),
})

export const lcdStateSchema = z.object({
  pins: z.array(z.number()),
  cols: z.number(),
  rows: z.number(),
  cursorCol: z.number(),
  cursorRow: z.number(),
  textBuffer: z.array(z.string()), // one string per row
})

export const libraryStateSchema = z.object({
  servos: z.record(z.string(), servoStateSchema),   // keyed by variable name
  lcd: lcdStateSchema.nullable().default(null),
  serialBaud: z.number().default(0),
})
export type LibraryState = z.infer<typeof libraryStateSchema>

// ── Board Component ──────────────────────────────────────────────
export const boardComponentSchema = z.object({
  id: z.string().min(1),
  type: componentTypeSchema,
  name: z.string().min(1),
  x: z.number(),       // breadboard grid column
  y: z.number(),       // breadboard grid row
  rotation: z.number().default(0),
  pins: z.record(z.string(), z.number().nullable()), // component pin name -> Arduino pin number
  properties: z.record(z.string(), z.unknown()),      // type-specific props
})
export type BoardComponent = z.infer<typeof boardComponentSchema>

// ── Wire ─────────────────────────────────────────────────────────
export const wireSchema = z.object({
  id: z.string().min(1),
  fromRow: z.number(),
  fromCol: z.number(),
  toRow: z.number(),
  toCol: z.number(),
  color: z.string().default("#22c55e"),
})
export type Wire = z.infer<typeof wireSchema>

// ── Board State ──────────────────────────────────────────────────
export const boardStateSchema = z.object({
  components: z.record(z.string(), boardComponentSchema),
  wires: z.record(z.string(), wireSchema),
  pinStates: z.array(pinStateSchema),       // 20 pins (0-19)
  libraryState: libraryStateSchema,         // Servo, LCD, Serial state (see DR-6)
  serialOutput: z.array(z.string()),
  sketchCode: z.string(),
})
export type BoardState = z.infer<typeof boardStateSchema>
```

### 1.2 New File: `packages/schemas/src/arduino-graph.ts`

```ts
import { z } from "zod"

export const arduinoNodeTypeSchema = z.enum([
  // Flow control
  "setup", "loop",
  // Digital I/O
  "digital_write", "digital_read", "pin_mode",
  // Analog I/O
  "analog_write", "analog_read",
  // Timing
  "delay", "millis", "micros",
  // Serial
  "serial_begin", "serial_print", "serial_read",
  // Logic
  "if_else", "comparison", "logic_gate",
  // Math
  "math", "map_value", "constrain",
  // Variables
  "variable", "constant",
  // Components (high-level)
  "servo_write", "tone", "lcd_print",
  // Custom
  "code_block",
])
export type ArduinoNodeType = z.infer<typeof arduinoNodeTypeSchema>

export const arduinoPortDataTypeSchema = z.enum([
  "flow",       // execution flow
  "digital",    // HIGH/LOW
  "analog",     // 0-1023
  "pwm",        // 0-255
  "integer",    // int
  "float",      // float
  "string",     // char*/String
  "boolean",    // bool
  "pin",        // pin number reference
  "any",
])
export type ArduinoPortDataType = z.infer<typeof arduinoPortDataTypeSchema>
```

### 1.3 Modify: `packages/schemas/src/ops.ts`

Replace scene op kinds with Arduino board ops:

```ts
export const boardOpKindSchema = z.enum([
  "place_component",
  "remove_component",
  "move_component",
  "update_component",
  "connect_wire",
  "remove_wire",
  "set_pin_mode",
  "update_sketch",
  "update_board_settings",
])

// Discriminated union for each op:
export const boardOpSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("place_component"),
    component: boardComponentSchema,
  }),
  z.object({
    kind: z.literal("remove_component"),
    componentId: z.string(),
  }),
  z.object({
    kind: z.literal("move_component"),
    componentId: z.string(),
    x: z.number(),
    y: z.number(),
  }),
  z.object({
    kind: z.literal("update_component"),
    componentId: z.string(),
    changes: boardComponentSchema.partial(),
  }),
  z.object({
    kind: z.literal("connect_wire"),
    wire: wireSchema,
  }),
  z.object({
    kind: z.literal("remove_wire"),
    wireId: z.string(),
  }),
  z.object({
    kind: z.literal("set_pin_mode"),
    pin: z.number(),
    mode: pinModeSchema,
  }),
  z.object({
    kind: z.literal("update_sketch"),
    code: z.string(),
  }),
  z.object({
    kind: z.literal("update_board_settings"),
    settings: z.record(z.string(), z.unknown()),
  }),
])
export type BoardOp = z.infer<typeof boardOpSchema>
```

### 1.4 Modify: `packages/schemas/src/graph.ts`

- Replace `portDataTypeSchema` with `arduinoPortDataTypeSchema`
- Replace `graphNodeTypeSchema` with `arduinoNodeTypeSchema`
- Rewrite `getDefaultPorts()` to return Arduino-appropriate ports per node type
- Update `COMPATIBLE_TYPES` for Arduino data types

### 1.5 Modify: `packages/schemas/src/project.ts`

- Remove `spriteComponentSchema`, `tilemapComponentSchema`, `physicsBodyComponentSchema`, `cameraComponentSchema`
- Add `boardState: boardStateSchema` to `projectFileSchema`
- Keep `scriptComponentSchema` and `transformComponentSchema`

### 1.6 Modify: `packages/schemas/src/index.ts`

- Remove character exports
- Add Arduino schema exports
- Add board op exports

### 1.7 Checkpoint

- [ ] `bun run typecheck` passes in schemas package
- [ ] All types importable from `@dreamer/schemas`
- [ ] Commit: `"feat: add Arduino domain schemas (components, pins, board ops)"`

---

## Phase 2: Board State Machine

> **Dependencies**: Phase 1

**Objective**: Replace the sprite-based XState scene machine with an Arduino board state machine.

### 2.1 Rename + Rewrite: `scene-machine.ts` → `board-machine.ts`

**File**: `packages/app/src/store/board-machine.ts`

```ts
import { setup, assign } from "xstate"
import type { BoardComponent, Wire, PinState, BoardState } from "@dreamer/schemas"

export type BoardEvent =
  | { type: "PLACE_COMPONENT"; component: BoardComponent }
  | { type: "REMOVE_COMPONENT"; id: string }
  | { type: "UPDATE_COMPONENT"; id: string; changes: Partial<BoardComponent> }
  | { type: "MOVE_COMPONENT"; id: string; x: number; y: number }
  | { type: "SELECT"; id: string | null }
  | { type: "ADD_WIRE"; wire: Wire }
  | { type: "REMOVE_WIRE"; id: string }
  | { type: "SET_PIN_STATE"; pin: number; changes: Partial<PinState> }
  | { type: "UPDATE_SKETCH"; code: string }
  | { type: "APPEND_SERIAL"; text: string }
  | { type: "CLEAR_SERIAL" }
  | { type: "RESET_PINS" }
  | { type: "SNAPSHOT" }
  | { type: "UNDO" }
  | { type: "REDO" }
```

Context holds the full `BoardState` plus:
- `selectedId: string | null`
- `_past: BoardState[]` (undo stack)
- `_future: BoardState[]` (redo stack)

Same XState v5 `setup()` + `assign()` pattern as the existing scene machine.

### 2.2 Rename + Rewrite: `scene-context.ts` → `board-context.ts`

**File**: `packages/app/src/store/board-context.ts`

```ts
import { createActorContext } from "@xstate/react"
import { boardMachine } from "./board-machine"

export const BoardContext = createActorContext(boardMachine)
export const useBoard = BoardContext.useActorRef
export const useBoardSelector = BoardContext.useSelector
```

### 2.3 Rewrite: `packages/app/src/types.ts`

```ts
// Re-export from schemas
export type {
  BoardComponent,
  Wire,
  PinState,
  BoardState,
  ComponentType,
  PinMode,
} from "@dreamer/schemas"

// UI-only types
export type InteractionMode =
  | { type: "idle" }
  | { type: "placing"; componentType: ComponentType }
  | { type: "wiring"; fromRow: number; fromCol: number }
  | { type: "dragging"; componentId: string; offsetX: number; offsetY: number }
  | { type: "selecting" }
```

### 2.4 Modify: `packages/app/src/app.tsx`

- Replace `SceneContext.Provider` with `BoardContext.Provider`
- Remove canvas panel registration
- Keep graph panel, project panel, inspector panel (empty for now)

### 2.5 Checkpoint

- [ ] App compiles and starts
- [ ] Board machine responds to dispatched events (test from console)
- [ ] Undo/redo works
- [ ] Commit: `"feat: board state machine (replaces scene machine)"`

---

## Phase 3: Breadboard Canvas

> **Dependencies**: Phase 2. **Parallel with**: Phases 4, 5.

**Objective**: Build the visual breadboard as SVG — component placement, wiring, zoom/pan.

### 3.1 New Directory Structure

```
packages/app/src/breadboard/
├── breadboard-panel.tsx          # Dockview panel wrapper
├── breadboard-canvas.tsx         # Main SVG canvas
├── breadboard-grid.ts            # Grid logic (830-point layout)
├── breadboard-camera.ts          # Zoom/pan state
├── breadboard-interaction.ts     # XState interaction machine
├── component-palette.tsx         # Draggable component sidebar
└── component-renderers/
    ├── index.tsx                  # Component type → renderer map
    ├── led-renderer.tsx           # LED: circle + glow
    ├── button-renderer.tsx        # Button: clickable rect
    ├── resistor-renderer.tsx      # Resistor: color bands
    ├── servo-renderer.tsx         # Servo: angle arc
    ├── buzzer-renderer.tsx        # Buzzer: circle + waves
    ├── potentiometer-renderer.tsx # Pot: rotary dial
    ├── lcd-renderer.tsx           # LCD: 16x2 text display
    ├── arduino-uno-renderer.tsx   # Board outline + pin headers
    └── wire-renderer.tsx          # Colored path between points
```

### 3.2 `breadboard-grid.ts` — Grid Logic

Standard breadboard layout:
- **Terminal strips**: 63 rows × 5 columns × 2 sides (center gap)
- **Power rails**: 2 rails × 2 sides (+ and -)
- **Grid coordinate system**: `(row, col)` → `(pixelX, pixelY)`
- **Internal connections**: 5 holes per row are connected; power rails connected along their length
- **Snap-to-grid**: nearest valid grid point from mouse coordinates

```ts
export type GridPoint = { row: number; col: number }
export type Net = { id: string; points: GridPoint[]; arduinoPins: number[] }

export function gridToPixel(point: GridPoint): { x: number; y: number }
export function pixelToGrid(x: number, y: number): GridPoint
export function snapToGrid(x: number, y: number): GridPoint
export function areConnected(a: GridPoint, b: GridPoint): boolean

// Wire net connectivity resolver (see DR-8)
// Uses union-find to determine which component pins are electrically connected
// through the breadboard's internal bus + wires. Runs on every wire/component change.
export function resolveNets(
  components: Record<string, BoardComponent>,
  wires: Record<string, Wire>,
): Net[]
```

**Must be unit tested** (see DR-9): `gridToPixel`/`pixelToGrid` roundtrip, `areConnected` for same-row vs cross-gap, `resolveNets` with sample circuits.

### 3.3 `breadboard-canvas.tsx` — SVG Renderer

- Renders the breadboard background (rows of holes)
- Renders placed components at their grid positions using type-specific renderers
- Renders wires as SVG `<path>` elements
- Handles zoom/pan via CSS `transform` on the SVG group
- Mouse handlers: click to select, drag to move, right-click context menu

**Performance strategy (see DR-3)**:
- Breadboard grid (830 holes) is a **static SVG layer** rendered once, not reactive to state
- Every component renderer wrapped in `React.memo` — props are simple values
- Wire paths computed via `useMemo`, batched into a single `<path>` if > 50 wires
- Glow/pulse animations use CSS class toggles, not React state
- If SVG proves too slow: swap grid layer to `<canvas>`, keep component overlays as positioned SVG

### 3.4 `breadboard-interaction.ts` — Interaction State Machine

```
States: idle, placing, wiring, dragging
Events: START_PLACE, START_WIRE, START_DRAG, POINTER_MOVE, POINTER_UP, CANCEL
```

- **Placing**: click component in palette → hover on board → click to place
- **Wiring**: click a pin/hole → drag to another pin/hole → creates wire
- **Dragging**: click existing component → drag to new grid position

### 3.5 `component-palette.tsx`

Sidebar panel listing all available component types with icons/labels:
- Arduino Uno
- LED (red, green, blue, yellow, white)
- Button
- Resistor (220Ω, 1KΩ, 10KΩ)
- Potentiometer
- Servo
- Buzzer
- LCD 16×2
- Photoresistor
- Temperature Sensor
- Ultrasonic Sensor

Drag from palette → drop on breadboard.

### 3.6 Component Renderers

Each renderer is a React component receiving `BoardComponent` + `PinState[]`:

| Renderer | Visual |
| --- | --- |
| `LedRenderer` | Circle with fill color. Glow filter when pin is HIGH. Brightness = PWM/255. |
| `ButtonRenderer` | Rounded rect. Darkens on hover. On click → sets input pin HIGH (mousedown) / LOW (mouseup). |
| `ResistorRenderer` | Rect with 4 color bands based on resistance value. |
| `ServoRenderer` | Circle + line arm. Arm angle = current PWM mapped to 0-180°. |
| `BuzzerRenderer` | Circle. Animated rings when `tone()` active. |
| `PotentiometerRenderer` | Circle with rotatable indicator. Drag rotates → sets analog value 0-1023. |
| `LcdRenderer` | Rectangle with 16×2 monospace text grid. Shows text from `lcd.print()` calls. |
| `ArduinoUnoRenderer` | Simplified board shape. Pin headers labeled D0-D13, A0-A5, 5V, 3.3V, GND, VIN. |
| `WireRenderer` | SVG `<path>` with rounded corners between two grid points. Color-coded. |

### 3.7 Modify: `packages/app/src/app.tsx`

Register `BreadboardPanel` in Dockview. Replace the old canvas slot.

### 3.8 Checkpoint

- [ ] Breadboard renders with grid of holes
- [ ] Zoom/pan works (scroll + space-drag)
- [ ] Component palette visible in sidebar
- [ ] Can drag components from palette onto board (snap to grid)
- [ ] Wires can be drawn between pins/holes
- [ ] Arduino Uno shows labeled pin headers
- [ ] Selecting a component highlights it
- [ ] Commit: `"feat: breadboard canvas with component placement and wiring"`

---

## Phase 4: Arduino Graph Nodes

> **Dependencies**: Phase 1 (schemas). **Parallel with**: Phases 3, 5.

**Objective**: Replace all game-engine graph node types with Arduino nodes. Keep the XyFlow editor infrastructure.

### 4.1 Modify: `packages/app/src/graph/node-factory.ts`

New `NODE_DEFAULTS`:

```ts
const NODE_DEFAULTS: Record<ArduinoNodeType, { width: number; height: number; name: string }> = {
  setup:          { width: 160, height: 70,  name: "setup()" },
  loop:           { width: 160, height: 70,  name: "loop()" },
  digital_write:  { width: 180, height: 100, name: "digitalWrite" },
  digital_read:   { width: 180, height: 100, name: "digitalRead" },
  analog_write:   { width: 180, height: 100, name: "analogWrite" },
  analog_read:    { width: 180, height: 100, name: "analogRead" },
  pin_mode:       { width: 180, height: 90,  name: "pinMode" },
  delay:          { width: 140, height: 80,  name: "delay" },
  millis:         { width: 140, height: 70,  name: "millis()" },
  micros:         { width: 140, height: 70,  name: "micros()" },
  serial_begin:   { width: 180, height: 80,  name: "Serial.begin" },
  serial_print:   { width: 200, height: 100, name: "Serial.print" },
  serial_read:    { width: 180, height: 90,  name: "Serial.read" },
  if_else:        { width: 180, height: 120, name: "if / else" },
  comparison:     { width: 160, height: 90,  name: "Compare" },
  logic_gate:     { width: 140, height: 80,  name: "Logic Gate" },
  math:           { width: 160, height: 90,  name: "Math" },
  map_value:      { width: 180, height: 100, name: "map()" },
  constrain:      { width: 180, height: 90,  name: "constrain()" },
  variable:       { width: 160, height: 90,  name: "Variable" },
  constant:       { width: 140, height: 70,  name: "Constant" },
  servo_write:    { width: 180, height: 100, name: "Servo.write" },
  tone:           { width: 180, height: 100, name: "tone()" },
  lcd_print:      { width: 200, height: 110, name: "LCD Print" },
  code_block:     { width: 240, height: 160, name: "Code Block" },
}
```

### 4.2 Default Ports per Node Type

Examples:

| Node | Input Ports | Output Ports |
| --- | --- | --- |
| `setup` | — | `flow_out` (flow) |
| `loop` | — | `flow_out` (flow) |
| `digital_write` | `flow_in` (flow), `pin` (pin), `value` (digital) | `flow_out` (flow) |
| `digital_read` | `pin` (pin) | `value` (digital) |
| `analog_read` | `pin` (pin) | `value` (analog) |
| `delay` | `flow_in` (flow), `ms` (integer) | `flow_out` (flow) |
| `serial_print` | `flow_in` (flow), `value` (any) | `flow_out` (flow) |
| `if_else` | `flow_in` (flow), `condition` (boolean) | `flow_true` (flow), `flow_false` (flow) |
| `comparison` | `a` (any), `b` (any) | `result` (boolean) |
| `variable` | `set` (any) | `get` (any) |
| `constant` | — | `value` (any) |
| `code_block` | `flow_in` (flow) | `flow_out` (flow) |

### 4.3 Replace Node Content Files

**Delete** all files in `packages/app/src/graph/node-content/`.

**Create** new content components:

```
packages/app/src/graph/node-content/
├── index.tsx                    # type → component map
├── setup-content.tsx            # "Runs once at start" label
├── loop-content.tsx             # "Runs repeatedly" label
├── digital-write-content.tsx    # Pin number input + HIGH/LOW toggle
├── digital-read-content.tsx     # Pin number input
├── analog-write-content.tsx     # Pin + value (0-255) input
├── analog-read-content.tsx      # Pin input (A0-A5 dropdown)
├── pin-mode-content.tsx         # Pin + mode dropdown
├── delay-content.tsx            # Milliseconds number input
├── millis-content.tsx           # No inputs, just label
├── serial-begin-content.tsx     # Baud rate input (default 9600)
├── serial-print-content.tsx     # Text/value input + newline toggle
├── if-else-content.tsx          # Condition display
├── comparison-content.tsx       # Operator dropdown (==, !=, <, >, <=, >=)
├── logic-gate-content.tsx       # Gate type dropdown (AND, OR, NOT, XOR)
├── math-content.tsx             # Operation dropdown (+, -, *, /, %)
├── map-value-content.tsx        # fromLow, fromHigh, toLow, toHigh inputs
├── variable-content.tsx         # Name, type (int/float/bool/String), initial value
├── constant-content.tsx         # Value + type
├── servo-write-content.tsx      # Pin + angle (0-180) slider
├── tone-content.tsx             # Pin + frequency + duration inputs
├── lcd-print-content.tsx        # Row, col, text inputs
└── code-block-content.tsx       # Inline code editor textarea
```

### 4.4 Modify: `packages/app/src/graph/graph-machine.ts`

Update `NODE_SIZE` record with new Arduino node types and dimensions.

### 4.5 Modify: `packages/app/src/graph/graph-panel.tsx`

Update the node creation palette/search to show Arduino node types.

### 4.6 Checkpoint

- [ ] Graph editor shows Arduino node types in search (Ctrl+K)
- [ ] Can create `setup → pin_mode → digital_write` chains
- [ ] Nodes have correct ports with correct data types
- [ ] Can connect flow ports and data ports
- [ ] Node content renders correct inputs per type
- [ ] Commit: `"feat: Arduino graph nodes (23 node types replacing game nodes)"`

---

## Phase 5: Arduino VM

> **Dependencies**: Phase 1 (schemas), Phase 2 (board machine)
>
> **Key design decisions**: DR-1 (transpiler approach), DR-2 (delay semantics), DR-7 (error boundaries)

**Objective**: Execute Arduino sketches in the browser. Two execution modes: a step-based JS interpreter for instant feedback, with avr8js as a future upgrade path for full accuracy.

### 5.1 New Directory Structure

```
packages/app/src/simulator/
├── arduino-transpiler.ts       # C++ subset → JS step list
├── arduino-stdlib.ts           # Injected Arduino API implementations
├── arduino-vm.ts               # Core VM (step-based interpreter)
├── simulation-worker.ts        # Web Worker wrapper (see DR-7)
├── simulation-loop.ts          # setup() once, loop() repeated
├── simulation-machine.ts       # XState: stopped/compiling/running/paused/error
├── component-behavior.ts       # Pin state → component visual updates
└── __tests__/
    ├── arduino-transpiler.test.ts
    └── arduino-vm.test.ts
```

Install: `bun add avr8js` (for future Phase 5b upgrade)

### 5.2 `arduino-transpiler.ts` — C++ Subset → JS Step List

**This is NOT a full C++ parser** (see DR-1). It handles the "Arduino language" subset that covers ~90% of beginner sketches. Unsupported features produce a clear error message.

**Supported patterns**:

| C++ Pattern | JS Output |
| --- | --- |
| `int x = 5;` | `let x = 5;` |
| `float y = 1.5;` | `let y = 1.5;` |
| `bool flag = true;` | `let flag = true;` |
| `String msg = "hi";` | `let msg = "hi";` |
| `unsigned long t;` | `let t;` |
| `byte b = 0xFF;` | `let b = 0xFF;` |
| `void setup() { ... }` | `function setup() { ... }` |
| `void loop() { ... }` | `function loop() { ... }` |
| `#define LED_PIN 13` | `const LED_PIN = 13;` |
| `for (int i=0; ...)` | `for (let i=0; ...)` |
| `HIGH` / `LOW` | `1` / `0` |
| `INPUT` / `OUTPUT` / `INPUT_PULLUP` | `0` / `1` / `2` |

**Explicitly NOT supported** (returns error with guidance):
- `#include` with transitive dependencies (only `<Servo.h>`, `<LiquidCrystal.h>` recognized — mapped to injected globals)
- Pointer arithmetic, struct/class definitions, operator overloading
- Templates, namespaces, multiple files
- Complex macros (only `#define NAME value` constants)

**Step-based output** (see DR-2): The transpiler produces a flat array of executable steps, not a single JS function. Each statement becomes one step. This enables the VM to yield between statements for delay handling and instruction counting.

```ts
export type Step =
  | { type: "expression"; code: string }
  | { type: "delay"; ms: string }           // expression that evaluates to ms
  | { type: "branch"; condition: string; thenSteps: Step[]; elseSteps: Step[] }
  | { type: "loop"; init: string; condition: string; update: string; body: Step[] }

export function transpile(arduinoCode: string): {
  success: boolean
  globals: string          // global variable declarations as JS
  setupSteps: Step[]
  loopSteps: Step[]
  error?: { line: number; message: string }
}
```

**Must be unit tested** (see DR-9): each C++ pattern → expected Step output, plus unsupported feature → clear error message.

### 5.3 `arduino-stdlib.ts` — Arduino API Implementations

All Arduino API functions implemented in JS, injected as globals into the VM sandbox:

| Category | Functions |
| --- | --- |
| Digital I/O | `pinMode(pin, mode)`, `digitalWrite(pin, val)`, `digitalRead(pin)` |
| Analog I/O | `analogWrite(pin, val)`, `analogRead(pin)` |
| Timing | `delay(ms)` _(special — handled by VM, not a real function)_, `delayMicroseconds(us)`, `millis()`, `micros()` |
| Serial | `Serial.begin(baud)`, `Serial.print(val)`, `Serial.println(val)`, `Serial.available()`, `Serial.read()` |
| Sound | `tone(pin, freq, dur)`, `noTone(pin)` |
| Math | `map(val, fL, fH, tL, tH)`, `constrain(val, lo, hi)`, `min()`, `max()`, `abs()`, `pow()`, `sqrt()` |
| Servo | `Servo` class: `.attach(pin)`, `.write(angle)`, `.read()` — updates `libraryState.servos` |
| LCD | `LiquidCrystal` class: `.begin(cols, rows)`, `.setCursor(col, row)`, `.print(text)`, `.clear()` — updates `libraryState.lcd` |
| Interrupts | `attachInterrupt(pin, ISR, mode)`, `detachInterrupt(pin)` — ISR references stored in VM runtime (not serializable) |
| Constants | `HIGH=1`, `LOW=0`, `INPUT=0`, `OUTPUT=1`, `INPUT_PULLUP=2`, `LED_BUILTIN=13`, `A0-A5=14-19` |

### 5.4 `arduino-vm.ts` — Step-Based Interpreter

```ts
export type ArduinoVMCallbacks = {
  onPinWrite: (pin: number, value: number, isPwm: boolean) => void
  onSerialPrint: (text: string) => void
  onTone: (pin: number, frequency: number, duration?: number) => void
  onLibraryStateChange: (state: LibraryState) => void
}

export type ArduinoVM = {
  loadSketch: (code: string) => { success: boolean; error?: string }
  runSetup: () => void
  runLoopFrame: (budgetMs: number) => void  // execute steps up to budget
  digitalRead: (pin: number) => number
  analogRead: (pin: number) => number
  getMillis: () => number
  getMicros: () => number
  setExternalPinState: (pin: number, value: number) => void
  reset: () => void
  isDelaying: () => boolean        // true if waiting for delay() to expire
  getStepCount: () => number       // for instruction limit monitoring
}
```

**delay() implementation** (see DR-2):
- `delay(ms)` does NOT use async/await
- When the VM encounters a `delay` step, it sets `resumeAt = currentMillis + ms`
- On each frame, the VM checks `if (millis() < resumeAt) return` — skips execution until time passes
- Nested delays in loops work naturally: the program counter stays at the delay step until time expires, then advances
- `delayMicroseconds()` uses the same mechanism with microsecond precision

**Instruction limit** (see DR-7):
- Max **100,000 steps per `runLoopFrame()` call**
- If exceeded → throw `InstructionLimitError` with message: "Possible infinite loop detected. Check your code for missing delays or exit conditions."

### 5.5 `simulation-worker.ts` — Web Worker Wrapper (see DR-7)

The VM runs inside a **Web Worker** to prevent browser freezes:

```ts
// Main thread API
export type SimulationWorker = {
  postSketch: (code: string) => void
  start: () => void
  pause: () => void
  stop: () => void
  setExternalPin: (pin: number, value: number) => void
  onPinUpdate: (callback: (pin: number, value: number, isPwm: boolean) => void) => void
  onSerialOutput: (callback: (text: string) => void) => void
  onError: (callback: (error: string) => void) => void
  onLibraryState: (callback: (state: LibraryState) => void) => void
  terminate: () => void
}
```

**Safety**:
- Worker has a **2-second timeout** per `loop()` iteration. If exceeded → terminate worker, fire `RUNTIME_ERROR`
- All communication via `postMessage` — main thread never blocks
- `try/catch` in the worker around every step execution. Errors posted back as structured messages with line numbers.

### 5.6 `simulation-loop.ts`

Runs on the main thread, orchestrates the worker:

1. On PLAY: send sketch to worker, worker calls `setup()`, then starts `loop()` cycle
2. Each frame (~16ms): worker runs N loop steps, posts pin state diffs back
3. Main thread receives diffs → dispatches `SET_PIN_STATE` / `APPEND_SERIAL` to board machine
4. On PAUSE: tell worker to stop loop cycle (keeps state)
5. On STOP: terminate worker, reset board machine pin states

### 5.7 `simulation-machine.ts` — XState Machine

```
States:
  stopped → (COMPILE) → compiling → (SUCCESS) → running
  running → (PAUSE) → paused → (RESUME) → running
  running → (STOP) → stopped
  compiling → (COMPILE_ERROR) → error
  running → (RUNTIME_ERROR) → error
  error → (STOP) → stopped
  paused → (STOP) → stopped
```

### 5.8 `component-behavior.ts`

Maps pin state changes to component visual updates:

| Component | Pin Behavior |
| --- | --- |
| LED | Pin HIGH or PWM > 0 → on. Brightness = `pwmValue / 255`. |
| RGB LED | 3 pins (R/G/B), each PWM → color mix. |
| Servo | Reads from `libraryState.servos[name].angle`. |
| Buzzer | `tone()` active → show animated waves. Web Audio oscillator for sound. |
| LCD | Reads from `libraryState.lcd.textBuffer`. |
| Button | User click → set input pin HIGH (mousedown), LOW (mouseup). |
| Potentiometer | User drag rotation → set analog input value 0-1023. |
| Photoresistor | Slider or ambient value → analog input 0-1023. |
| Temperature Sensor | Slider → analog input mapping to temperature. |

### 5.9 Future: avr8js Upgrade (Phase 5b, optional)

If the subset transpiler proves too limiting, swap the execution backend to **avr8js**:
1. Add an Arduino-to-hex compilation step (via a WASM build of arduino-cli, or a server-side compile endpoint)
2. Load the .hex into avr8js's AVR CPU emulator
3. avr8js handles delay(), interrupts, and timing natively via instruction cycle counting
4. Keep the same `ArduinoVMCallbacks` interface — the rest of the system doesn't change

This is a drop-in replacement because the VM interface is the same. The transpiler approach ships first for instant feedback; avr8js can be added later for accuracy.

### 5.10 Checkpoint

- [ ] Blink sketch compiles and runs:
  ```cpp
  void setup() { pinMode(13, OUTPUT); }
  void loop() { digitalWrite(13, HIGH); delay(1000); digitalWrite(13, LOW); delay(1000); }
  ```
- [ ] Pin 13 toggles in board state every 1 second
- [ ] `Serial.println("Hello")` appears in serial output
- [ ] `millis()` returns correct elapsed time
- [ ] `delay()` timing is accurate (including nested in loops)
- [ ] Infinite loop triggers error after 100K steps (not browser freeze)
- [ ] Unsupported C++ feature shows clear error message
- [ ] Unit tests pass for transpiler and VM
- [ ] Commit: `"feat: Arduino VM with step-based interpreter and Web Worker"`

---

## Phase 6: Simulation Viewport & Serial Monitor

> **Dependencies**: Phase 3 (breadboard) + Phase 5 (VM)

**Objective**: Live visual feedback on breadboard + Serial Monitor + Pin Inspector panels.

### 6.1 New File: `packages/app/src/breadboard/simulation-overlay.tsx`

Overlay on the breadboard SVG that reads from simulation state:
- LEDs: CSS `filter: drop-shadow()` glow, opacity based on PWM
- Servos: rotating arm via CSS `transform: rotate()`
- LCD: text rendered in monospace in the LCD rect
- Buttons: visual press state on mousedown
- Active wires: subtle pulse animation showing current flow direction

### 6.2 New File: `packages/app/src/panels/serial-monitor.tsx`

Dockview panel:
- Scrolling `<pre>` area for serial output
- Input field at bottom for `Serial.read()` input
- Header bar: baud rate display, clear button, auto-scroll toggle, timestamp toggle
- Keyboard: Enter sends input line

```tsx
// Reads from board state
const serialOutput = useBoardSelector(state => state.context.serialOutput)
```

### 6.3 New File: `packages/app/src/panels/pin-inspector.tsx`

Dockview panel — table of all 20 pins:

| Pin | Mode | Digital | Analog | PWM |
| --- | --- | --- | --- | --- |
| D0 | INPUT | LOW | — | — |
| D1 | OUTPUT | HIGH | — | — |
| ... | ... | ... | ... | ... |
| D13 | OUTPUT | HIGH | — | 128 |
| A0 | INPUT | — | 512 | — |
| ... | ... | ... | ... | ... |

Color coding: green = HIGH, gray = LOW, blue = PWM active. Live-updating during simulation.

### 6.4 Modify: `packages/app/src/panels/inspector.tsx`

Replace sprite inspector with component inspector:
- Shows selected component's type, name, grid position
- Editable pin assignments (dropdown per component pin → Arduino pin)
- Type-specific property editors (resistance value, LED color, etc.)

### 6.5 Modify: `packages/app/src/app.tsx`

Update Dockview default layout:

```
┌──────────┬──────────────────────────┬──────────────────┬──────────┐
│          │                          │                  │          │
│ Project  │     Breadboard           │   Graph Editor   │Inspector │
│ Panel    │                          │                  │          │
│          │                          │                  │  + Pin   │
│  (15%)   │       (35%)              │     (35%)        │Inspector │
│          │                          │                  │  (15%)   │
│          ├──────────────────────────┤                  │          │
│          │     Serial Monitor       │                  │          │
│          │       (bottom)           │                  │          │
└──────────┴──────────────────────────┴──────────────────┴──────────┘
```

### 6.6 Modify: `packages/app/src/toolbar/play-controls.tsx`

- Wire Play/Pause/Stop to simulation machine events
- Add Compile button (shows compile errors inline)
- Add speed control (1x, 2x, 0.5x simulation speed)

### 6.7 Checkpoint

- [ ] LED blinks visually on breadboard during blink simulation
- [ ] Serial Monitor shows `Serial.println` output in real time
- [ ] Pin Inspector shows live HIGH/LOW/PWM values
- [ ] Component inspector shows properties of selected component
- [ ] Play/Pause/Stop controls work
- [ ] Button component responds to mouse clicks during simulation
- [ ] Commit: `"feat: simulation viewport, serial monitor, pin inspector"`

---

## Phase 7: AI Agent Conversion

> **Dependencies**: Phase 1 (schemas) + Phase 2 (board ops). **Does NOT need** Phase 5 (VM).
> Can start as soon as Phase 2 is done, in parallel with Phases 3-5 (see DR-11).

**Objective**: Make the AI agent understand Arduino circuits and code instead of game sprites.

### 7.1 Rewrite: `packages/api/src/agents/core/agent.ts`

New system prompt (key sections):

```
You are an Arduino simulator assistant. You help users:
- Place components on a virtual breadboard
- Write Arduino sketches (C/C++)
- Debug code and circuit issues
- Learn Arduino concepts

You have tools to manipulate the virtual breadboard and write Arduino code.

Component types available: led, rgb_led, button, resistor, potentiometer,
buzzer, servo, lcd_16x2, seven_segment, photoresistor, temperature_sensor,
ultrasonic_sensor

Arduino Uno pin layout:
- Digital: D0-D13 (D3,D5,D6,D9,D10,D11 support PWM)
- Analog: A0-A5
- Power: 5V, 3.3V, GND, VIN

When placing components, always:
1. Place the Arduino Uno first if not present
2. Connect components to appropriate pins
3. Add necessary resistors (220Ω for LEDs, 10KΩ pull-down for buttons)
4. Write the sketch code to drive the circuit
```

### 7.2 Rewrite: `packages/api/src/agents/core/tools.ts`

| Tool | Description |
| --- | --- |
| `get_board_state` | Read current components, wires, pin states, sketch code |
| `place_component` | Place a component on the breadboard (type, position, pin mappings, properties) |
| `remove_component` | Remove a component by ID |
| `move_component` | Reposition a component on the grid |
| `connect_wire` | Connect two breadboard points with a wire |
| `remove_wire` | Remove a wire |
| `update_sketch` | Write or replace the Arduino sketch code |
| `get_sketch` | Read the current sketch code |
| `run_simulation` | Trigger compile + start simulation |
| `delegate_to_graph_agent` | Delegate visual programming tasks |
| `delegate_to_circuit_agent` | Delegate circuit design tasks |

### 7.3 Rewrite: `packages/api/src/agents/graph/agent.ts`

Update system prompt to describe Arduino node types and how they map to Arduino code.

### 7.4 Delete

- `packages/api/src/agents/sprite/` (entire directory)
- `packages/api/src/agents/coding/` (entire directory)

### 7.5 New: `packages/api/src/agents/circuit/`

**`agent.ts`** — Circuit design specialist:
- Knows common Arduino circuits (LED blink, traffic light, servo sweep, LCD hello world, ultrasonic distance, temperature monitor)
- Validates pin assignments (PWM-capable pins, interrupt pins, analog-only pins)
- Suggests appropriate resistor values

**`tools.ts`**:
- `suggest_circuit(description)` — returns component list + wiring + sketch
- `validate_wiring()` — checks for common errors (missing ground, wrong pin types, missing resistors)
- `list_available_components()` — returns all component types with pin descriptions

### 7.6 Modify: `packages/api/src/agents/types.ts`

```ts
export type AgentKind = "core" | "graph" | "circuit"
// Remove: "sprite", "coding", "character"
```

### 7.7 Modify: `packages/api/src/db/schemas/agent.ts`

Update `agentKindSchema` enum values.

### 7.8 Modify: `packages/api/src/routes/chat.ts`

- Update op kinds for board ops
- Route board ops through project-repo's board state handler

### 7.9 Modify: `packages/app/src/chat/apply-ops.ts`

Translate board ops to `BoardEvent` dispatches:

```ts
function applyBoardOp(op: BoardOp, send: (event: BoardEvent) => void) {
  switch (op.kind) {
    case "place_component":
      send({ type: "PLACE_COMPONENT", component: op.component })
      break
    case "remove_component":
      send({ type: "REMOVE_COMPONENT", id: op.componentId })
      break
    case "connect_wire":
      send({ type: "ADD_WIRE", wire: op.wire })
      break
    case "update_sketch":
      send({ type: "UPDATE_SKETCH", code: op.code })
      break
    // ... etc
  }
}
```

### 7.10 Modify: `packages/app/src/toolbar/use-chat-messages.ts`

Update `onData` handler to dispatch board events instead of scene events.

### 7.11 Checkpoint

- [ ] Chat: "Place an LED on pin 13" → agent places LED + resistor + wires
- [ ] Chat: "Make it blink" → agent writes blink sketch
- [ ] Chat: "Add a button on pin 2 to toggle the LED" → agent updates circuit + code
- [ ] Chat: "What does analogRead do?" → agent explains clearly
- [ ] Simulation runs the generated code correctly
- [ ] Commit: `"feat: AI agent for Arduino (circuit + code assistance)"`

---

## Phase 8: Code Editor Panel

> **Dependencies**: Phase 2 (board machine). **Parallel with**: Phase 6, 7.

**Objective**: Dedicated Arduino sketch editor with syntax highlighting.

### 8.1 New Directory Structure

```
packages/app/src/editor/
├── sketch-editor.tsx           # Dockview panel
└── arduino-syntax.ts           # Keyword list + highlighting rules
```

### 8.2 Install CodeMirror 6 (see DR-10)

```bash
bun add codemirror @codemirror/lang-cpp @codemirror/view @codemirror/state @codemirror/autocomplete @codemirror/lint
```

### 8.3 `sketch-editor.tsx`

**CodeMirror 6** with `@codemirror/lang-cpp` for C++ syntax highlighting:
- Line numbers, bracket matching, code folding out of the box
- Toolbar: **Compile** button, **Upload & Run** button, **Format** button
- Compile errors shown via `@codemirror/lint` extension (red underline + error gutter)
- Custom `@codemirror/autocomplete` source for Arduino API (`digitalWrite`, `Serial.print`, etc.)
- Bidirectional sync with `boardState.sketchCode`:
  - On edit → dispatch `UPDATE_SKETCH` to board machine
  - On external change (AI agent writes code) → update editor state via `EditorView.dispatch`
- Theme: dark mode matching the rest of the app

### 8.4 `arduino-completions.ts`

Arduino-specific autocomplete source for CodeMirror:

```ts
export const ARDUINO_COMPLETIONS = [
  // Functions
  { label: "pinMode", type: "function", detail: "(pin, mode)", info: "Configures a pin as INPUT or OUTPUT" },
  { label: "digitalWrite", type: "function", detail: "(pin, value)", info: "Write HIGH or LOW to a digital pin" },
  { label: "digitalRead", type: "function", detail: "(pin)", info: "Read HIGH or LOW from a digital pin" },
  { label: "analogWrite", type: "function", detail: "(pin, value)", info: "Write PWM value (0-255) to a pin" },
  { label: "analogRead", type: "function", detail: "(pin)", info: "Read analog value (0-1023) from a pin" },
  { label: "delay", type: "function", detail: "(ms)", info: "Pause execution for milliseconds" },
  // ... Serial, Servo, LCD, math, etc.

  // Constants
  { label: "HIGH", type: "constant", detail: "1" },
  { label: "LOW", type: "constant", detail: "0" },
  { label: "INPUT", type: "constant", detail: "Pin mode" },
  { label: "OUTPUT", type: "constant", detail: "Pin mode" },
  { label: "LED_BUILTIN", type: "constant", detail: "13" },
  // ... A0-A5, INPUT_PULLUP, etc.
]
```

### 8.5 `arduino-linter.ts`

Custom lint source that catches Arduino-specific errors before compilation:
- Missing `setup()` or `loop()` function
- `analogWrite()` on non-PWM pin (only D3, D5, D6, D9, D10, D11)
- `analogRead()` on non-analog pin (only A0-A5)
- Pin number out of range (> 19)
- `Serial.print()` without `Serial.begin()` in setup

### 8.4 Modify: `packages/app/src/app.tsx`

Add `sketchEditor` panel — tabbed with Graph editor (user can switch between visual and code views).

### 8.5 Checkpoint

- [ ] Editor shows current sketch code with syntax highlighting
- [ ] Editing code updates board state
- [ ] AI agent writing code updates the editor
- [ ] Compile button shows success or error messages
- [ ] Run button starts simulation
- [ ] Commit: `"feat: Arduino sketch code editor panel"`

---

## Phase 9: Graph-to-Code Generation

> **Dependencies**: Phase 4 (graph nodes) + Phase 5 (VM, for running generated code)

**Objective**: Visual node graph generates valid Arduino C++ code.

### 9.1 New File: `packages/app/src/graph/arduino-codegen.ts`

```ts
export function generateArduinoCode(
  nodes: Record<string, GraphNode>,
  edges: Record<string, Edge>,
): string
```

**Algorithm** (see DR-5 for cycle handling):
1. Find `setup` and `loop` **entry point nodes** — these are roots, not part of the flow DAG
2. For each entry, walk its flow subgraph in **topological order**
3. If a cycle is detected within a subgraph → reject with user-visible error: "Circular connection detected between X and Y"
4. `loop()` being called repeatedly is handled by the simulation loop, NOT the graph topology
5. **Data-only connections** (no flow edges) are evaluated lazily per-read — no cycle issue
6. For each node in order, generate the corresponding C++ statement
7. Resolve data connections to inline values or variable references
8. Collect global variable declarations from `variable` and `constant` nodes
9. Assemble: `#includes` → globals → `void setup() { ... }` → `void loop() { ... }`

**Code generation per node type**:

| Node | Generated Code |
| --- | --- |
| `pin_mode` | `pinMode({pin}, {mode});` |
| `digital_write` | `digitalWrite({pin}, {value});` |
| `digital_read` | `digitalRead({pin})` (expression) |
| `analog_write` | `analogWrite({pin}, {value});` |
| `analog_read` | `analogRead({pin})` (expression) |
| `delay` | `delay({ms});` |
| `millis` | `millis()` (expression) |
| `serial_begin` | `Serial.begin({baud});` |
| `serial_print` | `Serial.println({value});` |
| `if_else` | `if ({condition}) { {true_branch} } else { {false_branch} }` |
| `comparison` | `{a} {op} {b}` (expression) |
| `logic_gate` | `{a} && {b}` / `{a} \|\| {b}` / `!{a}` |
| `math` | `{a} {op} {b}` (expression) |
| `map_value` | `map({val}, {fL}, {fH}, {tL}, {tH})` |
| `variable` | Declaration: `int {name} = {initial};` / Usage: `{name}` |
| `constant` | `const int {name} = {value};` |
| `servo_write` | `{servoVar}.write({angle});` |
| `tone` | `tone({pin}, {freq}, {dur});` |
| `lcd_print` | `lcd.setCursor({col}, {row}); lcd.print({text});` |
| `code_block` | Raw code passthrough |

### 9.2 Rename: `graph-scene-bridge.ts` → `graph-board-bridge.ts`

**File**: `packages/app/src/store/graph-board-bridge.ts`

When graph nodes/edges change:
1. Call `generateArduinoCode(nodes, edges)`
2. Dispatch `UPDATE_SKETCH` to board machine with generated code
3. Code appears in sketch editor automatically

### 9.3 New File: `packages/app/src/graph/code-preview.tsx`

Small overlay panel in the graph editor (toggleable) showing the generated Arduino code in real-time as nodes are connected/modified. Read-only, syntax-highlighted.

### 9.4 Checkpoint

- [ ] Create nodes: `setup → pinMode(13, OUTPUT)` + `loop → digitalWrite(13, HIGH) → delay(1000) → digitalWrite(13, LOW) → delay(1000)`
- [ ] Generated code appears in sketch editor as valid Arduino C++
- [ ] Code preview in graph editor matches
- [ ] Running the generated code in the simulator works (LED blinks)
- [ ] Modifying a node (e.g., change delay to 500ms) regenerates code immediately
- [ ] Commit: `"feat: graph-to-Arduino-code generation"`

---

## Phase 10: Polish & Persistence

> **Dependencies**: All previous phases

**Objective**: Wire everything end-to-end. Ensure projects save/load correctly.

### 10.1 Modify: `packages/api/src/db/project-repo.ts`

- Handle `boardState` in project read/write
- Apply board ops (validate + patch + increment version)
- Initialize new projects with empty board state + Arduino Uno component

### 10.2 Modify: `packages/app/src/project/project-loader.tsx`

- Load board state from project → hydrate board machine
- Load sketch code into editor
- Load graph nodes (Arduino types)

### 10.3 Modify: `packages/app/src/project/use-graph-persistence.ts`

Ensure graph persistence works with new Arduino node types. No structural changes needed if graph schema migration is handled in Phase 1.

### 10.4 New File: `packages/app/src/breadboard/component-library.ts`

Predefined component configs:

```ts
export const RESISTOR_VALUES = [220, 330, 470, 1000, 2200, 4700, 10000] as const

export const LED_COLORS = {
  red:    { color: "#ef4444", forwardVoltage: 1.8 },
  green:  { color: "#22c55e", forwardVoltage: 2.1 },
  blue:   { color: "#3b82f6", forwardVoltage: 3.0 },
  yellow: { color: "#eab308", forwardVoltage: 2.0 },
  white:  { color: "#f8fafc", forwardVoltage: 3.2 },
} as const

export const COMPONENT_PIN_LAYOUTS: Record<ComponentType, {
  pins: { name: string; description: string }[]
  defaultResistor?: number  // auto-suggest resistor value
}> = {
  led: {
    pins: [
      { name: "anode", description: "Connect to digital pin (through resistor)" },
      { name: "cathode", description: "Connect to GND" },
    ],
    defaultResistor: 220,
  },
  button: {
    pins: [
      { name: "a", description: "Connect to digital pin" },
      { name: "b", description: "Connect to GND (with pull-down resistor)" },
    ],
    defaultResistor: 10000,
  },
  // ... all other component types
}
```

### 10.5 Starter Templates

New file: `packages/app/src/project/templates.ts`

Pre-built project templates for new users:

| Template | Components | Sketch |
| --- | --- | --- |
| **Blink** | Arduino Uno, LED, 220Ω resistor | `digitalWrite(13, HIGH/LOW)` with delay |
| **Button LED** | Arduino Uno, LED, Button, resistors | `digitalRead` button → `digitalWrite` LED |
| **Traffic Light** | Arduino Uno, 3 LEDs, 3 resistors | Sequential red/yellow/green with delays |
| **Servo Sweep** | Arduino Uno, Servo | `Servo.write()` 0-180 loop |
| **LCD Hello** | Arduino Uno, LCD 16×2 | `lcd.print("Hello World!")` |
| **Potentiometer LED** | Arduino Uno, Pot, LED | `analogRead` → `analogWrite` brightness |
| **Blank** | Arduino Uno only | Empty setup/loop |

### 10.6 Update: `CLAUDE.md`

Update project documentation:
- Architecture diagram (breadboard + graph + AI agent + simulator)
- New schema descriptions
- Updated dev commands
- New component types and pin documentation

### 10.7 Final Checkpoint

- [ ] Create new project → loads with Arduino Uno on breadboard
- [ ] Place LED + resistor → wire to pin 13 + GND
- [ ] Write blink sketch in editor → compile → run → LED blinks visually
- [ ] OR: build blink in graph editor → code generates → run → LED blinks
- [ ] OR: ask AI "make an LED blink" → agent places components + writes code → run
- [ ] Serial Monitor shows output
- [ ] Pin Inspector shows live state
- [ ] Save project → reload page → everything restored
- [ ] All starter templates load and run correctly
- [ ] `bun run typecheck` passes
- [ ] Commit: `"feat: persistence, templates, and polish"`

---

## Phase Dependency Graph

```
Phase 0 (cleanup)
  └── Phase 1 (schemas)
        ├── Phase 2 (board state machine)
        │     ├── Phase 3 (breadboard canvas) ─────────┐
        │     ├── Phase 4 (graph nodes)                 ├── Phase 6 (viewport + serial)
        │     ├── Phase 5 (Arduino VM) ────────────────┘
        │     ├── Phase 7 (AI agents) ← needs 1 + 2 only, NOT 5
        │     └── Phase 8 (code editor) ← needs 2 only
        │
        ├── Phase 4 + Phase 5 ──── Phase 9 (graph codegen)
        └── All phases ──── Phase 10 (polish)
```

### Parallelizable Work (see DR-11)

Phase numbers are a _suggested_ serial order. The dependency graph above is the actual constraint.

After Phase 2 is complete, **four independent workstreams** can proceed in parallel:
1. **Phase 3** (breadboard canvas)
2. **Phase 4** (graph nodes)
3. **Phase 5** (Arduino VM)
4. **Phase 7** (AI agents) — only needs schemas + board ops, not the VM

After those complete:
- **Phase 6** needs Phase 3 + 5
- **Phase 8** can start after Phase 2 (minimal deps), but benefits from Phase 5 for compile/run integration
- **Phase 9** needs Phase 4 + 5
- **Phase 10** is last

---

## Execution Log

> Track progress below. Mark each step as it's completed.

### Phase 0
- [ ] Branch created: `arduino-simulator`
- [ ] Game directories deleted
- [ ] Dead imports cleaned
- [ ] Unused deps removed
- [ ] Typecheck passes
- [ ] Committed

### Phase 1
- [ ] `arduino.ts` schema created (with libraryState — DR-6)
- [ ] `arduino-graph.ts` schema created
- [ ] `ops.ts` rewritten with board ops
- [ ] `graph.ts` updated with Arduino types
- [ ] `project.ts` updated with board state
- [ ] `index.ts` re-exports updated
- [ ] Schema validation tests pass (`bun test`)
- [ ] Typecheck passes
- [ ] Committed

### Phase 2
- [ ] `board-machine.ts` created
- [ ] `board-context.ts` created
- [ ] `types.ts` rewritten
- [ ] `app.tsx` wired to BoardContext
- [ ] Board machine unit tests pass (dispatch + undo/redo)
- [ ] Typecheck passes
- [ ] Committed

### Phase 3
- [ ] Grid logic implemented + unit tested (roundtrips, connections, resolveNets)
- [ ] SVG breadboard renders (static grid layer — DR-3)
- [ ] Component palette working
- [ ] Drag-to-place working
- [ ] Wire drawing working
- [ ] Net connectivity resolver working (DR-8)
- [ ] Zoom/pan working
- [ ] All component renderers done (React.memo wrapped — DR-3)
- [ ] Committed

### Phase 4
- [ ] Node factory updated
- [ ] Default ports defined for all 23 types
- [ ] All node content components created
- [ ] Graph machine sizes updated
- [ ] Node search works
- [ ] Committed

### Phase 5
- [ ] Transpiler handles core C++ patterns (unit tested — DR-9)
- [ ] Step-based interpreter executes setup/loop (DR-2)
- [ ] All Arduino stdlib functions injected
- [ ] Web Worker isolation working (DR-7)
- [ ] Instruction limit catches infinite loops (DR-7)
- [ ] Simulation loop with timing
- [ ] Simulation state machine works
- [ ] Blink sketch runs correctly
- [ ] delay() works nested in loops (DR-2)
- [ ] Unsupported C++ shows clear error (DR-1)
- [ ] Transpiler + VM unit tests pass
- [ ] Committed

### Phase 6
- [ ] Simulation overlay on breadboard
- [ ] Serial Monitor panel
- [ ] Pin Inspector panel
- [ ] Component inspector updated
- [ ] Play controls wired
- [ ] Layout updated
- [ ] Committed

### Phase 7
- [ ] Core agent prompt rewritten
- [ ] Core tools rewritten
- [ ] Graph agent updated
- [ ] Circuit agent created
- [ ] Sprite/coding agents deleted
- [ ] apply-ops.ts rewritten
- [ ] Chat integration working
- [ ] Committed

### Phase 8
- [ ] CodeMirror 6 integrated (DR-10)
- [ ] C++ syntax highlighting via @codemirror/lang-cpp
- [ ] Arduino autocomplete working
- [ ] Arduino linter catches common errors
- [ ] Compile button shows errors via CodeMirror lint
- [ ] Bidirectional sync with board state
- [ ] Committed

### Phase 9
- [ ] Codegen from graph nodes (unit tested — DR-9)
- [ ] Cycle detection with user-visible error (DR-5)
- [ ] graph-board-bridge syncs code
- [ ] Code preview overlay in graph
- [ ] Generated code runs in simulator
- [ ] Committed

### Phase 10
- [ ] Project persistence updated
- [ ] Project loader hydrates board
- [ ] Component library configs
- [ ] Starter templates
- [ ] CLAUDE.md updated
- [ ] Full e2e workflow verified
- [ ] Committed
