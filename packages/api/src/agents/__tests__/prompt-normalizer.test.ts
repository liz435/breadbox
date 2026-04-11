import { describe, test, expect } from "bun:test";
import { normalizeAgentPrompt } from "../prompt-normalizer";

describe("normalizeAgentPrompt", () => {
  test("adds safety constraints for servo power", () => {
    const result = normalizeAgentPrompt(
      "make a servo sweep with 3 leds to show angle zones"
    );

    expect(result.shouldUseNormalizedPrompt).toBe(true);
    expect(result.normalizedPrompt).toContain("external 5V supply");
    expect(result.normalizedPrompt).toContain("power budget summary");
    expect(result.detectedComponents).toContain("servo");
    expect(result.detectedComponents).toContain("led");
  });

  test("keeps non-circuit prompts unchanged", () => {
    const result = normalizeAgentPrompt("write a short welcome message");

    expect(result.shouldUseNormalizedPrompt).toBe(false);
    expect(result.normalizedPrompt).toBe("write a short welcome message");
  });

  test("biases starfish led prompts toward simple safe wiring", () => {
    const result = normalizeAgentPrompt(
      "create a starfish with 5 LEDs and make them blink together"
    );

    expect(result.shouldUseNormalizedPrompt).toBe(true);
    expect(result.normalizedPrompt).toContain("Keep the solution simple");
    expect(result.normalizedPrompt).toContain("Do not drive many LEDs from one pin");
    expect(result.assumptions.some((a) => a.includes("Detected 5 LEDs"))).toBe(true);
  });
});
