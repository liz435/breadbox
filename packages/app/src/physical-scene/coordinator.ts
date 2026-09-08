import type { PhysicalScene, PhysicalSensor } from "@dreamer/schemas"
import type {
  ArduinoActuatorBinding,
  ArduinoActuatorCommand,
  ArduinoFeedback,
  ArduinoProgramDriver,
  ArduinoUltrasonicBinding,
} from "./arduino-adapter"
import type { PhysicalCommand, PhysicalRuntime, PhysicalSnapshot } from "./runtime"

export type PhysicalCoordinatorStatus = "paused" | "running" | "disposed"

export type PhysicalArduinoBindings = {
  actuators: ArduinoActuatorBinding[]
  ultrasonic: ArduinoUltrasonicBinding[]
}

/** Convert persisted Uno pin labels into explicit AVR adapter bindings. */
export function arduinoBindingsForScene(scene: PhysicalScene): PhysicalArduinoBindings {
  const actuators: ArduinoActuatorBinding[] = []
  for (const actuator of Object.values(scene.actuators)) {
    const source = actuator.source
    if (!source) continue
    if (actuator.kind === "servo") {
      const pin = parsePin(source.pin)
      if (pin === null) throw new Error(`Actuator ${actuator.id} needs a numeric servo pin`)
      actuators.push({ id: actuator.id, kind: "servo", pin })
      continue
    }
    if (actuator.kind === "stepper") {
      if (source.pins) {
        const pins = source.pins.map(parsePin)
        if (pins.some((pin): pin is null => pin === null)) throw new Error(`Actuator ${actuator.id} has invalid coil pins`)
        actuators.push({
          id: actuator.id,
          kind: "stepper-coils",
          pins: pins as [number, number, number, number],
          stepsPerRevolution: source.stepsPerRevolution ?? 2048,
        })
        continue
      }
      const stepPin = parsePin(source.pin)
      const directionPin = parsePin(source.directionPin)
      if (stepPin === null || directionPin === null) throw new Error(`Actuator ${actuator.id} needs STEP and DIR pins`)
      const enablePin = parsePin(source.enablePin)
      actuators.push({ id: actuator.id, kind: "stepper", stepPin, directionPin, ...(enablePin === null ? {} : { enablePin }) })
      continue
    }
    const pwmPin = parsePin(source.pin)
    if (pwmPin === null) throw new Error(`Actuator ${actuator.id} needs a numeric PWM pin`)
    const directionPin = parsePin(source.directionPin)
    actuators.push({ id: actuator.id, kind: "dc_motor", pwmPin, ...(directionPin === null ? {} : { directionPin }) })
  }
  const ultrasonic: ArduinoUltrasonicBinding[] = []
  for (const sensor of Object.values(scene.sensors)) {
    if (sensor.kind !== "distance" || (!sensor.triggerPin && !sensor.echoPin)) continue
    const triggerPin = parsePin(sensor.triggerPin)
    const echoPin = parsePin(sensor.echoPin)
    if (triggerPin === null || echoPin === null) throw new Error(`Distance sensor ${sensor.id} needs trigger and echo pins`)
    ultrasonic.push({ id: sensor.id, triggerPin, echoPin })
  }
  return { actuators, ultrasonic }
}

function parsePin(value: string | undefined): number | null {
  if (!value) return null
  const normalized = value.trim().toUpperCase()
  if (/^\d+$/.test(normalized)) {
    const pin = Number(normalized)
    return Number.isInteger(pin) && pin >= 0 && pin <= 19 ? pin : null
  }
  if (/^D\d+$/.test(normalized)) return parsePin(normalized.slice(1))
  if (/^A[0-5]$/.test(normalized)) return 14 + Number(normalized.slice(1))
  return null
}

/**
 * Couples the real AVR adapter to the fixed physical clock. The MCU reads
 * sensor values from the previous physical snapshot, emits actuator commands
 * for this tick, and the physical world then advances exactly one fixed step.
 * Rendering never advances either clock.
 */
export class PhysicalSimulationCoordinator {
  private statusValue: PhysicalCoordinatorStatus = "paused"

