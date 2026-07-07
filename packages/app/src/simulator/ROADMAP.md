# Simulator Pivot — Robust Transient Simulation

Decision (2026-07-06): pivot the simulator from an education-first
operating-point analyzer to a genuinely robust transient simulator, while
keeping the existing education surface. Constraints agreed:

- **Audience:** both — engineering-grade fidelity under the same friendly
  lessons/UI. Education features stay.
- **First target:** true transient circuit solver.
- **Performance budget:** slower-than-realtime is acceptable (SPICE-style),
  with an honest timescale indicator. Interactivity preserved via a worker.

## Why this is tractable

spicey (already a dependency, already bun-patched for pnjlim) natively
supports transient analysis: real capacitors (`vPrev`), inductors (`iPrev`),
Shockley diodes with Newton iteration, voltage-controlled switches, and
time-varying `waveform(t)` voltage sources. The app currently defeats all of
it: `netlist-builder.ts` emits `.tran 0.001 0.01` and `circuit-solver.ts`
reads only the last point (a pseudo operating point), models capacitors as
manually-evolved V sources on a display timescale, and approximates PWM as
duty-averaged DC corrected by a 3-pin switching-state enumeration.

The pivot is therefore mostly *app-side rearchitecture* plus **one**
engine-level addition (transistors).

---

## Phases

### Phase A — Continuous transient core

1. **Persistent transient session.** Keep the parsed circuit alive across
   frames; carry `vPrev`/`iPrev` forward; advance the circuit by exactly the
   AVR's simulated elapsed time. One unified timeline for MCU and circuit
   (today: circuit runs on wall clock at 5–30 Hz, MCU on sim time).
2. **Real capacitors.** Emit `C` elements; delete the Thevenin-probe
   evolution (`evolveCapacitorVoltages`) and `capacitor-state.ts` display
   stretch. Keep the watchable slow-motion view as an explicit
   **"demo timescale" toggle** (education requirement) — real time is the
   default.
3. **Inductors.** Emit `L` elements — unlocks motor coils and flyback
   lessons.
4. **PWM as real waveforms.** Drive PWM pins with square-wave `waveform(t)`
   sources at true frequency/duty from `PwmTracker`. Delete
   `solvePwmAverage` and the `MAX_PWM_ENUM_SOURCES = 3` cap.

Land behind a feature flag; validate against `circuit-solver.test.ts`,
`led-forward-voltage.test.ts`, and the example-behavior tables before
flipping the default.

### Phase A′ — Transistors in spicey (parallel engine track)

Independent of A–D (lives in the spicey patch, not the app), so it runs in
parallel. Sequencing note: Phase A's inductors unlock motor/relay lessons
that *need* a transistor driver — A′ completes those lessons.

1. **BJT (Ebers-Moll).** `Q<name> c b e <model>` parsing +
   `.model X NPN(IS=.. BF=..)`; two coupled junctions using the existing
   diode pattern (pnjLimit per junction, linearized 3×3 conductance block
   via `stampAdmittanceReal`/`stampCurrentReal`, convergence check
   extending `diodesConverged`). ~150–250 lines by analogy with the ~80-line
   diode implementation.
2. **MOSFET (level 1).** Square-law regions (cutoff/triode/saturation),
   `gm`/`gds` linearization; no junction limiting needed.
3. **Golden tests vs ngspice.** 2N2222 + base resistor + LED (saturation
   switch), common-emitter DC sweep (active region), motor + flyback diode.
4. **App side (after engine proves out):** `transistor` /`mosfet` component
   types in @dreamer/schemas, registry entries, breadboard footprints,
   netlist emission, renderer.
5. **Upstream PR** to tscircuit/spicey once stable (precedent: pnjlim).

### Phase B — Decouple solver from the render thread

1. **Web Worker.** Circuit stepping off the main thread; publishes state
   snapshots. PWM-resolution timesteps (~20 µs) will not fit a frame budget
   — this is where slower-than-realtime is exercised.
2. **Lockstep barrier.** MCU and circuit exchange pin states every fixed
   sim-time quantum so `analogRead` sees the circuit voltage of the *same
   simulated moment* (today: up to ~200 ms stale).
3. **Extend the realtime-factor badge** to the circuit domain.

### Phase C — Sensors through the circuit

1. Route **LDR and potentiometer** reads through the solver (LDR netlist
   element already exists; only the read path is injection). Voltage-divider
   wiring mistakes get real consequences.
2. **Keep** ultrasonic/PIR/IR/DHT as protocol-level injectors — their
   physics is non-electrical; that design stands.

### Phase D — Device fidelity (opt-in "strict hardware mode")

1. Button **contact bounce** (inject bounce edges via existing
   `scheduleEdge`).
2. **LCD timing strictness** (busy-flag window; sketches missing 37 µs
   delays fail like real hardware).
