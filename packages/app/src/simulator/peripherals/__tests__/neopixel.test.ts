import { describe, expect, test } from "bun:test"
import type { BoardComponent, Wire } from "@dreamer/schemas"
import { NeoPixelPeripheral } from "../neopixel"
import { PeripheralBus } from "../peripheral-bus"
import { PinStateStore } from "../../pin-state-store"

function makeComponent(pins: Record<string, number | null> = { din: 6, vcc: null, gnd: null }): BoardComponent {
  return {
    id: "neo-1",
    type: "neopixel",
    name: "NeoPixel Strip",
    x: 7,
    y: 5,
    rotation: 0,
    pins,
    properties: { numLeds: 2 },
  }
}

function edge(pin: number, value: 0 | 1, simMs: number) {
  return { pin, value, simMs, source: "avr" as const }
}

function writeBit(p: NeoPixelPeripheral, pin: number, bit: 0 | 1, t: number): number {
  p.onPinEdge(edge(pin, 1, t))
  p.onPinEdge(edge(pin, 0, t + (bit ? 0.0007 : 0.00035)))
  return t + 0.00125
}

function writeByte(p: NeoPixelPeripheral, pin: number, value: number, t: number): number {
  let next = t
  for (let bit = 7; bit >= 0; bit--) {
    next = writeBit(p, pin, ((value >> bit) & 1) as 0 | 1, next)
  }
  return next
}

function writePixel(p: NeoPixelPeripheral, pin: number, rgb: { r: number; g: number; b: number }, t: number): number {
  let next = t
  next = writeByte(p, pin, rgb.g, next)
  next = writeByte(p, pin, rgb.r, next)
  next = writeByte(p, pin, rgb.b, next)
  return next
}

describe("NeoPixelPeripheral", () => {
  test("decodes WS2812 GRB bytes into RGB pixels after reset gap", () => {
    const p = new NeoPixelPeripheral(makeComponent())
    let t = 0
    t = writePixel(p, 6, { r: 255, g: 16, b: 4 }, t)
    t = writePixel(p, 6, { r: 0, g: 128, b: 32 }, t)
    p.onTick(t + 0.08)

    const state = p.getState()
    expect(state?.kind).toBe("neopixel")
    expect(state?.pixels[0]).toEqual({ r: 255, g: 16, b: 4 })
    expect(state?.pixels[1]).toEqual({ r: 0, g: 128, b: 32 })
  })

  test("resolves DIN from breadboard wire topology", () => {
    const bus = new PeripheralBus()
    const wires: Record<string, Wire> = {
      din: {
        id: "din",
        fromRow: -999,
        fromCol: 6,
        toRow: 5,
        toCol: 7,
        color: "#22c55e",
      },
    }

    bus.attachBoard({
      components: { "neo-1": makeComponent({ din: null, vcc: null, gnd: null }) },
      wires,
      pinStore: new PinStateStore(),
    })

    expect(bus.findByTypeOnPin("neopixel", 6)?.id).toBe("neo-1")
  })
})
