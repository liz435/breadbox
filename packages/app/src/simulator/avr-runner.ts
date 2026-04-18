// ── AVR Runner (low-level avr8js wrapper) ──────────────────────────────────
//
// Wraps the avr8js emulator (CPU, GPIO, Timers, USART) into a simple
// interface that the `AvrSketchRunner` (in runners/avr-runner.ts) can drive
// frame-by-frame.

import {
  CPU,
  avrInstruction,
  avrInterrupt,
  AVRTimer,
  AVRIOPort,
  AVRUSART,
  timer0Config,
  timer1Config,
  timer2Config,
  portBConfig,
  portCConfig,
  portDConfig,
  usart0Config,
  PinState,
} from "avr8js"

const AVR_FREQ_HZ = 16_000_000 // 16 MHz (Arduino Uno)

export type AVRRunnerCallbacks = {
  /**
   * Fires whenever a pin's state transitions between Low / High / Input /
   * InputPullUp. Covers both OUTPUT writes (so the VM can mirror digital
   * levels) and DDR/PORT transitions that change the pin's *mode* (so the
   * pin-state-store can track INPUT / INPUT_PULLUP, which is what
   * components like buttons need to decide how to drive a line).
   */
  onPinChange: (port: string, pin: number, state: PinState) => void
  onSerialOutput: (char: string) => void
}

export type AVRRunner = {
  load: (program: Uint16Array) => void
  execute: (cycles: number) => void
  writeSerialInput: (text: string) => void
  setExternalPin: (port: string, pin: number, value: boolean) => void
  getPin: (port: string, pin: number) => PinState
  stop: () => void
  reset: () => void
  getCycleCount: () => number
  getFrequencyHz: () => number
}

/**
 * Map from port name to the avr8js port config and the Arduino pin number
 * offset for that port.
 *
 * Arduino Uno pin mapping:
 *   D0–D7  = PORTD pins 0–7
 *   D8–D13 = PORTB pins 0–5
 *   A0–A5  = PORTC pins 0–5  (Arduino pins 14–19)
 */
const PORT_MAP = {
  D: { config: portDConfig, offset: 0 },
  B: { config: portBConfig, offset: 8 },
  C: { config: portCConfig, offset: 14 },
} as const

/**
 * Convert an Arduino pin number (0–19) to a port name and pin index.
 */
export function arduinoPinToPort(arduinoPin: number): { port: string; pin: number } | null {
  if (arduinoPin >= 0 && arduinoPin <= 7) {
    return { port: "D", pin: arduinoPin }
  }
  if (arduinoPin >= 8 && arduinoPin <= 13) {
    return { port: "B", pin: arduinoPin - 8 }
  }
  if (arduinoPin >= 14 && arduinoPin <= 19) {
    return { port: "C", pin: arduinoPin - 14 }
  }
  return null
}

/**
 * Convert a port name + pin index to an Arduino pin number.
 */
export function portToArduinoPin(port: string, pin: number): number | null {
  const entry = PORT_MAP[port as keyof typeof PORT_MAP]
  if (!entry) return null
  return entry.offset + pin
}

