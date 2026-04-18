// ── Sensor Inputs ─────────────────────────────────────────────────────────
//
// Bridges visual-only sensor components to the running sketch.
//
// Problem:
//   Components like the photoresistor, ultrasonic sensor, PIR, DHT, and IR
//   receiver have an "environment" reading that the sketch wants to read via
//   `analogRead`, `digitalRead`, `pulseIn`, or a library call. They are not
//   well-modelled by the SPICE circuit solver — either because their physics
//   (light, distance, motion, temperature) isn't electrical or because modelling
//   them with voltage sources makes spicey unstable.
//
// Design:
//   1. Each input component stores its current reading in `component.properties`.
//      The inspector mutates those properties; the user controls the world.
//   2. Once per simulation tick (inside `runInlineAnalysis`), this module walks
//      all input components, resolves their wired/explicit signal pin, and
//      pushes values via `store.writeExternal()` for analog/digital sensors, or
//      into a module-level bus for libraries that are polled via class methods
//      (DHT, IR).
//   3. Stdlib classes (`DHTClass`, `IRrecvClass`) and `pulseIn()` read from the
//      matching bus keyed by pin number.
//
// Why a bus instead of SPICE:
//   Injecting values directly into the pin store bypasses the circuit solver
//   for these sensors entirely. This is intentional — the solver cannot model
//   the physics (light, air, RF), and simulating them as voltage sources makes
//   the netlist unstable. The trade-off is that the sensors ignore wiring
//   beyond identifying the signal pin.
//
// Invalidation:
//   All buses are cleared by `resetSensorBuses()`, which simulation-loop.ts
//   should call on sim stop so stale values don't leak between runs.

import type { BoardComponent, Wire, Environment } from "@dreamer/schemas"
import type { PinStateStore } from "./pin-state-store"
import { findInputPinForComponent, findArduinoPinsForComponent } from "@/breadboard/component-pin-resolver"
import {
  sensorRay,
  raycastDistance,
  environmentToSegments,
  pixelsToCm,
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
} from "./ray-cast"

// ── Per-pin busses consulted by stdlib ────────────────────────────────────

/**
 * Distance in cm for HC-SR04 ultrasonic sensors, keyed by echo pin.
 * Read by `pulseIn(pin, HIGH, ...)` in the stdlib.
 */
export const ultrasonicDistanceBus = new Map<number, number>()

/**
 * DHT11/22 readings keyed by signal pin.
 * Read by `DHTClass.readTemperature()` / `.readHumidity()`.
 */
export const dhtSensorBus = new Map<number, { temperatureC: number; humidity: number }>()

/**
 * Pending IR code per signal pin, with an expiry timestamp in ms since epoch.
 * Read by `IRrecvClass.decode()`, cleared once consumed or once expired.
 */
export const irReceiverBus = new Map<number, { code: number; expiresAt: number }>()

/**
 * Trigger pin for each ultrasonic sensor keyed by echo pin.
 * Used by `pulseIn()` to validate the sketch sent a trigger pulse.
 */
export const ultrasonicTriggerPinBus = new Map<number, number>()

/** Tracks the most recent `pendingCodeAt` we've dispatched to each
 *  IrReceiverPeripheral so back-to-back inspector-triggered sends
 *  don't fire twice for the same user click. */
const irLastPendingAt = new Map<string, number>()

/** Clear all sensor busses — called on simulation reset/stop. */
export function resetSensorBuses(): void {
  ultrasonicDistanceBus.clear()
  dhtSensorBus.clear()
  irReceiverBus.clear()
  ultrasonicTriggerPinBus.clear()
  irLastPendingAt.clear()
}

// ── Helpers ───────────────────────────────────────────────────────────────

/**
 * Pick the signal pin for a component, preferring explicit pin assignments
 * for sensors where we know the exact pin name, falling back to wire tracing.
 */
function resolveNamedPin(
  comp: BoardComponent,
  pinName: string,
  wires: Record<string, Wire>,
): number | null {
  const explicit = comp.pins[pinName]
  if (explicit != null) return explicit
  // Fallback: any Arduino pin wired to this component.
  const wired = findArduinoPinsForComponent(comp, wires)
  return wired[0] ?? null
}

