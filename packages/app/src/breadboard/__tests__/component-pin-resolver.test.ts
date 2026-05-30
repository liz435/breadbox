import { describe, expect, test } from "bun:test"
import type { BoardComponent, ComponentType, Wire } from "@dreamer/schemas"
import {
  analyzeButtonWiring,
  findArduinoPinForComponentPin,
  findArduinoPinsForComponent,
} from "../component-pin-resolver"

function makeButton(): BoardComponent {
  return {
    id: "btn-1",
    type: "button",
    name: "Button",
    x: 3,
    y: 10,
    rotation: 0,
    pins: { a: null, b: null },
    properties: {},
  }
}

function makeComponent(type: ComponentType, pins: Record<string, number | null>): BoardComponent {
  return {
    id: `${type}-1`,
    type,
    name: type,
    x: 3,
    y: 10,
    rotation: 0,
    pins,
    properties: {},
  }
}

function signalWire(id: string, pin: number, toRow: number, toCol: number): Wire {
  return {
    id,
    fromRow: -999,
    fromCol: pin,
    toRow,
    toCol,
    color: "#22c55e",
  }
}

describe("analyzeButtonWiring", () => {
  test("resolves one-sided signal + opposite ground reference", () => {
    const button = makeButton()
    const wires: Record<string, Wire> = {
      s: signalWire("s", 2, 10, 3),
      g: signalWire("g", -3, 11, 6),
    }

    const result = analyzeButtonWiring(button, wires)
    expect(result.inputPin).toBe(2)
    expect(result.hasGroundReference).toBe(true)
    expect(result.hasSignalOnBothSides).toBe(false)
  })

  test("detects missing opposite-side reference", () => {
    const button = makeButton()
    const wires: Record<string, Wire> = {
      s: signalWire("s", 2, 10, 3),
    }

    const result = analyzeButtonWiring(button, wires)
    expect(result.inputPin).toBe(2)
    expect(result.hasGroundReference).toBe(false)
    expect(result.hasPowerReference).toBe(false)
  })

  test("rejects both-side signal topology", () => {
    const button = makeButton()
    const wires: Record<string, Wire> = {
      s1: signalWire("s1", 2, 10, 3),
      s2: signalWire("s2", 4, 11, 6),
    }

    const result = analyzeButtonWiring(button, wires)
    expect(result.inputPin).toBeNull()
    expect(result.hasSignalOnBothSides).toBe(true)
  })
})

describe("findArduinoPinForComponentPin", () => {
  test("resolves DHT data from the canonical data row, not VCC", () => {
    const dht = makeComponent("dht_sensor", { vcc: null, data: null, gnd: null })
    const wires: Record<string, Wire> = {
      vcc: signalWire("vcc", 5, 10, 3),
      data: signalWire("data", 2, 11, 3),
    }

    expect(findArduinoPinsForComponent(dht, wires).sort((a, b) => a - b)).toEqual([2, 5])
    expect(findArduinoPinForComponentPin(dht, "data", wires)).toBe(2)
  })

  test("resolves ultrasonic trigger and echo from their named rows", () => {
    const sonic = makeComponent("ultrasonic_sensor", {
      vcc: null,
      trigger: null,
      echo: null,
      gnd: null,
    })
    const wires: Record<string, Wire> = {
      trigger: signalWire("trigger", 7, 11, 3),
      echo: signalWire("echo", 8, 12, 3),
    }

    expect(findArduinoPinForComponentPin(sonic, "trigger", wires)).toBe(7)
    expect(findArduinoPinForComponentPin(sonic, "echo", wires)).toBe(8)
  })

  test("uses explicit alias pins before tracing wires", () => {
    const ir = makeComponent("ir_receiver", { out: 4, gnd: null, vcc: null })
    const wires: Record<string, Wire> = {
      out: signalWire("out", 9, 10, 3),
    }

    expect(findArduinoPinForComponentPin(ir, ["signal", "out"], wires)).toBe(4)
  })

  test("resolves RGB LED channels from the canonical red/green/blue rows", () => {
    const rgb = makeComponent("rgb_led", {
      red: null,
      green: null,
      blue: null,
      common: null,
    })
    const wires: Record<string, Wire> = {
      red: signalWire("red", 9, 10, 3),
      green: signalWire("green", 10, 11, 3),
      blue: signalWire("blue", 11, 12, 3),
    }

    expect(findArduinoPinForComponentPin(rgb, "red", wires)).toBe(9)
    expect(findArduinoPinForComponentPin(rgb, "green", wires)).toBe(10)
    expect(findArduinoPinForComponentPin(rgb, "blue", wires)).toBe(11)
  })

  test("resolves relay signal from its wired row when pins.signal is null", () => {
    // Regression: saved/wired boards keep pins.signal null and derive the
    // connection from wires. The renderer must trace the wire to know which
    // Arduino pin energizes the coil — otherwise the relay never animates.
    const relay = makeComponent("relay", { signal: null })
    const wires: Record<string, Wire> = {
      // signal row is y+1 = 11, col = x = 3 (see resolveComponentPins("relay"))
      sig: signalWire("sig", 7, 11, 3),
    }

    expect(findArduinoPinForComponentPin(relay, ["signal", "out"], wires)).toBe(7)
  })

  test("resolves relay signal from the inspector's explicit `out` alias", () => {
    // The generic inspector writes the relay's pin to `out` (registry default),
    // so the renderer must accept that alias too.
    const relay = makeComponent("relay", { out: 5 })

    expect(findArduinoPinForComponentPin(relay, ["signal", "out"], {})).toBe(5)
  })

  test("resolves DC motor signal from its wired row when pins.signal is null", () => {
    const motor = makeComponent("dc_motor", { signal: null })
    const wires: Record<string, Wire> = {
      // signal row is y+1 = 11, col = x = 3 (see resolveComponentPins("dc_motor"))
      sig: signalWire("sig", 9, 11, 3),
    }

    expect(findArduinoPinForComponentPin(motor, ["signal", "out"], wires)).toBe(9)
  })

  test("resolves RGB LED channels when Arduino wires pass through center-gap resistors", () => {
    // RGB LED on the right side (col 7) — matches the ex-rgb-led.json example board.
    // Arduino signal wires land on the LEFT side (col 3) and each series resistor
    // bridges col 3 → col 6, putting the signal on the same right-side bus as the LED.
    const rgb: import("@dreamer/schemas").BoardComponent = {
      id: "rgb-led-1",
      type: "rgb_led",
      name: "RGB LED",
      x: 7,
      y: 5,
      rotation: 0,
      pins: { red: null, green: null, blue: null, common: null },
      properties: {},
    }
    const wires: Record<string, Wire> = {
      red: signalWire("red", 9, 5, 3),
      green: signalWire("green", 10, 6, 3),
      blue: signalWire("blue", 11, 7, 3),
    }

    expect(findArduinoPinForComponentPin(rgb, "red", wires)).toBe(9)
    expect(findArduinoPinForComponentPin(rgb, "green", wires)).toBe(10)
    expect(findArduinoPinForComponentPin(rgb, "blue", wires)).toBe(11)
  })
})
