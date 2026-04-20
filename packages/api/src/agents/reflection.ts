// ── Reflection Loop ─────────────────────────────────────────────────────
//
// After collectResult(), checks whether the agent's output matches the
// original intent. If not, and there's budget remaining, suggests re-entry
// into the tool loop with an adjusted plan.

import { generateObject } from "ai";
import { anthropicModel } from "./anthropic-provider";
import { z } from "zod";
import type { AgentPlan } from "./planner";
import { createLogger } from "../logger";

const log = createLogger("reflection");

/** Model for reflection — cheap, fast. */
const REFLECTION_MODEL = "claude-haiku-4-5-20251001";

// ── Schema ───────────────────────────────────────────────────────────────

export const reflectionResultSchema = z.object({
  matchesIntent: z.boolean().describe("True if the output satisfies the user's request"),
  confidence: z.number().min(0).max(1).describe("Confidence that the output matches intent"),
  issues: z.array(z.string()).optional().describe("What doesn't match, if any"),
  suggestedAdjustment: z.string().optional().describe("What to change if re-entering the loop"),
});

export type ReflectionResult = z.infer<typeof reflectionResultSchema>;

export type ReflectionUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  model: string;
};

// ── Reflection Check ─────────────────────────────────────────────────────

/**
 * Ask a cheap model whether the agent's output matches the original intent.
 * Returns a structured assessment with confidence score.
 */
export async function reflectOnOutput(params: {
  originalPrompt: string;
  plan?: AgentPlan;
  assistantText: string;
  opsCount: number;
  boardSummaryAfter: string;
}): Promise<{ result: ReflectionResult; usage: ReflectionUsage }> {
  const { originalPrompt, plan, assistantText, opsCount, boardSummaryAfter } = params;
  const start = performance.now();

  const planContext = plan
    ? `\nPlan was: ${plan.summary} (${plan.steps.length} steps)`
    : "";

  const result = await generateObject({
    model: anthropicModel(REFLECTION_MODEL),
    schema: reflectionResultSchema,
    prompt: `You are reviewing an Arduino simulator agent's output. Did it satisfy the user's request?

User request: ${originalPrompt}
${planContext}

Agent response: ${assistantText.slice(0, 500)}
Operations applied: ${opsCount}

Board state after:
${boardSummaryAfter}

Evaluate: does the output match the user's intent? Consider:
1. Were the right components placed/modified?
2. Does the sketch logic match what was asked?
3. Are there obvious missing pieces?

Be generous — partial success with correct direction is a match. Only flag clear mismatches.`,
  });

  const inputTokens = result.usage?.inputTokens ?? 0;
  const outputTokens = result.usage?.outputTokens ?? 0;
  const elapsed = (performance.now() - start).toFixed(0);

  log.info(
    `reflection in ${elapsed}ms — matches: ${result.object.matchesIntent}, confidence: ${result.object.confidence.toFixed(2)}`,
  );

  return {
    result: result.object,
    usage: {
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      model: REFLECTION_MODEL,
    },
  };
}

/**
 * Determine whether to re-enter the tool loop based on reflection results.
 * Budget check: only allow re-entry if the agent used fewer than maxSteps.
 */
export function shouldReplan(params: {
  reflection: ReflectionResult;
  stepsUsed: number;
  maxSteps: number;
  /** How many times we've already re-planned this turn. */
  replanCount: number;
}): boolean {
  const { reflection, stepsUsed, maxSteps, replanCount } = params;

  // Never re-plan more than once per turn
  if (replanCount >= 1) return false;

  // If it matches intent, no need to re-plan
  if (reflection.matchesIntent) return false;

  // Low confidence + budget remaining = re-plan
  if (reflection.confidence < 0.5 && stepsUsed < maxSteps - 1) {
    return true;
  }

  return false;
}
