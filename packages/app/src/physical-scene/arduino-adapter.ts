import { PinState } from "avr8js"
import { arduinoPinToPort, createAVRRunner, portToArduinoPin, type AVRRunner } from "../simulator/avr-runner"
import { parseIntelHex } from "../simulator/intel-hex"

/** Explicit Uno pin bindings; deliberately independent of scene/Board schemas. */
export type ArduinoActuatorBinding =
  | { id: string; kind: "servo"; pin: number; minPulseUs?: number; maxPulseUs?: number }
  | { id: string; kind: "stepper"; stepPin: number; directionPin: number; enablePin?: number; enableActiveLow?: boolean }
  | { id: string; kind: "stepper-coils"; pins: readonly [number, number, number, number]; stepsPerRevolution: number }
  | { id: string; kind: "dc_motor"; pwmPin: number; directionPin?: number }

export type ArduinoUltrasonicBinding = { id: string; triggerPin: number; echoPin: number }
export type ArduinoFeedback = {
  /** Latched until replaced or reset. Contact polarity is explicit at this boundary. */
  digital?: readonly { pin: number; value: boolean }[]
  contacts?: readonly { pin: number; active: boolean; activeLow?: boolean }[]
  /** Metres; null or >4m means no echo. Values below 2cm saturate at 2cm. */
  ultrasonic?: readonly { id: string; distanceMeters: number | null }[]
}
export type ArduinoActuatorCommand = { id: string; timeSeconds: number } & (
  | { kind: "servo"; targetAngleRadians: number; pulseWidthUs: number }
  | { kind: "stepper"; deltaSteps: number; targetSteps: number }
  /** Signed average drive during this advance, not measured rotor speed. */
  | { kind: "dc_motor"; drive: number }
)
export type ArduinoAdvanceResult = {
  timeSeconds: number
  mcuTimeSeconds: number
  commands: readonly ArduinoActuatorCommand[]
  serialOutput: string
}
export type ArduinoProgramDriver = {
  readonly status: "paused" | "running" | "disposed"
  start(): void
  pause(): void
  reset(): void
  dispose(): void
  advance(dtSeconds: number, feedback?: ArduinoFeedback): ArduinoAdvanceResult
  /** Explicit single time slice while paused; remains paused. */
  step(dtSeconds: number, feedback?: ArduinoFeedback): ArduinoAdvanceResult
}
export type ArduinoAdapterOptions = {
  actuators?: readonly ArduinoActuatorBinding[]
  ultrasonic?: readonly ArduinoUltrasonicBinding[]
  /** Reject excessive work instead of dropping simulation time. Default 0.1s. */
  maxSliceSeconds?: number
}
/** Inject compileSketch (or a headless compiler) without importing its UI dependencies. */
export type ArduinoCompiler = (source: string) => Promise<
  | { success: true; format: "hex"; hex: Uint16Array }
  | { success: true; format: "uf2" }
  | { success: false; error: string }
>

export async function compileArduinoProgramDriver(
  source: string, compile: ArduinoCompiler, options: ArduinoAdapterOptions = {},
): Promise<ArduinoProgramDriver> {
  const result = await compile(source)
  if (!result.success) throw new Error(result.error)
  if (result.format !== "hex") throw new Error("Physical Arduino adapter requires ATmega328P/Uno HEX firmware")
  return createArduinoProgramDriver(result.hex, options)
}

/**
 * Executes actual 16MHz ATmega328P firmware, including startup/setup, only when
 * advanced. Pass compileSketch's word array or committed Intel HEX. Compiler
 * selection must target Uno/Nano ATmega328P (HEX alone cannot identify a chip).
 * No DOM, global pin store, wall clock, timers, or second mechanical integrator.
 * Commands are ordered pin-derived events (DC is one slice average). Consumers
 * retain position targets between calls and clear them on reset. Feedback is
 * applied before execution; the coordinator supplies the previous physics tick.
 * Instructions are atomic: MCU time may lead requested time by one instruction;
 * that overshoot is carried forward, never added once per slice.
 */
