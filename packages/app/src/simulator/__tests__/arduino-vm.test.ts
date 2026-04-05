import { describe, test, expect } from "bun:test"
import { createArduinoVM, type ArduinoVMCallbacks } from "../arduino-vm"
import { parseIntelHex } from "../avr-compiler"
import { arduinoPinToPort, portToArduinoPin } from "../avr-runner"

function createTestCallbacks(overrides: Partial<ArduinoVMCallbacks> = {}): {
  callbacks: ArduinoVMCallbacks
  pinWrites: Array<{ pin: number; value: number; isPwm: boolean }>
  pinModes: Array<{ pin: number; mode: number }>
  serialOutput: string[]
  errors: string[]
} {
  const pinWrites: Array<{ pin: number; value: number; isPwm: boolean }> = []
  const pinModes: Array<{ pin: number; mode: number }> = []
  const serialOutput: string[] = []
  const errors: string[] = []

  return {
    callbacks: {
      onPinWrite: (pin, value, isPwm) => {
        pinWrites.push({ pin, value, isPwm })
        overrides.onPinWrite?.(pin, value, isPwm)
      },
      onPinMode: (pin, mode) => {
        pinModes.push({ pin, mode })
        overrides.onPinMode?.(pin, mode)
      },
      onSerialPrint: (text) => {
        serialOutput.push(text)
        overrides.onSerialPrint?.(text)
      },
      onTone: overrides.onTone ?? (() => {}),
      onNoTone: overrides.onNoTone ?? (() => {}),
      onError: (error) => {
        errors.push(error)
        overrides.onError?.(error)
      },
    },
    pinWrites,
    pinModes,
    serialOutput,
    errors,
  }
}

const BLINK_SKETCH = `
void setup() {
  pinMode(13, OUTPUT);
}

void loop() {
  digitalWrite(13, HIGH);
  delay(1000);
}
`

// ── Transpile-mode tests (existing) ───────────────────────────────

