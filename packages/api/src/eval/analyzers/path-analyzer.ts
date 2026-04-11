// ── Path Analyzer ───────────────────────────────────────────────────────
//
// Extracts the full execution trace from a run's messages array and
// produces metrics:
//   - stepCount / stepLimit (the limit is derived from the agent that ran,
//     not hardcoded — core=10, graph/circuit=8, template=0)
//   - retryCount (semantic: same tool with similar input after an error)
//   - hallucinations, delegations, propose_circuit usage

import type { RunFile, PathAnalysis, TraceStep } from "../types"

/**
 * Agent-specific step limits — must stay in sync with `stopWhen: stepCountIs(N)`
 * in each agent's streamText call. Core=10, graph/circuit=8, template=0
 * (templates don't step).
 */
const STEP_LIMITS: Record<string, number> = {
  core: 10,
  graph: 8,
  circuit: 8,
  template: 0,
}

function getStepLimit(run: RunFile): number {
  const agent = run.run.agent
  return STEP_LIMITS[agent] ?? 10
}

/**
 * Compute a structural fingerprint for a tool call — the tool name plus a
 * stable JSON stringification of its arguments (with keys sorted). Two calls
 * with the same fingerprint are functionally identical; two calls with the
 * same tool name but different args are NOT the same call.
 *
 * Used by retry detection so "called place_component twice with different
 * positions" is not counted as a retry, while "called place_component twice
 * with the exact same input after an error" is.
 */
function fingerprint(toolName: string, input: Record<string, unknown>): string {
  return toolName + ":" + stableStringify(input)
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value)
  if (Array.isArray(value)) {
    return "[" + value.map(stableStringify).join(",") + "]"
  }
  const keys = Object.keys(value as Record<string, unknown>).sort()
  return (
    "{" +
    keys
      .map((k) => JSON.stringify(k) + ":" + stableStringify((value as Record<string, unknown>)[k]))
      .join(",") +
    "}"
  )
}

/**
 * Rough semantic similarity between two JSON-ish inputs — used as a softer
 * retry signal than exact equality. Returns a value in [0, 1]; 1 means
 * identical, 0 means no overlap. We compare the set of key paths in the
 * JSON tree plus the values at leaf positions.
 */
function similarity(a: Record<string, unknown>, b: Record<string, unknown>): number {
  const flat = (obj: unknown, prefix = ""): Map<string, string> => {
    const out = new Map<string, string>()
    if (obj === null || typeof obj !== "object") {
      out.set(prefix || "<root>", JSON.stringify(obj))
      return out
    }
    if (Array.isArray(obj)) {
      obj.forEach((v, i) => {
        for (const [k, vv] of flat(v, `${prefix}[${i}]`)) out.set(k, vv)
      })
      return out
    }
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      for (const [kk, vv] of flat(v, prefix ? `${prefix}.${k}` : k)) out.set(kk, vv)
    }
    return out
  }

  const fa = flat(a)
  const fb = flat(b)
  if (fa.size === 0 && fb.size === 0) return 1
  const allKeys = new Set([...fa.keys(), ...fb.keys()])
  let matches = 0
  for (const k of allKeys) {
    if (fa.get(k) === fb.get(k)) matches++
  }
  return matches / allKeys.size
}

/**
 * Threshold above which a post-error call is considered a retry.
 * Picked empirically: identical inputs are 1.0, small param adjustments land
 * around 0.75–0.9, meaningfully different inputs land below 0.6.
 */
const RETRY_SIMILARITY_THRESHOLD = 0.75

export function analyzePath(run: RunFile): PathAnalysis {
  const trace: TraceStep[] = []
  const hallucinations: string[] = []
  const delegations: string[] = []
  let retryCount = 0
  let usedProposeCircuit = false
  let stepNum = 0

  // Tool-name → last failed call fingerprint + input (for semantic retry match)
  type FailedCall = {
    fingerprint: string
    input: Record<string, unknown>
    error: string
  }
  const recentFailures = new Map<string, FailedCall>()

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

          // Semantic retry: same tool after an error, with similar-enough
          // inputs. Exact equality OR similarity above threshold counts.
          const prev = recentFailures.get(toolName)
          if (prev) {
            const fp = fingerprint(toolName, input)
            const isIdentical = fp === prev.fingerprint
            const sim = isIdentical ? 1 : similarity(input, prev.input)
            if (isIdentical || sim >= RETRY_SIMILARITY_THRESHOLD) {
              retryCount++
            }
            // Clear regardless — we only count the first retry of each failure
            recentFailures.delete(toolName)
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

          const hasError = result && typeof result === "object" && "error" in (result as Record<string, unknown>)
          const errorMsg = hasError ? String((result as Record<string, unknown>).error) : undefined

          if (hasError && errorMsg) {
            // Look up the matching tool-call to record its fingerprint
            const matchingCall = [...trace].reverse().find(
              (s) => s.type === "tool_call" && s.toolCallId === callId
            )
            if (matchingCall?.type === "tool_call" && matchingCall.toolInput) {
              const input = matchingCall.toolInput as Record<string, unknown>
              recentFailures.set(toolName, {
                fingerprint: fingerprint(toolName, input),
                input,
                error: errorMsg,
              })
            } else {
              // Fall back to tool-name-only tracking if we can't find the call
              recentFailures.set(toolName, {
                fingerprint: toolName,
                input: {},
                error: errorMsg,
              })
            }

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

  // Detect fabricated IDs from tool inputs
  for (const step of trace) {
    if (step.type === "tool_call" && step.toolInput && typeof step.toolInput === "object") {
      const input = step.toolInput as Record<string, unknown>
      if (typeof input.componentId === "string") {
        const id = input.componentId
        if (id.length < 10 && !id.includes("-")) {
          hallucinations.push(`${step.toolName}: used fabricated component ID "${id}"`)
        }
      }
    }
  }

  return {
    stepCount: trace.filter((s) => s.type === "tool_call").length,
    stepLimit: getStepLimit(run),
    retryCount,
    hallucinations,
    usedProposeCircuit,
    delegations,
    trace,
  }
}