3. **I2C electrical realism**: clock stretching, repeated-START semantics,
   graceful address-collision behavior (bus corruption instead of sim-start
   crash).
4. Component **tolerances/noise** as opt-in.

---

## Updated limitations (current state, corrected)

Corrections vs. earlier audits are marked ▲.

### Solver / physics
- Repeated DC operating point despite the engine supporting transient
  analysis; capacitors faked as evolved V sources with a 0.3 s display-floor
  time stretch; PWM duty-averaged with 3-pin enumeration cap.
- ▲ **Inductors are supported by spicey but never emitted** by
  netlist-builder — not an engine gap, an app gap.
- ▲ **Transistors do not exist anywhere**: no component type in the schema,
  no netlist emission, no spicey element. Nothing is "faked as a switch" —
  the concept is absent (which is why the "you need a transistor" lesson is
  prose-only).
- No component tolerances, noise, thermal effects, reverse breakdown, or AC
  analysis (spicey has `.ac`; unused).
- Two-clock problem: circuit state lags MCU time by up to ~200 ms; capacitor
  transients run on a third (display) timescale.

### Sensors
- LDR/pot/TMP36/PIR/ultrasonic/DHT/IR readings injected directly into the
  pin store, bypassing wiring beyond signal-pin identification. World model
  is 2D canvas ray-casting.

### I2C
- ▲ **User sketches CAN drive I2C.** All code compiles via arduino-cli and
  runs on avr8js's real TWI peripheral — `Wire.beginTransmission()` etc.
  work. The LEARN_TOPICS "Wire — Phase 4" item is a missing *doc page*, not
  missing functionality.