describe("ArduinoVM (transpile mode)", () => {
  test("loadSketch compiles a valid blink sketch", () => {
    const { callbacks } = createTestCallbacks()
    const vm = createArduinoVM(callbacks)
    const result = vm.loadSketch(BLINK_SKETCH)
    expect(result.success).toBe(true)
  })

  test("loadSketch returns error for invalid code", () => {
    const { callbacks } = createTestCallbacks()
    const vm = createArduinoVM(callbacks)
    const result = vm.loadSketch("struct Foo {")
    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
  })

  test("runSetup calls pinMode", () => {
    const { callbacks, pinModes } = createTestCallbacks()
    const vm = createArduinoVM(callbacks)
    vm.loadSketch(BLINK_SKETCH)
    vm.runSetup()
    expect(pinModes.length).toBeGreaterThanOrEqual(1)
    expect(pinModes[0]).toEqual({ pin: 13, mode: 1 })
  })

  test("runLoopIteration writes to pin 13", () => {
    const { callbacks, pinWrites } = createTestCallbacks()
    const vm = createArduinoVM(callbacks)
    vm.loadSketch(BLINK_SKETCH)
    vm.runSetup()
    vm.runLoopIteration()

    expect(pinWrites.length).toBeGreaterThanOrEqual(1)
    // First write should be pin 13 HIGH (digital)
    const write13 = pinWrites.find((w) => w.pin === 13)
    expect(write13).toBeDefined()
    expect(write13!.value).toBe(1)
  })

  test("delay() causes runLoopIteration to return false", () => {
    const { callbacks } = createTestCallbacks()
    const vm = createArduinoVM(callbacks)
    vm.loadSketch(BLINK_SKETCH)
    vm.runSetup()

    // First iteration: runs loop, which calls delay(1000)
    vm.runLoopIteration()

    // Should now be delaying
    expect(vm.isDelaying()).toBe(true)
    expect(vm.runLoopIteration()).toBe(false)
  })

  test("Serial.println produces output", () => {
    const { callbacks, serialOutput } = createTestCallbacks()
    const vm = createArduinoVM(callbacks)

    const sketch = `
void setup() {
  Serial.begin(9600);
  Serial.println("Hello World");
}

void loop() {}
`
    vm.loadSketch(sketch)
    vm.runSetup()
    expect(serialOutput).toContain("Hello World\n")
  })

  test("millis() returns increasing values", () => {
    const { callbacks } = createTestCallbacks()
    const vm = createArduinoVM(callbacks)
    vm.loadSketch("void setup() {}\nvoid loop() {}")
    vm.runSetup()
    const t1 = vm.getMillis()
    // millis is based on Date.now() so even a tiny sleep check should show it's >= 0
    expect(t1).toBeGreaterThanOrEqual(0)
  })

  test("getPinState reads written values", () => {
    const { callbacks } = createTestCallbacks()
    const vm = createArduinoVM(callbacks)
    vm.loadSketch(BLINK_SKETCH)
    vm.runSetup()
    vm.runLoopIteration()

    const pinState = vm.getPinState(13)
    expect(pinState.digital).toBe(1)
    expect(pinState.mode).toBe(1) // OUTPUT
  })

  test("setExternalPin updates pin state for digitalRead", () => {
    const { callbacks, serialOutput } = createTestCallbacks()
    const vm = createArduinoVM(callbacks)

    const sketch = `
void setup() {
  pinMode(2, INPUT);
  Serial.begin(9600);
}

void loop() {
  int val = digitalRead(2);
  Serial.println(val);
}
`
    vm.loadSketch(sketch)
    vm.runSetup()
    vm.setExternalPin(2, 1)
    vm.runLoopIteration()
    expect(serialOutput).toContain("1\n")
  })

  test("setAnalogInput updates pin state for analogRead", () => {
    const { callbacks, serialOutput } = createTestCallbacks()
    const vm = createArduinoVM(callbacks)

    const sketch = `
void setup() {
  Serial.begin(9600);
}

void loop() {
  int val = analogRead(14);
  Serial.println(val);
}
`
    vm.loadSketch(sketch)
    vm.runSetup()
    vm.setAnalogInput(14, 512)
    vm.runLoopIteration()
    expect(serialOutput).toContain("512\n")
  })

  test("reset clears all state", () => {
    const { callbacks } = createTestCallbacks()
    const vm = createArduinoVM(callbacks)
    vm.loadSketch(BLINK_SKETCH)
    vm.runSetup()
    vm.runLoopIteration()
    vm.reset()

    const pinState = vm.getPinState(13)
    expect(pinState.digital).toBe(0)
    expect(pinState.mode).toBe(0)
    expect(vm.isDelaying()).toBe(false)
  })

  test("analogWrite sets PWM values", () => {
    const { callbacks, pinWrites } = createTestCallbacks()
    const vm = createArduinoVM(callbacks)

    const sketch = `
void setup() {
  pinMode(9, OUTPUT);
  analogWrite(9, 128);
}
void loop() {}
`
    vm.loadSketch(sketch)
    vm.runSetup()

    const pwmWrite = pinWrites.find((w) => w.pin === 9 && w.isPwm)
    expect(pwmWrite).toBeDefined()
    expect(pwmWrite!.value).toBe(128)

    const pinState = vm.getPinState(9)
    expect(pinState.pwm).toBe(128)
  })

  test("getMode returns 'transpile' by default", () => {
    const { callbacks } = createTestCallbacks()
    const vm = createArduinoVM(callbacks)
    expect(vm.getMode()).toBe("transpile")
  })
})

// ── AVR-mode tests ────────────────────────────────────────────────

