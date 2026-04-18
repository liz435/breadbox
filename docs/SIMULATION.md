# Simulation

How a compiled sketch turns into live pixels on the breadboard. Everything
below happens in the browser; the backend is only involved for the one-shot
`/api/compile` call that produces the hex image.

## Component map

```
   React hook                    Runner abstraction                  Hardware model
┌─────────────────┐   creates  ┌────────────────────┐    wraps   ┌────────────────┐
│ useSimulation() │ ─────────> │  SketchRunner      │  ────────> │  avr8js CPU    │
│  (rAF loop)     │            │    (avr-runner.ts) │            │  + GPIO ports  │
│                 │            │                    │            │  + Timers      │
│ play / pause    │            │  loadSketchAsync   │            │  + USART       │
│ stop / resume   │            │  runSetup          │            └───────┬────────┘
│ sendSerialInput │            │  runLoopIteration  │                    │ port listener
└────────┬────────┘            │  getPinStore       │                    ▼
         │                     │  getPeripheralBus  │            ┌────────────────┐
         │ frame tick          │  attachBoard       │   routes   │ PinStateStore  │
         ▼                     └────────┬───────────┘ ─────────> │  (20 pins)     │
┌─────────────────┐                     │                        └───────┬────────┘
│ runInlineAnalysis                     │ peripheralBus.dispatchEdge()   │
│  (every 12 fr.) │                     ▼                                │ writeExternal
│ analyzeCircuit  │            ┌────────────────────┐                    │
│ applySensor     │            │  PeripheralBus     │ ─────────────────> │
│  Inputs         │            │  servo, buzzer,    │  scheduleEdge +    │
└────────┬────────┘            │  lcd, ultrasonic,  │  flushScheduled    │
         │                     │  dht, ir_receiver  │                    │
         ▼                     └────────────────────┘                    │
┌─────────────────┐                                                      │
│ board-machine   │ <──────────────────────────────────────────────────── │
│ libraryState    │  syncLibraryState()                                   │ external sink
│ (servos, lcd)   │                                                       │ writes back
└─────────────────┘                                                       ▼
                                                                   [avr setPin()]
```

## The simulation loop

File: `packages/app/src/simulator/simulation-loop.ts`

`useSimulation()` returns `{ status, error, play, pause, resume, stop,
sendSerialInput, runner }` and owns:

- The `SketchRunner` instance (lazy, rebuilt when `boardTarget` changes).
- The rAF loop, stored in a ref so it survives renders.
- A Web Audio context used only when a `BuzzerPeripheral` is active.
- Cached "last serialized library state" so downstream XState dispatches are
  deduped.

### Frame cadence

`tick()` in `startLoop()` runs once per `requestAnimationFrame`. Key rates:

- **Circuit analysis** runs on frame 1 and every 12th frame thereafter —
  about 5 Hz at 60 fps (`simulation-loop.ts:313`). DC analysis is expensive
  (spicey solver over every node) and analog voltages change slowly relative
  to pin edges; 5 Hz is the sweet spot between UI smoothness and solver cost.
- **AVR execution** runs every frame — `runner.runLoopIteration()` advances
  exactly `AVR_CYCLES_PER_FRAME = 16_000_000 / 60 ≈ 266_667` simulated cycles
  (`runners/avr-runner.ts:27`). This keeps simulated MCU time locked to wall
  clock at 1:1 on a 60 fps display.
- **React yield**: every 4th frame the loop uses `setTimeout(0)` instead of
  rAF, letting React/DevTools breathe. Without this, a heavy chat stream
  rerender can starve the tick.
- **Peripheral tick** runs at 20 Hz (every 50 ms) via `setInterval` inside the
  runner (`runners/avr-runner.ts:93`). This is for peripherals that need
  periodic housekeeping — silence timeouts, envelope endings — not for
  routing pin edges. Edges flow synchronously on port-listener callbacks.

### Analog voltage flow

`runInlineAnalysis()` (`simulation-loop.ts:225`):

1. Skip if the board has no non-board circuit components (saves solver cost).
2. Snapshot the pin store via `snapshotAsPinStates(store)` and hand it to
   `analyzeCircuit(components, wires, pinStates)`.
3. Walk the resulting `componentStates`; any component pin (`comp.pins[key]`)
   that maps to an Arduino analog pin gets its voltage converted via
   `voltsToAnalog(v) = round(min(5, |v|) / 5 * 1023)` and written via
   `store.writeExternal(pin, { analogValue })`.