export function createArduinoProgramDriver(
  firmware: string | Uint16Array, options: ArduinoAdapterOptions = {},
): ArduinoProgramDriver {
  const program = typeof firmware === "string" ? parseIntelHex(firmware) : firmware.slice()
  if (!program.length || program.length > 0x4000) throw new Error("Firmware must fit ATmega328P 32KB flash")
  const actuators = structuredClone(options.actuators ?? [])
  const sensors = structuredClone(options.ultrasonic ?? [])
  const maxSlice = options.maxSliceSeconds ?? 0.1
  if (!Number.isFinite(maxSlice) || maxSlice <= 0) throw new Error("Invalid maxSliceSeconds")
  const ids = new Set<string>()
  const inputPins = new Set<number>()
  const outputPins = new Set<number>()
  function pinCheck(pin: number): void {
    if (!Number.isInteger(pin) || pin < 0 || pin > 19) throw new Error(`Invalid Uno pin ${pin}`)
  }
  for (const binding of [...actuators, ...sensors]) {
    if (!binding.id || ids.has(binding.id)) throw new Error(`Duplicate/empty binding id ${binding.id}`)
    ids.add(binding.id)
  }
  for (const binding of actuators) {
    const pins = binding.kind === "servo" ? [binding.pin]
      : binding.kind === "stepper" ? [binding.stepPin, binding.directionPin, binding.enablePin]
      : binding.kind === "stepper-coils" ? binding.pins : [binding.pwmPin, binding.directionPin]
    for (const pin of pins) if (pin !== undefined) { pinCheck(pin); outputPins.add(pin) }
    if (binding.kind === "servo") {
      const min = binding.minPulseUs ?? 544
      const max = binding.maxPulseUs ?? 2400
      if (!Number.isFinite(min) || !Number.isFinite(max) || min <= 0 || max <= min) throw new Error("Invalid servo pulse range")
    }
    if (binding.kind === "stepper-coils" && (!Number.isFinite(binding.stepsPerRevolution) || binding.stepsPerRevolution <= 0)) {
      throw new Error("Invalid stepsPerRevolution")
    }
  }
  for (const sensor of sensors) {
    pinCheck(sensor.triggerPin); pinCheck(sensor.echoPin)
    if (inputPins.has(sensor.echoPin)) throw new Error("Ultrasonic echo pins must be unique")
    inputPins.add(sensor.echoPin); outputPins.add(sensor.triggerPin)
  }
  for (const pin of inputPins) if (outputPins.has(pin)) throw new Error(`Input/output binding conflict on pin ${pin}`)

  let status: ArduinoProgramDriver["status"] = "paused"
  let requestedCycles = 0
  let runner: AVRRunner
  let commands: ArduinoActuatorCommand[] = []
  let serialOutput = ""
  const levels = new Map<number, boolean>()
  const inputs = new Map<number, boolean>()
  const rising = new Map<string, number>()
  const steps = new Map<string, number>()
  const fields = new Map<string, number>()
  const distances = new Map<string, number | null>()
  const echoQueue: { cycle: number; pin: number; value: boolean }[] = []
  const motorIntegral = new Map<string, number>()
  const motorAt = new Map<string, number>()
  const frequency = 16_000_000
  const level = (pin: number) => levels.get(pin) ?? false
  function drive(binding: Extract<ArduinoActuatorBinding, { kind: "dc_motor" }>): number {
    return level(binding.pwmPin) ? (binding.directionPin === undefined || level(binding.directionPin) ? 1 : -1) : 0
  }
  function integrateMotors(cycle: number): void {
    for (const binding of actuators) if (binding.kind === "dc_motor") {
      const previous = motorAt.get(binding.id) ?? cycle
      motorIntegral.set(binding.id, (motorIntegral.get(binding.id) ?? 0) + (cycle - previous) * drive(binding))
      motorAt.set(binding.id, cycle)
    }
  }
  function setInput(pin: number, value: boolean): void {
    inputs.set(pin, value)
    const mapped = arduinoPinToPort(pin)
    if (mapped) runner.setExternalPin(mapped.port, mapped.pin, value)
  }
  function emitSteps(id: string, delta: number, timeSeconds: number): void {
    const targetSteps = (steps.get(id) ?? 0) + delta
    steps.set(id, targetSteps)
    commands.push({ id, kind: "stepper", deltaSteps: delta, targetSteps, timeSeconds })
  }
  function makeRunner(): AVRRunner {
    return createAVRRunner({
      onSerialOutput: (char) => { serialOutput += char },
      onPinChange: (port, bit, state) => {
        const pin = portToArduinoPin(port, bit)
        if (pin === null) return
        // The shared runner seeds pullups on mode changes. Reassert physical
        // input immediately so a held contact survives pinMode(INPUT_PULLUP).
        if (state === PinState.Input || state === PinState.InputPullUp) {
          const input = inputs.get(pin)
          if (input !== undefined) runner.setExternalPin(port, bit, input)
        }
        const high = state === PinState.High
        if (level(pin) === high) return
        const cycle = runner.getCycleCount()
        const timeSeconds = cycle / frequency
        integrateMotors(cycle)
        levels.set(pin, high)
        for (const binding of actuators) {
          if (binding.kind === "servo" && binding.pin === pin) {
            if (high) rising.set(binding.id, cycle)
            else {
              const start = rising.get(binding.id)
              rising.delete(binding.id)
              if (start === undefined) continue
              const pulseWidthUs = (cycle - start) / 16
              if (pulseWidthUs < 400 || pulseWidthUs > 2600) continue
              const min = binding.minPulseUs ?? 544
              const max = binding.maxPulseUs ?? 2400
              commands.push({ id: binding.id, kind: "servo", timeSeconds, pulseWidthUs,
                targetAngleRadians: Math.max(0, Math.min(1, (pulseWidthUs - min) / (max - min))) * Math.PI })
            }
          } else if (binding.kind === "stepper" && binding.stepPin === pin && high) {
            if (binding.enablePin !== undefined && level(binding.enablePin) === (binding.enableActiveLow ?? true)) continue
            emitSteps(binding.id, level(binding.directionPin) ? 1 : -1, timeSeconds)
          } else if (binding.kind === "stepper-coils" && binding.pins.includes(pin)) {
            const [a, b, c, d] = binding.pins
            const x = Number(level(a)) - Number(level(c))
            const y = Number(level(b)) - Number(level(d))
            if (!x && !y) continue
            const field = Math.atan2(y, x)
            const previous = fields.get(binding.id)
            fields.set(binding.id, field)
            if (previous === undefined) continue
            const delta = Math.atan2(Math.sin(field - previous), Math.cos(field - previous)) * 2 / Math.PI
            if (Math.abs(delta) > 1e-12) emitSteps(binding.id, delta, timeSeconds)
          }
        }
        for (const sensor of sensors) if (sensor.triggerPin === pin) {
          if (high) rising.set(sensor.id, cycle)
          else {
            const start = rising.get(sensor.id)
            rising.delete(sensor.id)
            const meters = distances.get(sensor.id)
            if (start === undefined || cycle - start < 128 || meters == null || meters > 4) continue
            const echoStart = cycle + 8000 // existing HC-SR04 protocol: 500us processing
            echoQueue.push({ cycle: echoStart, pin: sensor.echoPin, value: true },
              { cycle: echoStart + Math.max(0.02, meters) * 100 * 58 * 16, pin: sensor.echoPin, value: false })
            echoQueue.sort((a, b) => a.cycle - b.cycle)
          }
        }
      },
    })
  }
  runner = makeRunner()
  runner.load(program)
  function assertAlive(): void {
    if (status === "disposed") throw new Error("Arduino adapter is disposed")
  }
  function applyFeedback(feedback: ArduinoFeedback): void {
    const digital = [...(feedback.digital ?? []), ...(feedback.contacts ?? []).map(contact => ({
      pin: contact.pin, value: contact.activeLow ? !contact.active : contact.active,
    }))]
    for (const input of digital) {
      pinCheck(input.pin)
      if (outputPins.has(input.pin) || inputPins.has(input.pin)) throw new Error(`Feedback conflicts with binding on pin ${input.pin}`)
    }
    for (const input of feedback.ultrasonic ?? []) {
      if (!sensors.some(sensor => sensor.id === input.id)) throw new Error(`Unknown ultrasonic sensor ${input.id}`)
      if (input.distanceMeters !== null && (!Number.isFinite(input.distanceMeters) || input.distanceMeters < 0)) throw new Error("Invalid distanceMeters")
    }
    for (const input of digital) setInput(input.pin, input.value)
    for (const input of feedback.ultrasonic ?? []) distances.set(input.id, input.distanceMeters)
  }
  function advance(dt: number, feedback: ArduinoFeedback = {}, force = false): ArduinoAdvanceResult {
    assertAlive()
    if (!Number.isFinite(dt) || dt < 0 || dt > maxSlice) throw new Error(`Time slice must be between 0 and ${maxSlice} seconds`)
    commands = []; serialOutput = ""
    if ((status === "running" || force) && dt > 0) {
      applyFeedback(feedback)
      const begin = runner.getCycleCount()
      motorIntegral.clear(); motorAt.clear()
      integrateMotors(begin)
      requestedCycles += dt * frequency
      const target = Math.floor(requestedCycles + 1e-7)
      while (runner.getCycleCount() < target) {
        while (echoQueue[0] && echoQueue[0].cycle <= runner.getCycleCount()) {
          const edge = echoQueue.shift()
          if (edge) setInput(edge.pin, edge.value)
        }
        runner.step()
      }
      integrateMotors(runner.getCycleCount())
      const elapsed = runner.getCycleCount() - begin
      for (const binding of actuators) if (binding.kind === "dc_motor") {
        commands.push({ id: binding.id, kind: "dc_motor", timeSeconds: requestedCycles / frequency,
          drive: elapsed ? (motorIntegral.get(binding.id) ?? 0) / elapsed : drive(binding) })
      }
    }
    return { timeSeconds: requestedCycles / frequency, mcuTimeSeconds: runner.getCycleCount() / frequency, commands, serialOutput }
  }
  return {
    get status() { return status },
    start() { assertAlive(); status = "running" },
    pause() { assertAlive(); status = "paused" },
    advance,
    step(dt, feedback) {
      assertAlive()
      if (status !== "paused") throw new Error("Single step requires paused Arduino adapter")
      return advance(dt, feedback, true)
    },
    reset() {
      assertAlive(); runner.stop(); status = "paused"; requestedCycles = 0
      levels.clear(); inputs.clear(); rising.clear(); steps.clear(); fields.clear(); distances.clear()
      echoQueue.length = 0; motorIntegral.clear(); motorAt.clear(); commands = []; serialOutput = ""
      runner = makeRunner(); runner.load(program)
    },
    dispose() {
      if (status === "disposed") return
      runner.stop(); runner.reset(); status = "disposed"
      echoQueue.length = 0; commands = []; serialOutput = ""
      levels.clear(); inputs.clear(); rising.clear(); steps.clear(); fields.clear(); distances.clear()
      motorIntegral.clear(); motorAt.clear()
    },
  }
}
