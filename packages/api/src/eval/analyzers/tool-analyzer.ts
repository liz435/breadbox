// ── Tool Analyzer ───────────────────────────────────────────────────────
//
// Evaluates tool-call accuracy. The analyzer dispatches to domain-specific
// rules by tool name — breadboard tools get circuit-specific checks (valid
// pin names, grid bounds), graph tools get graph-specific checks (known
// node IDs, port compatibility). Each tool has an entry in TOOL_RULES that
// runs its own validation without polluting the others.

import type { RunFile, ToolAnalysis, ToolDetail } from "../types"
import { isArduinoSignalPin } from "@dreamer/schemas"

// ── Domain: breadboard ──────────────────────────────────────────────────

const VALID_PIN_NAMES: Record<string, string[]> = {
  led: ["anode", "cathode"],
  rgb_led: ["red", "green", "blue", "common"],
  button: ["a", "b"],
  resistor: ["a", "b"],
  capacitor: ["positive", "negative"],
  potentiometer: ["vcc", "signal", "gnd"],
  buzzer: ["positive", "negative"],
  servo: ["signal", "vcc", "gnd"],
  neopixel: ["din"],
  pir_sensor: ["signal"],
  relay: ["signal"],
  dc_motor: ["signal"],
  dht_sensor: ["signal"],
  ir_receiver: ["signal"],
  shift_register: ["data", "clock", "latch"],
  oled_display: ["sda", "scl"],
  lcd_16x2: ["vss", "vdd", "vo", "rs", "rw", "e", "en", "d4", "d5", "d6", "d7", "a", "k"],
  seven_segment: ["a", "b", "c", "d", "e", "f", "g", "dp", "gnd"],
  temperature_sensor: ["vcc", "signal", "gnd"],
  ic: [],
}

const VALID_ARDUINO_POWER_PINS = new Set([-1, -2, -3, -4, -5, -6, -7, -8, -9])

// ── Rule types ──────────────────────────────────────────────────────────

/** One issue detected on a tool call. Pushed into the running counters. */
type ToolIssue = {
  bucket: "hallucinatedIds" | "wrongPinNames" | "invalidPositions" | "invalidGraphConnections"
  message: string
}

type ToolRule = (
  input: Record<string, unknown>,
  ctx: {
    knownGraphNodeIds: Set<string>
    knownGraphEdgeIds: Set<string>
  }
) => ToolIssue[]

// ── Per-tool rules ──────────────────────────────────────────────────────

