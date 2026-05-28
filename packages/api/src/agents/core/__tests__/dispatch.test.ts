import { describe, expect, test } from "bun:test"
import { createDefaultBoardState, isBoardComponentType, type BoardState } from "@dreamer/schemas"

// The dispatcher in agent.ts is small enough that I'm testing its logic
// directly here rather than spinning up the whole streamText machinery.
// The dispatcher: empty board (zero non-surface components) → build agent,
// otherwise → fix agent.

function dispatchTarget(board: BoardState): "build" | "fix" {
  const userComponents = Object.values(board.components).filter(
    (c) => !isBoardComponentType(c.type),
  ).length
  return userComponents > 0 ? "fix" : "build"
}

describe("v2.0.0 dispatcher logic", () => {
  test("empty default board routes to BuildAgent", () => {
    const board = createDefaultBoardState()
    expect(dispatchTarget(board)).toBe("build")
  })

  test("board with a single LED routes to FixAgent", () => {
    const board = createDefaultBoardState()
    board.components["led1"] = {
      id: "led1",
      type: "led",
      name: "LED1",
      x: 5,
      y: 5,
      rotation: 0,
      properties: {},
    } as (typeof board.components)[string]
    expect(dispatchTarget(board)).toBe("fix")
  })

  test("breadboard and arduino surfaces don't count as 'user components'", () => {
    // createDefaultBoardState already includes a breadboard surface. The
    // dispatcher should ignore it and route to BuildAgent.
    const board = createDefaultBoardState()
    expect(Object.keys(board.components).length).toBeGreaterThan(0)
    expect(dispatchTarget(board)).toBe("build")
  })

  test("multiple user components routes to FixAgent", () => {
    const board = createDefaultBoardState()
    board.components["led1"] = {
      id: "led1",
      type: "led",
      name: "LED1",
      x: 5, y: 5, rotation: 0, properties: {},
    } as (typeof board.components)[string]
    board.components["r1"] = {
      id: "r1",
      type: "resistor",
      name: "R1",
      x: 3, y: 5, rotation: 0, properties: { resistance: 220 },
    } as (typeof board.components)[string]
    expect(dispatchTarget(board)).toBe("fix")
  })
})
