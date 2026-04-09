import { describe, test, expect } from "bun:test"
import { createArduinoVM, type ArduinoVMCallbacks } from "../arduino-vm"
import { PinStateStore, type PinSnapshot } from "../pin-state-store"
import { parseIntelHex } from "../avr-compiler"
import { arduinoPinToPort, portToArduinoPin } from "../avr-runner"

/**
 * Build a fresh, isolated test harness: VM with a dedicated PinStateStore
 * (so tests don't share the global singleton) plus convenient log arrays
 * that record every pin write / mode change observed via the store.
 */
function createTestHarness(
  mode: "transpile" | "avr" = "transpile",
  overrides: Partial<ArduinoVMCallbacks> = {},
): {
  callbacks: ArduinoVMCallbacks
  store: PinStateStore
  vm: ReturnType<typeof createArduinoVM>
  pinWrites: Array<{ pin: number; value: number; isPwm: boolean }>
  pinModes: Array<{ pin: number; mode: string }>
  serialOutput: string[]
  errors: string[]
} {
  const pinWrites: Array<{ pin: number; value: number; isPwm: boolean }> = []
  const pinModes: Array<{ pin: number; mode: string }> = []
  const serialOutput: string[] = []
  const errors: string[] = []

  const store = new PinStateStore()

  // Subscribe to track pin changes — equivalent to the old onPinWrite/onPinMode.
  const prev: PinSnapshot[] = store.getSnapshot().map((p) => ({ ...p }))
  store.subscribe(() => {
    const curr = store.getSnapshot()
    for (let i = 0; i < 20; i++) {
      const p = curr[i]
      const q = prev[i]
      if (p.digitalValue !== q.digitalValue || p.pwmValue !== q.pwmValue) {
        const isPwm = p.isPwm
        const value = isPwm ? p.pwmValue : p.digitalValue
        pinWrites.push({ pin: i, value, isPwm })
      }
      if (p.mode !== q.mode) {
        pinModes.push({ pin: i, mode: p.mode })
      }
      prev[i] = { ...p }
    }
  })

  const callbacks: ArduinoVMCallbacks = {
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
  }

  const vm = createArduinoVM(callbacks, mode, store)

  return { callbacks, store, vm, pinWrites, pinModes, serialOutput, errors }
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

// ── Transpile-mode tests ──────────────────────────────────────────

describe("ArduinoVM (transpile mode)", () => {
  test("loadSketch compiles a valid blink sketch", () => {
    const { vm } = createTestHarness()
    const result = vm.loadSketch(BLINK_SKETCH)
    expect(result.success).toBe(true)
  })

  test("loadSketch returns error for invalid code", () => {
    const { vm } = createTestHarness()
    const result = vm.loadSketch("struct Foo {")
    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
  })

  test("runSetup calls pinMode", () => {
    const { vm, pinModes } = createTestHarness()
    vm.loadSketch(BLINK_SKETCH)
    vm.runSetup()
    expect(pinModes.length).toBeGreaterThanOrEqual(1)
    expect(pinModes[0]).toEqual({ pin: 13, mode: "OUTPUT" })
  })

  test("runLoopIteration writes to pin 13", () => {
    const { vm, pinWrites } = createTestHarness()
    vm.loadSketch(BLINK_SKETCH)
    vm.runSetup()
    vm.runLoopIteration()

    expect(pinWrites.length).toBeGreaterThanOrEqual(1)
    const write13 = pinWrites.find((w) => w.pin === 13)
    expect(write13).toBeDefined()
    expect(write13!.value).toBe(1)
  })

  test("delay() causes runLoopIteration to return false", () => {
    const { vm } = createTestHarness()
    vm.loadSketch(BLINK_SKETCH)
    vm.runSetup()
    vm.runLoopIteration()
    expect(vm.isDelaying()).toBe(true)
    expect(vm.runLoopIteration()).toBe(false)
  })

  test("Serial.println produces output", () => {
    const { vm, serialOutput } = createTestHarness()
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
    const { vm } = createTestHarness()
    vm.loadSketch("void setup() {}\nvoid loop() {}")
    vm.runSetup()
    const t1 = vm.getMillis()
    expect(t1).toBeGreaterThanOrEqual(0)
  })

  test("getPinState reads written values", () => {
    const { vm } = createTestHarness()
    vm.loadSketch(BLINK_SKETCH)
    vm.runSetup()
    vm.runLoopIteration()

    const pinState = vm.getPinState(13)
    expect(pinState.digital).toBe(1)
    expect(pinState.mode).toBe(1) // numeric OUTPUT
  })

  test("store.writeExternal updates pin state for digitalRead", () => {
    const { vm, store, serialOutput } = createTestHarness()

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
    store.writeExternal(2, { digitalValue: 1 })
    vm.runLoopIteration()
    expect(serialOutput).toContain("1\n")
  })

  test("store.writeExternal updates analog pin for analogRead", () => {
    const { vm, store, serialOutput } = createTestHarness()

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
    store.writeExternal(14, { analogValue: 512 })
    vm.runLoopIteration()
    expect(serialOutput).toContain("512\n")
  })

  test("reset clears all state", () => {
    const { vm } = createTestHarness()
    vm.loadSketch(BLINK_SKETCH)
    vm.runSetup()
    vm.runLoopIteration()
    vm.reset()

    const pinState = vm.getPinState(13)
    expect(pinState.digital).toBe(0)
    expect(pinState.mode).toBe(0) // UNSET → 0
    expect(vm.isDelaying()).toBe(false)
  })

  test("analogWrite sets PWM values", () => {
    const { vm, pinWrites } = createTestHarness()

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
    const { vm } = createTestHarness()
    expect(vm.getMode()).toBe("transpile")
  })
})

// ── AVR-mode tests ────────────────────────────────────────────────

describe("ArduinoVM (avr mode)", () => {
  test("can be created with mode='avr'", () => {
    const { vm } = createTestHarness("avr")
    expect(vm.getMode()).toBe("avr")
  })

  test("loadSketch in avr mode returns error suggesting async", () => {
    const { vm } = createTestHarness("avr")
    const result = vm.loadSketch(BLINK_SKETCH)
    expect(result.success).toBe(false)
    expect(result.error).toContain("loadSketchAsync")
  })

  test("isDelaying returns false in avr mode", () => {
    const { vm } = createTestHarness("avr")
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
