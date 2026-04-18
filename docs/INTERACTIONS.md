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
runInlineAnalysis() — fires every 12 frames (~5 Hz)
  1. snapshotAsPinStates(store)   ────────> analyzeCircuit(...)
  2. voltsToAnalog(compState.voltage) ───> store.writeExternal(pin, {analogValue})
     (explicit pins + wire-fanout pass)
  3. applySensorInputs(components, wires, store, environment, bus)
       ├─ photoresistor  → writeExternal(pin, {analogValue})
       ├─ temperature    → writeExternal(pin, {analogValue})
       ├─ pir_sensor     → writeExternal(pin, {digitalValue})
       ├─ ultrasonic     → peripheral.setDistance(cm)  (+ legacy bus)
       ├─ dht_sensor     → peripheral.setReading(t, h) (+ legacy bus)
       └─ ir_receiver    → peripheral.sendCode(code)   (+ legacy bus)
```

Everything sensor-related happens inside `runInlineAnalysis` in
`simulation-loop.ts:225-298`. Step 1 reads the current pin snapshot and hands
it to the SPICE-backed `analyzeCircuit`. Step 2 walks the resulting
`componentStates` and writes analog voltages to analog pins — both for pins
explicitly declared in `component.pins` and, via the "wire fanout" loop at
`simulation-loop.ts:264-279`, for any Arduino analog wire (`fromRow ===
-999`) landing on a circuit component's footprint. Step 3 —
`applySensorInputs` at line 290 — runs **unconditionally**, even when
`analyzeCircuit` returns `isValid === false` or throws. That is how a
photoresistor still updates `A0` on a board with no power rails.

### Why ordering matters

The SPICE solver models sensors like the photoresistor as a voltage-divider
(`5V → R → Apin → LDR → GND`). It will happily compute a steady-state voltage
at `Apin` and step 2 will call `writeExternal(A0, { analogValue: ... })`
based on that equivalent voltage. That value has no connection to the
inspector's light slider — the SPICE model has no opinion about lux.

Step 3 runs last so it clobbers step 2's stale value with the real physical
reading. `writePhotoresistor` (`sensor-inputs.ts:112`) converts the
inspector's `light %` into a non-linear curve and writes the result via
`store.writeExternal(pin, { analogValue })`. Swap the order and every
photoresistor reading would snap to whatever divider voltage SPICE
converged on — which for a disconnected or mis-wired board is zero.

Distance/temperature/IR sensors route through the peripheral bus rather
than the pin store because the AVR sketch reads them through library calls
that expect a specific on-the-wire protocol (`pulseIn` echo pulse, DHT
response frame, NEC carrier). `writeUltrasonic` / `writeDht` /
`writeIrReceiver` call the peripheral's `setDistance` / `setReading` /
`sendCode` methods so the *next* trigger or request from the sketch sees
fresh data. The legacy `ultrasonicDistanceBus` / `dhtSensorBus` /
`irReceiverBus` maps are still populated as a safety net
(`sensor-inputs.ts:53-71`) but are no-ops in AVR-only builds now that the
transpile-mode stdlib is gone.

### Cadence

Because `applySensorInputs` is called from inside `runInlineAnalysis`, it
inherits that hook's cadence: frame 1 and every 12th frame thereafter
(`simulation-loop.ts:313`). At 60 fps that's ~5 Hz. This is a deliberate
rate-limit — running it every frame would either (a) burn cycles on SPICE
for sensors the solver cannot model anyway, or (b) need a separate loop and
a new way to reason about staleness.

### External sink: digital vs analog

`writeExternal` only forwards digital changes to the runner's external-pin
sink (`pin-state-store.ts:147`). Analog values stop at the store. The AVR's
`analogRead()` goes through the emulated ADC MUX; the stdlib path calls
`store.readAnalog(pin)` (`pin-state-store.ts:115`) directly, so the analog
mirror is authoritative — no PIN-register forwarding is necessary or
desired.

## 3. Undo / redo vs. agent ops

**TL;DR:** Undo is purely client-side XState state. It never hits the server.
The server does not track a history of ops, and its version counter does not
decrement. After a user undoes an agent-applied op, the client's
`expectedVersion` in the chat request still reflects the version the server
bumped to when it applied the op — so a subsequent agent turn sees a
server board that still contains the agent's changes, even though the user's
screen does not.

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

`projectRepo.applyBoardOps` (`project-repo.ts:505-526`) is the chat route's
only mutation path. It:

```ts
const working = structuredClone(existing)
for (const op of input.ops) applyBoardOp(working, boardOpSchema.parse(op))
working.project.version += 1
await writeProject(projectId, working)
return { newVersion: working.project.version, appliedOps: input.ops }
```

Notice what is *not* there: no `expectedVersion` check. Unlike `applyOps`
(scene ops — `project-repo.ts:423-458`), which throws `VersionConflictError`
when `existing.project.version !== input.expectedVersion`, `applyBoardOps`
ignores the expected version entirely. The chat route's
`capturedExpectedVersion` (`routes/chat.ts:280`) is still passed in and still
echoed back via `data-scene-result.newVersion = expectedVersion + 1` for the
template fast path, but the real post-apply path reads
`applyResult.newVersion` from the repo — which is `existing.project.version +
1`, whatever `existing.project.version` happened to be.

`VersionConflictError` is defined (`project-repo.ts:48-58`) and caught
(`routes/chat.ts:347-359`), but in practice only scene ops can raise it. The
chat route's error branch exists for future-proofing and the scene path, not
because agent board ops can trip it today.

### What that means for undo

1. **Undo is local-only.** There is no `/api/undo` route, no `DELETE
   /api/ops/:id`, no decrementing call. `app.tsx:238-242` sends `UNDO` to the
   XState actor and stops.
2. **`expectedVersion` drifts after undo.** `useChatMessages` sources
   `expectedVersion` from `project.version`, which is mutated only by
   `data-scene-result.newVersion` (`use-chat-messages.ts:132-134`) and by
   initial project load (`project-loader.tsx:54`). Undoing an agent op does
   not touch `project.version`. So after "agent places LED → user hits
   Cmd+Z", the next `/api/chat` request still sends `expectedVersion = N+1`
   (the version bumped by the agent's apply), even though the user's board
   no longer contains the LED.
3. **The server still sees the agent's ops.** The on-disk project file was
   already updated when `applyBoardOps` ran; nothing rolls that back. The
   next agent turn loads `project.boardState` (already containing the LED)
   and `boardTracker` serves the same stale view to the system prompt via
   `boardTracker.summarize` (`board-state-tracker.ts:133`). The agent will
   reason as if the LED is still there.
4. **The autosave debounce writes the user's view back.** Two seconds after
   the undo, `use-board-persistence.ts:131-173` fires `saveProjectState`,
   which POSTs the current (post-undo) board to `/project/:id/state`. That
   path calls `saveBoardAndGraph` (`project-repo.ts:622-638`), which
   overwrites `boardState` but — importantly — **does not bump
   `project.version`**. So the file now contains the post-undo components
   paired with the agent-era version number. The client's
   `project.version` and the server's `project.version` are now identical
   (neither moved), but both point at a snapshot that has nothing to do
   with either "just after the agent turn" or "just before it".
5. **Net behavior for a reproducer.** User undoes an agent op, waits 2 s,
   then sends another chat message. The agent prompt will contain the
   post-undo board (because the autosave overwrote the file), so no phantom
   components survive — but the `expectedVersion` sent with the request is
   the post-apply version, not a fresh one, and that mismatch is silently
   ignored by `applyBoardOps`. If the code path ever grows a real version
   check, this flow will break.

### Caveats

- Scene ops *do* have a version check and *can* raise `VersionConflictError`.
  The doc above is specific to board ops.
- The `__tests__/board-machine.test.ts` suite covers the XState side
  thoroughly (see `board-machine-undo.test.ts`), but there is no
  integration test covering a server round-trip after undo. The behavior
  described above is what the code does today, not what it guarantees.
