// ── Wire endpoints keep out of part bodies ──────────────────────────────────
//
// Stored wires terminate on the exact pin hole of the part they feed; in 3D
// that puts the jumper pin inside the part's body. The remap must slide such
// endpoints along the SAME electrical strip (same terminal half-row / same
// rail column — the net never changes) to a hole clear of the body, and must
// leave already-clear wires untouched.

import { describe, expect, test } from "bun:test"
import type { BoardComponent, Wire } from "@dreamer/schemas"
import { remapWireEndpoints } from "../wire-endpoint-clearance"
import { powerSupplyPinRows } from "@/components/catalog/power-supply/pin-rows"

function comp(partial: Partial<BoardComponent> & { id: string; type: string }): BoardComponent {
  return {
    name: partial.id,
    x: 0,
    y: 0,
    rotation: 0,
    pins: {},
    properties: {},
    ...partial,
  } as BoardComponent
}

function wire(partial: Partial<Wire> & { id: string }): Wire {
  return { color: "#22c55e", fromRow: 0, fromCol: 0, toRow: 0, toCol: 0, ...partial } as Wire
}

const buzzer = comp({ id: "buzzer-1", type: "buzzer", x: 7, y: 5 })

describe("remapWireEndpoints", () => {
  test("an endpoint in the part's own pin hole moves along the same strip half", () => {
    // Buzzer pins sit at col 7 (rows 5/6); a wire plugged straight into (5,7)
    // must move to another col of the 5–9 half in the SAME row — same net.
    const wires = { w1: wire({ id: "w1", fromRow: -999, fromCol: 3, toRow: 5, toCol: 7 }) }
    const out = remapWireEndpoints(wires, { "buzzer-1": buzzer })
    expect(out.w1.toRow).toBe(5)
    expect(out.w1.toCol).not.toBe(7)
    expect(out.w1.toCol).toBeGreaterThanOrEqual(5)
    expect(out.w1.toCol).toBeLessThanOrEqual(9)
  })

  test("the displaced hole clears the buzzer's real body, not just its pins", () => {
    // The buzzer can is ~13mm across (≈±2 holes around col 7). Col 8 would be
    // free of pins but still inside the can — the remap must go further out.
    const wires = { w1: wire({ id: "w1", fromRow: -999, fromCol: 3, toRow: 5, toCol: 7 }) }
    const out = remapWireEndpoints(wires, { "buzzer-1": buzzer })
    expect(Math.abs(out.w1.toCol - 7)).toBeGreaterThanOrEqual(2)
  })

  test("a wire far from every part is returned untouched (same reference)", () => {
    const wires = { w1: wire({ id: "w1", fromRow: 20, fromCol: 0, toRow: 25, toCol: 9 }) }
    const out = remapWireEndpoints(wires, { "buzzer-1": buzzer })
    expect(out).toBe(wires)
  })

  test("two wires displaced from the same strip never pick the same hole", () => {
    const wires = {
      a: wire({ id: "a", fromRow: -999, fromCol: 3, toRow: 5, toCol: 7 }),
      b: wire({ id: "b", fromRow: -999, fromCol: 4, toRow: 5, toCol: 7 }),
    }
    const out = remapWireEndpoints(wires, { "buzzer-1": buzzer })
    expect(out.a.toCol).not.toBe(out.b.toCol)
  })

  test("arduino-pin endpoints (row −999) are never remapped", () => {
    const wires = { w1: wire({ id: "w1", fromRow: -999, fromCol: 3, toRow: 5, toCol: 7 }) }
    const out = remapWireEndpoints(wires, { "buzzer-1": buzzer })
    expect(out.w1.fromRow).toBe(-999)
    expect(out.w1.fromCol).toBe(3)
  })

  test("a board-wide module only blocks its own pin holes, not half the board", () => {
    // The MB102 spans all four rails; a disc around its pin centroid would
    // cover the whole board end. Terminal wires near it must stay put.
    const psu = comp({ id: "psu-1", type: "power_supply", x: 0, y: 11 })
    const wires = { w1: wire({ id: "w1", fromRow: -999, fromCol: 3, toRow: 12, toCol: 3 }) }
    const out = remapWireEndpoints(wires, { "psu-1": psu })
    expect(out).toBe(wires)
  })

  test("a rail endpoint sharing the PSU's pad hole slides along the rail", () => {
    const psu = comp({ id: "psu-1", type: "power_supply", x: 0, y: 11 })
    // PSU pads land on rail block rows (pin rows snap near the drop row); plug
    // a wire into the exact + pad hole on col 11 and it must move rows.
    const [padRow] = powerSupplyPinRows(psu.y)
    const wires = { w1: wire({ id: "w1", fromRow: -999, fromCol: 3, toRow: padRow, toCol: 11 }) }
    const out = remapWireEndpoints(wires, { "psu-1": psu })
    expect(out.w1.toCol).toBe(11)
    expect(out.w1.toRow).not.toBe(padRow)
  })
})