- Actual gaps: reads from unregistered addresses return 0xFF (silently
  ack'd); no open-drain/pull-up electrical modeling; no clock stretching; no
  repeated-START semantics; 7-bit only; single bus; duplicate addresses
  throw at sim start instead of corrupting like real hardware.

### Boards
- Uno/Nano solid (avr8js: USART/TWI/SPI/EEPROM/ADC/WDT wired).
- Mega 2560 executes on a 328P core — Timer3/4/5, USART1–3, pins 20–53
  absent (warned in build log).
- RP2040 needs vendored bootrom for timing/USB-CDC; **no TWI bridge** (I2C
  components skip on Pico).
- ESP32/STM32/SAMD: `compile-only` runner throws — unimplemented.

### Peripherals
- LCD: 4-bit only, no timing enforcement, no busy flag, no shift-on-write.
- OLED: Adafruit command subset; scrolling no-ops; reads return 0x00.
- No button contact bounce.
- Power budget is a profile lookup table, not reconciled with solver
  currents (framed as estimate; deliberate).

---

## Updated risk register

| # | Risk | Phase | Severity | Mitigation |
|---|------|-------|----------|------------|
| 1 | **Numerical robustness**: spicey uses fixed timestep, dense Gaussian solve, Newton capped at 100 iterations, no adaptive error control, no gmin stepping. Stiff circuits (small RC + 20 µs PWM steps) may not converge or may alias. | A | High | Adaptive dt with local truncation error control; add gmin; consider trapezoidal integration (currently backward Euler). Standard SPICE3 techniques, well documented. |
| 2 | **Performance**: PWM-resolution transient (~20 µs steps) is ~10⁴ solves per simulated second. | A/B | High | Worker isolation (B); slower-than-realtime accepted by decision; event-driven stepping (analytical advance between PWM edges); only enter fine-step mode when reactive elements present. |
| 3 | **Transistor convergence** at saturation boundary; oscillator circuits. | A′ | Medium | gmin + source-stepping fallbacks; golden tests vs ngspice before app exposure. |
| 4 | **Education regression**: real-time caps make RC transients invisible (they complete in ms); 22 lessons + example behavior tables assume current behavior. | A | High | "Demo timescale" toggle default-on in lessons context, off in free-build; re-run the full example-behavior test suite; behavior tables are mandatory per project convention. |
| 5 | **Patch drift**: transistor work lives in the bun patch of spicey until upstreamed; version bumps require re-porting (precedent: pnjlim re-port note). | A′ | Medium | Keep patch minimal and self-contained; upstream PR early; pin spicey version. |
| 6 | **Two-clock unification breaks hidden assumptions**: peripherals, pwm-tracker, and capacitor-state all encode wall-clock assumptions. | A/B | Medium | Feature flag + parallel old/new solver paths until parity proven; delete old path only after example suite passes on new path. |
| 7 | **Worker serialization overhead** (structured-clone of state snapshots per barrier). | B | Low | Transferable ArrayBuffers for node-voltage vectors; snapshot at barrier cadence, not per step. |
| 8 | **Scope creep** toward tier-3 items (thermal, tolerances, AC, real Mega emulation). | all | Medium | Phases are gates; tier-3 stays out unless a lesson or user demands it. |

## Mitigation detail — Risks 1 & 2

### Risk 1: numerical robustness

Failure modes: Newton non-convergence (today spicey gives up silently at
iteration 100 — `if (iter === 99) break`, no error), singular matrices from
floating nodes, and backward-Euler's artificial damping falsifying LC physics.

1. **gmin** (~10 lines, do first). Stamp 1e-12 S across every nonlinear
   junction and node→ground. Prevents singular matrices, gives Newton a
   gradient everywhere. Generalizes the app's hand-rolled `R_bleed` 1 GΩ
   resistors (netlist-builder.ts) into the engine.
2. **Convergence retry ladder** instead of silent failure:
   - *gmin stepping:* solve at gmin=1e-4, reduce ×10 stepwise to 1e-12,
     seeding each solve with the previous solution.
   - *source stepping:* ramp all V sources 0 → full in steps.
   Standard SPICE3 continuation; composes with the existing pnjlim patch.
3. **Adaptive timestep with LTE control** (core fix). Estimate local
   truncation error per step (BE vs trapezoidal estimate); error > tol →
   halve dt and redo; well under → grow dt (×2, capped). Newton
   non-convergence *also* triggers dt halving — timestep control doubles as
   convergence rescue.
4. **Trapezoidal integration.** spicey's C companion is backward Euler
   (`Gc = C/dt`, first-order), which numerically damps oscillations — LC
   flyback ringing would decay when physics says it shouldn't. Trapezoidal
   is a companion-model change (`Geq = 2C/dt` + history current term),
   ~30 lines; it is the difference between plausible and correct.
5. **Regression tests, not vibes:** RC τ within 5% of analytical; LC ringing
   frequency within 1% of 1/(2π√LC); ngspice goldens in the patch test suite.

### Risk 2: performance

Arithmetic: circuits are small (10–60 nodes; each solve cheap) — the cost is
**step count**: naïve 20 µs uniform stepping under 490 Hz PWM ≈ 50k steps ×
~3 Newton iterations per simulated second. Two levers: fewer steps, cheaper
steps.

**Fewer steps (the big lever):**

1. **Event-driven stepping.** PWM edges are known analytically from
   PwmTracker — force a step boundary exactly at each edge; between edges
   sources are piecewise-constant DC, so adaptive dt grows exponentially
   (RC settles in ~5τ, then nothing changes until the next edge). ~10–30
   well-placed steps per PWM period instead of ~100 uniform, zero aliasing.
2. **Dormancy detection.** No reactive elements, or all transients settled
   below tolerance → drop out of transient stepping; re-solve only on input
   events (pin edge, inspector slider). Fine-stepping engages only when a
   switching source actually drives a reactive element — statically
   detectable in the netlist builder. Most boards (LED+resistor+button) are
   purely resistive and never fine-step at all.

**Cheaper steps:**

3. **Kill the allocations.** spicey allocates a fresh N×N matrix on *every
   Newton iteration* (`Array.from(...)` inside the iter loop), and the app
   rebuilds + re-parses the netlist string every analysis frame.
   Preallocated Float64Arrays zeroed in place + the persistent parsed
   circuit from Phase A ≈ 5–10× constant-factor win before any algorithms.
4. **Skip Newton when linear.** No diodes/transistors (or no region change)
   → first solve is exact, no iteration.

**Architecture (Phase B):**

5. **Worker with a time-budget scheduler.** Solver consumes a compute budget
   per chunk, reports achieved sim-time. UI needs ≤60 snapshots/sec —
   decimate, ship node voltages as transferable Float64Arrays.
6. **The honesty valve.** When the circuit can't keep up with the MCU, slow
   the MCU to maintain lockstep (correctness over speed, per decision);
   realtime-factor badge shows e.g. "×0.3 realtime". Letting the clocks
   drift apart is exactly the two-clock lie the pivot removes.

**Escalation order:** measure baseline steps/sec on representative boards →
allocation fixes (cheap, huge) → event-driven stepping → adaptive dt →
worker → WASM inner loop *only if still short* (not expected at breadboard
scale; sub-realtime with lockstep is acceptable by decision).

## Verification strategy

- Unit: existing `circuit-solver.test.ts`, `led-forward-voltage.test.ts`,
  `netlist-builder.test.ts` must pass on the new path (values may tighten —
  update goldens with justification, never loosen).
- Engine: ngspice golden-value comparisons for every new element (BJT,
  MOSFET, inductor emission, PWM waveform) checked into spicey patch tests.
- Integration: full example-board behavior tables
  (`examples/__tests__/example-behavior.test.ts`) on both solver paths
  during the flag period.
- New physics tests: RC time constant accuracy (measure τ from the
  transient, assert within 5%), LC ringing frequency, flyback spike
  clamping, BJT switch saturation voltage.
