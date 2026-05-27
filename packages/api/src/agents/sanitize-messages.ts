// ── Sanitize malformed tool-call blocks ─────────────────────────────────
//
// The Anthropic Messages API rejects requests where a `tool_use` block's
// `input` field is anything other than a JSON object — null, array,
// string, undefined all fail with:
//
//   AI_APICallError: messages.N.content.M.tool_use.input:
//                    Input should be an object
//
// The Vercel AI SDK's tool-loop replays the entire prior conversation on
// each step. If the model emits a `tool-call` with a malformed `input`
// at step K, the assistant message persists in the loop state and gets
// re-sent on step K+1 → request fails → user sees 500.
//
// This sanitizer is run in three places (defense in depth):
//   1. `prepareStep` in agents/core/agent.ts — drops bad blocks before
//      each Anthropic call so the loop can self-heal mid-stream.
//   2. `buildModelMessagesFromRuns` in db/messages.ts — defensive layer
//      for cross-run replay. No-op today (stringly content only) but
//      future-proofs against any change that replays raw tool blocks.
//   3. Route layer before `completeRun` persistence — closes the loop so
//      bad blocks don't land in DB and re-replay next request.
//
// Scope: only `tool-call.input` is validated. Other fields (toolName,
// toolCallId, type) are trusted — no observed failure mode there. Add
// more checks only when a new failure shape surfaces.

import type { ModelMessage } from "ai"

export type SanitizationReport = {
  /** Bad tool-call blocks dropped (input was not a plain object). */
  toolCalls: number
  /** Orphan tool-result blocks dropped (referenced a dropped tool-call). */
  toolResults: number
  /** Whole messages dropped (content array became empty after filtering). */
  messages: number
  /** Deduped names of tools whose calls were sanitized — for UX surface. */
  toolNames: string[]
}

const EMPTY_REPORT: SanitizationReport = {
  toolCalls: 0,
  toolResults: 0,
  messages: 0,
  toolNames: [],
}

/**
 * Empty object `{}` is VALID — Anthropic accepts a tool_use with empty
 * input (the tool's own zod schema is responsible for rejecting if it
 * requires fields). We only reject inputs that fail Anthropic's
 * type-shape check.
 */
function isValidToolCallInput(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  )
}

function isToolCallBlock(part: unknown): part is {
  type: "tool-call"
  toolCallId?: string
  toolName?: string
  input?: unknown
} {
  return (
    typeof part === "object" &&
    part !== null &&
    "type" in part &&
    (part as { type: unknown }).type === "tool-call"
  )
}

function isToolResultBlock(part: unknown): part is {
  type: "tool-result"
  toolCallId?: string
} {
  return (
    typeof part === "object" &&
    part !== null &&
    "type" in part &&
    (part as { type: unknown }).type === "tool-result"
  )
}

/**
 * Drop malformed tool-call blocks and any orphaned tool-result blocks
 * that referenced them. Returns the sanitized message array plus a
 * report of what was dropped. Stringly-content messages (the common
 * case) pass through unchanged with near-zero overhead.
 *
 * Safe to call repeatedly — clean input produces an empty report.
 */
export function sanitizeModelMessages(
  messages: ModelMessage[],
): { sanitized: ModelMessage[]; report: SanitizationReport } {
  // First pass: identify bad tool-call ids and count them.
  const droppedIds = new Set<string>()
  const toolNames = new Set<string>()
  let toolCalls = 0

  for (const msg of messages) {
    const content = (msg as { content?: unknown }).content
    if (!Array.isArray(content)) continue
    for (const part of content) {
      if (!isToolCallBlock(part)) continue
      if (isValidToolCallInput(part.input)) continue
      toolCalls += 1
      if (typeof part.toolName === "string" && part.toolName.length > 0) {
        toolNames.add(part.toolName)
      }
      if (typeof part.toolCallId === "string" && part.toolCallId.length > 0) {
        droppedIds.add(part.toolCallId)
      }
    }
  }

  // Fast path: nothing to do.
  if (toolCalls === 0) {
    return { sanitized: messages, report: EMPTY_REPORT }
  }

  // Second pass: rebuild the array with bad blocks (and orphaned
  // tool-results) filtered out. Drop messages that become empty.
  let toolResults = 0
  let messagesDropped = 0
  const sanitized: ModelMessage[] = []

  for (const msg of messages) {
    const content = (msg as { content?: unknown }).content
    if (!Array.isArray(content)) {
      sanitized.push(msg)
      continue
    }
    const filtered = content.filter((part) => {
      if (isToolCallBlock(part) && !isValidToolCallInput(part.input)) {
        return false
      }
      if (isToolResultBlock(part)) {
        const id = part.toolCallId
        if (typeof id === "string" && droppedIds.has(id)) {
          toolResults += 1
          return false
        }
      }
      return true
    })
    if (filtered.length === 0) {
      messagesDropped += 1
      continue
    }
    sanitized.push({ ...(msg as object), content: filtered } as ModelMessage)
  }

  return {
    sanitized,
    report: {
      toolCalls,
      toolResults,
      messages: messagesDropped,
      toolNames: Array.from(toolNames).sort(),
    },
  }
}

/** Aggregate two reports (sum counts, union tool names). */
export function mergeReports(
  a: SanitizationReport,
  b: SanitizationReport,
): SanitizationReport {
  return {
    toolCalls: a.toolCalls + b.toolCalls,
    toolResults: a.toolResults + b.toolResults,
    messages: a.messages + b.messages,
    toolNames: Array.from(new Set([...a.toolNames, ...b.toolNames])).sort(),
  }
}

export function isReportEmpty(r: SanitizationReport): boolean {
  return r.toolCalls === 0 && r.toolResults === 0 && r.messages === 0
}

export { EMPTY_REPORT }
