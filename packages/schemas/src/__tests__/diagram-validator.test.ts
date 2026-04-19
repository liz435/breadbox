import { describe, test, expect } from "bun:test";
import {
  DIAGRAM_SCHEMA_V1,
  validateDiagram,
  type DreamerDiagramInput,
} from "../index";

function makeDiagram(overrides: Partial<DreamerDiagramInput>): DreamerDiagramInput {
  return {
    $schema: DIAGRAM_SCHEMA_V1,
    board: "arduino_uno",
    sketch:
      "void setup(){pinMode(13,OUTPUT);} void loop(){digitalWrite(13,HIGH);delay(500);digitalWrite(13,LOW);delay(500);}",
    components: [
      { id: "led1", type: "led", at: [7, 5], rotation: 0, properties: {} },
      { id: "r1", type: "resistor", at: [3, 5], rotation: 0, properties: {} },
    ],
    wires: [
      { from: "arduino.13", to: "r1.a" },
      { from: "r1.b", to: "led1.anode" },
      { from: "led1.cathode", to: "arduino.GND" },
    ],
    environment: { obstacles: [], boundaryEnabled: false, boundaryMargin: 100 },
    customLibraries: [],
    ...overrides,
  };
}

describe("validateDiagram — structural", () => {
  test("clean diagram passes with no issues", () => {
    const result = validateDiagram(makeDiagram({}));
    expect(result.ok).toBe(true);
    expect(result.issues).toHaveLength(0);
    expect(result.boardState).toBeDefined();
  });

  test("pin typo produces a structural error issue", () => {
    const result = validateDiagram(
      makeDiagram({
        wires: [
          { from: "arduino.13", to: "led1.anoed" },
        ],
      }),
    );
    expect(result.ok).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
    const err = result.issues.find((i) => i.code === "STRUCTURAL_ERROR");
    expect(err).toBeDefined();
    expect(err?.severity).toBe("error");
    expect(err?.suggestion).toBe("anode");
  });

  test("structural failure skips semantic checks", () => {
    const result = validateDiagram({
      $schema: "dreamer-diagram-v99", // bad version
    });
    expect(result.ok).toBe(false);
    // Only structural errors, no semantic warnings
    expect(result.issues.every((i) => i.category === "structural")).toBe(true);
  });
});

describe("validateDiagram — semantic: dangling components", () => {
  test("orphaned component produces a warning", () => {
    const result = validateDiagram(
      makeDiagram({
        components: [
          { id: "led1", type: "led", at: [7, 5], rotation: 0, properties: {} },
          { id: "r1", type: "resistor", at: [3, 5], rotation: 0, properties: {} },
          // Orphan — no wires touch it
          { id: "orphan", type: "led", at: [7, 15], rotation: 0, properties: {} },
        ],
      }),
    );
    expect(result.ok).toBe(true);
    const dangling = result.issues.filter((i) => i.code === "DANGLING_COMPONENT");
    expect(dangling).toHaveLength(1);
    expect(dangling[0].message).toContain("orphan");
    expect(dangling[0].severity).toBe("warning");
  });

  test("fully wired components produce no dangling warnings", () => {
    const result = validateDiagram(makeDiagram({}));
    expect(result.issues.filter((i) => i.code === "DANGLING_COMPONENT")).toHaveLength(0);
  });
});

