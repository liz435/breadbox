// ── Token Analyzer ──────────────────────────────────────────────────────
//
// Calculates token cost, detects wasted tokens from unnecessary calls.

import type { RunFile, TokenAnalysis } from "../types"

// Pricing per 1M tokens (as of 2026)
const PRICING: Record<string, { input: number; output: number }> = {
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-haiku-4-5-20251001": { input: 0.8, output: 4 },
  "template": { input: 0, output: 0 },
}

export function analyzeTokens(run: RunFile): TokenAnalysis {
  const usage = run.tokenUsage ?? { inputTokens: 0, outputTokens: 0, totalTokens: 0, model: "unknown" }
  const model = usage.model
  const pricing = PRICING[model] ?? { input: 1, output: 5 }

  const inputCost = (usage.inputTokens / 1_000_000) * pricing.input
  const outputCost = (usage.outputTokens / 1_000_000) * pricing.output
  const estimatedCost = inputCost + outputCost

  // Detect wasted tokens
  let wastedTokens = 0
  const wasteDetails: string[] = []

  // Check for unnecessary get_board_state calls (board state is in system prompt)
  let getBoardStateCalls = 0
  for (const msg of run.messages) {
    if (msg.role === "assistant" && Array.isArray(msg.content)) {
      for (const part of msg.content as Array<Record<string, unknown>>) {
        if (part.type === "tool-call" && part.toolName === "get_board_state") {
          getBoardStateCalls++
        }
      }
    }
  }
  if (getBoardStateCalls > 0) {
    // Each get_board_state response can be ~500-2000 tokens
    const waste = getBoardStateCalls * 1000
    wastedTokens += waste
    wasteDetails.push(`${getBoardStateCalls} get_board_state call(s) — board state was already in system prompt (~${waste} tokens)`)
  }

  // Check for retried tool calls (same work done twice)
  const toolCalls: string[] = []
  for (const msg of run.messages) {
    if (msg.role === "assistant" && Array.isArray(msg.content)) {
      for (const part of msg.content as Array<Record<string, unknown>>) {
        if (part.type === "tool-call") {
          toolCalls.push((part.toolName ?? "") as string)
        }
      }
    }
  }

  // Detect consecutive same-tool calls (likely retries)
  for (let i = 1; i < toolCalls.length; i++) {
    if (toolCalls[i] === toolCalls[i - 1]) {
      wastedTokens += 200 // estimated overhead per retry
      wasteDetails.push(`Retry: ${toolCalls[i]} called consecutively`)
    }
  }

  // Check if the run produced 0 ops (wasted entire run)
  if (run.proposedOps.length === 0 && usage.totalTokens > 100) {
    wasteDetails.push(`Run produced 0 ops but consumed ${usage.totalTokens} tokens`)
    wastedTokens += Math.floor(usage.totalTokens * 0.5) // half is waste
  }

  return {
    model,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    totalTokens: usage.totalTokens,
    estimatedCost: Math.round(estimatedCost * 10000) / 10000,
    wastedTokens,
    wasteDetails,
  }
}
