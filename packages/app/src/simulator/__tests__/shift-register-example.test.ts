import { describe, test, expect } from "bun:test"
import { MAX_ARDUINO_PIN, type BoardState, type PinState } from "@dreamer/schemas"
import { analyzeCircuit } from "../circuit-solver"
import exampleBoard from "../../examples/boards/ex-shift-register.json"
import learnBoard from "../../learn/boards/20-shift-register.json"

// All pins high-impedance/UNSET: the shift register's outputs are driven by the
// `shiftRegisterOutputs` map, and VCC/GND come from power wires — none of which
// depend on Arduino pin state.
function unsetPins(): PinState[] {
  return Array.from({ length: MAX_ARDUINO_PIN + 1 }, (_, pin) => ({
    pin,
    mode: "UNSET" as const,
    digitalValue: 0 as const,
    analogValue: 0,
    pwmValue: 0,
    isPwm: false,
    pwmFrequency: 490,
    interruptMode: "NONE" as const,
  }))
}

function outputsFor(byte: number): boolean[] {
  return Array.from({ length: 8 }, (_, i) => ((byte >> i) & 1) === 1)
}

function analyzeForByte(board: BoardState, byte: number) {
  return analyzeCircuit(
    board.components,
    board.wires,
    unsetPins(),
    new Map([["sr-1", outputsFor(byte)]]),
  )
}

describe("ex-shift-register example — Q0..Q7 drive their LEDs", () => {
  const board = exampleBoard as unknown as BoardState

  test("board has 8 LEDs wired to the 595", () => {
    const ledIds = Object.keys(board.components).filter((id) => id.startsWith("led-"))
    expect(ledIds).toHaveLength(8)
  })

  test("each chaser byte 1<<i lights exactly led-i", () => {
    for (let i = 0; i < 8; i++) {
      const res = analyzeForByte(board, 1 << i)
      for (let j = 0; j < 8; j++) {
        const state = res.componentStates.get(`led-${j}`)
        expect(state?.isActive ?? false).toBe(i === j)
        if (i === j) {
          expect(state?.brightness ?? 0).toBeGreaterThan(0.05)
        }
      }
    }
  })

  test("all-low byte leaves every LED dark", () => {
    const res = analyzeForByte(board, 0)
    for (let j = 0; j < 8; j++) {
      expect(res.componentStates.get(`led-${j}`)?.isActive ?? false).toBe(false)
    }
  })

  test("all-high byte lights every LED", () => {
    const res = analyzeForByte(board, 0xff)
    for (let j = 0; j < 8; j++) {
      expect(res.componentStates.get(`led-${j}`)?.isActive ?? false).toBe(true)
    }
  })

  test("learn board (20-shift-register) matches the example board", () => {
    expect(learnBoard).toEqual(exampleBoard)
  })
})
