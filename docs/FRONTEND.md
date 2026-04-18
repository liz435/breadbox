# Frontend

The `packages/app` workspace: React 19 + Vite (port 3000 in dev). Renders
the breadboard, the sketch editor, the agent chat, the schematic view, and
a set of inspector/debug panels.

## Shell and routing

- `packages/app/src/index.tsx` — Vite entry, mounts `<App />`.
- `packages/app/src/app.tsx` — app shell (workspace layout + dockview
  panels).
- `packages/app/src/app-providers.tsx` — provider pyramid: project context,
  scene/graph/board XState actor contexts, dockview, toast provider, error
  boundary.
- `packages/app/src/router.tsx` — top-level client-side routes (landing,
  editor, learn). SPA fallback for unknown paths is handled on the server
  (see [CLI.md](./CLI.md) and `routes/web-ui-static.ts`).

Path alias: `@/*` → `packages/app/src/*` (both in `tsconfig.json` and the
Vite config). Cross-package imports use `@dreamer/schemas` / `@dreamer/config`.

## State management

Three XState actor contexts, each created with `createActorContext` from
`@xstate/react`:

| Context | Machine | Owns |
| --- | --- | --- |
| `BoardContext` | `store/board-machine.ts` | Components, wires, sketch code, library state, environment, custom libraries, build log, undo/redo stack |
| `SceneContext` | `store/scene-machine.ts` | Sprite scene (legacy from an earlier PixiJS iteration; still used by the scene panel) |
| `GraphContext` | `store/graph-machine.ts` | Node graph (flow-chart view of the board) |

Accessor hooks (`useBoard`, `useBoardSelector`, `useCanUndo`, `useCanRedo`)
live in `store/board-context.ts`.

### Board machine

`store/board-machine.ts` is a plain XState v5 machine. Its context type is
`BoardMachineContext = BoardState & { selectedId, buildLog, _past, _future }`.
Events are a discriminated union (`BoardEvent`):

```
PLACE_COMPONENT | REMOVE_COMPONENT | UPDATE_COMPONENT | MOVE_COMPONENT
ADD_WIRE | UPDATE_WIRE | REMOVE_WIRE
SET_LIBRARY_STATE | UPDATE_SKETCH
APPEND_SERIAL | CLEAR_SERIAL | APPEND_BUILD_LOG | CLEAR_BUILD_LOG
RESET_PINS | ADD_CUSTOM_LIBRARY | UPDATE_CUSTOM_LIBRARY | REMOVE_CUSTOM_LIBRARY
SET_BOARD_TARGET | ADD_OBSTACLE | UPDATE_OBSTACLE | REMOVE_OBSTACLE
UPDATE_ENVIRONMENT | LOAD_BOARD | SNAPSHOT | UNDO | REDO
```

Pin state used to live in this machine's context. It was moved out to
`simulator/pin-state-store.ts` to avoid write amplification — every pin
write no longer triggers an XState transition. See
[SIMULATION.md — pin state store](./SIMULATION.md#pin-state-store).

Wires attached to a removed component are auto-cleaned via
`wiresAttachedToComponent` (`board-machine.ts:31`), using `areConnected`
from the breadboard grid to detect electrical attachment (not just
coordinate equality).

### Context equality

`board-context.ts` defines a `boardEqual` selector that shallow-compares the
fields the UI actually cares about. Without it, every state transition
(including SNAPSHOT) would cause every component using `useBoard()` to
rerender. The equality function is intentionally partial — `_past` and
`_future` are excluded so undo-stack growth alone doesn't trigger renders.

## Chat integration

File: `packages/app/src/toolbar/use-chat-messages.ts`

This hook is the bridge between the AI SDK's `useChat` and the XState
actors. It:

1. Creates a `DefaultChatTransport` pointed at `${API_ORIGIN}/api/chat` with
   `{ projectId, sceneId, threadId, sessionId, expectedVersion }` in the body.
2. On `onData(dataPart)`:
   - `data-scene-ops` → partitioned into `BoardOp` / `GraphOp` / `SceneOp`
     via `isBoardOp` + `isGraphOp`, then dispatched to the respective
     XState actor through `applyBoardOpsToBoard`, `applyGraphOpsToGraph`,
     `applyOpsToScene` (`chat/apply-ops.ts`, `chat/apply-graph-ops.ts`).
   - `data-token-usage` → session token tracker.
   - `data-scene-result` → local project version bump (so next request's
     `expectedVersion` is correct).
3. Fetches existing thread messages on mount via `/api/threads/:id/messages`.

The apply-ops modules are pure `case`-per-kind dispatchers that map each
server op to one or more XState events. They do not do any business logic
of their own — they're the inverse of `make-op.ts` on the server.

## Panels

`packages/app/src/panels/*`:

- `inspector.tsx` — per-component properties panel. For sensors, also
  surfaces inspector-driven inputs (distance for ultrasonic, temperature
  for DHT, detect for PIR, IR code) that `sensor-inputs.ts` reads each
  tick.
- `pin-inspector.tsx` — live view of all 20 pins. Subscribes to the pin
  state store via `usePinStates()`.
- `serial-monitor.tsx` — streams `boardMachine.serialOutput` entries.
  Accepts input and forwards to `runner.sendSerialInput(text)`.
- `electrical-report.tsx` — renders the `CircuitAnalysis` warnings list +
  current paths.
- `graph-inspector.tsx` — inspector for the node-graph view.
- `project-files.tsx` / `project-panel.tsx` / `project-selector.tsx` —
  project CRUD (calls `/api/projects`).
- `sprite-list.tsx` — scene panel (legacy).
- `tile-brush-palette.tsx` — tile painter (scene feature).

## Editor and toolbar

- `editor/sketch-editor.tsx` — Monaco wrapper for the Arduino sketch.
  Edits flow through `UPDATE_SKETCH` events on the board machine.
- `editor/example-button.tsx` — quick-load examples from
  `examples/boards/*.json`.
- `toolbar/bottom-toolbar.tsx` — chat input, status bar, token tracker.
- `toolbar/play-controls.tsx` — play/pause/stop wired to the
  `useSimulation()` hook from `simulator/simulation-loop.ts`.

## Styling

Tailwind v4 via `@tailwindcss/vite`. Class composition goes through
`@/utils/classnames::cn`. Base UI (`@base-ui/react`) components are used
for dialogs, menus, popovers, tabs, toast — avoid rolling your own. See
the root [`CLAUDE.md`](../CLAUDE.md) for the full style policy.

## Examples + learning content

- `examples/boards/*.json` — prebuilt board snapshots (LED blink, DHT
  sensor, NeoPixel, relay, servo, LCD, DC motor, etc.).
- `examples/example-catalog.ts` — index over those.
- `learn/boards/*.json` — per-lesson board snapshots for the learn mode.

The loader path is: user clicks an example → `LOAD_BOARD` event is sent
to the board machine with the parsed JSON → board replaces its state
atomically (no diffing).

## Circuit overlay

`breadboard/circuit-overlay.tsx` renders warnings and current-path arrows
over the board. It reads from `latestSimAnalysisRef` (exported from
`simulator/simulation-loop.ts:24`), which is a ref to a ref — the
simulation loop writes the latest analysis inside the tick function so
the overlay can read it without waiting for a React render pass.

If the simulation is stopped, `latestSimAnalysisRef.current.current` is
`null` and the overlay falls back to `circuit-analysis-hook.ts`, which
runs analysis on-demand from the React tree (debounced).
