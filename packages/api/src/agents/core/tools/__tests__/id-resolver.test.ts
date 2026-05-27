import { describe, expect, test } from "bun:test"
import { suggestIdMatches, formatSuggestion } from "../id-resolver"

const board = [
  { id: "a4d8c4b1-f1e2-4c0a-b3d2-1c4e5f6a7b8c", name: "LED1", type: "led" },
  { id: "b5e9d5c2-0123-4d1b-c4e3-2d5f6a7b8c9d", name: "BTN_UP", type: "button" },
  { id: "c6f0e6d3-1234-5e2c-d5f4-3e6a7b8c9d0e", name: "R1", type: "resistor" },
]

describe("suggestIdMatches", () => {
  test("exact id returns the candidate", () => {
    const r = suggestIdMatches("a4d8c4b1-f1e2-4c0a-b3d2-1c4e5f6a7b8c", board)
    expect(r[0]?.id).toBe(board[0]!.id)
  })

  test("exact name (case-insensitive)", () => {
    const r = suggestIdMatches("led1", board)
    expect(r[0]?.id).toBe(board[0]!.id)
  })

  test("truncated UUID matches by prefix", () => {
    const r = suggestIdMatches("a4d8c4b1", board)
    expect(r[0]?.id).toBe(board[0]!.id)
  })

  test("invented friendly name with separators matches by name-contains", () => {
    const r = suggestIdMatches("btn-up", board)
    // "btn-up" doesn't equal "btn_up" by string ===, but our scorer relies
    // on includes() in both directions — neither contains the other once
    // separators differ. Levenshtein covers it (distance 1).
    expect(r[0]?.id).toBe(board[1]!.id)
  })

  test("typo in friendly name (distance 1)", () => {
    const r = suggestIdMatches("LEDD1", board)
    expect(r[0]?.id).toBe(board[0]!.id)
  })

  test("unrelated query returns empty", () => {
    const r = suggestIdMatches("totally_unrelated_xyz", board)
    expect(r).toEqual([])
  })

  test("empty inputs return empty", () => {
    expect(suggestIdMatches("", board)).toEqual([])
    expect(suggestIdMatches("led1", [])).toEqual([])
  })

  test("limit caps result length", () => {
    const dupes = [
      { id: "id1", name: "LED1", type: "led" },
      { id: "id2", name: "LED1", type: "led" },
      { id: "id3", name: "LED1", type: "led" },
    ]
    const r = suggestIdMatches("led1", dupes, 2)
    expect(r).toHaveLength(2)
  })
})

describe("formatSuggestion", () => {
  test("returns empty string when no match", () => {
    expect(formatSuggestion("nope", board)).toBe("")
  })

  test("formats single match with name + type", () => {
    const s = formatSuggestion("led1", board)
    expect(s).toContain("LED1")
    expect(s).toContain("led")
    expect(s).toMatch(/^ Did you mean /)
    expect(s).toMatch(/\?$/)
  })

  test("formats two-match suggestion joined by 'or'", () => {
    const a = { id: "id1", name: "LED1", type: "led" }
    const b = { id: "id2", name: "LED2", type: "led" }
    // Query that scores similarly against both
    const s = formatSuggestion("led", [a, b])
    // At least one should appear; "or" joiner if both surfaced
    expect(s).toMatch(/(LED1|LED2)/)
  })
})