4. Fan-out step: walk wires whose `fromRow === -999` (the Arduino-pin sentinel)
   and whose `fromCol` is an analog pin. If the `to` end lands on a circuit
   component's footprint, assign that component's voltage to the analog pin.
   This is how `analogRead(A0)` sees a voltage divider landed on row 5.
5. **Always** call `applySensorInputs(components, wires, store, environment,
   peripheralBus)` last — including when analysis returned `isValid === false`
   — so sensor-driven inputs (photoresistor, PIR, DHT, ultrasonic, IR) still
   push their environment-driven readings into the pin store and peripheral
   bus even on broken boards.

### Library state sync

`syncLibraryState()` reads the peripheral bus snapshot and dispatches a single
`SET_LIBRARY_STATE` event to the board machine — only when the serialized
shape differs from the previous dispatch. This is what makes the servo arm
rotate and the LCD text render without forcing a rerender per tick.

## SketchRunner contract

File: `packages/app/src/simulator/runners/sketch-runner.ts`

```ts
interface SketchRunner {
  readonly kind: RunnerKind      // 'avr' | 'rp2040' | 'compile-only'
  readonly fqbn: string

  loadSketchAsync(code, customLibs?, opts?): Promise<{ success, error? }>
  runSetup(): void
  runLoopIteration(): boolean

  sendSerialInput(text): void
  getPinState(pin): PinSnapshot
  getMillis(): number
  reset(): void

  isDelaying(): boolean            // legacy: AVR always returns false
  getMode(): RunnerKind            // legacy alias for .kind

  getPinStore(): PinStateStore     // shared with React
  getPeripheralBus(): PeripheralBus
  attachBoard(input): void
  getSketchSize?(): SketchSizeInfo | null
}
```

The same interface is used by `simulation-loop.ts` unchanged across backends.
Today only `createAvrSketchRunner(target, callbacks, store?)` is implemented
(`runners/avr-runner.ts`). The factory in `runners/index.ts` currently wires
every board target to the AVR runner.

### AVR runner implementation

`createAvrSketchRunner(target, callbacks, store)`:

1. Creates a fresh `PeripheralBus`.
2. On `loadSketchAsync(code)`:
   - `reset()`.
   - Calls `compileSketch()` which POSTs to `/api/compile` and NDJSON-streams
     arduino-cli output back, parsing the final `hex` / `uf2` field. AVR path
     parses Intel HEX into a `Uint16Array`.
   - Rebuilds the low-level `AVRRunner` via `createAVRRunnerInstance()` and
     `.load(program)`.
   - Registers the external-pin sink on the pin store
     (`store.setExternalPinSink((pin, v) => avrRunner.setExternalPin(...))`)
     so UI writes propagate into the emulator's PIN register.
3. Execution happens in `executeChunked(totalCycles)` which loops
   `SCHEDULER_STEP_CYCLES = 160` cycles at a time and calls
   `peripheralBus.flushScheduledEdges(simMs)` between chunks
   (`runners/avr-runner.ts:209`). 160 cycles on a 16 MHz AVR = 10 µs of
   simulated MCU time. This matters because:
   - **HC-SR04 echo** produces 58 µs per cm. Coarser resolution would
     quantize distance readings to multi-cm bands.
   - **DHT11/22 bits** distinguish "0" (26 µs HIGH) from "1" (70 µs HIGH). A
     1 ms step would collapse both into the same reading.
   - **NEC IR** has 562 µs minimum envelope pulses.
   `runSetup` runs 800,000 cycles (~50 ms); each frame runs 266,667.
4. Serial output is byte-aligned from the USART. A 200 ms idle timer plus
   newline-flush buffers bytes into lines before firing `onSerialPrint`, so
   the Serial Monitor renders one entry per line rather than per character.

### Pin ↔ port mapping

`packages/app/src/simulator/avr-runner.ts:59` lays out the Uno/Nano map:

```
D0–D7   → PORTD bits 0–7           (offset 0)
D8–D13  → PORTB bits 0–5           (offset 8)
A0–A5   → PORTC bits 0–5 (aka pins 14–19, offset 14)
```

`arduinoPinToPort(n)` and `portToArduinoPin(port, bit)` do both directions.

### Port listener — the critical piece

`wireListeners()` (`avr-runner.ts:130`) subscribes a single callback per port.
avr8js fires the port listener on **both** DDR and PORT writes, so this one
callback covers the entire state machine: digital-write flips, `pinMode()`
transitions, `INPUT_PULLUP` enable/disable.

Two things to understand here:

