// ── Externalized Policy Engine ───────────────────────────────────────────
//
// Centralizes all safety / guardrail checks that run AFTER the agent's tool
// loop completes and BEFORE ops are applied. This replaces the inline
// power-budget + routing-policy checks that were scattered in core/agent.ts.
//
// Each policy is a pure function that receives the working board + proposed
// ops and returns violations (if any). The engine runs all policies and
// aggregates results.

import type { BoardState, BoardOp } from "@dreamer/schemas";
import { analyzePowerBudget } from "../electrical/power-budget-analyzer";
import { analyzeRoutingPolicy, normalizeDirectPinFanout } from "../electrical/routing-policy";
import { makeBoardOp } from "./make-op";

// ── Types ────────────────────────────────────────────────────────────────

export type PolicyViolation = {
  policy: string;
  severity: "error" | "warning";
  message: string;
  code: string;
  pin?: number;
};

export type PolicyRemediationOp = {
  ops: BoardOp[];
  note: string;
};

export type PolicyResult = {
  violations: PolicyViolation[];
  remediations: PolicyRemediationOp[];
  blocked: boolean;
  /** Human-readable block reason when blocked=true. */
  blockReason?: string;
};

type OpContext = {
  projectId: string;
  sceneId: string;
  expectedVersion: number;
};

// ── Individual Policies ──────────────────────────────────────────────────

function checkPowerBudget(board: BoardState): {
  violations: PolicyViolation[];
  recommendations: Array<{ message: string }>;
} {
  const report = analyzePowerBudget(board);
  const violations: PolicyViolation[] = report.issues
    .filter((issue) => issue.severity === "error" || issue.severity === "warning")
    .map((issue) => ({
      policy: "power_budget",
      severity: issue.severity as "error" | "warning",
      message: issue.message,
      code: issue.code,
      pin: issue.pin,
    }));

  return { violations, recommendations: report.recommendations };
}

function checkRoutingPolicy(board: BoardState): PolicyViolation[] {
  const routing = analyzeRoutingPolicy(board);
  const violations: PolicyViolation[] = [];

  if (routing.maxPinFanout > 1) {
    violations.push({
      policy: "routing",
      severity: "warning",
      message: `${routing.pinsOverDirectFanout} pin(s) have multiple direct wires (max fanout: ${routing.maxPinFanout}). Should route through breadboard bus.`,
      code: "DIRECT_PIN_FANOUT",
    });
  }

  for (const v of routing.violations) {
    violations.push({
      policy: "routing",
      severity: "warning",
      message: v.message,
      code: v.code,
      pin: v.pin,
    });
  }

  return violations;
}

// ── Auto-Remediation ─────────────────────────────────────────────────────

function tryRemediateFanout(
  board: BoardState,
  opCtx: OpContext,
): PolicyRemediationOp | null {
  const fix = normalizeDirectPinFanout({ board, opCtx });
  if (!fix) return null;
  return { ops: fix.ops, note: fix.notes.join(" ") };
}

function tryRemediateLedOvercurrent(
  board: BoardState,
  opCtx: OpContext,
  powerViolations: PolicyViolation[],
): PolicyRemediationOp | null {
  const issue = powerViolations.find(
    (v) => v.code === "PIN_OVERCURRENT" && typeof v.pin === "number",
  );
  if (!issue || issue.pin == null) return null;
  const overloadedPin = issue.pin;

  const ledWires = Object.values(board.wires).filter((wire) => {
    if (wire.fromRow !== -999 || wire.fromCol !== overloadedPin) return false;
    return Object.values(board.components).some(
      (component) =>
        component.type === "led" && component.y === wire.toRow && component.x === wire.toCol,
    );
  });
  if (ledWires.length < 3) return null;

  const preferredPins = [overloadedPin, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2];
  const requiredPins = Math.ceil(ledWires.length / 2);
  if (requiredPins > preferredPins.length) return null;
  const assignedPins = preferredPins.slice(0, requiredPins);
  const extraPins = assignedPins.filter((p) => p !== overloadedPin);

  const generatedOps: BoardOp[] = [];
  for (let i = 0; i < ledWires.length; i++) {
    const wire = ledWires[i]!;
    const targetPin = assignedPins[Math.floor(i / 2)]!;
    if (targetPin === overloadedPin) continue;

    generatedOps.push(
      makeBoardOp(opCtx, { kind: "remove_wire", payload: { wireId: wire.id } }),
    );
    delete board.wires[wire.id];

    const newWire = {
      id: crypto.randomUUID(),
      fromRow: -999,
      fromCol: targetPin,
      toRow: wire.toRow,
      toCol: wire.toCol,
      color: wire.color,
    };
    generatedOps.push(
      makeBoardOp(opCtx, { kind: "connect_wire", payload: { wire: newWire } }),
    );
    board.wires[newWire.id] = newWire;
  }

  if (generatedOps.length === 0) return null;

  // Patch sketch for split pins
  const sketchCode = board.sketchCode ?? "";
  const patchedSketch = patchSketchForSplitPins(sketchCode, overloadedPin, extraPins);
  if (!patchedSketch) return null;

  generatedOps.push(
    makeBoardOp(opCtx, { kind: "update_sketch", payload: { code: patchedSketch } }),
  );
  board.sketchCode = patchedSketch;

  return {
    ops: generatedOps,
    note: `Auto-fix applied: redistributed LED load from D${overloadedPin} across pins ${assignedPins.map((p) => `D${p}`).join(", ")} and patched sketch writes accordingly.`,
  };
}

