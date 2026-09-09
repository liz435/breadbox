import { describe, expect, test } from "bun:test"
import { findAutoLayoutRow } from "./auto-layout"

describe("agent auto-layout physical clearance", () => {
  test("keeps the 2D servo body clear of a power supply", () => {
    const row = findAutoLayoutRow("servo", 21, [
      { type: "power_supply", row: 6, col: 8 },
    ])

    // This is the layout from the reported proposal. Row 21 is clear in the
    // calibrated GLB frame, but the 2D SG90 body and moving horn extend above
    // its cable-pin anchor and overlap the PSU through row 19.
    expect(row).toBe(27)
  })

  test("does not place a servo above an MB102 body that its calibrated GLB reaches", () => {
    const row = findAutoLayoutRow("servo", 0, [
      { type: "power_supply", row: 9, col: 8 },
    ])

    // The servo's rendered GLB body is offset down-board from its three logical
    // cable holes. Starting at row 0 would still put that body through the PSU.
    expect(row).toBeGreaterThanOrEqual(10)
  })
})
