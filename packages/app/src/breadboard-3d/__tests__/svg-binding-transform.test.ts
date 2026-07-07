import { describe, expect, test } from "bun:test"
import type { DslBinding } from "@dreamer/schemas"
import { svgBindingTransform } from "../part-models"

const CENTER = { x: 10, y: 20 }

describe("svgBindingTransform", () => {
  test("identity when the binding sets nothing", () => {
    const t = svgBindingTransform({ target: "rotor" }, {}, CENTER)
    expect(t.position).toEqual([0, 0, 0])
    expect(t.rotationZ).toBe(0)
    expect(t.scale).toBe(1)
    expect(t.opacity).toBeUndefined()
  })

  test("pure translate moves by (tx, ty), leaving rotation/scale untouched", () => {
    const binding: DslBinding = { target: "rotor", translateX: 3, translateY: -4 }
    const t = svgBindingTransform(binding, {}, CENTER)
    expect(t.position).toEqual([3, -4, 0])
    expect(t.rotationZ).toBe(0)
    expect(t.scale).toBe(1)
  })

  test("rotation pivots about the element centre — the centre stays fixed", () => {
    // A rotor rotating about its own hub: the origin point maps to itself.
    const binding: DslBinding = { target: "rotor", rotate: 90 }
    const t = svgBindingTransform(binding, {}, CENTER)
    expect(t.rotationZ).toBeCloseTo(Math.PI / 2, 6)
    // Apply the group transform to the pivot: R·c·s + p should equal c.
    const [px, py] = t.position
    const s = t.scale
    const rx = Math.cos(t.rotationZ) * CENTER.x - Math.sin(t.rotationZ) * CENTER.y
    const ry = Math.sin(t.rotationZ) * CENTER.x + Math.cos(t.rotationZ) * CENTER.y
    expect(s * rx + px).toBeCloseTo(CENTER.x, 6)
    expect(s * ry + py).toBeCloseTo(CENTER.y, 6)
  })

  test("scale is applied about the origin, keeping the origin fixed", () => {
    const binding: DslBinding = { target: "rotor", scale: 2 }
    const t = svgBindingTransform(binding, {}, CENTER)
    const [px, py] = t.position
    expect(t.scale * CENTER.x + px).toBeCloseTo(CENTER.x, 6)
    expect(t.scale * CENTER.y + py).toBeCloseTo(CENTER.y, 6)
  })

  test("evaluates expression bindings over the signal context", () => {
    const binding: DslBinding = { target: "rotor", rotate: "angle" }
    const t = svgBindingTransform(binding, { angle: 180 }, CENTER)
    expect(t.rotationZ).toBeCloseTo(Math.PI, 6)
  })

  test("opacity is clamped to 0..1", () => {
    expect(svgBindingTransform({ target: "x", opacity: 1.5 }, {}, CENTER).opacity).toBe(1)
    expect(svgBindingTransform({ target: "x", opacity: -0.5 }, {}, CENTER).opacity).toBe(0)
  })

  test("an explicit origin overrides the element centre", () => {
    const binding: DslBinding = { target: "x", rotate: 90, originX: 0, originY: 0 }
    const t = svgBindingTransform(binding, {}, CENTER)
    // Rotating about (0,0) leaves the group position at the origin.
    expect(t.position[0]).toBeCloseTo(0, 6)
    expect(t.position[1]).toBeCloseTo(0, 6)
  })
})
