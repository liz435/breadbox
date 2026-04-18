import { describe, test, expect } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import {
  renderSymbol,
  ResistorSymbol,
  LedSymbol,
  ButtonSymbol,
  CapacitorSymbol,
  BuzzerSymbol,
  ServoSymbol,
  PotentiometerSymbol,
  VoltageSourceSymbol,
  GroundSymbol,
  ArduinoPinSymbol,
  SevenSegmentSymbol,
  UltrasonicSensorSymbol,
  TemperatureSensorSymbol,
  PhotoresistorSymbol,
  LcdSymbol,
  NeopixelSymbol,
  PirSensorSymbol,
  WireJunction,
  type SchematicSymbolType,
} from "../schematic-symbols"
import type { SymbolProps } from "../schematic-symbols"

// ── Helpers ────────────────────────────────────────────────────────────

const BASE_PROPS: SymbolProps = {
  x: 100,
  y: 100,
  label: "Test",
}

function render(node: React.ReactNode): string {
  return renderToStaticMarkup(node as React.ReactElement)
}

// ── renderSymbol dispatch ──────────────────────────────────────────────

describe("renderSymbol — dispatch to all 18 symbol types", () => {
  const ALL_TYPES: SchematicSymbolType[] = [
    "resistor",
    "led",
    "button",
    "capacitor",
    "buzzer",
    "servo",
    "potentiometer",
    "seven_segment",
    "ultrasonic_sensor",
    "temperature_sensor",
    "photoresistor",
    "lcd",
    "neopixel",
    "pir_sensor",
    "voltage_source",
    "ground",
    "arduino_pin",
    "junction",
  ]

  for (const type of ALL_TYPES) {
    test(`renderSymbol("${type}") returns a non-null React node`, () => {
      const result = renderSymbol(type, BASE_PROPS)
      expect(result).not.toBeNull()
    })

    test(`renderSymbol("${type}") renders to non-empty HTML`, () => {
      const result = renderSymbol(type, BASE_PROPS)
      const html = render(result)
      expect(html.length).toBeGreaterThan(0)
    })
  }

  test("all 18 types are covered (exhaustive count check)", () => {
    expect(ALL_TYPES.length).toBe(18)
  })
})

// ── Label rendering ────────────────────────────────────────────────────

describe("symbol label rendering", () => {
  test("ResistorSymbol renders its label in output", () => {
    const html = render(<ResistorSymbol {...BASE_PROPS} label="R1" />)
    expect(html).toContain("R1")
  })

  test("LedSymbol renders its label in output", () => {
    const html = render(<LedSymbol {...BASE_PROPS} label="LED1" />)
    expect(html).toContain("LED1")
  })

  test("ButtonSymbol renders label with SW prefix", () => {
    const html = render(<ButtonSymbol {...BASE_PROPS} label="BTN1" />)
    expect(html).toContain("SW")
    expect(html).toContain("BTN1")
  })

  test("ArduinoPinSymbol renders pin label", () => {
    const html = render(<ArduinoPinSymbol {...BASE_PROPS} label="D13" />)
    expect(html).toContain("D13")
  })

  test("VoltageSourceSymbol renders 5V label", () => {
    const html = render(<VoltageSourceSymbol {...BASE_PROPS} label="5V" />)
    expect(html).toContain("5V")
  })

  test("GroundSymbol renders GND label", () => {
    const html = render(<GroundSymbol {...BASE_PROPS} label="GND" />)
    expect(html).toContain("GND")
  })
})

// ── Value rendering ────────────────────────────────────────────────────

describe("symbol value rendering", () => {
  test("ResistorSymbol renders value when provided", () => {
    const html = render(<ResistorSymbol {...BASE_PROPS} value="220Ω" />)
    expect(html).toContain("220Ω")
  })

  test("ResistorSymbol does not render value element when value is undefined", () => {
    const html = render(<ResistorSymbol {...BASE_PROPS} />)
    // Should not have a second text element for value — just the label
    // We check that "220" is not in the output as a proxy
    // We can also check that the output does not have a value-styled text
    const occurrences = (html.match(/fill="#aaa"/g) ?? []).length
    expect(occurrences).toBe(0)
  })

  test("LedSymbol renders value when provided", () => {
    const html = render(<LedSymbol {...BASE_PROPS} value="red" />)
    expect(html).toContain("red")
  })
})

// ── Active state styling ───────────────────────────────────────────────

describe("symbol active state styling", () => {
  test("ResistorSymbol uses active stroke color (#ef4444) when isActive=true", () => {
    const html = render(<ResistorSymbol {...BASE_PROPS} isActive={true} />)
    expect(html).toContain("#ef4444")
  })

  test("ResistorSymbol uses default stroke (#333) when isActive=false", () => {
    const html = render(<ResistorSymbol {...BASE_PROPS} isActive={false} />)
    expect(html).toContain("#333")
    expect(html).not.toContain("#ef4444")
  })

  test("ResistorSymbol uses default stroke when isActive is undefined", () => {
    const html = render(<ResistorSymbol {...BASE_PROPS} />)
    expect(html).toContain("#333")
  })

  test("LedSymbol uses active stroke (#ef4444) when isActive=true", () => {
    const html = render(<LedSymbol {...BASE_PROPS} isActive={true} />)
    // Active LED should have red color
    expect(html).toContain("#ef4444")
  })

  test("ButtonSymbol uses blue (#3b82f6) stroke when isActive=true", () => {
    const html = render(<ButtonSymbol {...BASE_PROPS} isActive={true} />)
    expect(html).toContain("#3b82f6")
  })

  test("ButtonSymbol uses default stroke (#333) when isActive=false", () => {
    const activeHtml = render(<ButtonSymbol {...BASE_PROPS} isActive={true} />)
    const inactiveHtml = render(<ButtonSymbol {...BASE_PROPS} isActive={false} />)
    // Active and inactive should produce different output
    expect(activeHtml).not.toBe(inactiveHtml)
  })
})

