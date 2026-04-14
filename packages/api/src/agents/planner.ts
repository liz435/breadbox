// ── LLM-based Plan Generation ───────────────────────────────────────────
//
// Before the core tool loop, generates an explicit plan object that
// describes what the agent intends to do. For destructive operations
// (removing components, rebuild), the plan is streamed to the user for
// approval before execution.

import { generateObject } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import type { RoutingDecision } from "./router";
import { createLogger } from "../logger";

const log = createLogger("planner");

/** Model used for plan generation — cheap, fast. */
const PLANNER_MODEL = "claude-haiku-4-5-20251001";

// ── Schema ───────────────────────────────────────────────────────────────

export const planStepSchema = z.object({
  action: z.string().describe("What this step does, e.g. 'Place LED at row 5'"),
  tool: z.string().optional().describe("Which tool to call, e.g. 'place_component'"),
  destructive: z.boolean().describe("True if this step removes or replaces existing work"),
});

export const agentPlanSchema = z.object({
  summary: z.string().describe("One-line summary of the full plan"),
  steps: z.array(planStepSchema).describe("Ordered steps the agent will take"),
  estimatedToolCalls: z.number().int().min(1).max(10).describe("Expected number of tool calls"),
  isDestructive: z.boolean().describe("True if the plan involves removing components or wires"),
  destructiveDetails: z.string().optional().describe("What will be removed/replaced, if destructive"),
});

export type AgentPlan = z.infer<typeof agentPlanSchema>;
export type PlanStep = z.infer<typeof planStepSchema>;

// ── Plan Feasibility ─────────────────────────────────────────────────────

export type PlanFeasibility = {
  feasible: true;
  requiresApproval: false;
} | {
  feasible: true;
  requiresApproval: true;
  approvalReason: string;
} | {
  feasible: false;
  reason: string;
};

/**
 * Determine if a plan is feasible and whether it needs user approval.
 * Destructive plans (removing parts, rebuilding) require approval.
 */
export function assessFeasibility(
  plan: AgentPlan,
  routing: RoutingDecision,
): PlanFeasibility {
  // Plans with destructive steps need approval
  if (plan.isDestructive) {
    return {
      feasible: true,
      requiresApproval: true,
      approvalReason: plan.destructiveDetails
        ?? "This plan involves removing or replacing existing components.",
    };
  }

  // Rebuild requests are inherently destructive
  if (routing.requestType === "rebuild") {
    return {
      feasible: true,
      requiresApproval: true,
      approvalReason: "This will rebuild the circuit, replacing existing components and wiring.",
    };
  }

  // Safe plan — no approval needed
  return { feasible: true, requiresApproval: false };
}

// ── Plan Generation ──────────────────────────────────────────────────────

export type PlannerUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  model: string;
};

export type GeneratePlanResult = {
  plan: AgentPlan;
  usage: PlannerUsage;
};

/**
 * Generate an explicit plan using a cheap LLM call. The plan describes
 * what the agent intends to do before entering the tool loop.
 */
export async function generatePlan(params: {
  prompt: string;
  boardSummary: string;
  routing: RoutingDecision;
}): Promise<GeneratePlanResult> {
  const { prompt, boardSummary, routing } = params;
  const start = performance.now();

  const result = await generateObject({
    model: anthropic(PLANNER_MODEL),
    schema: agentPlanSchema,
    prompt: `You are planning actions for an Arduino simulator assistant. Given the user's request, current board state, and routing decision, create a concise plan.

User request: ${prompt}

Current board:
${boardSummary}

Routing: mode=${routing.toolMode}, domain=${routing.domain}, type=${routing.requestType}

Create a plan with concrete steps. Mark steps as destructive if they remove/replace existing components or wires. Keep it concise — max 6 steps.`,
  });

  const inputTokens = result.usage?.inputTokens ?? 0;
  const outputTokens = result.usage?.outputTokens ?? 0;
  const elapsed = (performance.now() - start).toFixed(0);

  log.info(
    `plan generated in ${elapsed}ms — ${result.object.steps.length} steps, destructive: ${result.object.isDestructive}`,
  );

  return {
    plan: result.object,
    usage: {
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      model: PLANNER_MODEL,
    },
  };
}
