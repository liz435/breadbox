// ── Headless board simulation harness ───────────────────────────────────
//
// Runs a pre-compiled sketch (Intel HEX fixture) against a full board:
// the same AVR SketchRunner, PinStateStore, and PeripheralBus stack the
// app uses — peripherals attached, TWI wired, sensor inputs applied. This
// is what makes the example suites test *component interaction* (LCD text,
// NeoPixel colors, DHT frames over the wire protocol, I²C OLED traffic)
// rather than just bare pin toggles.

import {
  BOARD_TARGETS,
  DEFAULT_BOARD_TARGET,
  type BoardState,
  type RealismProfile,
} from "@dreamer/schemas"
import { analyzeCircuit } from "../../simulator/circuit-solver"
import { PowerDomain } from "../../simulator/power-domain"
import { powerModelFor } from "../../simulator/power-model"
import { createAvrSketchRunner } from "../../simulator/runners/avr-runner"
import { PinStateStore } from "../../simulator/pin-state-store"
import { applySensorInputs, resetSensorBuses } from "../../simulator/sensor-inputs"
import { SolverScheduler } from "../../simulator/solver-scheduler"
import { TransientSession } from "../../simulator/transient-session"
import { snapshotAsPinStates } from "../../simulator/pin-state-store"
import { isTransientSolverEnabled } from "../../simulator/transient-flag"
import { getBoardPinLayout } from "../../breadboard/breadboard-grid"
import type { PeripheralState } from "../../simulator/peripherals/types"
import type { ExpectedBehavior } from "../example-meta"

export type HeadlessObservations = {
  /** True if any buzzer peripheral reported `playing` during the run. */
  buzzerEverPlayed: boolean
  /** True if any 74HC595 output bit was ever latched HIGH. */
  shiftRegisterEverHigh: boolean
  /** Widest servo sweep observed (max - min angle), degrees. */
  servoSweepDeg: number
  /** Max count of non-black NeoPixel pixels observed at any point. */
  neopixelMaxLitPixels: number
  /** Lit-pixel count in the final OLED framebuffer. */
  oledLitPixels: number
  /** Final LCD text (all rows joined with newlines). */
  lcdText: string
  /** Fastest DC-motor rotor speed (0..1) observed during the run. */
  dcMotorMaxSpeed: number
}

export type HeadlessRunOptions = {
  /**
   * Realism profile to simulate under. Defaults to "learn", which leaves the
   * power gate off exactly as the app does.
   *
   * In "electrical"/"hardware" the harness runs the operating-point solve and
   * pushes solved supply state into the peripheral bus each iteration, the
   * same sequence as simulation-loop. Without this the harness never exercises
   * the power model at all — which is why a peripheral wrongly reported as
   * unpowered could pass the whole suite.
   */
  realismProfile?: RealismProfile
}

export type HeadlessRunResult = {
  serial: string
  /** Errors reported through the runner's onError callback. */
  runtimeErrors: string[]
  /** Digital-level transitions per Arduino pin over the whole run. */
  transitions: Map<number, number>
  /** Digital level per pin at the end of the run. */
  finalDigital: Map<number, 0 | 1>
  /** Peripheral snapshots at the end of the run, keyed by componentId. */
  peripheralsFinal: Record<string, PeripheralState>
  observations: HeadlessObservations
}

function countOledLitPixels(framebuffer: number[]): number {
  let lit = 0
  for (const byte of framebuffer) {
    let b = byte
    while (b) {
      lit += b & 1
      b >>>= 1
    }
  }
  return lit
}

/**
 * Execute `hex` on the board for `simulateMs` of simulated MCU time.
 * Runs the full app stack headlessly; safe to call repeatedly in tests
 * (sensor buses are reset per run, and the runner is torn down on exit).
 */