1. **Per-pin `PinState` cache.** `lastPinState[port][i]` tracks the last
   reported enum value. We can't rely on avr8js's `(value, oldValue)` diff
   because DDR changes toggle the *mode* without necessarily flipping PORT
   bits. When the cached value differs, we fire the client callback.

2. **INPUT_PULLUP seeding.** avr8js's PIN register reflects `pinValue` (set
   via `setPin`), not PORT. For output pins the port drives PIN automatically;
   for input pins with the internal pull-up enabled, nothing writes 1 into
   PIN unless we do. So when a transition to `InputPullUp` is detected, the
   runner calls `port.setPin(i, true)` immediately (`avr-runner.ts:150`).
   Without this, `digitalRead()` on an `INPUT_PULLUP` pin returns 0, which
   breaks the standard button idiom. Symmetric: a transition back to `Input`
   calls `setPin(i, false)` to release the line LOW.

In the SketchRunner's `onPinChange` (`runners/avr-runner.ts:108`) the state
is collapsed into `{ digitalValue, mode }` and passed through to the pin
store. Every pin transition — both output flips and mode changes — is
additionally dispatched to the peripheral bus via `peripheralBus.dispatchEdge`.
The dispatched `simMs` is derived from `cpu.cycles / freq`, not wall clock,
because wall-clock time would collapse a 20 ms servo frame into ~1 ms of JS
time (the AVR simulates 16 ms of MCU time in ~1 ms of real time).

## Pin state store

File: `packages/app/src/simulator/pin-state-store.ts`

A class-instance singleton that owns a snapshot array of 20 `PinSnapshot`
values. Reactive via `useSyncExternalStore`: every mutation replaces the
snapshot array by reference (shallow `slice()`), so React's default
referential equality check picks it up with zero deep-compare.

### Two write paths

| Method | Caller | Rule |
| --- | --- | --- |
| `writeFromSketch(pin, changes)` | AVR `onPinChange` callback | Always wins. The sketch owns its pins. |
| `writeExternal(pin, changes)` | Button presses, inspector, circuit solver, sensors | Skipped when `snapshot[pin].mode === "OUTPUT"`. |

The OUTPUT rule is a simple short-circuit simulation: if the MCU has claimed
a pin as output, writing a button press to it has no effect (just like
real hardware). It also prevents the circuit solver from fighting the AVR
for analog values on pins the sketch is actively PWM-ing.

### INPUT_PULLUP seeding

When `writeInternal` sees `mode` change to `INPUT_PULLUP` without an explicit
`digitalValue`, it seeds `digitalValue=1` (`pin-state-store.ts:184`). Symmetric
seeding to 0 happens for bare `INPUT`. This mirrors the `avr-runner.ts` seed
one level higher — the UI still reads the correct default even for
transpile-mode runs that never passed through avr8js.

### External pin sink

`setExternalPinSink(fn)` registers a callback that fires whenever
`writeExternal` changes `digitalValue`. The active SketchRunner uses this to
forward UI-driven writes into the MCU's PIN register. Without the sink, a
button press would update the store (so `usePinState()` renders the button
pressed) but `digitalRead()` inside the sketch would keep seeing the old
value. The AVR runner wires the sink in `createAVRRunnerInstance()`
(`runners/avr-runner.ts:156`) and unregisters it on `reset()`.

### Interrupts

`attachInterrupt(pin, mode, cb)` registers a JS callback. On every
`digitalValue` change the store calls `checkInterrupt` which fires the
callback if the edge mode matches (RISING / FALLING / CHANGE / LOW).
ISR callback errors are silently swallowed — matches real Arduino behavior
(no stderr in an ISR).

## Peripheral bus

File: `packages/app/src/simulator/peripherals/peripheral-bus.ts`

The peripheral bus owns every simulated device for a single sim run. It:

- Builds peripherals from the current board on `attachBoard(input)`. Factories
  are registered per `ComponentType` at module load — the built-in registry
  is in `peripheral-bus.ts:36`: servo, buzzer, lcd, ultrasonic, dht, ir.
- Indexes peripherals by pin (`byPin`) and by type (`byType`) so
  `dispatchEdge(edge)` can fan out in O(watchers) and stdlib lookups like
  `findByTypeOnPin` are O(1).
- Aggregates per-component state into `snapshot(): Record<id, PeripheralState>`
  so the simulation loop can hand slices of it to the board machine and the
  Web Audio reconciler.

### The Peripheral interface

`peripherals/types.ts`:

