// ── Path Analyzer ───────────────────────────────────────────────────────
//
// Extracts the full execution trace from a run's messages array.
// Detects retries, hallucinations, delegation, and propose_circuit usage.

import type { RunFile, PathAnalysis, TraceStep } from "../types"

const STEP_LIMIT = 10

export function analyzePath(run: RunFile): PathAnalysis {
  const trace: TraceStep[] = []
  const hallucinations: string[] = []
  const delegations: string[] = []
  let retryCount = 0
  let usedProposeCircuit = false
  let stepNum = 0

  // Track tool calls for retry detection
  const recentErrors = new Map<string, string>() // toolName → last error

  for (const msg of run.messages) {
    if (msg.role === "assistant" && Array.isArray(msg.content)) {
      for (const part of msg.content as Array<Record<string, unknown>>) {
        if (part.type === "tool-call") {
          stepNum++
          const toolName = (part.toolName ?? part.name ?? "unknown") as string
          const input = (part.args ?? part.input ?? {}) as Record<string, unknown>
          const callId = (part.toolCallId ?? "") as string

          trace.push({
            step: stepNum,
            type: "tool_call",
            toolName,
            toolCallId: callId,
            toolInput: input,
          })

          if (toolName === "propose_circuit") usedProposeCircuit = true
          if (toolName === "delegate_to_graph_agent") delegations.push("graph")
          if (toolName === "delegate_to_circuit_agent") delegations.push("circuit")

          // Check for retry: same tool called after it errored
          if (recentErrors.has(toolName)) {
            retryCount++
            recentErrors.delete(toolName)
          }
        } else if (part.type === "text" && typeof part.text === "string" && part.text.trim()) {
          stepNum++
          trace.push({
            step: stepNum,
            type: "text",
            text: part.text as string,
          })
        }
      }
    } else if (msg.role === "tool" && Array.isArray(msg.content)) {
      for (const part of msg.content as Array<Record<string, unknown>>) {
        if (part.type === "tool-result") {
          stepNum++
          const toolName = (part.toolName ?? "") as string
          const callId = (part.toolCallId ?? "") as string
          const output = part.output as Record<string, unknown> | undefined
          const result = output?.type === "json" ? output.value : output

          // Detect errors
          const hasError = result && typeof result === "object" && "error" in (result as Record<string, unknown>)
          const errorMsg = hasError ? String((result as Record<string, unknown>).error) : undefined

          if (hasError && errorMsg) {
            recentErrors.set(toolName, errorMsg)

            // Detect hallucinated IDs
            if (errorMsg.includes("not found")) {
              hallucinations.push(`${toolName}: ${errorMsg}`)
            }
          }

          trace.push({
            step: stepNum,
            type: "tool_result",
            toolName,
            toolCallId: callId,
            toolResult: result,
            succeeded: !hasError,
            error: errorMsg,
          })
        }
      }
    }
  }

  // Detect hallucinations from tool inputs — agent used IDs that look fabricated
  for (const step of trace) {
    if (step.type === "tool_call" && step.toolInput && typeof step.toolInput === "object") {
      const input = step.toolInput as Record<string, unknown>
      if (typeof input.componentId === "string") {
        const id = input.componentId
        // Fabricated IDs: too short, contains readable words, not a UUID pattern
        if (id.length < 10 && !id.includes("-")) {
          hallucinations.push(`${step.toolName}: used fabricated component ID "${id}"`)
        }
      }
    }
  }

  return {
    stepCount: trace.filter(s => s.type === "tool_call").length,
    stepLimit: STEP_LIMIT,
    retryCount,
    hallucinations,
    usedProposeCircuit,
    delegations,
    trace,
  }
}