const TOOL_RULES: Record<string, ToolRule> = {
  // Breadboard
  place_component: (input) => {
    const issues: ToolIssue[] = []
    const x = input.x as number | undefined
    const y = input.y as number | undefined
    if (x != null && (x < 0 || x > 9)) {
      issues.push({ bucket: "invalidPositions", message: `x=${x} is out of range (0-9)` })
    }
    if (y != null && (y < 0 || y > 29)) {
      issues.push({ bucket: "invalidPositions", message: `y=${y} is out of range (0-29)` })
    }
    const type = input.type as string | undefined
    const pins = input.pins as Record<string, unknown> | undefined
    if (type && pins && VALID_PIN_NAMES[type]) {
      const validNames = new Set(VALID_PIN_NAMES[type])
      for (const pinName of Object.keys(pins)) {
        if (!validNames.has(pinName)) {
          issues.push({
            bucket: "wrongPinNames",
            message: `Pin name "${pinName}" not valid for ${type} (expected: ${[...validNames].join(", ")})`,
          })
        }
      }
    }
    return issues
  },

  move_component: (input) => {
    const issues: ToolIssue[] = []
    const x = input.x as number | undefined
    const y = input.y as number | undefined
    if (x != null && (x < 0 || x > 9)) {
      issues.push({ bucket: "invalidPositions", message: `x=${x} out of range` })
    }
    if (y != null && (y < 0 || y > 29)) {
      issues.push({ bucket: "invalidPositions", message: `y=${y} out of range` })
    }
    return issues
  },

  connect_wire: (input) => {
    const issues: ToolIssue[] = []
    const fromRow = input.fromRow as number | undefined
    const fromCol = input.fromCol as number | undefined
    const toRow = input.toRow as number | undefined
    const toCol = input.toCol as number | undefined

    if (fromRow != null && fromRow !== -999 && (fromRow < 0 || fromRow > 29)) {
      issues.push({ bucket: "invalidPositions", message: `fromRow=${fromRow} out of range` })
    }
    if (fromCol != null && fromRow != null && fromRow !== -999 && (fromCol < -2 || fromCol > 11)) {
      issues.push({ bucket: "invalidPositions", message: `fromCol=${fromCol} out of range` })
    }
    if (fromRow === -999 && fromCol != null && !isArduinoSignalPin(fromCol) && !VALID_ARDUINO_POWER_PINS.has(fromCol)) {
      issues.push({ bucket: "invalidPositions", message: `fromCol=${fromCol} is not a valid Arduino pin` })
    }
    if (toRow != null && toRow !== -999 && (toRow < 0 || toRow > 29)) {
      issues.push({ bucket: "invalidPositions", message: `toRow=${toRow} out of range` })
    }
    if (toCol != null && (toCol < -2 || toCol > 11)) {
      issues.push({ bucket: "invalidPositions", message: `toCol=${toCol} out of range` })
    }
    return issues
  },

  // Graph
  create_edge: (input, ctx) => {
    const issues: ToolIssue[] = []
    const sourceNodeId = input.sourceNodeId as string | undefined
    const targetNodeId = input.targetNodeId as string | undefined
    if (sourceNodeId && !ctx.knownGraphNodeIds.has(sourceNodeId)) {
      issues.push({
        bucket: "invalidGraphConnections",
        message: `Edge source node not found: ${sourceNodeId}`,
      })
    }
    if (targetNodeId && !ctx.knownGraphNodeIds.has(targetNodeId)) {
      issues.push({
        bucket: "invalidGraphConnections",
        message: `Edge target node not found: ${targetNodeId}`,
      })
    }
    return issues
  },

  connect_nodes: (input, ctx) => {
    const issues: ToolIssue[] = []
    const sourceNodeId = input.sourceNodeId as string | undefined
    const targetNodeId = input.targetNodeId as string | undefined
    if (sourceNodeId && !ctx.knownGraphNodeIds.has(sourceNodeId)) {
      issues.push({
        bucket: "invalidGraphConnections",
        message: `connect_nodes source missing: ${sourceNodeId}`,
      })
    }
    if (targetNodeId && !ctx.knownGraphNodeIds.has(targetNodeId)) {
      issues.push({
        bucket: "invalidGraphConnections",
        message: `connect_nodes target missing: ${targetNodeId}`,
      })
    }
    return issues
  },

  delete_graph_node: (input, ctx) => {
    const issues: ToolIssue[] = []
    const nodeId = input.nodeId as string | undefined
    if (nodeId && !ctx.knownGraphNodeIds.has(nodeId)) {
      issues.push({
        bucket: "hallucinatedIds",
        message: `delete_graph_node: unknown nodeId ${nodeId}`,
      })
    }
    return issues
  },

  disconnect_nodes: (input, ctx) => {
    const issues: ToolIssue[] = []
    const edgeId = input.edgeId as string | undefined
    if (edgeId && !ctx.knownGraphEdgeIds.has(edgeId)) {
      issues.push({
        bucket: "hallucinatedIds",
        message: `disconnect_nodes: unknown edgeId ${edgeId}`,
      })
    }
    return issues
  },
}

// ── Analyzer ────────────────────────────────────────────────────────────

