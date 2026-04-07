import { describe, test, expect } from "bun:test"
import { transpile } from "../arduino-transpiler"

describe("transpile", () => {
  // ── Variable declarations ──────────────────────────────────────

  test("int variable declaration with assignment", () => {
    const result = transpile("int x = 5;")
    expect(result.success).toBe(true)
    expect(result.code).toContain("let x = 5;")
  })

  test("float variable declaration", () => {
    const result = transpile("float temperature = 23.5;")
    expect(result.success).toBe(true)
    expect(result.code).toContain("let temperature = 23.5;")
  })

  test("bool variable declaration", () => {
    const result = transpile("bool isReady = true;")
    expect(result.success).toBe(true)
    expect(result.code).toContain("let isReady = true;")
  })

  test("String variable declaration", () => {
    const result = transpile('String msg = "hello";')
    expect(result.success).toBe(true)
    expect(result.code).toContain('let msg = "hello";')
  })

  test("byte variable declaration", () => {
    const result = transpile("byte data = 0xFF;")
    expect(result.success).toBe(true)
    expect(result.code).toContain("let data = 0xFF;")
  })

  test("unsigned long variable declaration", () => {
    const result = transpile("unsigned long timer = 0;")
    expect(result.success).toBe(true)
    expect(result.code).toContain("let timer = 0;")
  })

  test("uninitialized variable gets default value", () => {
    const result = transpile("int count;")
    expect(result.success).toBe(true)
    expect(result.code).toContain("let count = 0;")
  })

  // ── Function declarations ──────────────────────────────────────

  test("void setup function", () => {
    const result = transpile("void setup() {")
    expect(result.success).toBe(true)
    expect(result.code).toContain("function setup() {")
  })

  test("void loop function", () => {
    const result = transpile("void loop() {")
    expect(result.success).toBe(true)
    expect(result.code).toContain("function loop() {")
  })

  test("function with return type", () => {
    const result = transpile("int readSensor() {")
    expect(result.success).toBe(true)
    expect(result.code).toContain("function readSensor() {")
  })

  test("function with parameters", () => {
    const result = transpile("void setLed(int pin, int value) {")
    expect(result.success).toBe(true)
    expect(result.code).toContain("function setLed(pin, value) {")
  })

  // ── Preprocessor directives ────────────────────────────────────

  test("#define becomes const", () => {
    const result = transpile("#define LED_PIN 13")
    expect(result.success).toBe(true)
    expect(result.code).toContain("const LED_PIN = 13;")
  })

  test("#include with known library is accepted", () => {
    const result = transpile("#include <Servo.h>")
    expect(result.success).toBe(true)
    expect(result.code).toContain("// #include <Servo.h>")
  })

  test("#include with unknown library returns error", () => {
    const result = transpile("#include <WiFi.h>")
    expect(result.success).toBe(false)
    expect(result.error?.message).toContain("Unsupported library")
  })

  // ── For loop ───────────────────────────────────────────────────

  test("for loop with int i", () => {
    const result = transpile("for (int i = 0; i < 10; i++) {")
    expect(result.success).toBe(true)
    expect(result.code).toContain("for (let i = 0; i < 10; i++) {")
  })

  // ── Constants ──────────────────────────────────────────────────

  test("HIGH/LOW substitution", () => {
    const result = transpile("digitalWrite(13, HIGH);")
    expect(result.success).toBe(true)
    expect(result.code).toContain("digitalWrite(13, 1);")
  })

  test("INPUT/OUTPUT substitution", () => {
    const result = transpile("pinMode(13, OUTPUT);")
    expect(result.success).toBe(true)
    expect(result.code).toContain("pinMode(13, 1);")
  })

  test("INPUT_PULLUP substitution", () => {
    const result = transpile("pinMode(2, INPUT_PULLUP);")
    expect(result.success).toBe(true)
    expect(result.code).toContain("pinMode(2, 2);")
  })

  // ── Comments ───────────────────────────────────────────────────

  test("line comments pass through", () => {
    const result = transpile("// this is a comment")
    expect(result.success).toBe(true)
    expect(result.code).toContain("// this is a comment")
  })

  test("block comments pass through", () => {
    const result = transpile("/* block */")
    expect(result.success).toBe(true)
    expect(result.code).toContain("/* block */")
  })

  // ── Arrays ─────────────────────────────────────────────────────

  test("array declaration with size", () => {
    const result = transpile("int arr[5];")
    expect(result.success).toBe(true)
    expect(result.code).toContain("let arr = new Array(5).fill(0);")
  })

  test("array declaration with initializer", () => {
    const result = transpile("int arr[3] = {1, 2, 3};")
    expect(result.success).toBe(true)
    expect(result.code).toContain("let arr = [1, 2, 3];")
  })

  // ── const declarations ─────────────────────────────────────────

  test("const int declaration", () => {
    const result = transpile("const int PIN = 13;")
    expect(result.success).toBe(true)
    expect(result.code).toContain("const PIN = 13;")
  })

  // ── Unsupported features ───────────────────────────────────────

  test("struct returns error", () => {
    const result = transpile("struct Point {")
    expect(result.success).toBe(false)
    expect(result.error?.message).toContain("struct")
  })

  test("class returns error", () => {
    const result = transpile("class MyClass {")
    expect(result.success).toBe(false)
    expect(result.error?.message).toContain("class")
  })

  test("template returns error", () => {
    const result = transpile("template <typename T>")
    expect(result.success).toBe(false)
    expect(result.error?.message).toContain("Template")
  })

  test("namespace returns error", () => {
    const result = transpile("namespace MyNs {")
    expect(result.success).toBe(false)
    expect(result.error?.message).toContain("Namespace")
  })

  // ── Complete sketch ────────────────────────────────────────────

  test("complete blink sketch transpiles correctly", () => {
    const blinkSketch = `
// Blink sketch
#define LED_PIN 13

void setup() {
  pinMode(LED_PIN, OUTPUT);
}

void loop() {
  digitalWrite(LED_PIN, HIGH);
  delay(1000);
  digitalWrite(LED_PIN, LOW);
  delay(1000);
}
`
    const result = transpile(blinkSketch)
    expect(result.success).toBe(true)
    expect(result.code).toContain("const LED_PIN = 13;")
    expect(result.code).toContain("function setup() {")
    expect(result.code).toContain("function loop() {")
    expect(result.code).toContain("pinMode(LED_PIN, 1);")
    expect(result.code).toContain("digitalWrite(LED_PIN, 1);")
    expect(result.code).toContain("digitalWrite(LED_PIN, 0);")
    expect(result.code).toContain("delay(1000);")
  })
})
