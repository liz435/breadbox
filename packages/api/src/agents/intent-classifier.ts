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

/** Words for components that, when paired with additive triggers, indicate "add to board" */
const COMPONENT_NOUNS = "led|button|servo|buzzer|resistor|capacitor|pot|potentiometer|sensor|relay|motor|wire|neopixel|lcd|oled|display|switch|speaker|piezo|dht|pir|temperature|temp"

/** Template circuit names — also valid additive targets ("add another traffic light") */
const TEMPLATE_NOUNS = "traffic\\s*light|blink|sweep|tone|melody|brightness"

/**
 * Additive intent: trigger word followed by a component or template name.
 * Matches: "add a led", "also add a buzzer", "another traffic light", "more LEDs"
 * Does NOT match: "another circuit", "more complex" (no component/template after trigger)
 */
const ADDITIVE_PATTERNS = new RegExp(
  `\\b(?:add|also|another|more|extra|as well)\\b[^.]*?\\b(?:${COMPONENT_NOUNS}|${TEMPLATE_NOUNS})\\b`,
  "i"
)

/**
 * "Keep" intent: keep specific components or existing state
 * Matches: "keep the led", "keep existing", "keep current"
 * Does NOT match: "keep this clean", "keep going"
 */
const KEEP_PATTERNS = new RegExp(
  `\\bkeep\\b[^.]*?\\b(?:existing|current|the\\s+(?:${COMPONENT_NOUNS})|board)\\b`,
  "i"
)

/**
 * Explicit replacement intent — escape to agent path for these.
 * Matches: "another circuit", "different design", "new setup", "replace with"
 * The agent has full board context and can decide what to do.
 */
const REPLACEMENT_PATTERNS = /\b(?:another|different|new|fresh|instead|replace(?:\s+with)?)\s+(?:circuit|design|version|setup|sketch|one|project)\b/i

/**
 * Selective removal intent — also escape to agent.
 * Matches: "keep only the led", "remove all but", "delete everything except"
 */
const SELECTIVE_PATTERNS = /\bkeep\s+only\b|\b(?:remove|delete)\s+(?:all|everything)\s+(?:but|except)\b|\bonly\s+(?:keep|leave)\b/i

export function classifyIntent(prompt: string): ClassifiedIntent {
  const p = prompt.toLowerCase().trim()

  // Ambiguous prompts go to the agent — it has full context
  if (REPLACEMENT_PATTERNS.test(p) || SELECTIVE_PATTERNS.test(p)) {
    return { type: "agent" }
  }

  const additive = ADDITIVE_PATTERNS.test(p) || KEEP_PATTERNS.test(p)

  // ── Blink LED ──
  if (/\bblink(?:ing)?\b/.test(p) && /\bled\b/.test(p) && !(/button|servo|lcd|sensor|motor/.test(p))) {
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
const COMPLEX_LAYOUT_PATTERNS = /\bstarfish\b|\bshape\b|\bpattern\b|\barrange\b|\blayout\b|\bsymmetr(?:y|ical)\b|\ball\s+leds?\b|\bsimultaneous(?:ly)?\b/

/** Patterns that signal a simple request Haiku can handle. */
const SIMPLE_PATTERNS = /\badd\s+(a|an|one|another)\b|\bremove\b|\bdelete\b|\bchange\s+(the\s+)?color\b|\bmove\b|\brename\b|\bturn\s+(on|off)\b|\balways\s+on\b|\bupdate\s+(the\s+)?sketch\b|\bi\s+want\s+(a|an|one|another)\b/

/** Conversational / trivial prompts that don't need Sonnet. */
const GREETING_PATTERNS = /^(hi|hey|hello|yo|sup|thanks|thank you|ok|okay|cool|nice|great|good|awesome|perfect|yes|no|yep|nope|sure|got it|sounds good)\s*[!.?]?$/i

export function classifyComplexity(prompt: string): AgentComplexity {
  const p = prompt.toLowerCase().trim()

  // Greetings / trivial messages — always simple
  if (GREETING_PATTERNS.test(p)) return "simple"

  // Explicit simple override:
  // Shape-only LED art requests (e.g. starfish) with basic blink behavior
  // are cheap build tasks and should not escalate by default.
  const isSimpleLedShape =
    /\bstarfish\b/.test(p) &&
    /\bleds?\b/.test(p) &&
    /\bblink(?:ing)?\b/.test(p) &&
    !/\b(debug|fix|not working|analyze|validate|neopixel|servo|motor|sensor|lcd|oled|graph)\b/.test(p)
  if (isSimpleLedShape) return "simple"

  // Complex patterns take priority
  if (COMPLEX_PATTERNS.test(p) || COMPLEX_LAYOUT_PATTERNS.test(p)) return "complex"

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