export function analyzeTools(run: RunFile): ToolAnalysis {
  const details: ToolDetail[] = []
  let errors = 0
  let hallucinatedIds = 0
  let wrongPinNames = 0
  let invalidPositions = 0
  let invalidGraphConnections = 0

  // Pair tool calls with their results in order
  const calls: Array<{ name: string; input: Record<string, unknown>; callId: string }> = []
  const results = new Map<string, { result: unknown; hasError: boolean; errorMsg?: string }>()

  for (const msg of run.messages) {
    if (msg.role === "assistant" && Array.isArray(msg.content)) {
      for (const part of msg.content as Array<Record<string, unknown>>) {
        if (part.type === "tool-call") {
          calls.push({
            name: (part.toolName ?? "") as string,
            input: (part.args ?? part.input ?? {}) as Record<string, unknown>,
            callId: (part.toolCallId ?? crypto.randomUUID()) as string,
          })
        }
      }
    } else if (msg.role === "tool" && Array.isArray(msg.content)) {
      for (const part of msg.content as Array<Record<string, unknown>>) {
        if (part.type === "tool-result") {
          const callId = (part.toolCallId ?? "") as string
          const output = part.output as Record<string, unknown> | undefined
          const value = output?.type === "json" ? output.value : output
          const hasError =
            value != null && typeof value === "object" && "error" in (value as Record<string, unknown>)
          results.set(callId, {
            result: value,
            hasError,
            errorMsg: hasError ? String((value as Record<string, unknown>).error) : undefined,
          })
        }
      }
    }
  }

  // Track graph state across the run so reference-checks are accurate:
  // create_graph_node populates known IDs, delete removes them, etc.
  const knownGraphNodeIds = new Set<string>()
  const knownGraphEdgeIds = new Set<string>()

  for (const call of calls) {
    const res = results.get(call.callId)
    let status: "success" | "error" | "hallucination" = "success"
    let issue: string | undefined

    // Top-level error handling — agent-agnostic
    if (res?.hasError) {
      errors++
      if (res.errorMsg?.includes("not found")) {
        hallucinatedIds++
        status = "hallucination"
        issue = res.errorMsg
      } else {
        status = "error"
        issue = res.errorMsg
      }
    }

    // Feed graph state for the next iteration (only on successful calls)
    if (!res?.hasError) {
      if (call.name === "create_graph_node") {
        // The tool result contains the nodeId; also synthesize from input if needed
        const r = res?.result as Record<string, unknown> | undefined
        const nodeId = (r?.nodeId as string | undefined) ?? (call.input.nodeId as string | undefined)
        if (nodeId) knownGraphNodeIds.add(nodeId)
      }
      if (call.name === "connect_nodes" || call.name === "create_edge") {
        const r = res?.result as Record<string, unknown> | undefined
        const edgeId = (r?.edgeId as string | undefined) ?? (call.input.edgeId as string | undefined)
        if (edgeId) knownGraphEdgeIds.add(edgeId)
      }
    }

    // Run per-tool rule (if any)
    const rule = TOOL_RULES[call.name]
    if (rule) {
      const issues = rule(call.input, { knownGraphNodeIds, knownGraphEdgeIds })
      for (const i of issues) {
        if (i.bucket === "hallucinatedIds") hallucinatedIds++
        else if (i.bucket === "wrongPinNames") wrongPinNames++
        else if (i.bucket === "invalidPositions") invalidPositions++
        else if (i.bucket === "invalidGraphConnections") invalidGraphConnections++
        if (status === "success") status = "error"
        if (!issue) issue = i.message
      }
    }

    // Agent-agnostic: fabricated component IDs (short, no dashes)
    if (call.input.componentId != null) {
      const id = String(call.input.componentId)
      if (id.length < 10 && !id.includes("-")) {
        hallucinatedIds++
        status = "hallucination"
        issue = `Fabricated component ID: "${id}"`
      }
    }

    details.push({
      tool: call.name,
      input: call.input,
      result: status,
      issue,
    })
  }

  const totalCalls = calls.length
  return {
    totalCalls,
    errors,
    errorRate: totalCalls > 0 ? Math.round((errors / totalCalls) * 100) / 100 : 0,
    hallucinatedIds,
    wrongPinNames,
    invalidPositions,
    invalidGraphConnections,
    details,
  }
}