function patchSketchForSplitPins(
  sketchCode: string,
  sourcePin: number,
  extraPins: number[],
): string | null {
  if (!sketchCode.trim() || extraPins.length === 0) return null;

  let patched = sketchCode;
  let changed = false;
  const sourcePinLiteral = String(sourcePin);

  const constMatch = new RegExp(
    `const\\s+int\\s+(\\w+)\\s*=\\s*${sourcePinLiteral}\\s*;`,
  ).exec(sketchCode);
  if (constMatch) {
    const baseVar = constMatch[1]!;
    const decl = extraPins
      .map((pin, idx) => `const int ${baseVar}_${idx + 2} = ${pin};`)
      .join("\n");
    patched = patched.replace(constMatch[0], `${constMatch[0]}\n${decl}`);
    changed = true;

    const pinModeRe = new RegExp(
      `pinMode\\s*\\(\\s*${baseVar}\\s*,\\s*OUTPUT\\s*\\)\\s*;`,
    );
    patched = patched.replace(pinModeRe, (m) => {
      const extra = extraPins
        .map((_, idx) => `  pinMode(${baseVar}_${idx + 2}, OUTPUT);`)
        .join("\n");
      return `${m}\n${extra}`;
    });

    for (const level of ["HIGH", "LOW"] as const) {
      const re = new RegExp(
        `digitalWrite\\s*\\(\\s*${baseVar}\\s*,\\s*${level}\\s*\\)\\s*;`,
        "g",
      );
      patched = patched.replace(re, () => {
        const lines = [
          `digitalWrite(${baseVar}, ${level});`,
          ...extraPins.map(
            (_, idx) => `digitalWrite(${baseVar}_${idx + 2}, ${level});`,
          ),
        ];
        return lines.join("\n  ");
      });
    }
    return changed ? patched : null;
  }

  const pinModeRe = new RegExp(
    `pinMode\\s*\\(\\s*${sourcePinLiteral}\\s*,\\s*OUTPUT\\s*\\)\\s*;`,
  );
  if (pinModeRe.test(patched)) {
    patched = patched.replace(pinModeRe, (m) => {
      const extra = extraPins
        .map((pin) => `  pinMode(${pin}, OUTPUT);`)
        .join("\n");
      return `${m}\n${extra}`;
    });
    changed = true;
  }

  for (const level of ["HIGH", "LOW"] as const) {
    const re = new RegExp(
      `digitalWrite\\s*\\(\\s*${sourcePinLiteral}\\s*,\\s*${level}\\s*\\)\\s*;`,
      "g",
    );
    if (re.test(patched)) {
      patched = patched.replace(re, () => {
        const lines = [
          `digitalWrite(${sourcePinLiteral}, ${level});`,
          ...extraPins.map((pin) => `digitalWrite(${pin}, ${level});`),
        ];
        return lines.join("\n  ");
      });
      changed = true;
    }
  }

  return changed ? patched : null;
}

// ── Main Engine ──────────────────────────────────────────────────────────

const MAX_AUTO_FIX_PASSES = 2;

/**
 * Run all policies against the working board state. Attempts auto-remediation
 * for fixable violations (up to MAX_AUTO_FIX_PASSES). Returns aggregated
 * result including any remediation ops that should be appended.
 */
export function runPolicies(params: {
  workingBoard: BoardState;
  proposedOps: BoardOp[];
  opCtx: OpContext;
}): PolicyResult {
  const { workingBoard, proposedOps, opCtx } = params;
  const allRemediations: PolicyRemediationOp[] = [];

  if (proposedOps.length === 0) {
    return { violations: [], remediations: [], blocked: false };
  }

  // Iterative remediation passes
  for (let pass = 0; pass < MAX_AUTO_FIX_PASSES; pass++) {
    let changed = false;

    const fanoutFix = tryRemediateFanout(workingBoard, opCtx);
    if (fanoutFix) {
      allRemediations.push(fanoutFix);
      changed = true;
    }

    const powerResult = checkPowerBudget(workingBoard);
    const powerErrors = powerResult.violations.filter((v) => v.severity === "error");

    const ledFix = tryRemediateLedOvercurrent(workingBoard, opCtx, powerErrors);
    if (ledFix) {
      allRemediations.push(ledFix);
      changed = true;
    }

    if (!changed) break;
  }

  // Final check after all remediation attempts
  const finalPower = checkPowerBudget(workingBoard);
  const finalRouting = checkRoutingPolicy(workingBoard);
  const allViolations = [...finalPower.violations, ...finalRouting];
  const errors = allViolations.filter((v) => v.severity === "error");

  if (errors.length > 0) {
    const topErrors = errors.slice(0, 4).map((v) => `- ${v.message}`).join("\n");
    const recs = finalPower.recommendations
      .slice(0, 3)
      .map((r) => `- ${r.message}`)
      .join("\n");

    return {
      violations: allViolations,
      remediations: allRemediations,
      blocked: true,
      blockReason: [
        "I couldn't apply this change because it violates electrical safety constraints.",
        "",
        "Top issues:",
        topErrors || "- Unknown electrical error.",
        "",
        "Recommended fix:",
        recs ||
          "- Use one Arduino lead per net, distribute with breadboard rails, and power high-current loads externally.",
      ].join("\n"),
    };
  }

  return {
    violations: allViolations,
    remediations: allRemediations,
    blocked: false,
  };
}
