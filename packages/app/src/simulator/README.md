# Simulator

Arduino sketches run on a real AVR emulator (avr8js) after being compiled by
arduino-cli. Components on the breadboard observe the sketch's pin traffic
through a shared **peripheral bus** that produces one typed state blob per
component. The bus is the single source of truth — both the electrical
analyzer and every UI renderer read from it.

There is no JS-side Arduino transpiler. All C++ runs through arduino-cli.

## Pipeline

```
 sketch.ino ─► arduino-cli ─► hex ─► avr8js ─► pin edges ─► PeripheralBus ─► component state
                                       │                         │
                                       └─► PinStateStore ◄────────┘
                                                 │
                                        external writes (buttons, inspector sliders,
                                        circuit solver analog voltages)
```

Each hop is one file:

| Stage | File | What it does |
|---|---|---|
| Compile | `avr-compiler.ts` | Streams code to the API's `/api/compile` endpoint; returns Intel HEX + flash/RAM size info. |
| Emulate | `avr-runner.ts` | Wraps avr8js (ATmega328P). Owns port listeners that fan out edges for the runner callback. |
| Runner  | `runners/sketch-runner.ts` + `runners/avr-runner.ts` | `SketchRunner` interface + `AvrSketchRunner` implementation (`loadSketchAsync` → `runSetup` → `runLoopIteration` → `reset`); dispatches AVR edges into the peripheral bus with simulated MCU time. The factory in `runners/index.ts` picks the runner based on `BoardTargetInfo.runner`. |
| Edge fan-out | `peripherals/peripheral-bus.ts` | Per-run registry of `Peripheral` instances. Maintains a pin → peripherals index for O(1) edge dispatch. |
| Device state | `peripherals/{servo,buzzer,lcd,…}.ts` | Decode pin traffic into typed state. Expose capability tags ("soundSource", "positionActuator", …). |
| Pin mirror | `pin-state-store.ts` | Shared 20-pin snapshot so renderers and the circuit solver see the same values the VM does. |
| External input | `sensor-inputs.ts` (legacy), inspector sliders, circuit solver | Drive `pinStateStore.writeExternal` → forwarded to `avrRunner.setExternalPin`. |
| React driver | `simulation-loop.ts` | rAF loop calling `runLoopIteration`; reconciles Web Audio against bus state; pushes servos/LCD to the board XState machine. |

## The Peripheral contract

Every simulated component implements one interface (`peripherals/types.ts`):

```ts
interface Peripheral<S extends PeripheralState = PeripheralState> {
  readonly id: string
  readonly componentType: ComponentType
  readonly capabilities: ReadonlySet<PeripheralCapability>
  readonly watchedPins: ReadonlySet<number>
  attach(ctx: PeripheralContext): void
  onPinEdge(edge: PinEdge): void
  onTick(simMs: number): void
  getState(): Readonly<S> | null
  reset(): void
  getTrace(): ReadonlyArray<PeripheralTrace>
}
```

Key ideas:

- **`watchedPins`** — the bus only delivers edges for pins a peripheral
  cares about. Most peripherals resolve this from the wire topology in
  `attach` using `findArduinoPinsForComponent`.
- **Capabilities** — declarative tags used by downstream systems:
  `soundSource` (Web Audio listens), `positionActuator` (servo-like),
  `displaySink` (LCD/OLED), `lightEmitter`, `analogSensor`,
  `digitalSensor`, `requiresExternalPower` (power-budget analyzer).
- **Simulated time** — `PinEdge.simMs` is *simulated* MCU milliseconds
  (cycles / 16MHz × 1000), not `performance.now()`. The AVR runs ~16ms of
  simulated time in ~1ms of real JS time, so a 1.5ms servo pulse would look
  like 0.1ms on the wall clock. Every pulse-width measurement reads `simMs`.
- **State is reference-typed** — `PeripheralState` is a discriminated union
  so consumers switch on `state.kind`.

### Example: ServoPeripheral

- Watches its signal pin (either explicit in `component.pins.signal` or
  resolved by walking wires from the signal hole to an Arduino pin).
- On each falling edge, records HIGH pulse width in microseconds.
- After 3+ edges at 30–80 Hz with a 0.4–2.6 ms pulse → maps
  `(pulseUs − 544) / (2400 − 544) × 180°` to the angle.