export function runBoardHeadless(
  board: BoardState,
  hex: string,
  simulateMs: number,
  options: HeadlessRunOptions = {},
): HeadlessRunResult {
  resetSensorBuses()
  const store = new PinStateStore()
  const realismProfile = options.realismProfile ?? "learn"
  const powerDomain = new PowerDomain()

  let serial = ""
  const runtimeErrors: string[] = []
  const target = BOARD_TARGETS[board.boardTarget ?? DEFAULT_BOARD_TARGET]
  const runner = createAvrSketchRunner(
    target,
    {
      onSerialPrint: (text) => {
        serial += text
      },
      onError: (error) => {
        runtimeErrors.push(error)
      },
    },
    store,
  )

  // Count digital transitions by diffing store snapshots on every notify —
  // the store notifies synchronously per pin write, so no edges are lost.
  const transitions = new Map<number, number>()
  let prevSnapshot = store.getSnapshot()
  const unsubscribe = store.subscribe(() => {
    const next = store.getSnapshot()
    for (let pin = 0; pin < next.length; pin++) {
      if (next[pin].digitalValue !== prevSnapshot[pin].digitalValue) {
        transitions.set(pin, (transitions.get(pin) ?? 0) + 1)
      }
    }
    prevSnapshot = next
  })

  const observations: HeadlessObservations = {
    buzzerEverPlayed: false,
    shiftRegisterEverHigh: false,
    servoSweepDeg: 0,
    neopixelMaxLitPixels: 0,
    oledLitPixels: 0,
    lcdText: "",
    dcMotorMaxSpeed: 0,
  }

  let servoAngleMin = Number.POSITIVE_INFINITY
  let servoAngleMax = Number.NEGATIVE_INFINITY

  // reset() flushes buffered serial (delivering any trailing partial line
  // through onSerialPrint), stops the peripheral tick interval, and
  // detaches the board — without it the interval would keep bun alive.
  // Run it BEFORE building the result so `serial` includes the tail, and
  // guard so the error path tears down exactly once.
  let torndown = false
  const teardown = () => {
    if (torndown) return
    torndown = true
    unsubscribe()
    runner.reset()
  }

  try {
    if (!runner.loadHex) {
      throw new Error(`runner kind "${runner.kind}" does not support loadHex`)
    }
    runner.loadHex(hex)
    runner.attachBoard({
      components: board.components,
      wires: board.wires,
      pinStore: store,
    })
    runner.runSetup()

    const bus = runner.getPeripheralBus()
    // Mirror the app loop's transient path (Phase A–C): the scheduler
    // advances the circuit on the MCU clock and the solved node voltages
    // feed the analog pins — this is what makes pot/LDR sketches read real
    // divider physics in the headless harness too. Generous budget: tests
    // prefer determinism over frame pacing.
    const scheduler = new SolverScheduler(new TransientSession(), { budgetMs: 1000 })
    const analogPinSet = new Set(
      getBoardPinLayout(board.boardTarget ?? DEFAULT_BOARD_TARGET).analogPins.map((p) => p.pin),
    )
    const feedSolvedAnalogVoltages = (): void => {
      if (!isTransientSolverEnabled()) return
      const hasCircuit = Object.values(board.components).some(
        (c) => c.type !== "wire",
      )
      if (!hasCircuit) return
      const tick = scheduler.tick({
        components: board.components,
        wires: board.wires,
        pinStates: snapshotAsPinStates(store),
        mcuTimeSeconds: runner.getMillis() / 1000,
      })
      if (!tick.analysis.isValid) return
      const voltsToAnalog = (v: number) =>
        Math.round((Math.min(5, Math.abs(v)) / 5) * 1023)
      for (const wire of Object.values(board.wires)) {
        if (wire.fromRow !== -999) continue
        if (!analogPinSet.has(wire.fromCol)) continue
        const volts = tick.analysis.nodeVoltageAt?.({ row: wire.toRow, col: wire.toCol })
        if (volts !== null && volts !== undefined) {
          store.writeExternal(wire.fromCol, { analogValue: voltsToAnalog(volts) })
        }
      }
    }
    // Solve the operating point and hand the peripherals their supply state,
    // mirroring simulation-loop. Learn mode skips it, matching the app.
    const applyPowerGate = (): void => {
      if (realismProfile === "learn") return
      const analysis = analyzeCircuit(
        board.components,
        board.wires,
        snapshotAsPinStates(store),
        undefined,
        { peripheralStates: bus.snapshot() },
      )
      // Deliberately not gated on isValid — simulation-loop applies power
      // state from any result it gets. A board that fails to solve has no
      // solved supplies, which is itself the correct "unpowered" answer.
      powerDomain.update(analysis.supplies, analysis.componentPower)
      bus.setPowerStates(
        new Map(
          Object.values(board.components)
            .filter((component) => powerModelFor(component.type) !== undefined)
            .map((component) => [
              component.id,
              powerDomain.isComponentOperating(component.id, component.type),
            ]),
        ),
      )
    }

    while (runner.getMillis() < simulateMs) {
      if (runtimeErrors.length > 0) break
      feedSolvedAnalogVoltages()
      applySensorInputs(
        board.components, board.wires, store, board.environment, bus,
        realismProfile, runner.getMillis(), powerDomain,
      )
      applyPowerGate()
      runner.runLoopIteration()
      bus.tick(runner.getMillis())

      for (const state of Object.values(bus.snapshot())) {
        switch (state.kind) {
          case "buzzer":
            if (state.playing) observations.buzzerEverPlayed = true
            break
          case "shift_register":
            if (state.outputs.some(Boolean)) observations.shiftRegisterEverHigh = true
            break
          case "servo":
            servoAngleMin = Math.min(servoAngleMin, state.angle)
            servoAngleMax = Math.max(servoAngleMax, state.angle)
            break
          case "dc_motor":
            observations.dcMotorMaxSpeed = Math.max(observations.dcMotorMaxSpeed, state.speed)
            break
          case "neopixel": {
            const lit = state.pixels.filter((p) => p.r > 0 || p.g > 0 || p.b > 0).length
            observations.neopixelMaxLitPixels = Math.max(
              observations.neopixelMaxLitPixels,
              lit,
            )
            break
          }
          default:
            break
        }
      }
    }

    const peripheralsFinal = bus.snapshot()
    for (const state of Object.values(peripheralsFinal)) {
      if (state.kind === "oled") {
        observations.oledLitPixels = Math.max(
          observations.oledLitPixels,
          countOledLitPixels(state.framebuffer),
        )
      }
      if (state.kind === "lcd") {
        observations.lcdText = state.textBuffer.join("\n")
      }
    }
    if (Number.isFinite(servoAngleMin) && Number.isFinite(servoAngleMax)) {
      observations.servoSweepDeg = servoAngleMax - servoAngleMin
    }

    const finalDigital = new Map<number, 0 | 1>()
    for (const pin of store.getSnapshot()) {
      finalDigital.set(pin.pin, pin.digitalValue)
    }

    teardown()

    return {
      serial,
      runtimeErrors,
      transitions,
      finalDigital,
      peripheralsFinal,
      observations,
    }
  } finally {
    teardown()
  }
}

