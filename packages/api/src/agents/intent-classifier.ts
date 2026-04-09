// ── Intent Classifier ───────────────────────────────────────────────────
//
// Lightweight regex-based router that matches user prompts to known circuit
// patterns. Returns a template name for deterministic execution, or null
// for freeform agent reasoning.
//
// This runs BEFORE the expensive Sonnet call — ~0ms, zero tokens.

export type ClassifiedIntent =
  | { type: "template"; template: string; params: Record<string, unknown>; additive: boolean }
  | { type: "agent" }

export type AgentComplexity = "simple" | "complex"

/** Words that signal the user wants to add to the existing board, not replace it. */
const ADDITIVE_PATTERNS = /\badd\b|\balso\b|\bmore\b|\banother\b|\bextra\b|\bmodif|\bchange\b|\bupdate\b|\bkeep\b|\bexisting\b|\bcurrent\b|\bon top\b|\bas well\b/

export function classifyIntent(prompt: string): ClassifiedIntent {
  const p = prompt.toLowerCase().trim()
  const additive = ADDITIVE_PATTERNS.test(p)

  // ── Blink LED ──
  if (/\bblink\b/.test(p) && /\bled\b/.test(p) && !(/button|servo|lcd|sensor|motor/.test(p))) {
    const pinMatch = p.match(/\bpin\s*(\d+)\b/)
    const pin = pinMatch ? parseInt(pinMatch[1], 10) : 13
    const colorMatch = p.match(/\b(red|green|blue|yellow|white|orange)\b/)
    const colorMap: Record<string, string> = {
      red: "#ef4444", green: "#22c55e", blue: "#3b82f6",
      yellow: "#facc15", white: "#f5f5f5", orange: "#f97316",
    }
    return {
      type: "template", template: "blink", additive,
      params: { pin, color: colorMap[colorMatch?.[1] ?? "red"] ?? "#ef4444" },
    }
  }

  // ── Button + LED ──
  if (/\bbutton\b/.test(p) && /\bled\b/.test(p) && !(/servo|lcd|motor|sensor/.test(p))) {
    return { type: "template", template: "button_led", params: {}, additive }
  }

  // ── Servo sweep ──
  if (/\bservo\b/.test(p) && /\bsweep\b/.test(p)) {
    const pinMatch = p.match(/\bpin\s*(\d+)\b/)
    const pin = pinMatch ? parseInt(pinMatch[1], 10) : 9
    return { type: "template", template: "servo_sweep", params: { pin }, additive }
  }

  // ── Traffic light ──
  if (/\btraffic\s*light\b/.test(p)) {
    return { type: "template", template: "traffic_light", params: {}, additive }
  }

  // ── Potentiometer + LED (brightness control) ──
  if (/\bpot\b|\bpotentiometer\b/.test(p) && /\bled\b|\bbright\b/.test(p)) {
    return { type: "template", template: "pot_led", params: {}, additive }
  }

  // ── Temperature sensor reading ──
  if (/\btemp\b|\btemperature\b/.test(p) && /\bread\b|\bsensor\b|\bmonitor\b/.test(p)) {
    return { type: "template", template: "temperature_reading", params: {}, additive }
  }

  // ── Buzzer / tone ──
  if (/\bbuzz\b|\btone\b|\bmelody\b|\bbeep\b/.test(p) && !(/button|led|servo|motor/.test(p))) {
    return { type: "template", template: "buzzer_tone", params: {}, additive }
  }

  // No match — use full agent
  return { type: "agent" }
}

// ── Complexity Classifier ─────────────────────────────────────────────
//
// Determines whether a prompt needs Sonnet (complex multi-component, debugging,
// wiring analysis) or can be handled by Haiku (single component add/remove,
// simple property change, straightforward sketch edit).

/** Patterns that signal a complex request requiring Sonnet. */
const COMPLEX_PATTERNS = /\bdebug\b|\bfix\b|\bwhy\b|\bwhat'?s wrong\b|\bnot working\b|\brefactor\b|\bredesign\b|\boptimize\b|\bcomplex\b|\bmultiple\b|\bcircuit\b|\banalyze\b|\bvalidat|\bexplain\b|\bi2c\b|\bspi\b|\binterrupt\b|\bshift.?reg|\bneopixel\b|\blcd\b|\boled\b|\bgraph\b|\bnode.?block\b|\bvisual\b/

/** Patterns that signal a simple request Haiku can handle. */
const SIMPLE_PATTERNS = /\badd\s+(a|an|one|another)\b|\bremove\b|\bdelete\b|\bchange\s+(the\s+)?color\b|\bmove\b|\brename\b|\bturn\s+(on|off)\b|\balways\s+on\b|\bupdate\s+(the\s+)?sketch\b|\bi\s+want\s+(a|an|one|another)\b/

/** Conversational / trivial prompts that don't need Sonnet. */
const GREETING_PATTERNS = /^(hi|hey|hello|yo|sup|thanks|thank you|ok|okay|cool|nice|great|good|awesome|perfect|yes|no|yep|nope|sure|got it|sounds good)\s*[!.?]?$/i

export function classifyComplexity(prompt: string): AgentComplexity {
  const p = prompt.toLowerCase().trim()

  // Greetings / trivial messages — always simple
  if (GREETING_PATTERNS.test(p)) return "simple"

  // Complex patterns take priority
  if (COMPLEX_PATTERNS.test(p)) return "complex"

  // Count component types mentioned — multiple types = complex
  const componentMentions = [
    /\bled\b/, /\bbutton\b/, /\bservo\b/, /\bmotor\b/, /\bbuzzer\b/,
    /\bpot\b|\bpotentiometer\b/, /\bsensor\b/, /\brelay\b/, /\bresistor\b/,
    /\bcapacitor\b/, /\bdisplay\b/,
  ].filter(re => re.test(p)).length
  if (componentMentions >= 2) return "complex"

  // Long prompts with many clauses tend to be complex
  if (p.length > 200) return "complex"

  // Simple patterns
  if (SIMPLE_PATTERNS.test(p)) return "simple"

  // Default to complex for safety (Sonnet handles edge cases better)
  return "complex"
}