// ── Per-component readers ────────────────────────────────────────────────

/**
 * Photoresistor: convert the inspector's light % into an analog reading.
 * Uses the common voltage-divider wiring (5V → fixed R → Apin → LDR → GND):
 * bright light ⇒ low analog value, dark ⇒ high analog value.
 */
function writePhotoresistor(
  comp: BoardComponent,
  wires: Record<string, Wire>,
  store: PinStateStore,
): void {
  const pin = findInputPinForComponent(comp, wires)
  if (pin == null || pin < 0) return
  const light = clamp((comp.properties.light as number) ?? 50, 0, 100)
  // 100% bright → ~0, 0% dark → ~1023. Non-linear curve feels more like a real LDR.
  const normalized = 1 - light / 100 // 0 bright → 1 dark
  const analogValue = Math.round(normalized ** 1.5 * 1023)
  store.writeExternal(pin, { analogValue })
}

/**
 * TMP36 temperature sensor: push the inspector temperature onto the signal pin
 * using the TMP36 formula (Vout = 0.5 + temp × 0.01). Bypasses SPICE so it
 * works even without VCC/GND wires.
 */
function writeTemperatureSensor(
  comp: BoardComponent,
  wires: Record<string, Wire>,
  store: PinStateStore,
): void {
  const pin = resolveNamedPin(comp, "signal", wires)
  if (pin == null || pin < 0) return
  const temp = clamp((comp.properties.temperature as number) ?? 25, -40, 125)
  const voltage = 0.5 + temp * 0.01
  const analogValue = Math.round((clamp(voltage, 0, 5) / 5) * 1023)
  store.writeExternal(pin, { analogValue })
}

/**
 * HC-SR04 ultrasonic sensor: compute distance via ray-casting against
 * the environment, or fall back to the inspector slider value. When a
 * peripheral bus is supplied the value is pushed into the component's
 * `UltrasonicPeripheral` so the AVR-compiled `pulseIn()` sees the right
 * echo pulse shape. The legacy `ultrasonicDistanceBus` is kept populated
 * for any remaining non-peripheral readers but has no user impact now
 * that the transpile-mode stdlib is gone.
 */
function writeUltrasonic(
  comp: BoardComponent,
  wires: Record<string, Wire>,
  environment: Environment,
  bus?: import("./peripherals/peripheral-bus").PeripheralBus,
): void {
  const echoPin = resolveNamedPin(comp, "echo", wires)
  const triggerPin = resolveNamedPin(comp, "trigger", wires)

  // Distance comes exclusively from the canvas environment (ray-cast).
  // No slider fallback — if nothing's in range, `distance` stays null so
  // the peripheral skips the echo pulse and pulseIn() reads 0 (timeout).
  let distance: number | null = null
  const segments = environmentToSegments(environment, CANVAS_WIDTH, CANVAS_HEIGHT)
  if (segments.length > 0) {
    const ray = sensorRay(comp)
    const pixelDist = raycastDistance(ray, segments)
    if (isFinite(pixelDist)) {
      const cm = pixelsToCm(pixelDist)
      if (cm <= 400) {
        distance = Math.max(2, cm)
      }
    }
  }

  // Legacy side-channel (still populated in case anything reads from it).
  if (echoPin != null) {
    if (triggerPin != null) ultrasonicTriggerPinBus.set(echoPin, triggerPin)
    ultrasonicDistanceBus.set(echoPin, distance ?? Infinity)
  }

  // Peripheral path (authoritative in AVR mode).
  const peripheral = bus?.get(comp.id)
  if (
    peripheral &&
    peripheral.componentType === "ultrasonic_sensor" &&
    "setDistance" in peripheral &&
    typeof (peripheral as { setDistance?: (cm: number | null) => void }).setDistance === "function"
  ) {
    ;(peripheral as { setDistance: (cm: number | null) => void }).setDistance(distance)
  }
}

/**
 * PIR motion sensor: toggle the signal pin HIGH/LOW based on the inspector's
 * "Motion detected" switch.
 */
