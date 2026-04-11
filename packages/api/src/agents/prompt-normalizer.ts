export type PromptNormalizationResult = {
  originalPrompt: string;
  normalizedPrompt: string;
  shouldUseNormalizedPrompt: boolean;
  assumptions: string[];
  detectedComponents: string[];
};

const COMPONENT_PATTERNS: Array<{ name: string; re: RegExp }> = [
  { name: "led", re: /\bleds?\b/i },
  { name: "resistor", re: /\bresistors?\b/i },
  { name: "button", re: /\bbuttons?\b/i },
  { name: "servo", re: /\bservos?\b/i },
  { name: "motor", re: /\bmotors?\b/i },
  { name: "buzzer", re: /\bbuzzer|piezo|tone\b/i },
  { name: "potentiometer", re: /\bpot(?:entiometer)?s?\b/i },
  { name: "sensor", re: /\bsensors?\b/i },
  { name: "breadboard", re: /\bbreadboard\b/i },
  { name: "arduino", re: /\barduino|uno\b/i },
];

function detectComponents(prompt: string): string[] {
  return COMPONENT_PATTERNS.filter((pattern) => pattern.re.test(prompt)).map((pattern) => pattern.name);
}

function detectLedCount(prompt: string): number | null {
  const explicitCount = prompt.match(/\b(\d{1,2})\s*leds?\b/i);
  if (explicitCount) {
    const parsed = Number.parseInt(explicitCount[1] ?? "", 10);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return /\bleds?\b/i.test(prompt) ? 1 : null;
}

function compactWhitespace(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

function looksCircuitRelated(prompt: string, components: string[]): boolean {
  if (components.length > 0) return true;
  return /\b(pin|gnd|5v|voltage|current|power|wiring|sketch|circuit)\b/i.test(prompt);
}

export function normalizeAgentPrompt(prompt: string): PromptNormalizationResult {
  const originalPrompt = compactWhitespace(prompt);
  const detectedComponents = detectComponents(originalPrompt);
  const assumptions: string[] = [];

  if (!looksCircuitRelated(originalPrompt, detectedComponents)) {
    return {
      originalPrompt,
      normalizedPrompt: originalPrompt,
      shouldUseNormalizedPrompt: false,
      assumptions,
      detectedComponents,
    };
  }

  const ledCount = detectLedCount(originalPrompt);
  const includeSimpleBias =
    /\b(simple|beginner|basic)\b/i.test(originalPrompt) ||
    (/\bstarfish\b/i.test(originalPrompt) && /\bleds?\b/i.test(originalPrompt));

  const safetyRules: string[] = [
    "Keep each Arduino I/O pin at or below 20mA and keep total board draw within safe Uno limits.",
  ];
  if (detectedComponents.includes("servo") || detectedComponents.includes("motor")) {
    safetyRules.push("Use an external 5V supply for high-current actuators and tie external ground to Arduino GND.");
  }
  if ((ledCount ?? 0) >= 3) {
    safetyRules.push("Do not drive many LEDs from one pin; distribute signal pins and keep one resistor per LED.");
    assumptions.push(`Detected ${ledCount} LEDs; split load across multiple pins if needed.`);
  }

  const deliverables = [
    "Provide a wiring table (pin -> component).",
    "Provide complete Arduino sketch code.",
    "Include a short power budget summary (per-pin and total).",
  ];

  if (includeSimpleBias) {
    assumptions.push("Use simple logic and minimal parts unless the user explicitly asks for advanced behavior.");
  }

  const normalizedPrompt = [
    `User request (verbatim): ${originalPrompt}`,
    "",
    "Execution brief:",
    includeSimpleBias
      ? "- Keep the solution simple and beginner-friendly."
      : "- Preserve user intent exactly; avoid unnecessary complexity.",
    detectedComponents.length > 0
      ? `- Components implied: ${detectedComponents.join(", ")}.`
      : "- Components implied: infer from user request only.",
    "",
    "Safety constraints:",
    ...safetyRules.map((rule) => `- ${rule}`),
    "",
    "Expected output:",
    ...deliverables.map((item) => `- ${item}`),
  ].join("\n");

  return {
    originalPrompt,
    normalizedPrompt,
    shouldUseNormalizedPrompt: true,
    assumptions,
    detectedComponents,
  };
}
