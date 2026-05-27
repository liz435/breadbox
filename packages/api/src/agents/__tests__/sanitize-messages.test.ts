// ── Sanitizer unit tests ────────────────────────────────────────────────
//
// Pure — no Supabase needed. Locks the contract that bad tool-call
// `input` shapes get dropped, orphaned tool-results get dropped with
// them, and stringly content passes through untouched.

import { describe, expect, test } from "bun:test"
import type { ModelMessage } from "ai"
import {
  EMPTY_REPORT,
  isReportEmpty,
  mergeReports,
  sanitizeModelMessages,
} from "../sanitize-messages"

// ── Fixture helpers ────────────────────────────────────────────────────

function assistantWithToolCall(
  toolCallId: string,
  toolName: string,
  input: unknown,
): ModelMessage {
  return {
    role: "assistant",
    content: [
      { type: "tool-call", toolCallId, toolName, input },
    ],
  } as unknown as ModelMessage
}

function toolResultMsg(
  toolCallId: string,
  output: unknown,
): ModelMessage {
  return {
    role: "tool",
    content: [
      { type: "tool-result", toolCallId, output },
    ],
  } as unknown as ModelMessage
}

// ── Tests ──────────────────────────────────────────────────────────────

describe("sanitizeModelMessages", () => {
  test("legit stringly content passes through unchanged with empty report", () => {
    const input: ModelMessage[] = [
      { role: "user", content: "hello" },
      { role: "assistant", content: "hi back" },
    ]
    const { sanitized, report } = sanitizeModelMessages(input)
    expect(sanitized).toBe(input) // fast path: same reference
    expect(isReportEmpty(report)).toBe(true)
  })

  test("null input → block dropped, message remains if other valid blocks exist", () => {
    const msg: ModelMessage = {
      role: "assistant",
      content: [
        { type: "text", text: "thinking…" },
        { type: "tool-call", toolCallId: "tc-1", toolName: "propose_circuit", input: null },
      ],
    } as unknown as ModelMessage
    const { sanitized, report } = sanitizeModelMessages([msg])
    expect(sanitized).toHaveLength(1)
    const content = (sanitized[0] as { content: unknown[] }).content
    expect(content).toHaveLength(1)
    expect((content[0] as { type: string }).type).toBe("text")
    expect(report.toolCalls).toBe(1)
    expect(report.toolNames).toEqual(["propose_circuit"])
  })

  test("array input → dropped", () => {
    const input: ModelMessage[] = [
      assistantWithToolCall("tc-1", "fix_wiring", []),
    ]
    const { sanitized, report } = sanitizeModelMessages(input)
    // The whole message had only the bad block → message dropped.
    expect(sanitized).toHaveLength(0)
    expect(report.toolCalls).toBe(1)
    expect(report.messages).toBe(1)
  })

  test("string input → dropped", () => {
    const input: ModelMessage[] = [
      assistantWithToolCall("tc-1", "fix_wiring", "foo"),
    ]
    const { report } = sanitizeModelMessages(input)
    expect(report.toolCalls).toBe(1)
  })

  test("empty object input is VALID — passes through", () => {
    const input: ModelMessage[] = [
      assistantWithToolCall("tc-1", "get_board_overview", {}),
    ]
    const { sanitized, report } = sanitizeModelMessages(input)
    expect(sanitized).toHaveLength(1)
    expect(isReportEmpty(report)).toBe(true)
  })

  test("orphaned tool-result → dropped with its tool-call", () => {
    const input: ModelMessage[] = [
      assistantWithToolCall("tc-1", "propose_circuit", null),
      toolResultMsg("tc-1", { ok: true }),
    ]
    const { sanitized, report } = sanitizeModelMessages(input)
    expect(sanitized).toHaveLength(0) // both messages dropped (one orphaned, one bad-block-only)
    expect(report.toolCalls).toBe(1)
    expect(report.toolResults).toBe(1)
    expect(report.messages).toBe(2)
  })

  test("valid + bad mix → only bad dropped, toolNames lists the bad one", () => {
    const input: ModelMessage[] = [
      {
        role: "assistant",
        content: [
          { type: "tool-call", toolCallId: "tc-1", toolName: "propose_circuit", input: { sketch: "…" } },
          { type: "tool-call", toolCallId: "tc-2", toolName: "fix_wiring", input: null },
        ],
      } as unknown as ModelMessage,
    ]
    const { sanitized, report } = sanitizeModelMessages(input)
    expect(sanitized).toHaveLength(1)
    const content = (sanitized[0] as { content: unknown[] }).content
    expect(content).toHaveLength(1)
    expect((content[0] as { toolName: string }).toolName).toBe("propose_circuit")
    expect(report.toolCalls).toBe(1)
    expect(report.toolNames).toEqual(["fix_wiring"])
  })

  test("all blocks bad → whole message dropped", () => {
    const input: ModelMessage[] = [
      {
        role: "assistant",
        content: [
          { type: "tool-call", toolCallId: "tc-1", toolName: "a", input: null },
          { type: "tool-call", toolCallId: "tc-2", toolName: "b", input: "str" },
        ],
      } as unknown as ModelMessage,
    ]
    const { sanitized, report } = sanitizeModelMessages(input)
    expect(sanitized).toHaveLength(0)
    expect(report.toolCalls).toBe(2)
    expect(report.messages).toBe(1)
    expect(report.toolNames.sort()).toEqual(["a", "b"])
  })

  test("toolNames deduplicate across multiple messages", () => {
    const input: ModelMessage[] = [
      assistantWithToolCall("tc-1", "propose_circuit", null),
      assistantWithToolCall("tc-2", "propose_circuit", []),
    ]
    const { report } = sanitizeModelMessages(input)
    expect(report.toolCalls).toBe(2)
    expect(report.toolNames).toEqual(["propose_circuit"])
  })

  test("system messages and user stringly content untouched", () => {
    const input: ModelMessage[] = [
      { role: "system", content: "be helpful" },
      { role: "user", content: "ok" },
      assistantWithToolCall("tc-1", "fix_wiring", null), // triggers sanitization path
    ]
    const { sanitized, report } = sanitizeModelMessages(input)
    expect(sanitized).toHaveLength(2)
    expect((sanitized[0] as { role: string }).role).toBe("system")
    expect((sanitized[1] as { role: string }).role).toBe("user")
    expect(report.toolCalls).toBe(1)
  })

  test("tool-result with no toolCallId is not orphan-dropped", () => {
    const input: ModelMessage[] = [
      assistantWithToolCall("tc-1", "propose_circuit", null),
      {
        role: "tool",
        content: [
          { type: "tool-result", output: { ok: true } }, // no toolCallId
        ],
      } as unknown as ModelMessage,
    ]
    const { sanitized, report } = sanitizeModelMessages(input)
    // The orphan-less tool-result message survives (no id to match against).
    expect(sanitized).toHaveLength(1)
    expect((sanitized[0] as { role: string }).role).toBe("tool")
    expect(report.toolResults).toBe(0)
  })
})

describe("mergeReports", () => {
  test("sums counts and unions tool names", () => {
    const merged = mergeReports(
      { toolCalls: 1, toolResults: 0, messages: 1, toolNames: ["a"] },
      { toolCalls: 2, toolResults: 1, messages: 0, toolNames: ["b", "a"] },
    )
    expect(merged.toolCalls).toBe(3)
    expect(merged.toolResults).toBe(1)
    expect(merged.messages).toBe(1)
    expect(merged.toolNames).toEqual(["a", "b"])
  })

  test("EMPTY_REPORT is the identity", () => {
    const r = { toolCalls: 5, toolResults: 2, messages: 1, toolNames: ["x"] }
    expect(mergeReports(r, EMPTY_REPORT)).toEqual(r)
    expect(mergeReports(EMPTY_REPORT, r)).toEqual(r)
  })
})