function writePir(
  comp: BoardComponent,
  wires: Record<string, Wire>,
  store: PinStateStore,
): void {
  const pin = resolveNamedPin(comp, "signal", wires)
  if (pin == null) return
  const motion = (comp.properties.motion as boolean) === true
  store.writeExternal(pin, { digitalValue: motion ? 1 : 0 })
}

/**
 * DHT11/22: route inspector temperature + humidity into the `DhtPeripheral`
 * so the AVR-compiled DHT library sees a correctly-timed response frame.
 * The legacy `dhtSensorBus` stays populated for any remaining reader.
 */
function writeDht(
  comp: BoardComponent,
  wires: Record<string, Wire>,
  bus?: import("./peripherals/peripheral-bus").PeripheralBus,
): void {
  const pin = resolveNamedPin(comp, "signal", wires)
  const temperatureC = clamp((comp.properties.temperature as number) ?? 25, -40, 80)
  const humidity = clamp((comp.properties.humidity as number) ?? 50, 0, 100)

  if (pin != null) dhtSensorBus.set(pin, { temperatureC, humidity })

  const peripheral = bus?.get(comp.id)
  if (
    peripheral &&
    peripheral.componentType === "dht_sensor" &&
    "setReading" in peripheral &&
    typeof (peripheral as { setReading?: (t: number, h: number) => void }).setReading === "function"
  ) {
    ;(peripheral as { setReading: (t: number, h: number) => void }).setReading(temperatureC, humidity)
  }
}

/**
 * IR receiver: detect a newly-stamped `pendingCode` (hex string) from the
 * inspector and fire a NEC frame on the IrReceiverPeripheral. The legacy
 * `irReceiverBus` stays populated as a safety net.
 */
function writeIrReceiver(
  comp: BoardComponent,
  wires: Record<string, Wire>,
  bus?: import("./peripherals/peripheral-bus").PeripheralBus,
): void {
  const pin = resolveNamedPin(comp, "signal", wires)
  const pendingCode = comp.properties.pendingCode as string | undefined
  const pendingAt = comp.properties.pendingCodeAt as number | undefined

  if (pendingCode && pendingAt != null && pin != null) {
    const expiresAt = pendingAt + 250
    irReceiverBus.set(pin, { code: parseInt(pendingCode, 16) || 0, expiresAt })
  }

  // Peripheral path — edge-triggered on a new pendingAt timestamp.
  const peripheral = bus?.get(comp.id)
  if (
    peripheral &&
    peripheral.componentType === "ir_receiver" &&
    "sendCode" in peripheral &&
    typeof (peripheral as { sendCode?: (code: number) => void }).sendCode === "function"
  ) {
    const lastSeen = irLastPendingAt.get(comp.id) ?? 0
    if (pendingAt != null && pendingAt > lastSeen && pendingCode) {
      irLastPendingAt.set(comp.id, pendingAt)
      const code = parseInt(pendingCode, 16) || 0
      ;(peripheral as { sendCode: (code: number) => void }).sendCode(code)
    }
  }
}

// ── Public entry point ───────────────────────────────────────────────────

/**
 * Walk all components and apply their environment-driven readings to the
 * pin store or the stdlib busses. Called once per circuit-analysis tick.
 */
export function applySensorInputs(
  components: Record<string, BoardComponent>,
  wires: Record<string, Wire>,
  store: PinStateStore,
  environment: Environment,
  bus?: import("./peripherals/peripheral-bus").PeripheralBus,
): void {
  for (const comp of Object.values(components)) {
    switch (comp.type) {
      case "photoresistor":
        writePhotoresistor(comp, wires, store)
        break
      case "temperature_sensor":
        writeTemperatureSensor(comp, wires, store)
        break
      case "ultrasonic_sensor":
        writeUltrasonic(comp, wires, environment, bus)
        break
      case "pir_sensor":
        writePir(comp, wires, store)
        break
      case "dht_sensor":
        writeDht(comp, wires, bus)
        break
      case "ir_receiver":
        writeIrReceiver(comp, wires, bus)
        break
      default:
        break
    }
  }
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}
