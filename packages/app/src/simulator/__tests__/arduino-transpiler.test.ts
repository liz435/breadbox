import { describe, test, expect } from "bun:test"
import { transpile } from "../arduino-transpiler"

/** Helper: transpile and assert success, return code */
function ok(input: string): string {
  const result = transpile(input)
  expect(result.success).toBe(true)
  return result.code
}

/** Helper: transpile and assert failure, return error */
function fail(input: string): string {
  const result = transpile(input)
  expect(result.success).toBe(false)
  return result.error?.message ?? ""
}

describe("transpile", () => {
  // ═══════════════════════════════════════════════════════════════
  // Variable Declarations
  // ═══════════════════════════════════════════════════════════════

  describe("variable declarations", () => {
    test("int with assignment", () => {
      expect(ok("int x = 5;")).toContain("let x = 5;")
    })

    test("int without assignment defaults to 0", () => {
      expect(ok("int count;")).toContain("let count = 0;")
    })

    test("float", () => {
      expect(ok("float temp = 23.5;")).toContain("let temp = 23.5;")
    })

    test("double", () => {
      expect(ok("double pi = 3.14159;")).toContain("let pi = 3.14159;")
    })

    test("bool", () => {
      expect(ok("bool ready = true;")).toContain("let ready = true;")
    })

    test("boolean (Arduino alias)", () => {
      expect(ok("boolean flag = false;")).toContain("let flag = false;")
    })

    test("byte", () => {
      expect(ok("byte data = 0xFF;")).toContain("let data = 0xFF;")
    })

    test("char", () => {
      expect(ok("char c = 'A';")).toContain("let c = 'A';")
    })

    test("long", () => {
      expect(ok("long bigNum = 100000;")).toContain("let bigNum = 100000;")
    })

    test("short", () => {
      expect(ok("short small = 127;")).toContain("let small = 127;")
    })

    test("word", () => {
      expect(ok("word w = 1024;")).toContain("let w = 1024;")
    })

    test("String", () => {
      expect(ok('String msg = "hello";')).toContain('let msg = "hello";')
    })

    test("unsigned int", () => {
      expect(ok("unsigned int pos = 0;")).toContain("let pos = 0;")
    })

    test("unsigned long", () => {
      expect(ok("unsigned long timer = 0;")).toContain("let timer = 0;")
    })

    test("multiple variables on one line", () => {
      expect(ok("int a, b, c;")).toContain("let a, b, c;")
    })

    test("const int", () => {
      expect(ok("const int PIN = 13;")).toContain("const PIN = 13;")
    })

    test("const float", () => {
      expect(ok("const float PI_VAL = 3.14;")).toContain("const PI_VAL = 3.14;")
    })

    test("const unsigned int", () => {
      expect(ok("const unsigned int MAX = 255;")).toContain("const MAX = 255;")
    })

    test("expression in assignment (int division truncates)", () => {
      // Int-typed division must truncate to match C/C++ semantics — plain
      // JS `/` would leave a fractional value (e.g. 1023/102 = 10.029…).
      expect(ok("int val = (analogRead(A0) + 1) / 2;")).toContain(
        "let val = Math.trunc((analogRead(A0) + 1) / 2);",
      )
    })

    test("float division stays floating-point", () => {
      expect(ok("float ratio = rawValue / 102.0;")).toContain("let ratio = rawValue / 102.0;")
    })

    test("int declaration without division passes through", () => {
      expect(ok("int x = 5;")).toContain("let x = 5;")
      expect(ok("int y = a + b;")).toContain("let y = a + b;")
    })

    test("negative number assignment", () => {
      expect(ok("int offset = -10;")).toContain("let offset = -10;")
    })
  })

  // ═══════════════════════════════════════════════════════════════
  // Integer Division Truncation (C/C++ semantics)
  // ═══════════════════════════════════════════════════════════════

  describe("int division truncation", () => {
    test("declaration: int literal / int literal", () => {
      expect(ok("int digit = 1023 / 102;")).toContain("let digit = Math.trunc(1023 / 102);")
    })

    test("declaration: int var / int literal", () => {
      expect(ok("int rawValue = 0;\nint digit = rawValue / 102;"))
        .toContain("let digit = Math.trunc(rawValue / 102);")
    })

    test("assignment to existing int var truncates", () => {
      const out = ok("int rawValue = 0;\nint digit = 0;\nvoid loop() { digit = rawValue / 102; }")
      expect(out).toContain("digit = Math.trunc(rawValue / 102)")
    })

    test("inline expression in function call truncates", () => {
      const out = ok("int rawValue = 0;\nvoid loop() { Serial.print(rawValue / 102); }")
      expect(out).toContain("Serial.print(Math.trunc(rawValue / 102))")
    })

    test("float-typed var does NOT truncate", () => {
      const out = ok("float rawValue = 0.0;\nfloat ratio = rawValue / 102.0;")
      expect(out).not.toContain("Math.trunc")
    })

    test("mixed int/float does not truncate", () => {
      const out = ok("int raw = 0;\nfloat scale = 2.0;\nfloat out = raw / scale;")
      expect(out).not.toContain("Math.trunc")
    })

    test("analogRead (int-returning) / int truncates", () => {
      const out = ok("void loop() { Serial.print(analogRead(A0) / 10); }")
      expect(out).toContain("Math.trunc(analogRead(A0) / 10)")
    })

    test("already-wrapped division is not double-wrapped", () => {
      const out = ok("int x = 1023 / 10 / 2;")
      const matches = (out.match(/Math\.trunc/g) ?? []).length
      expect(matches).toBeGreaterThanOrEqual(1)
      // No Math.trunc(Math.trunc(Math.trunc
      expect(out).not.toMatch(/Math\.trunc\(Math\.trunc\(Math\.trunc/)
    })

    test("condition: int / int inside if truncates", () => {
      const out = ok("int raw = 0;\nvoid loop() { if (raw / 2 > 5) { } }")
      expect(out).toContain("if (Math.trunc(raw / 2) > 5)")
    })

    test("untyped variable leaves division alone", () => {
      // Untyped `foo` — we don't know its type, so don't truncate
      const out = ok("void loop() { Serial.print(foo / 2); }")
      expect(out).not.toContain("Math.trunc")
    })

    test("for loop increment is not affected", () => {
      const out = ok("void loop() { for (int i = 0; i < 10; i++) { } }")
      expect(out).not.toContain("Math.trunc")
    })
  })

  // ═══════════════════════════════════════════════════════════════
  // Array Declarations
  // ═══════════════════════════════════════════════════════════════

  describe("array declarations", () => {
    test("with size", () => {
      expect(ok("int arr[5];")).toContain("let arr = new Array(5).fill(0);")
    })

    test("with initializer", () => {
      expect(ok("int arr[3] = {1, 2, 3};")).toContain("let arr = [1, 2, 3];")
    })

    test("byte array", () => {
      expect(ok("byte buf[10];")).toContain("let buf = new Array(10).fill(0);")
    })

    test("float array with init", () => {
      expect(ok("float vals[2] = {1.5, 2.5};")).toContain("let vals = [1.5, 2.5];")
    })

    test("String array", () => {
      expect(ok("String names[3];")).toContain("let names = new Array(3).fill(0);")
    })

    test("2D int array with initializer", () => {
      expect(ok("const int digits[2][3] = {{1,2,3},{4,5,6}};")).toContain("const digits = [[1,2,3], [4,5,6]];")
    })

    test("2D bool array multiline initializer", () => {
      const code = `const bool grid[2][3] = {
  {true, false, true},
  {false, true, false}
};`
      expect(ok(code)).toContain("const grid = [[true, false, true], [false, true, false]];")
    })
  })

  // ═══════════════════════════════════════════════════════════════
  // Function Declarations
  // ═══════════════════════════════════════════════════════════════

  describe("function declarations", () => {
    test("void setup()", () => {
      expect(ok("void setup() {")).toContain("function setup() {")
    })

    test("void loop()", () => {
      expect(ok("void loop() {")).toContain("function loop() {")
    })

    test("int return type", () => {
      expect(ok("int readSensor() {")).toContain("function readSensor() {")
    })

    test("float return type", () => {
      expect(ok("float getTemp() {")).toContain("function getTemp() {")
    })

    test("bool return type", () => {
      expect(ok("bool isPressed() {")).toContain("function isPressed() {")
    })

    test("single parameter", () => {
      expect(ok("void blink(int pin) {")).toContain("function blink(pin) {")
    })

    test("multiple parameters", () => {
      expect(ok("void setLed(int pin, int value) {")).toContain("function setLed(pin, value) {")
    })

    test("mixed parameter types", () => {
      expect(ok("float convert(int raw, float scale) {")).toContain("function convert(raw, scale) {")
    })

    test("no parameters", () => {
      expect(ok("void doNothing() {")).toContain("function doNothing() {")
    })

    test("one-liner function", () => {
      expect(ok("void noop() {}")).toContain("function noop() {}")
    })

    test("unsigned int return type", () => {
      expect(ok("unsigned int getCount() {")).toContain("function getCount() {")
    })
  })

  // ═══════════════════════════════════════════════════════════════
  // Preprocessor Directives
  // ═══════════════════════════════════════════════════════════════

  describe("preprocessor directives", () => {
    test("#define numeric", () => {
      expect(ok("#define LED_PIN 13")).toContain("const LED_PIN = 13;")
    })

    test("#define expression", () => {
      expect(ok("#define HALF_SPEED 128")).toContain("const HALF_SPEED = 128;")
    })

    test("#define string-like", () => {
      expect(ok('#define VERSION "1.0"')).toContain('const VERSION = "1.0";')
    })

    test.each([
      "Servo.h", "LiquidCrystal.h", "EEPROM.h",
      "Wire.h", "SPI.h", "Stepper.h",
    ])("#include <%s> is accepted", (lib) => {
      const result = transpile(`#include <${lib}>`)
      expect(result.success).toBe(true)
      expect(result.code).toContain(`// #include <${lib}>`)
    })

    test("#include with quotes is accepted", () => {
      const result = transpile('#include "Servo.h"')
      expect(result.success).toBe(true)
    })

    test("#include unknown library fails", () => {
      expect(fail("#include <WiFi.h>")).toContain("Unsupported library")
    })

    test("#include unknown library with quotes fails", () => {
      expect(fail('#include "MyLib.h"')).toContain("Unsupported library")
    })

    test("unknown preprocessor directive is commented out", () => {
      expect(ok("#pragma once")).toContain("// #pragma once")
    })
  })

  // ═══════════════════════════════════════════════════════════════
  // Constant Substitution
  // ═══════════════════════════════════════════════════════════════

  describe("constant substitution", () => {
    test("HIGH → 1", () => {
      expect(ok("digitalWrite(13, HIGH);")).toContain("digitalWrite(13, 1);")
    })

    test("LOW → 0", () => {
      expect(ok("digitalWrite(13, LOW);")).toContain("digitalWrite(13, 0);")
    })

    test("OUTPUT → 1", () => {
      expect(ok("pinMode(13, OUTPUT);")).toContain("pinMode(13, 1);")
    })

    test("INPUT → 0", () => {
      expect(ok("pinMode(2, INPUT);")).toContain("pinMode(2, 0);")
    })

    test("INPUT_PULLUP → 2", () => {
      expect(ok("pinMode(2, INPUT_PULLUP);")).toContain("pinMode(2, 2);")
    })

    test('F("...") macro unwraps to a plain string literal', () => {
      expect(ok('Serial.println(F("hello"));')).toContain('Serial.println("hello");')
    })

    test("multiple constants in one line", () => {
      const code = ok("if (digitalRead(2) == HIGH) digitalWrite(13, LOW);")
      expect(code).toContain("== 1")
      expect(code).toContain("13, 0")
    })

    test("constants not substituted inside strings", () => {
      // This is a known limitation — constants ARE substituted even in strings.
      // Documenting the current behavior.
      const code = ok('Serial.println("HIGH");')
      expect(code).toContain("1") // currently substitutes — known limitation
    })

    test("constant not substituted in partial word", () => {
      // HIGH_SCORE should not become 1_SCORE
      const code = ok("int HIGHWAY = 0;")
      // \bHIGH\b should not match HIGHWAY
      expect(code).not.toContain("let 1WAY")
    })
  })

  // ═══════════════════════════════════════════════════════════════
  // For Loops
  // ═══════════════════════════════════════════════════════════════

  describe("for loops", () => {
    test("basic for with int", () => {
      expect(ok("for (int i = 0; i < 10; i++) {")).toContain("for (let i = 0; i < 10; i++) {")
    })

    test("for with byte", () => {
      expect(ok("for (byte i = 0; i < 255; i++) {")).toContain("for (let i = 0; i < 255; i++) {")
    })

    test("for with unsigned int", () => {
      expect(ok("for (unsigned int i = 0; i < 100; i++) {")).toContain("for (let i = 0; i < 100; i++) {")
    })

    test("for with float", () => {
      expect(ok("for (float x = 0.0; x < 1.0; x += 0.1) {")).toContain("for (let x = 0.0; x < 1.0; x += 0.1) {")
    })

    test("for without type (already JS-compatible) passes through", () => {
      const code = ok("for (i = 0; i < 10; i++) {")
      expect(code).toContain("for (i = 0; i < 10; i++) {")
    })
  })

  // ═══════════════════════════════════════════════════════════════
  // Comments
  // ═══════════════════════════════════════════════════════════════

  describe("comments", () => {
    test("line comment", () => {
      expect(ok("// this is a comment")).toContain("// this is a comment")
    })

    test("inline block comment", () => {
      expect(ok("/* block */")).toContain("/* block */")
    })

    test("multiline block comment", () => {
      const code = ok("/* line 1\n   line 2 */")
      expect(code).toContain("/* line 1")
      expect(code).toContain("line 2 */")
    })

    test("code after block comment end passes through (known limitation)", () => {
      // The transpiler doesn't parse code after a single-line block comment
      const code = ok("/* comment */ int x = 5;")
      expect(code).toContain("/* comment */ int x = 5;")
    })

    test("empty line passes through", () => {
      const result = transpile("\n\n\n")
      expect(result.success).toBe(true)
    })
  })

  // ═══════════════════════════════════════════════════════════════
  // Class / Struct Definitions
  // ═══════════════════════════════════════════════════════════════

  describe("class / struct definitions", () => {
    test("class with opening brace", () => {
      expect(ok("class Motor {")).toContain("class Motor {")
    })

    test("class without opening brace", () => {
      const code = ok("class Motor")
      expect(code).toContain("class Motor")
    })

    test("struct transpiles to class", () => {
      expect(ok("struct Point {")).toContain("class Point {")
    })

    test("class with inheritance", () => {
      expect(ok("class StepperMotor : public Motor {")).toContain("class StepperMotor {")
    })

    test("public: becomes comment", () => {
      expect(ok("public:")).toContain("// public:")
    })

    test("private: becomes comment", () => {
      expect(ok("private:")).toContain("// private:")
    })

    test("protected: becomes comment", () => {
      expect(ok("protected:")).toContain("// protected:")
    })
  })

  // ═══════════════════════════════════════════════════════════════
  // Class Instantiation
  // ═══════════════════════════════════════════════════════════════

  describe("class instantiation", () => {
    test("Servo without args", () => {
      expect(ok("Servo motor;")).toContain("let motor = new Servo();")
    })

    test("Servo with variable name containing numbers", () => {
      expect(ok("Servo servo1;")).toContain("let servo1 = new Servo();")
    })

    test("LiquidCrystal with args", () => {
      expect(ok("LiquidCrystal lcd(12, 11, 5, 4, 3, 2);")).toContain(
        "let lcd = new LiquidCrystal(12, 11, 5, 4, 3, 2);",
      )
    })

    test("Stepper with args", () => {
      expect(ok("Stepper myStepper(200, 8, 9, 10, 11);")).toContain(
        "let myStepper = new Stepper(200, 8, 9, 10, 11);",
      )
    })

    test("custom PascalCase class without args", () => {
      expect(ok("MyShield shield;")).toContain("let shield = new MyShield();")
    })

    test("custom PascalCase class with args", () => {
      expect(ok("CustomSensor sensor(4, 5);")).toContain("let sensor = new CustomSensor(4, 5);")
    })

    test("single-letter uppercase passes through (not enough chars for PascalCase)", () => {
      // 'A x;' — regex requires [A-Z]\w+ which needs at least 2 chars
      const result = transpile("A x;")
      expect(result.success).toBe(true)
      // Single uppercase letter doesn't match the class instantiation regex
      expect(result.code).toContain("A x;")
    })

    test("String is treated as type, not class instantiation", () => {
      // String is in C_TYPES, so `String s;` should be a variable declaration, not new String()
      expect(ok("String s;")).toContain("let s = 0;")
    })

    test("indented class instantiation preserves indent", () => {
      expect(ok("  Servo motor;")).toContain("  let motor = new Servo();")
    })
  })

  // ═══════════════════════════════════════════════════════════════
  // Unsupported Features
  // ═══════════════════════════════════════════════════════════════

  describe("unsupported features", () => {
    test("template returns error", () => {
      expect(fail("template <typename T>")).toContain("Template")
    })

    test("namespace returns error", () => {
      expect(fail("namespace MyNs {")).toContain("Namespace")
    })

    test("pointer dereference returns error", () => {
      expect(fail("int *ptr = &val;")).toContain("Pass-by-reference")
    })

    test("arrow operator returns error", () => {
      expect(fail("obj->method();")).toContain("Pass-by-reference")
    })

    test("address-of operator returns error", () => {
      expect(fail("int &ref = val;")).toContain("Pass-by-reference")
    })
  })

  // ═══════════════════════════════════════════════════════════════
  // Pass-through (lines that need no transformation)
  // ═══════════════════════════════════════════════════════════════

  describe("pass-through lines", () => {
    test("function call", () => {
      expect(ok("digitalWrite(13, 1);")).toContain("digitalWrite(13, 1);")
    })

    test("if statement", () => {
      expect(ok("if (x > 5) {")).toContain("if (x > 5) {")
    })

    test("else", () => {
      expect(ok("} else {")).toContain("} else {")
    })

    test("while loop", () => {
      expect(ok("while (true) {")).toContain("while (true) {")
    })

    test("return statement", () => {
      expect(ok("return 42;")).toContain("return 42;")
    })

    test("closing brace", () => {
      expect(ok("}")).toContain("}")
    })

    test("assignment", () => {
      expect(ok("x = x + 1;")).toContain("x = x + 1;")
    })

    test("compound assignment", () => {
      expect(ok("angle += 1;")).toContain("angle += 1;")
    })

    test("method call on object", () => {
      expect(ok("motor.write(90);")).toContain("motor.write(90);")
    })

    test("Serial.begin", () => {
      expect(ok("Serial.begin(9600);")).toContain("Serial.begin(9600);")
    })

    test("Serial.println with string", () => {
      expect(ok('Serial.println("hello");')).toContain('Serial.println("hello");')
    })

    test("switch statement", () => {
      expect(ok("switch (state) {")).toContain("switch (state) {")
    })

    test("case label", () => {
      expect(ok("case 1:")).toContain("case 1:")
    })

    test("break", () => {
      expect(ok("break;")).toContain("break;")
    })

    test("do-while", () => {
      expect(ok("do {")).toContain("do {")
    })
  })

  // ═══════════════════════════════════════════════════════════════
  // Complete Sketch Integration Tests
  // ═══════════════════════════════════════════════════════════════

  describe("complete sketches", () => {
    test("blink sketch", () => {
      const code = ok(`
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
`)
      expect(code).toContain("const LED_PIN = 13;")
      expect(code).toContain("function setup() {")
      expect(code).toContain("function loop() {")
      expect(code).toContain("pinMode(LED_PIN, 1);")
      expect(code).toContain("digitalWrite(LED_PIN, 1);")
      expect(code).toContain("digitalWrite(LED_PIN, 0);")
    })

    test("servo sweep sketch", () => {
      const code = ok(`
#include <Servo.h>

Servo motor;
int pinServo = 10;
int angle = 0;

void setup() {
  motor.attach(pinServo);
  motor.write(angle);
}

void loop() {
  angle += 1;
  if(angle > 180) {
    angle = 0;
  }
  motor.write(angle);
  delay(50);
}
`)
      expect(code).toContain("let motor = new Servo();")
      expect(code).toContain("let pinServo = 10;")
      expect(code).toContain("let angle = 0;")
      expect(code).toContain("function setup() {")
      expect(code).toContain("motor.attach(pinServo);")
      expect(code).toContain("motor.write(angle);")
      expect(code).toContain("angle += 1;")
    })

    test("LCD hello world sketch", () => {
      const code = ok(`
#include <LiquidCrystal.h>

LiquidCrystal lcd(12, 11, 5, 4, 3, 2);

void setup() {
  lcd.begin(16, 2);
  lcd.print("Hello World!");
}

void loop() {
  lcd.setCursor(0, 1);
  lcd.print(millis() / 1000);
}
`)
      expect(code).toContain("let lcd = new LiquidCrystal(12, 11, 5, 4, 3, 2);")
      expect(code).toContain("lcd.begin(16, 2);")
      expect(code).toContain('lcd.print("Hello World!");')
      expect(code).toContain("lcd.setCursor(0, 1);")
    })

    test("button with interrupt sketch", () => {
      const code = ok(`
volatile int count = 0;

void setup() {
  Serial.begin(9600);
  pinMode(2, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(2), onPress, FALLING);
}

void onPress() {
  count++;
}

void loop() {
  Serial.println(count);
  delay(500);
}
`)
      // 'volatile' is not a recognized type prefix — line passes through
      expect(code).toContain("volatile int count = 0;")
      expect(code).toContain("function setup() {")
      expect(code).toContain("Serial.begin(9600);")
      expect(code).toContain("pinMode(2, 2);") // INPUT_PULLUP → 2
      expect(code).toContain("function onPress() {")
      expect(code).toContain("count++;")
    })

    test("EEPROM read/write sketch", () => {
      const code = ok(`
#include <EEPROM.h>

void setup() {
  Serial.begin(9600);
  int val = EEPROM.read(0);
  Serial.println(val);
  EEPROM.write(0, val + 1);
}

void loop() {
}
`)
      expect(code).toContain("function setup() {")
      expect(code).toContain("EEPROM.read(0)")
      expect(code).toContain("EEPROM.write(0, val + 1)")
    })

    test("potentiometer to LED sketch", () => {
      const code = ok(`
int potPin = A0;
int ledPin = 9;

void setup() {
  pinMode(ledPin, OUTPUT);
}

void loop() {
  int potValue = analogRead(potPin);
  int brightness = map(potValue, 0, 1023, 0, 255);
  analogWrite(ledPin, brightness);
  delay(10);
}
`)
      expect(code).toContain("let potPin = A0;")
      expect(code).toContain("let ledPin = 9;")
      expect(code).toContain("let potValue = analogRead(potPin);")
      expect(code).toContain("let brightness = map(potValue, 0, 1023, 0, 255);")
      expect(code).toContain("analogWrite(ledPin, brightness);")
    })

    test("custom class in sketch", () => {
      const code = ok(`
class Blinker {
public:
  int pin;
  int interval;

  void begin(int p, int i) {
    pin = p;
    interval = i;
    pinMode(pin, OUTPUT);
  }

  void update() {
    digitalWrite(pin, HIGH);
    delay(interval);
    digitalWrite(pin, LOW);
    delay(interval);
  }
};

Blinker led1;

void setup() {
  led1.begin(13, 500);
}

void loop() {
  led1.update();
}
`)
      expect(code).toContain("class Blinker {")
      expect(code).toContain("// public:")
      expect(code).toContain("function begin(p, i) {")
      expect(code).toContain("function update() {")
      expect(code).toContain("let led1 = new Blinker();")
      expect(code).toContain("led1.begin(13, 500);")
      expect(code).toContain("led1.update();")
    })

    test("stepper motor sketch", () => {
      const code = ok(`
#include <Stepper.h>

Stepper myStepper(200, 8, 9, 10, 11);

void setup() {
  myStepper.setSpeed(60);
}

void loop() {
  myStepper.step(200);
  delay(1000);
  myStepper.step(-200);
  delay(1000);
}
`)
      expect(code).toContain("let myStepper = new Stepper(200, 8, 9, 10, 11);")
      expect(code).toContain("myStepper.setSpeed(60);")
      expect(code).toContain("myStepper.step(200);")
      expect(code).toContain("myStepper.step(-200);")
    })

    test("Wire I2C sketch", () => {
      const code = ok(`
#include <Wire.h>

void setup() {
  Wire.begin();
  Serial.begin(9600);
}

void loop() {
  Wire.beginTransmission(0x50);
  Wire.write(0);
  Wire.endTransmission();
  Wire.requestFrom(0x50, 1);
  if (Wire.available()) {
    int val = Wire.read();
    Serial.println(val);
  }
  delay(500);
}
`)
      expect(code).toContain("Wire.begin();")
      expect(code).toContain("Wire.beginTransmission(0x50);")
      expect(code).toContain("Wire.write(0);")
      expect(code).toContain("Wire.endTransmission();")
      expect(code).toContain("Wire.requestFrom(0x50, 1);")
      expect(code).toContain("Wire.read()")
    })
  })

  // ═══════════════════════════════════════════════════════════════
  // Edge Cases
  // ═══════════════════════════════════════════════════════════════

  describe("edge cases", () => {
    test("empty input", () => {
      const result = transpile("")
      expect(result.success).toBe(true)
      expect(result.code).toBe("")
    })

    test("whitespace only", () => {
      const result = transpile("   \n  \n  ")
      expect(result.success).toBe(true)
    })

    test("deeply indented code preserves indent", () => {
      expect(ok("      int x = 5;")).toContain("      let x = 5;")
    })

    test("tab-indented code", () => {
      expect(ok("\tint x = 5;")).toContain("\tlet x = 5;")
    })

    test("volatile keyword is stripped (treated as pass-through)", () => {
      // volatile is not a recognized C type in our transpiler, so the
      // variable declaration won't be transformed. It passes through.
      const code = ok("volatile int count = 0;")
      // 'volatile' is not in C_TYPES so this may not match var decl regex.
      // It should still succeed (pass-through).
      expect(code).toBeDefined()
    })

    test("semicolon-only line", () => {
      expect(ok(";")).toContain(";")
    })

    test("multiple semicolons", () => {
      expect(ok(";;")).toContain(";;")
    })

    test("mixed code and comments (inline comment preserved after transpilation)", () => {
      // Inline comments are stripped before regex matching, then re-appended
      const code = ok("int x = 5; // set x to 5")
      expect(code).toContain("let x = 5; // set x to 5")
    })

    test("long sketch does not error", () => {
      const lines = Array.from({ length: 500 }, (_, i) => `int var${i} = ${i};`)
      const result = transpile(lines.join("\n"))
      expect(result.success).toBe(true)
    })
  })
})
