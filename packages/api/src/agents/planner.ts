// ── LLM-based Plan Generation ───────────────────────────────────────────
//
// Before the core tool loop, generates an explicit plan object that
// describes what the agent intends to do. For destructive operations
// (removing components, rebuild), the plan is streamed to the user for
// approval before execution.

import { generateObject } from "ai";
import { anthropicModel } from "./anthropic-provider";
import { z } from "zod";
import type { RoutingDecision } from "./router";
import { createLogger } from "../logger";

const log = createLogger("planner");

/** Model used for plan generation — cheap, fast. */
const PLANNER_MODEL = "claude-haiku-4-5-20251001";

// ── Schema ───────────────────────────────────────────────────────────────
//
// IMPORTANT: this schema is fed to `generateObject`, which forwards it as
// `output_config.format.schema` to Anthropic's structured-outputs API
// (beta `structured-outputs-2025-11-13`). That API rejects schemas that
// combine `type: "integer"` with `minimum`/`maximum` keywords with:
//
//   AI_APICallError: output_config.format.schema:
//     For 'integer' type, properties maximum, minimum are not supported
//
// Zod 4's `z.toJSONSchema()` emits `minimum`/`maximum` for `.int()`
// automatically (set to ±Number.MAX_SAFE_INTEGER), even without an explicit
// `.min()/.max()` chain — so the offender is `.int()` itself, not just the
// bounds we used to put on it. We use plain `z.number()` here (emits a
// bare `type: "number"`) and round/clamp post-parse to recover the
// integer-with-bounds semantic.
//
// If you ever need to emit an integer field for the planner, do not switch
// to `.int()`/`z.int()`/`z.int32()` — they all hit this restriction. Either
// keep the field as `z.number()` and cast, or switch the planner over to
// `structuredOutputMode: 'jsonTool'` provider option (which routes through
// the tool-use path that doesn't apply this validation).

const ESTIMATED_TOOL_CALLS_MIN = 1;
const ESTIMATED_TOOL_CALLS_MAX = 10;

export const planStepSchema = z.object({
  action: z.string().describe("What this step does, e.g. 'Place LED at row 5'"),
  tool: z.string().optional().describe("Which tool to call, e.g. 'place_component'"),
  destructive: z.boolean().describe("True if this step removes or replaces existing work"),
});

export const agentPlanSchema = z.object({
  summary: z.string().describe("One-line summary of the full plan"),
  steps: z.array(planStepSchema).describe("Ordered steps the agent will take"),
  estimatedToolCalls: z
    .number()
    .describe(
      `Expected whole number of tool calls (target ${ESTIMATED_TOOL_CALLS_MIN}-${ESTIMATED_TOOL_CALLS_MAX}; rounded and clamped server-side, so an integer in range is the safe choice)`,
    ),
  isDestructive: z.boolean().describe("True if the plan involves removing components or wires"),
  destructiveDetails: z.string().optional().describe("What will be removed/replaced, if destructive"),
});

export type AgentPlan = z.infer<typeof agentPlanSchema>;
export type PlanStep = z.infer<typeof planStepSchema>;

/**
 * Round + clamp the model's estimated tool-call count into the documented
 * range. The bound is a sanity hint (purely surfaced for reporting, not a
 * correctness invariant), so we normalize rather than reject when the model
 * overshoots or returns a non-integer.
 *
 * Exported for tests; not part of the planner's public contract.
 */
export function clampEstimatedToolCalls(value: number): number {
  if (!Number.isFinite(value)) return ESTIMATED_TOOL_CALLS_MIN;
  return Math.min(
    ESTIMATED_TOOL_CALLS_MAX,
    Math.max(ESTIMATED_TOOL_CALLS_MIN, Math.round(value)),
  );
}

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
    model: anthropicModel(PLANNER_MODEL),
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

  // Normalize the estimated tool-call count post-parse since we no longer
  // express the bound in the JSON Schema (see schema comment above).
  const plan: AgentPlan = {
    ...result.object,
    estimatedToolCalls: clampEstimatedToolCalls(result.object.estimatedToolCalls),
  };

  log.info(
    `plan generated in ${elapsed}ms — ${plan.steps.length} steps, destructive: ${plan.isDestructive}`,
  );

  return {
    plan,
    usage: {
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      model: PLANNER_MODEL,
    },
  };
}
