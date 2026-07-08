import { describe, expect, test } from "bun:test"
import { boardComponentSchema, type BoardComponent } from "@dreamer/schemas"
import { MM_PER_PX } from "../layout"
import {
  offsetToWorld,
  partBoardOffset,
  surfaceBoardsOf,
  wireEndpointOffset,
} from "../board-offsets"

function board(id: string, worldX: number, worldY: number): BoardComponent {
  return boardComponentSchema.parse({
    id,
    type: "breadboard_full",
    name: id,
    x: 0,
    y: 0,
    pins: {},
    properties: {},
    parentId: null,
    worldX,
    worldY,
  })
}

function part(id: string, parentId: string | null): BoardComponent {
  return boardComponentSchema.parse({
    id,
    type: "led",
    name: id,
    x: 3,
    y: 4,
    pins: {},
    properties: {},
    parentId,
  })
}

const bbA = board("breadboard-1", 0, 0)
const bbB = board("breadboard-2", 200, -50)

describe("surfaceBoardsOf", () => {
  test("keeps breadboards/perfboards, drops parts", () => {
    const map = { [bbA.id]: bbA, [bbB.id]: bbB, led: part("led", bbB.id) }
    expect(surfaceBoardsOf(map).map((b) => b.id).sort()).toEqual([bbA.id, bbB.id])
  })
})

describe("partBoardOffset", () => {
  test("explicit parentId → that board's world offset", () => {
    expect(partBoardOffset(part("led", bbB.id), [bbA, bbB])).toEqual({ dx: 200, dy: -50 })
  })

  test("no parentId + exactly one board → the sole board (legacy fallback)", () => {
    expect(partBoardOffset(part("led", null), [bbB])).toEqual({ dx: 200, dy: -50 })
  })

  test("no parentId + multiple boards → zero (ambiguous)", () => {
    expect(partBoardOffset(part("led", null), [bbA, bbB])).toEqual({ dx: 0, dy: 0 })
  })

  test("parentId pointing at a missing board → zero", () => {
    expect(partBoardOffset(part("led", "ghost"), [bbA, bbB])).toEqual({ dx: 0, dy: 0 })
  })
})

describe("wireEndpointOffset", () => {
  test("explicit boardId → that board's world offset", () => {
    expect(wireEndpointOffset(bbB.id, [bbA, bbB])).toEqual({ dx: 200, dy: -50 })
  })

  test("no boardId + exactly one board → the sole board (legacy fallback)", () => {
    expect(wireEndpointOffset(undefined, [bbB])).toEqual({ dx: 200, dy: -50 })
  })

  test("no boardId + multiple boards → zero (ambiguous)", () => {
    expect(wireEndpointOffset(undefined, [bbA, bbB])).toEqual({ dx: 0, dy: 0 })
  })

  test("boardId not among surface boards (e.g. arduino) → zero", () => {
    expect(wireEndpointOffset("arduino-1", [bbA, bbB])).toEqual({ dx: 0, dy: 0 })
  })

  test("no surface boards → zero", () => {
    expect(wireEndpointOffset(bbB.id, [])).toEqual({ dx: 0, dy: 0 })
  })
})

describe("offsetToWorld", () => {
  test("scales pixel offset to world mm", () => {
    expect(offsetToWorld({ dx: 200, dy: -50 })).toEqual({
      x: 200 * MM_PER_PX,
      z: -50 * MM_PER_PX,
    })
  })
})
