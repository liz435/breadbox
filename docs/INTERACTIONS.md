# Interactions

The subsystem docs cover each piece in isolation. This one covers three cross-
system sequences that touch the board store, the pin store, the runner, and —
for the third — the API. Read [ARCHITECTURE.md](./ARCHITECTURE.md) first for
the component names; read [SIMULATION.md](./SIMULATION.md) for the pin-store
and runner contracts.

## 1. Button press → `digitalRead`

```
 SVG pointerdown                                            avr8js port B/C/D
       │                                                           ▲
       ▼                                                           │ setPin()
┌────────────────────┐   writeExternal(pin, digital)  ┌────────────┴─────────┐
│ button-renderer    │ ─────────────────────────────> │  pin-state-store     │
│   handlePointerDown│                                │   OUTPUT-claim guard │
│   buttonPressStore │ <── useButtonPressed ────      │   snapshot + notify  │
│   analyzeButton    │                                │   externalPinSink ───┼──┐
│     Wiring memo    │                                └──────────────────────┘  │
│   canDrivePress    │                                                          │
└────────────────────┘                                                          │
                                                                                ▼
                                                        ┌───────────────────────────┐
                                                        │ runners/avr-runner sink   │
                                                        │   arduinoPinToPort(pin)   │
                                                        │   avrRunner.setExternalPin│
                                                        └───────────┬───────────────┘
                                                                    ▼
                                                        ┌───────────────────────────┐
                                                        │ avr-runner                │
                                                        │   portInstance.setPin()   │
                                                        │   → pinValue mutated      │
                                                        │   → updatePinRegister()   │
                                                        │   → next digitalRead = 0  │
                                                        └───────────────────────────┘
```

`button-renderer.tsx:52-68` attaches the same `pointerdown` / `pointerup` /
`pointerleave` handlers to the whole SVG group, so any hit on the housing
counts — not just the cap. `buttonPressStore.press(id)` flips a `Set<string>`
and notifies subscribers; `useButtonPressed` returns `true` and the cap
renders depressed. That is purely visual.

The electrical half runs through `analyzeButtonWiring(component, wires)`
(`component-pin-resolver.ts:144`), memoized on `[component, wires]` so it
only re-runs when the board shape changes. It walks the button's two sides
through `resolveNets` and returns `{ inputPin, hasGroundReference,
hasPowerReference, hasSignalOnBothSides }`. The `canDrivePress` gate requires
exactly one side wired to an Arduino pin and the opposite side terminated
correctly: GND for `INPUT_PULLUP`, 5V/3V3 for plain `INPUT`. A bare signal
pin with nothing on the other leg is a no-op — pressing the button would not
change the pin on real hardware either.

When the gate passes, the handler calls
`pinStateStore.writeExternal(pin, { digitalValue: pressedValue })`
(`pin-state-store.ts:140-150`). `writeExternal` short-circuits if the sketch
has claimed the pin as `OUTPUT`, then delegates to `writeInternal` (snapshot
replacement, listener notify, interrupt edge check). The final step forwards
the new digital value to `externalPinSink`, which the active runner
registered on load.

On the AVR path that sink is
`(pin, v) => avrRunner.setExternalPin(mapped.port, mapped.pin, v === 1)`
(`runners/avr-runner.ts:147-152`). `setExternalPin` calls `portInstance.setPin`
(`avr-runner.ts:228-232`); avr8js mutates its internal `pinValue` and re-runs
`updatePinRegister`, so the PIN register — which is what the emulated CPU
reads — reflects the external drive. The next time the sketch executes
`digitalRead(pin)` inside the emulated `loop()`, it sees LOW.

**Why the INPUT_PULLUP seed matters.** avr8js derives the PIN register from
`pinValue`, not from the internal DDR/PORT pull-up flags. When the sketch
executes `pinMode(x, INPUT_PULLUP)`, the port listener at
`avr-runner.ts:136-159` observes the `InputPullUp` enum transition and calls
`port.setPin(i, true)` so the line reads HIGH by default. Without the seed,
`digitalRead()` on a freshly-enabled pullup returns 0 and the idiomatic
`if (digitalRead(BUTTON) == LOW) ...` appears inverted. The symmetric
seed — `setPin(i, false)` on `InputPullUp → Input` — releases the line so
swapping modes mid-run does not leak stale HIGHs. The pin-state-store mirrors
the same seeding one level higher (`pin-state-store.ts:184`) so non-AVR UIs
still see sensible defaults.

**Release path.** `handlePointerUp` and `handlePointerLeave` both call
`buttonPressStore.release(id)` and, crucially, always invoke
`pinStateStore.writeExternal(pin, { digitalValue: releasedValue })` whenever
`inputPin != null` — not conditional on `canDrivePress`. This is deliberate:
if the user rewires the button between `down` and `up` (e.g. removes the GND
leg mid-press), the `canDrivePress` gate would be false on release and the
pin would stay stuck LOW without the unconditional restore. Release always
clears.

## 2. Sensor inputs → pin store (and the ordering rule)