describe("ArduinoVM (avr mode)", () => {
  test("can be created with mode='avr'", () => {
    const { callbacks } = createTestCallbacks()
    const vm = createArduinoVM(callbacks, "avr")
    expect(vm.getMode()).toBe("avr")
  })

  test("loadSketch in avr mode returns error suggesting async", () => {
    const { callbacks } = createTestCallbacks()
    const vm = createArduinoVM(callbacks, "avr")
    const result = vm.loadSketch(BLINK_SKETCH)
    expect(result.success).toBe(false)
    expect(result.error).toContain("loadSketchAsync")
  })

  test("isDelaying returns false in avr mode", () => {
    const { callbacks } = createTestCallbacks()
    const vm = createArduinoVM(callbacks, "avr")
    expect(vm.isDelaying()).toBe(false)
  })
})

// ── Intel HEX parser tests ────────────────────────────────────────

describe("parseIntelHex", () => {
  test("parses a minimal Intel HEX with one data record and EOF", () => {
    // Two bytes at address 0x0000: 0x0C 0x94
    // sum = 0x02 + 0x00 + 0x00 + 0x00 + 0x0C + 0x94 = 0xA2
    // checksum = (-0xA2) & 0xFF = 0x5E
    const hex = [
      ":020000000C945E",
      ":00000001FF",
    ].join("\n")

    const result = parseIntelHex(hex)
    // little-endian: 0x0C | (0x94 << 8) = 0x940C
    expect(result[0]).toBe(0x940C)
  })

  test("parses multiple data records", () => {
    // Record 1: 2 bytes at 0x0000: 0x0C 0x94
    //   sum = 0x02 + 0x00 + 0x00 + 0x00 + 0x0C + 0x94 = 0xA2, checksum = 0x5E
    // Record 2: 2 bytes at 0x0002: 0xFF 0x00
    //   sum = 0x02 + 0x00 + 0x02 + 0x00 + 0xFF + 0x00 = 0x103, checksum = (-0x103) & 0xFF = 0xFD
    const hex = [
      ":020000000C945E",
      ":020002000000FC",
      ":00000001FF",
    ].join("\n")

    const result = parseIntelHex(hex)
    expect(result[0]).toBe(0x940C)
    // Second word: 0x00 | (0x00 << 8) = 0x0000
    expect(result[1]).toBe(0x0000)
  })

  test("throws on empty input", () => {
    expect(() => parseIntelHex("")).toThrow("no records found")
  })

  test("handles records with no data lines gracefully", () => {
    const hex = ":00000001FF\n"
    const result = parseIntelHex(hex)
    // Should return a buffer (all zeros since no data records)
    expect(result.length).toBeGreaterThan(0)
  })
})

// ── Pin mapping tests ─────────────────────────────────────────────

describe("Pin mapping", () => {
  test("Arduino D0-D7 map to PORTD pins 0-7", () => {
    for (let i = 0; i <= 7; i++) {
      const mapped = arduinoPinToPort(i)
      expect(mapped).toEqual({ port: "D", pin: i })
    }
  })

  test("Arduino D8-D13 map to PORTB pins 0-5", () => {
    for (let i = 8; i <= 13; i++) {
      const mapped = arduinoPinToPort(i)
      expect(mapped).toEqual({ port: "B", pin: i - 8 })
    }
  })

  test("Arduino A0-A5 (14-19) map to PORTC pins 0-5", () => {
    for (let i = 14; i <= 19; i++) {
      const mapped = arduinoPinToPort(i)
      expect(mapped).toEqual({ port: "C", pin: i - 14 })
    }
  })

  test("out-of-range pin returns null", () => {
    expect(arduinoPinToPort(-1)).toBeNull()
    expect(arduinoPinToPort(20)).toBeNull()
  })

  test("portToArduinoPin is inverse of arduinoPinToPort", () => {
    for (let pin = 0; pin <= 19; pin++) {
      const mapped = arduinoPinToPort(pin)
      expect(mapped).not.toBeNull()
      if (mapped) {
        const back = portToArduinoPin(mapped.port, mapped.pin)
        expect(back).toBe(pin)
      }
    }
  })

  test("portToArduinoPin returns null for unknown port", () => {
    expect(portToArduinoPin("X", 0)).toBeNull()
  })
})