describe("validateDiagram — semantic: pin-not-wired", () => {
  test("sketch uses pin 13 but no wire connects it", () => {
    const result = validateDiagram(
      makeDiagram({
        sketch: "void setup(){pinMode(13,OUTPUT);} void loop(){digitalWrite(13,HIGH);}",
        components: [
          { id: "led1", type: "led", at: [7, 5], rotation: 0, properties: {} },
        ],
        wires: [
          // No arduino.13 wire
          { from: "arduino.GND", to: "led1.cathode" },
        ],
      }),
    );
    const warn = result.issues.find((i) => i.code === "PIN_NOT_WIRED");
    expect(warn).toBeDefined();
    expect(warn?.message).toContain("pin 13");
  });

  test("LED_BUILTIN is treated as pin 13", () => {
    const result = validateDiagram(
      makeDiagram({
        sketch: "void setup(){pinMode(LED_BUILTIN,OUTPUT);} void loop(){}",
        components: [],
        wires: [],
      }),
    );
    const warn = result.issues.find((i) => i.code === "PIN_NOT_WIRED");
    expect(warn).toBeDefined();
    expect(warn?.message).toContain("pin 13");
  });

  test("A0 reference catches analog-pin wiring gap", () => {
    const result = validateDiagram(
      makeDiagram({
        sketch: "void setup(){} void loop(){int v=analogRead(A0);}",
        components: [],
        wires: [],
      }),
    );
    // A0 on Uno = pin 14
    const warn = result.issues.find((i) => i.code === "PIN_NOT_WIRED");
    expect(warn).toBeDefined();
    expect(warn?.message).toContain("pin 14");
  });

  test("comments don't trigger false positives", () => {
    const result = validateDiagram(
      makeDiagram({
        sketch: "// pinMode(5, OUTPUT);\n/* digitalWrite(7, HIGH); */\nvoid setup(){pinMode(13,OUTPUT);} void loop(){}",
      }),
    );
    expect(result.issues.filter((i) => i.code === "PIN_NOT_WIRED")).toHaveLength(0);
  });
});

describe("validateDiagram — semantic: missing ground", () => {
  test("servo with signal + vcc wired but no ground connection warns", () => {
    const result = validateDiagram(
      makeDiagram({
        sketch: "#include <Servo.h>\nServo s; void setup(){s.attach(9);} void loop(){}",
        components: [
          { id: "servo1", type: "servo", at: [7, 5], rotation: 0, properties: {} },
        ],
        wires: [
          { from: "arduino.9", to: "servo1.signal" },
          { from: "arduino.5V", to: "servo1.vcc" },
          { from: "servo1.gnd", to: "grid.10,9" }, // wired but goes nowhere useful
        ],
      }),
    );
    const warn = result.issues.find((i) => i.code === "MISSING_GROUND");
    expect(warn).toBeDefined();
    expect(warn?.message).toContain("servo1");
  });

  test("servo with gnd wired to arduino.GND passes", () => {
    const result = validateDiagram(
      makeDiagram({
        sketch: "#include <Servo.h>\nServo s; void setup(){s.attach(9);} void loop(){}",
        components: [
          { id: "servo1", type: "servo", at: [7, 5], rotation: 0, properties: {} },
        ],
        wires: [
          { from: "arduino.9", to: "servo1.signal" },
          { from: "arduino.5V", to: "servo1.vcc" },
          { from: "servo1.gnd", to: "arduino.GND" },
        ],
      }),
    );
    expect(result.issues.filter((i) => i.code === "MISSING_GROUND")).toHaveLength(0);
  });

  test("servo ground wired to PSU negative anchor passes", () => {
    const result = validateDiagram(
      makeDiagram({
        components: [
          { id: "psu1", type: "power_supply", at: [0, 0], rotation: 0, properties: {} },
          { id: "servo1", type: "servo", at: [7, 5], rotation: 0, properties: {} },
        ],
        wires: [
          { from: "arduino.9", to: "servo1.signal" },
          { from: "psu1.+", to: "servo1.vcc" },
          { from: "servo1.gnd", to: "psu1.-" },
        ],
      }),
    );
    expect(result.issues.filter((i) => i.code === "MISSING_GROUND")).toHaveLength(0);
  });
});

describe("validateDiagram — semantic: empty sketch", () => {
  test("components placed but empty sketch warns", () => {
    const result = validateDiagram(
      makeDiagram({
        sketch: "",
      }),
    );
    const warn = result.issues.find((i) => i.code === "EMPTY_SKETCH");
    expect(warn).toBeDefined();
    expect(warn?.severity).toBe("warning");
  });

  test("default stub sketch triggers empty-sketch warning", () => {
    const result = validateDiagram(
      makeDiagram({
        sketch: "void setup() {} void loop() {}",
      }),
    );
    const warn = result.issues.find((i) => i.code === "EMPTY_SKETCH");
    expect(warn).toBeDefined();
  });

  test("no components + empty sketch = no empty-sketch warning", () => {
    const result = validateDiagram(
      makeDiagram({
        sketch: "",
        components: [],
        wires: [],
      }),
    );
    expect(result.issues.filter((i) => i.code === "EMPTY_SKETCH")).toHaveLength(0);
  });
});