/**
 * Check a run against an ExpectedBehavior. Returns failure messages —
 * empty array means every rule held.
 */
export function evaluateExpectedBehavior(
  expected: ExpectedBehavior,
  result: HeadlessRunResult,
): string[] {
  const failures: string[] = []
  const { observations: obs } = result

  for (const rule of expected.pinToggles ?? []) {
    const seen = result.transitions.get(rule.pin) ?? 0
    if (seen < rule.minToggles) {
      failures.push(`pin ${rule.pin}: expected ≥${rule.minToggles} toggles, saw ${seen}`)
    }
  }
  for (const rule of expected.pinFinalState ?? []) {
    const actual = (result.finalDigital.get(rule.pin) ?? 0) === 1 ? "HIGH" : "LOW"
    if (actual !== rule.state) {
      failures.push(`pin ${rule.pin}: expected final state ${rule.state}, saw ${actual}`)
    }
  }
  if (expected.serialContains && !result.serial.includes(expected.serialContains)) {
    failures.push(
      `serial: expected substring ${JSON.stringify(expected.serialContains)}, saw ${JSON.stringify(result.serial.slice(0, 120))}`,
    )
  }
  if (expected.serialNotContains && result.serial.includes(expected.serialNotContains)) {
    failures.push(
      `serial: must not contain ${JSON.stringify(expected.serialNotContains)}, saw ${JSON.stringify(result.serial.slice(0, 120))}`,
    )
  }
  if (expected.lcdShows && !obs.lcdText.includes(expected.lcdShows)) {
    failures.push(
      `lcd: expected text ${JSON.stringify(expected.lcdShows)}, saw ${JSON.stringify(obs.lcdText)}`,
    )
  }
  if (expected.oledMinLitPixels !== undefined && obs.oledLitPixels < expected.oledMinLitPixels) {
    failures.push(
      `oled: expected ≥${expected.oledMinLitPixels} lit pixels, saw ${obs.oledLitPixels}`,
    )
  }
  if (
    expected.neopixelMinLitPixels !== undefined &&
    obs.neopixelMaxLitPixels < expected.neopixelMinLitPixels
  ) {
    failures.push(
      `neopixel: expected ≥${expected.neopixelMinLitPixels} lit pixels, saw ${obs.neopixelMaxLitPixels}`,
    )
  }
  if (expected.buzzerPlays && !obs.buzzerEverPlayed) {
    failures.push("buzzer: expected the buzzer peripheral to report playing")
  }
  if (
    expected.servoMinSweepDeg !== undefined &&
    obs.servoSweepDeg < expected.servoMinSweepDeg
  ) {
    failures.push(
      `servo: expected a sweep ≥${expected.servoMinSweepDeg}°, saw ${obs.servoSweepDeg.toFixed(1)}°`,
    )
  }
  if (expected.shiftRegisterDrivesHigh && !obs.shiftRegisterEverHigh) {
    failures.push("shift register: expected at least one output latched HIGH")
  }
  return failures
}
