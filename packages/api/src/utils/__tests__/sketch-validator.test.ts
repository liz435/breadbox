import { describe, expect, test } from "bun:test"
import { extractPinReferences, validateSketch } from "../sketch-validator"

describe("validateSketch", () => {
  test("empty is valid", () => {
    expect(validateSketch("").valid).toBe(true)
    expect(validateSketch("   \n  ").valid).toBe(true)
  })

  test("rejects unbalanced braces", () => {
    const r = validateSketch("void setup() {\nvoid loop() {}")
    expect(r.valid).toBe(false)
    expect(r.error).toMatch(/brace/i)
  })

  test("rejects missing setup/loop", () => {
    expect(validateSketch("void setup() {}").valid).toBe(false)
    expect(validateSketch("void loop() {}").valid).toBe(false)
  })
})

describe("extractPinReferences", () => {
  test("empty sketch yields no refs", () => {
    expect(extractPinReferences("")).toEqual([])
  })

  test("integer literal pin in pinMode/digitalWrite", () => {
    const code = `
      void setup() { pinMode(13, OUTPUT); }
      void loop() { digitalWrite(13, HIGH); }
    `
    const refs = extractPinReferences(code)
    expect(refs).toHaveLength(1)
    expect(refs[0].pin).toBe(13)
    expect(refs[0].callSites.sort()).toEqual([
      "digitalWrite(13)",
      "pinMode(13)",
    ])
  })

  test("analog token A0 resolves to pin 14", () => {
    const refs = extractPinReferences("void setup(){} void loop(){ analogRead(A0); }")
    expect(refs).toHaveLength(1)
    expect(refs[0].pin).toBe(14)
  })

  test("const int identifier is resolved", () => {
    const code = `
      const int trigPin = 7;
      int echoPin = 8;
      void setup() { pinMode(trigPin, OUTPUT); pinMode(echoPin, INPUT); }
      void loop() { pulseIn(echoPin, HIGH); }
    `
    const refs = extractPinReferences(code)
    const pins = refs.map((r) => r.pin).sort()
    expect(pins).toEqual([7, 8])
    // pulseIn lands on echoPin (pin 8)
    const echoSites = refs.find((r) => r.pin === 8)!.callSites
    expect(echoSites.some((s) => s.startsWith("pulseIn"))).toBe(true)
  })

  test("#define is resolved", () => {
    const code = `
      #define LED_PIN 13
      void setup() { pinMode(LED_PIN, OUTPUT); }
      void loop() { digitalWrite(LED_PIN, HIGH); }
    `
    const refs = extractPinReferences(code)
    expect(refs).toHaveLength(1)
    expect(refs[0].pin).toBe(13)
  })

  test("Servo.attach captures pin", () => {
    const code = `
      #include <Servo.h>
      Servo myServo;
      void setup() { myServo.attach(9); }
      void loop() {}
    `
    const refs = extractPinReferences(code)
    expect(refs).toHaveLength(1)
    expect(refs[0].pin).toBe(9)
    expect(refs[0].callSites[0]).toBe("myServo.attach(9)")
  })

  test("unresolvable identifier is skipped, not flagged", () => {
    // `runtimePin` is never declared as a constant — best-effort skips it.
    const code = `
      void setup() { pinMode(runtimePin, OUTPUT); }
      void loop() {}
    `
    expect(extractPinReferences(code)).toEqual([])
  })

  test("comments and strings don't confuse the parser", () => {
    const code = `
      // pinMode(99, OUTPUT);
      /* pulseIn(99, HIGH); */
      const char* s = "digitalWrite(99, LOW)";
      void setup() { pinMode(5, OUTPUT); }
      void loop() {}
    `
    const refs = extractPinReferences(code)
    expect(refs).toHaveLength(1)
    expect(refs[0].pin).toBe(5)
  })

  test("multiple distinct pins return one entry each, sorted", () => {
    const code = `
      void setup() { pinMode(2, OUTPUT); pinMode(13, OUTPUT); }
      void loop() { digitalWrite(2, HIGH); digitalWrite(13, LOW); }
    `
    const refs = extractPinReferences(code)
    expect(refs.map((r) => r.pin)).toEqual([2, 13])
  })
})
