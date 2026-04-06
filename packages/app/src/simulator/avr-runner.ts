// ── AVR Runner ────────────────────────────────────────────────────────────
//
// Wraps the avr8js emulator (CPU, GPIO, Timers, USART) into a simple
// interface that the ArduinoVM can drive frame-by-frame.

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
  onPinChange: (port: string, pin: number, value: boolean) => void
  onSerialOutput: (char: string) => void
}

export type AVRRunner = {
  load: (program: Uint16Array) => void
  execute: (cycles: number) => void
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

  function wireListeners(): void {
    // Listen for GPIO output changes on each port
    for (const [portName, port] of Object.entries({ B: portB, C: portC, D: portD })) {
      port.addListener((value, oldValue) => {
        const entry = PORT_MAP[portName as keyof typeof PORT_MAP]
        if (!entry) return
        // Determine which pins changed and report them
        const changed = value ^ oldValue
        for (let i = 0; i < 8; i++) {
          if (changed & (1 << i)) {
            const pinState = port.pinState(i)
            // Only report output pins
            if (pinState === PinState.High || pinState === PinState.Low) {
              callbacks.onPinChange(portName, i, pinState === PinState.High)
            }
          }
        }
      })
    }

    // USART transmit callback
    usart.onByteTransmit = (value) => {
      callbacks.onSerialOutput(String.fromCharCode(value))
    }
  }

  wireListeners()

  function load(program: Uint16Array): void {
    cpu.reset()
    // Copy program into CPU memory
    const len = Math.min(program.length, cpu.progMem.length)
    for (let i = 0; i < len; i++) {
      cpu.progMem[i] = program[i]
    }
    cpu.pc = 0
    cpu.cycles = 0
  }

  function execute(cycles: number): void {
    const targetCycles = cpu.cycles + cycles
    while (cpu.cycles < targetCycles) {
      avrInstruction(cpu)
      cpu.tick()
    }
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
    setExternalPin,
    getPin,
    stop,
    reset,
    getCycleCount,
    getFrequencyHz,
  }
}
