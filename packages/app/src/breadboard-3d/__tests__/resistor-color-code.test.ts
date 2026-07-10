import { describe, expect, test } from "bun:test"
import { RESISTOR_BAND_CODE, resistorBands } from "../resistor-color-code"

const [BLACK, BROWN, RED, , YELLOW, GREEN, , VIOLET, , WHITE] = RESISTOR_BAND_CODE

describe("resistorBands", () => {
  test("220Ω → red, red, brown", () => {
    expect(resistorBands(220)).toEqual([RED, RED, BROWN])
  })

  test("4.7kΩ → yellow, violet, red", () => {
    expect(resistorBands(4700)).toEqual([YELLOW, VIOLET, RED])
  })

  test("1kΩ → brown, black, red", () => {
    expect(resistorBands(1000)).toEqual([BROWN, BLACK, RED])
  })

  test("1MΩ → brown, black, green", () => {
    expect(resistorBands(1_000_000)).toEqual([BROWN, BLACK, GREEN])
  })

  test("10Ω → brown, black, black (multiplier 10⁰)", () => {
    expect(resistorBands(10)).toEqual([BROWN, BLACK, BLACK])
  })

  test("rounds to the nearest ohm before decoding", () => {
    expect(resistorBands(219.6)).toEqual([RED, RED, BROWN]) // 220
  })

  test("floors sub-1Ω values to 1Ω rather than crashing", () => {
    expect(resistorBands(0)).toEqual([BROWN, BLACK, BLACK]) // 1 → 1,0,×1
  })

  test("clamps an out-of-range multiplier to white (9)", () => {
    expect(resistorBands(1e11)[2]).toBe(WHITE) // 12 digits → mult 10 → clamp 9
  })
})
