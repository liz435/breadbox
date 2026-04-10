// ── Tool Analyzer ───────────────────────────────────────────────────────
//
// Evaluates tool call accuracy: error rate, hallucinated IDs, wrong pin
// names, invalid positions.

import type { RunFile, ToolAnalysis, ToolDetail } from "../types"

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
  lcd_16x2: ["rs", "en", "d4", "d5", "d6", "d7"],
  seven_segment: ["a", "b", "c", "d", "e", "f", "g"],
  temperature_sensor: ["vcc", "signal", "gnd"],
  ic: [],
}

export function analyzeTools(run: RunFile): ToolAnalysis {
  const details: ToolDetail[] = []
  let errors = 0
  let hallucatedIds = 0
  let wrongPinNames = 0
  let invalidPositions = 0

  // Pair tool calls with their results
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
          const hasError = value != null && typeof value === "object" && "error" in (value as Record<string, unknown>)
          results.set(callId, {
            result: value,
            hasError,
            errorMsg: hasError ? String((value as Record<string, unknown>).error) : undefined,
          })
        }
      }
    }
  }

  for (const call of calls) {
    const res = results.get(call.callId)
    let status: "success" | "error" | "hallucination" = "success"
    let issue: string | undefined

    // Check for errors
    if (res?.hasError) {
      errors++
      if (res.errorMsg?.includes("not found")) {
        hallucatedIds++
        status = "hallucination"
        issue = res.errorMsg
      } else {
        status = "error"
        issue = res.errorMsg
      }
    }

    // Check place_component inputs
    if (call.name === "place_component") {
      const x = call.input.x as number | undefined
      const y = call.input.y as number | undefined
      if (x != null && (x < 0 || x > 9)) {
        invalidPositions++
        issue = `x=${x} is out of range (0-9)`
        if (status === "success") status = "error"
      }
      if (y != null && (y < 0 || y > 29)) {
        invalidPositions++
        issue = `y=${y} is out of range (0-29)`
        if (status === "success") status = "error"
      }

      // Check pin names
      const type = call.input.type as string | undefined
      const pins = call.input.pins as Record<string, unknown> | undefined
      if (type && pins && VALID_PIN_NAMES[type]) {
        const validNames = new Set(VALID_PIN_NAMES[type])
        for (const pinName of Object.keys(pins)) {
          if (!validNames.has(pinName)) {
            wrongPinNames++
            issue = `Pin name "${pinName}" not valid for ${type} (expected: ${[...validNames].join(", ")})`
            if (status === "success") status = "error"
          }
        }
      }
    }

    // Check for fabricated component IDs
    if (call.input.componentId != null) {
      const id = String(call.input.componentId)
      if (id.length < 10 && !id.includes("-")) {
        hallucatedIds++
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
    hallucatedIds,
    wrongPinNames,
    invalidPositions,
    details,
  }
}