```ts
interface Peripheral {
  readonly id: string
  readonly componentType: ComponentType
  readonly capabilities: ReadonlySet<PeripheralCapability>
  readonly watchedPins: ReadonlySet<number>

  attach(ctx: PeripheralContext): void   // wires, pinStore, trace, scheduleEdge
  onPinEdge(edge: PinEdge): void         // raw pin transitions from AVR/stdlib
  onTick(simMs: number): void            // 20 Hz housekeeping
  getState(): S | null                   // snapshot for React
  reset(): void
  getTrace(): ReadonlyArray<PeripheralTrace>
}
```

`PinEdge.simMs` is **simulated MCU time**, not `performance.now()`. Peripherals
that time envelopes (ultrasonic echo pulse, DHT bit frame, IR NEC) schedule
future edges against the same clock via `ctx.scheduleEdge(pin, value, atSimMs)`.

### Edge scheduling

`scheduleEdge(pin, value, atSimMs)` inserts into a sorted array of
`ScheduledEdge` entries (binary-search insertion — stays sorted by `atSimMs`).
`flushScheduledEdges(nowSimMs)` pops off the head and writes via
`pinStore.writeExternal`. The runner calls `flushScheduledEdges` every
`SCHEDULER_STEP_CYCLES = 160` cycles — see the [AVR runner](#avr-runner-implementation)
section. Because writes go through `writeExternal`, the external-pin sink then
forwards them into the AVR's PIN register, so `pulseIn(echoPin, HIGH)` can
actually see the simulated echo pulse.

### Example: HC-SR04

`ultrasonic.ts`. Watches the TRIG pin for a rising edge, waits ~500 µs, then
schedules two edges on ECHO — rising at `simMs + delay`, falling at
`simMs + delay + echoDurationUs/1000`. `echoDurationUs = distance_cm * 58`.
`sensor-inputs.ts::applyUltrasonic` continuously pushes distance readings
from `environment.obstacles` (or a manual inspector value) into the peripheral
via its `setDistance(cm)` method, so the *next* trigger pulse uses the current
distance.

### Adding a new peripheral

1. Implement the factory in `peripherals/<name>.ts`. Read `types.ts` for the
   interface; copy the shape of `buzzer.ts` (simplest) or `ultrasonic.ts`
   (uses scheduling).
2. Register it in `peripheral-bus.ts` via `registerPeripheralFactory(type, factory)`.
3. If the peripheral exposes state to the UI, extend the `PeripheralState`
   union in `types.ts` with a new `kind`.
4. If the peripheral is inspector-driven (user changes a slider to make the
   sensor read X), add a handler in `sensor-inputs.ts::applySensorInputs`.

## Circuit solver

Files: `packages/app/src/simulator/circuit-solver.ts`,
`packages/app/src/simulator/netlist-builder.ts`

`analyzeCircuit(components, wires, pinStates)`:

1. Drop board components (`isBoardComponentType`) and wires-as-components;
   keep only circuit elements.
2. Call `buildNetlist(components, wires, pinStates)`, which:
   - Builds a point→node map by walking `resolveNets()` from the breadboard
     grid (see [BREADBOARD.md](./BREADBOARD.md)).
   - For each circuit component, invokes the registry's `buildNetlist`
     callback with helpers `{ footprint, resolveNode }`. Each callback
     emits SPICE lines (e.g. `D_led1 n5 n6 LED_RED`) plus model lines.
   - Adds DC voltage sources for Arduino pins driving the net (5V, GND,
     digital HIGH/LOW from the pin states).
3. Hands the netlist to `simulate()` from the `spicey` library.
4. For each component, calls the registry's `computeElectricalState(comp, {
   voltageDrop, currentMa })` to derive UI state (LED brightness, reverse
   polarity, current-path flag, warnings).

Results feed two places: the breadboard overlay (LED glow, current-path
arrows) and the simulation loop's analog-pin voltage assignment.

## Compile pipeline

`packages/app/src/simulator/avr-compiler.ts` POSTs `{ code, fqbn,
customLibraries }` to `/api/compile`. The backend
(`packages/api/src/routes/compile.ts`) spawns `arduino-cli compile --output-dir
<tmp>`, streams stdout/stderr line-by-line as NDJSON `{kind:'log', tag,
line, ts}` events, then emits either `{kind:'done', hex, sizeInfo}` (AVR) or
`{kind:'done', uf2, sizeInfo}` (RP2040, base64). On missing-header failure
it tries `arduino-cli lib search` + `lib install` and retries, up to 3 times
(gated by `DREAMER_AUTO_INSTALL_LIBS` — always off in hosted mode).

The simulation loop forwards each NDJSON `log` event to `onBuildLog` so the
Code Output panel renders the compiler's full transcript.