export function createAVRRunner(callbacks: AVRRunnerCallbacks): AVRRunner {
  // ATmega328P: 32KB flash = 0x4000 16-bit words, 2KB SRAM
  let cpu = new CPU(new Uint16Array(0x4000), 0x800)

  let portB = new AVRIOPort(cpu, portBConfig)
  let portC = new AVRIOPort(cpu, portCConfig)
  let portD = new AVRIOPort(cpu, portDConfig)

  let timer0 = new AVRTimer(cpu, timer0Config)
  let timer1 = new AVRTimer(cpu, timer1Config)
  let timer2 = new AVRTimer(cpu, timer2Config)

  let usart = new AVRUSART(cpu, usart0Config, AVR_FREQ_HZ)
  // Bytes waiting to be delivered to the AVR USART RX line.
  const serialInputQueue: number[] = []
  let serialInputReadIdx = 0

  function getPortInstance(portName: string): AVRIOPort | null {
    switch (portName) {
      case "B":
        return portB
      case "C":
        return portC
      case "D":
        return portD
      default:
        return null
    }
  }

  // Per-port cache of the last reported PinState for each of the 8 bits.
  // We can't rely on the (value, oldValue) diff alone because DDR changes
  // also toggle the *mode* (Input ↔ InputPullUp ↔ High/Low) without
  // necessarily flipping the PORT bits the listener receives.
  const lastPinState: Record<string, PinState[]> = {
    B: Array(8).fill(PinState.Input),
    C: Array(8).fill(PinState.Input),
    D: Array(8).fill(PinState.Input),
  }

  function wireListeners(): void {
    // The avr8js port listener fires on both DDR and PORT writes (see
    // writeGpio in avr8js/gpio.js). That means one callback covers the
    // full state machine: OUTPUT level flips, pinMode() transitions, and
    // INPUT_PULLUP enable/disable.
    for (const [portName, port] of Object.entries({ B: portB, C: portC, D: portD })) {
      port.addListener(() => {
        const entry = PORT_MAP[portName as keyof typeof PORT_MAP]
        if (!entry) return
        const cache = lastPinState[portName]
        for (let i = 0; i < 8; i++) {
          const next = port.pinState(i)
          if (cache[i] === next) continue
          const prev = cache[i]
          cache[i] = next

          // Simulate the internal pull-up resistor: avr8js's PIN register
          // only reflects pinValue (set via setPin), so an INPUT_PULLUP pin
          // would read LOW by default. Seed it HIGH when the mode becomes
          // InputPullUp so digitalRead matches real-Arduino behavior.
          if (next === PinState.InputPullUp && prev !== PinState.InputPullUp) {
            port.setPin(i, true)
          } else if (next === PinState.Input && prev === PinState.InputPullUp) {
            // Pullup disabled → release the line LOW.
            port.setPin(i, false)
          }

          callbacks.onPinChange(portName, i, next)
        }
      })
    }

    // USART transmit callback
    usart.onByteTransmit = (value) => {
      callbacks.onSerialOutput(String.fromCharCode(value))
    }
  }

  function clearSerialInputQueue(): void {
    serialInputQueue.length = 0
    serialInputReadIdx = 0
  }

  function compactSerialInputQueue(): void {
    if (serialInputReadIdx === 0) return
    if (serialInputReadIdx === serialInputQueue.length) {
      clearSerialInputQueue()
      return
    }
    // Compact occasionally so we don't grow unbounded indices.
    if (serialInputReadIdx >= 64 || serialInputReadIdx * 2 >= serialInputQueue.length) {
      serialInputQueue.splice(0, serialInputReadIdx)
      serialInputReadIdx = 0
    }
  }

  function drainSerialInputQueue(): void {
    while (serialInputReadIdx < serialInputQueue.length) {
      const nextByte = serialInputQueue[serialInputReadIdx]
      // writeByte returns false when RX is busy or disabled.
      if (!usart.writeByte(nextByte)) break
      serialInputReadIdx++
    }
    compactSerialInputQueue()
  }

  wireListeners()

  function load(program: Uint16Array): void {
    cpu.reset()
    clearSerialInputQueue()
    // Copy program into CPU memory
    const len = Math.min(program.length, cpu.progMem.length)
    for (let i = 0; i < len; i++) {
      cpu.progMem[i] = program[i]
    }
    cpu.pc = 0
    cpu.cycles = 0
  }

  function execute(cycles: number): void {
    drainSerialInputQueue()
    const targetCycles = cpu.cycles + cycles
    while (cpu.cycles < targetCycles) {
      avrInstruction(cpu)
      cpu.tick()
    }
    drainSerialInputQueue()
  }

  function writeSerialInput(text: string): void {
    if (!text) return
    for (const ch of text) {
      serialInputQueue.push(ch.charCodeAt(0) & 0xff)
    }
    drainSerialInputQueue()
  }

  function setExternalPin(port: string, pin: number, value: boolean): void {
    const portInstance = getPortInstance(port)
    if (!portInstance) return
    portInstance.setPin(pin, value)
  }

  function getPin(port: string, pin: number): PinState {
    const portInstance = getPortInstance(port)
    if (!portInstance) return PinState.Input
    return portInstance.pinState(pin)
  }

  function stop(): void {
    // Nothing to clean up — execution is synchronous
  }

  function reset(): void {
    // Recreate all peripherals for a clean slate
    cpu = new CPU(new Uint16Array(0x4000), 0x800)
    portB = new AVRIOPort(cpu, portBConfig)
    portC = new AVRIOPort(cpu, portCConfig)
    portD = new AVRIOPort(cpu, portDConfig)
    timer0 = new AVRTimer(cpu, timer0Config)
    timer1 = new AVRTimer(cpu, timer1Config)
    timer2 = new AVRTimer(cpu, timer2Config)
    usart = new AVRUSART(cpu, usart0Config, AVR_FREQ_HZ)
    for (const port of Object.keys(lastPinState)) {
      lastPinState[port].fill(PinState.Input)
    }
    clearSerialInputQueue()
    wireListeners()
  }

  function getCycleCount(): number {
    return cpu.cycles
  }

  function getFrequencyHz(): number {
    return AVR_FREQ_HZ
  }

  return {
    load,
    execute,
    writeSerialInput,
    setExternalPin,
    getPin,
    stop,
    reset,
    getCycleCount,
    getFrequencyHz,
  }
}