  constructor(
    private readonly runtime: PhysicalRuntime,
    private readonly arduino: ArduinoProgramDriver,
    private readonly scene: PhysicalScene,
    private readonly sensors: readonly PhysicalSensor[] = [],
  ) {}

  get status(): PhysicalCoordinatorStatus {
    return this.statusValue
  }

  start(): void {
    this.assertUsable()
    this.arduino.start()
    this.statusValue = "running"
  }

  pause(): void {
    this.assertUsable()
    this.arduino.pause()
    this.statusValue = "paused"
  }

  reset(): PhysicalSnapshot {
    this.assertUsable()
    this.arduino.reset()
    this.statusValue = "paused"
    return this.runtime.reset()
  }

  /** Advances one physical tick while running. */
  step(): PhysicalSnapshot {
    this.assertUsable()
    if (this.statusValue !== "running") throw new Error("Coordinator is paused")
    return this.advance(true)
  }

  /** Advances one tick while paused for deterministic inspection. */
  singleStep(): PhysicalSnapshot {
    this.assertUsable()
    const snapshot = this.advance(false)
    this.statusValue = "paused"
    return snapshot
  }

  dispose(options: { disposeRuntime?: boolean } = {}): void {
    if (this.statusValue === "disposed") return
    this.statusValue = "disposed"
    this.arduino.dispose()
    if (options.disposeRuntime !== false) this.runtime.dispose()
  }

  private advance(running: boolean): PhysicalSnapshot {
    const current = this.runtime.snapshot()
    const feedback = feedbackFromSnapshot(current, this.sensors)
    const result = running
      ? this.arduino.advance(this.runtime.timestep, feedback)
      : this.arduino.step(this.runtime.timestep, feedback)
    return this.runtime.step(commandsFromArduino(result.commands, this.scene))
  }

  private assertUsable(): void {
    if (this.statusValue === "disposed") throw new Error("Coordinator is disposed")
  }
}

function commandsFromArduino(commands: readonly ArduinoActuatorCommand[], scene: PhysicalScene): PhysicalCommand[] {
  const latest = new Map<string, PhysicalCommand>()
  for (const command of commands) {
    const actuator = scene.actuators[command.id]
    if (!actuator) continue
    const joint = scene.joints[actuator.jointId]
    if (!joint) continue
    const target = command.kind === "servo"
      ? servoTarget(command.targetAngleRadians, joint.limits)
      : command.kind === "stepper"
        ? stepperTarget(command.targetSteps, actuator, joint.kind)
        : command.drive
    latest.set(command.id, { actuatorId: command.id, target })
  }
  return [...latest.values()]
}

function servoTarget(angle: number, limits: { min: number; max: number } | undefined): number {
  if (!limits) return angle
  // The AVR adapter exposes the physical servo's normalised 0..pi output;
  // map it into the authored mechanical limit before driving the joint.
  return limits.min + (limits.max - limits.min) * Math.max(0, Math.min(1, angle / Math.PI))
}

function stepperTarget(steps: number, actuator: PhysicalScene["actuators"][string], jointKind: "fixed" | "revolute" | "prismatic"): number {
  const source = actuator.source
  const units = source?.stepsPerRevolution ?? 200
  if (jointKind === "revolute") return steps / units * Math.PI * 2
  return steps / units
}

function feedbackFromSnapshot(
  snapshot: PhysicalSnapshot,
  sensors: readonly PhysicalSensor[],
): ArduinoFeedback {
  const digital: { pin: number; value: boolean }[] = []
  const ultrasonic: { id: string; distanceMeters: number | null }[] = []
  for (const sensor of sensors) {
    const value = snapshot.sensors[sensor.id]
    if (!value) continue
    const pin = sensor.inputPin === undefined ? null : Number(sensor.inputPin)
    if (pin !== null && Number.isInteger(pin) && pin >= 0 && pin <= 19) {
      digital.push({ pin, value: value.active })
    }
    if (sensor.kind === "distance") {
      ultrasonic.push({ id: sensor.id, distanceMeters: value.distanceMm === null ? null : value.distanceMm / 1000 })
    }
  }
  return { digital, ultrasonic }
}