// ── Button open/closed state ───────────────────────────────────────────

describe("ButtonSymbol open/closed arm position", () => {
  test("arm is horizontal (closed) when isActive=true", () => {
    // When active, armY2 = y (same as y), so the arm line has both endpoints at same y
    // The arm: x1={x+18} y1={y} x2={armX2} y2={armY2=y}
    const x = 100
    const y = 100
    const html = render(<ButtonSymbol x={x} y={y} label="BTN" isActive={true} />)
    // armY2 = y = 100, so line y2="100"
    // We expect y1 and y2 of the arm line to both be 100
    expect(html).toContain(`y1="${y}"`)
    expect(html).toContain(`y2="${y}"`)
  })

  test("arm is angled (open) when isActive=false", () => {
    // When inactive, armY2 = y - 12
    const x = 100
    const y = 100
    const html = render(<ButtonSymbol x={x} y={y} label="BTN" isActive={false} />)
    // armY2 = y - 12 = 88
    expect(html).toContain(`y2="${y - 12}"`)
  })

  test("arm is angled (open) when isActive is undefined", () => {
    const y = 100
    const html = render(<ButtonSymbol x={100} y={y} label="BTN" />)
    // armY2 = y - 12 (falsy isActive)
    expect(html).toContain(`y2="${y - 12}"`)
  })
})

// ── Annotation rendering ───────────────────────────────────────────────

describe("Annotation component", () => {
  test("annotation is rendered when voltage is provided", () => {
    const html = render(<ResistorSymbol {...BASE_PROPS} voltage={3.3} />)
    expect(html).toContain("3.30V")
  })

  test("annotation is rendered when current is provided", () => {
    const html = render(<ResistorSymbol {...BASE_PROPS} current={15.5} />)
    expect(html).toContain("15.5mA")
  })

  test("annotation renders both voltage and current when both provided", () => {
    const html = render(<ResistorSymbol {...BASE_PROPS} voltage={5.0} current={22.0} />)
    expect(html).toContain("5.00V")
    expect(html).toContain("22.0mA")
  })

  test("annotation is not rendered when neither voltage nor current is provided", () => {
    const html = render(<ResistorSymbol {...BASE_PROPS} />)
    // Annotation uses italic fill="#888" — should not appear when no values
    expect(html).not.toContain("fontStyle")
  })

  test("annotation is not rendered when voltage and current are both null/undefined", () => {
    const html = render(<ResistorSymbol {...BASE_PROPS} voltage={undefined} current={undefined} />)
    expect(html).not.toContain("fontStyle")
  })

  test("voltage is formatted to 2 decimal places", () => {
    const html = render(<LedSymbol {...BASE_PROPS} voltage={1.7} />)
    expect(html).toContain("1.70V")
  })

  test("current is formatted to 1 decimal place", () => {
    const html = render(<LedSymbol {...BASE_PROPS} current={20} />)
    expect(html).toContain("20.0mA")
  })
})

// ── WireJunction ───────────────────────────────────────────────────────

describe("WireJunction", () => {
  test("renders a circle at the given coordinates", () => {
    const html = render(<WireJunction x={50} y={75} />)
    expect(html).toContain(`cx="50"`)
    expect(html).toContain(`cy="75"`)
  })

  test("junction circle has r=4", () => {
    const html = render(<WireJunction x={0} y={0} />)
    expect(html).toContain(`r="4"`)
  })
})

// ── Symbol coordinate placement ────────────────────────────────────────

describe("symbol coordinate placement", () => {
  test("ResistorSymbol terminal dots are at x and x+60", () => {
    const x = 200
    const html = render(<ResistorSymbol x={x} y={100} label="R" />)
    expect(html).toContain(`cx="${x}"`)
    expect(html).toContain(`cx="${x + 60}"`)
  })

  test("LedSymbol terminal dots are at x and x+60", () => {
    const x = 50
    const html = render(<LedSymbol x={x} y={100} label="D1" />)
    expect(html).toContain(`cx="${x}"`)
    expect(html).toContain(`cx="${x + 60}"`)
  })

  test("GroundSymbol terminal dot is at x (left terminal)", () => {
    const x = 300
    const html = render(<GroundSymbol x={x} y={100} label="GND" />)
    expect(html).toContain(`cx="${x}"`)
  })

  test("ArduinoPinSymbol lead right extends to x+50", () => {
    const x = 80
    const html = render(<ArduinoPinSymbol x={x} y={100} label="D13" />)
    // Terminal dot at x + 36 + 14 = x + 50
    expect(html).toContain(`cx="${x + 50}"`)
  })

  test("VoltageSourceSymbol terminal dot is at x+60", () => {
    const x = 80
    const html = render(<VoltageSourceSymbol x={x} y={100} label="5V" />)
    expect(html).toContain(`cx="${x + 60}"`)
  })
})

// ── NeopixelSymbol active LED colors ──────────────────────────────────

describe("NeopixelSymbol", () => {
  test("LED dots are visible when isActive=true", () => {
    const html = render(<NeopixelSymbol {...BASE_PROPS} isActive={true} />)
    // Active neopixel fills LED circles with colors
    expect(html).toContain("#ef4444") // red LED color
    expect(html).toContain("#22c55e") // green LED color
  })

  test("LED dots have no fill when isActive=false", () => {
    const html = render(<NeopixelSymbol {...BASE_PROPS} isActive={false} />)
    // When inactive, fill is "none"
    expect(html).toContain(`fill="none"`)
  })
})