```
runInlineAnalysis() — profile-based cadence
  1. applySensorInputs(components, wires, store, environment, bus)
       ├─ photoresistor  → writeExternal(pin, {analogValue})
       ├─ temperature    → writeExternal(pin, {analogValue})
       ├─ pir_sensor     → writeExternal(pin, {digitalValue})
       ├─ ultrasonic     → peripheral.setDistance(cm)
       ├─ dht_sensor     → peripheral.setReading(t, h)
       └─ ir_receiver    → peripheral.sendCode(code)
  2. snapshotAsPinStates(store)   ────────> analyzeCircuit(...)
  3. voltsToAnalog(compState.voltage) ───> store.writeExternal(pin, {analogValue})
     (explicit pins + wire-fanout pass)
```

`runInlineAnalysis` applies environment-driven sensor inputs before the
electrical solve. This ensures the solver and the next MCU quantum see the
latest sensor state. The solver is skipped when there are no circuit elements,
but sensor inputs still update the pin store or peripheral bus.

For photoresistors and temperature sensors, the inspector-driven value is the
authoritative environment input. SPICE may also derive a voltage for a divider,
but it must not overwrite the explicit environment reading. Ultrasonic, DHT,
and IR peripherals use their protocol-level peripheral implementations so the
sketch observes the next echo pulse, DHT frame, or IR code.

### Cadence

Analysis always runs on frame 1. In `learn` mode it runs every 12 frames, or
every 2 frames when a reactive circuit is catching up. In `electrical` and
`hardware` modes it runs every frame. Sensor application is part of this same
analysis step, so it follows the selected profile.

### External sink: digital vs analog

`writeExternal` forwards digital changes to the active runner's external-pin
sink. Analog values remain in the pin store; the AVR and RP2040 runners expose
them through their emulated ADC paths. The pin store is the UI-visible analog
mirror and is not forwarded through a digital GPIO register.

## 3. Undo / redo vs. agent ops

**TL;DR:** Undo is purely client-side XState state; it never decrements the
server revision or sends a compensating operation. The server does, however,
validate `expectedVersion` for board mutations and autosave. After undoing an
agent-applied op, autosave persists the current client snapshot as a new
version, so the local and server board converge once persistence completes.

### Client side

The board machine at `board-machine.ts:115-202` stores history in two
context fields: `_past: BoardState[]` and `_future: BoardState[]`. Every
mutating event (`PLACE_COMPONENT`, `ADD_WIRE`, `UPDATE_SKETCH`, …) wraps its
`assign` with `...pushHistory(context)`, which pushes the pre-mutation
`boardData(context)` onto `_past` and clears `_future`. `MAX_HISTORY = 100`
(`board-machine.ts:121`).

`UNDO` pops `_past`, re-pushes the current state onto `_future`, and swaps
the context fields with the popped snapshot. `REDO` is the mirror. Both are
guarded by `canUndo` / `canRedo` state-check guards. Keyboard dispatch lives
in `app.tsx:238-242` (`Cmd/Ctrl+Z`, `Shift+Cmd/Ctrl+Z`). CodeMirror editors
are excluded; Monaco handles its own undo.

Agent-applied ops flow through `applyBoardOpsToBoard` in `chat/apply-ops.ts`,
which dispatches `PLACE_COMPONENT` / `ADD_WIRE` / etc. to the same machine.
Because every one of those events calls `pushHistory`, agent ops are in the
same undo stack as user edits — one agent turn that emits N ops pushes N
history frames. `Cmd+Z` after an agent turn undoes one op; N presses undoes
the whole turn.

### Server side

`projectRepo.applyBoardOps` (`project-repo.ts`) is the chat route's board
mutation path. It:

```ts
if (existing.project.version !== input.expectedVersion) throw VersionConflictError
for (const op of input.ops) validate op.projectId and op.expectedVersion
applyBoardDocumentOps(..., { enforceRevision: true })
working.project.version += 1
await writeProject(projectId, working)
return { newVersion: working.project.version, appliedOps: input.ops }
```

The same optimistic-concurrency rule applies to scene operations and combined
board/graph/physical-scene autosaves. `VersionConflictError` aborts the write
before the project file is replaced, so a stale client cannot partially apply a
batch.

### What that means for undo

1. **Undo is local-only.** There is no `/api/undo` route, no `DELETE
   /api/ops/:id`, no decrementing call. `app.tsx:238-242` sends `UNDO` to the
   XState actor and stops.
2. **The server revision does not rewind.** After "agent places LED → user
   hits Cmd+Z", the local board no longer contains the LED, but the server
   revision remains the revision created by the agent mutation until the next
   persistence write.
3. **Autosave reconciles the snapshot.** The debounce calls
   `saveProjectState` with the current client board. `saveBoardAndGraph`
   validates the expected version, writes the post-undo snapshot, and bumps
   the project version. The next chat request receives the new version from
   the save result, so the agent and the UI converge on the same board.
4. **A concurrent mutation is rejected.** If another client changes the
   project before autosave, the stale save raises `VersionConflictError`.
   The client must reload or retry from the latest project snapshot; it must
   not silently overwrite the concurrent change.

### Caveats

- Board ops, scene ops, and combined project saves all have version checks and
  can raise `VersionConflictError`.
- The `__tests__/board-machine.test.ts` suite covers the XState side
  thoroughly (see `board-machine-undo.test.ts`). Persistence conflict tests
  cover stale saves and board-op batches in `project-repo.test.ts`.