- Emits `{ kind: "servo", pin, angle, attached }` from `getState()`.

### Example: BuzzerPeripheral

- Watches its signal pin.
- Requires a full 8-edge ring of recent transitions before emitting a
  frequency — prevents `shiftOut` / bit-banged SPI from producing false
  beeps.
- Estimates `(count − 1)/2 periods / elapsed × 1000` Hz and clamps to
  20 Hz–20 kHz. Silence for >150 ms drops `playing` back to false.
- `simulation-loop.syncAudioFromBus` reconciles Web Audio oscillators
  against buzzer state each tick — starts, retunes, or stops the
  `OscillatorNode` based on `{ playing, frequencyHz }` transitions.

## Adding a new peripheral

1. Create `peripherals/<name>.ts` exporting a class implementing `Peripheral`
   plus a factory `createXxxPeripheral(component)`.
2. Register it in `peripherals/peripheral-bus.ts`:
   ```ts
   registerPeripheralFactory("<componentType>", createXxxPeripheral)
   ```
3. Decide on capability tags — the bus, audio layer, and electrical
   analyzer pick it up automatically.
4. Add a unit test in `peripherals/__tests__/<name>.test.ts` that feeds
   synthetic `PinEdge`s and asserts `getState()`.
5. Renderers that want live state read `vm.getPeripheralBus().snapshot()`
   or `libraryState` (which `simulation-loop` derives from the bus).

## Observability

`components/peripheral-debug-panel.tsx` mounts a live view of the bus:
each peripheral's current state plus a rolling trace of edges / writes /
derivations / warnings. The dev panel polls `vm.getPeripheralBus()` at 200
ms. Useful when a peripheral "isn't doing anything" — the trace shows
whether edges are reaching it, whether they fit the expected pattern, and
whether state derivation fired.

## Testing

Three layers:

| Layer | Where | Needs arduino-cli? |
|---|---|---|
| Peripheral unit tests | `peripherals/__tests__/*.test.ts` | No. Feed synthetic `PinEdge`s directly. |
| Example board electrical | `examples/__tests__/example-behavior.test.ts` | No. Loads JSON, runs `analyzeElectricalBoard`. |
| Full sketch execution | (future) | Yes. Requires compile + hex caching. Not yet wired up in CI. |

Run `bun test src/` from `packages/app`.

## Conventions

- **Runner kinds:** `RunnerKind = "avr" | "rp2040" | "compile-only"`.
  - `"avr"` — full avr8js execution; Uno/Nano solid, Mega best-effort.
  - `"rp2040"` — rp2040js, lazy-loaded, GPIO works, USB CDC / PLL-dependent
    features don't until a real bootrom is supplied (see
    `runners/rp2040-runner.ts` header).
  - `"compile-only"` — not yet implemented; factory throws with a clear
    pointer so ESP32/STM32/SAMD support plugs in obviously.
  - Old `"transpile"` path and its hand-rolled JS stdlib shims were deleted.
- **Keep peripherals Node-safe** — no `window`, `document`, `AudioContext`,
  `requestAnimationFrame` imports in `peripherals/`. The audio layer lives
  in `simulation-loop.ts` and reads peripheral state, never the other way.
- **Strict discriminated-union state** — add a new `kind` to
  `PeripheralState` in `types.ts` before creating a peripheral that
  produces it. `getState()` returns `null` until the peripheral has
  observable data (don't dump a default-zero state blob).
- **Simulated time everywhere** — inside a peripheral, treat `simMs` as
  *the* clock. The VM's tick loop calls `bus.tick(getMillis())` so
  peripherals never need to read `performance.now()`.

## Dropped pieces (for history)

Three files + two test files, ~3500 lines, were removed when AVR became
the only mode:

- `arduino-transpiler.ts` — regex C++ → JS
- `arduino-stdlib.ts` — hand-rolled Servo/LCD/NeoPixel/DHT/IR shims
- `arduino-transpiler.test.ts`, `arduino-vm.test.ts`, `example-sketches.test.ts`
- A VM synchronous `loadSketch` method + mode switching in `simulation-loop.ts`
- The `arduino-vm.ts` monolith (its per-chip lifecycle moved to `runners/avr-runner.ts`; the `SketchRunner` interface in `runners/sketch-runner.ts` is now the contract).

The peripheral contract absorbed their responsibilities on the AVR side.
