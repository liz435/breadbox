import { tool } from "ai";
import { z } from "zod";
import { makeBoardOp } from "../../make-op";
import { validateSketch } from "../../../utils/sketch-validator";
import type { ToolContext, SketchState, ToolMode } from "./shared";

export function createSketchTools(
  ctx: ToolContext,
  sketchState: SketchState,
  mode: ToolMode,
) {
  const { workingBoard, ops, opCtx } = ctx;

  return {
    update_sketch: tool({
      description: "Replace the full Arduino sketch. For small edits, use patch_sketch. Code is validated before accepting.",
      inputSchema: z.object({
        code: z.string(),
      }),
      execute: async (input) => {
        if (sketchState.recoveryAbandoned) {
          return {
            error: "Sketch recovery is already abandoned for this run. Do not retry update_sketch.",
            blocked: true,
            abandoned: true,
            failureKind: "sketch_fix_attempt_limit",
            nextStep: "STOP retrying sketch fixes in this run. Explain the transpiler limitation and ask for a simpler/manual sketch.",
          };
        }
        const check = validateSketch(input.code);
        if (!check.valid) {
          const failureClass = sketchState.noteFailureClass(check);
          sketchState.fixValidationFailures += 1;
          if (
            sketchState.fixValidationFailures >= sketchState.maxFixFailures ||
            sketchState.consecutiveSameFailureClass >= sketchState.maxConsecutiveSameFailures
          ) {
            sketchState.recoveryAbandoned = true;
            sketchState.recoveryRequiredInBuild = mode === "build";
            return {
              error: `Sketch fix attempt budget exceeded (${sketchState.maxFixFailures}). Last error: ${sketchState.formatError(check)}.`,
              blocked: true,
              abandoned: true,
              failureKind: "sketch_fix_attempt_limit",
              limiter: `repeated_${failureClass}`,
              nextStep: "STOP trying to fix the sketch. Explain to the user what went wrong and what they can try manually.",
            };
          }
          return {
            error: `Sketch has errors: ${sketchState.formatError(check)}. Fix the code and retry.`,
            failureKind: "sketch_validation",
            attemptsRemaining: sketchState.maxFixFailures - sketchState.fixValidationFailures,
          };
        }
        sketchState.clearTracking();
        sketchState.recoveryRequiredInBuild = false;
        sketchState.recoveryAbandoned = false;
        ops.push(makeBoardOp(opCtx, { kind: "update_sketch", payload: { code: input.code } }));
        workingBoard.sketchCode = input.code;
        return { updated: true, codeLength: input.code.length };
      },
    }),

    patch_sketch: tool({
      description: "Edit a line range of the sketch.",
      inputSchema: z.object({
        startLine: z.number().int().min(1).describe("First line (1-based)"),
        endLine: z.number().int().min(1).describe("Last line (inclusive)"),
        newCode: z.string(),
      }),
      execute: async (input) => {
        if (sketchState.recoveryAbandoned) {
          return {
            error: "Sketch recovery is already abandoned for this run. Do not retry patch_sketch.",
            blocked: true,
            abandoned: true,
            failureKind: "sketch_fix_attempt_limit",
            nextStep: "STOP retrying sketch fixes in this run. Explain the transpiler limitation and ask for a simpler/manual sketch.",
          };
        }
        const currentCode = workingBoard.sketchCode ?? "";
        const lines = currentCode.split("\n");

        if (input.startLine > lines.length + 1) {
          return { error: `Start line ${input.startLine} is beyond end of file (${lines.length} lines).` };
        }

        const before = lines.slice(0, input.startLine - 1);
        const after = lines.slice(input.endLine);
        const patched = [...before, input.newCode, ...after].join("\n");

        const check = validateSketch(patched);
        if (!check.valid) {
          const failureClass = sketchState.noteFailureClass(check);
          sketchState.fixValidationFailures += 1;
          if (
            sketchState.fixValidationFailures >= sketchState.maxFixFailures ||
            sketchState.consecutiveSameFailureClass >= sketchState.maxConsecutiveSameFailures
          ) {
            sketchState.recoveryAbandoned = true;
            sketchState.recoveryRequiredInBuild = mode === "build";
            return {
              error: `Sketch fix attempt budget exceeded (${sketchState.maxFixFailures}). Last error: ${sketchState.formatError(check)}.`,
              blocked: true,
              abandoned: true,
              failureKind: "sketch_fix_attempt_limit",
              limiter: `repeated_${failureClass}`,
              nextStep: "STOP trying to fix the sketch. Explain to the user what went wrong and what they can try manually.",
            };
          }
          return {
            error: `Patched sketch has errors: ${sketchState.formatError(check)}. Fix and retry.`,
            failureKind: "sketch_validation",
            attemptsRemaining: sketchState.maxFixFailures - sketchState.fixValidationFailures,
          };
        }

        sketchState.clearTracking();
        sketchState.recoveryRequiredInBuild = false;
        sketchState.recoveryAbandoned = false;
        ops.push(makeBoardOp(opCtx, { kind: "update_sketch", payload: { code: patched } }));
        workingBoard.sketchCode = patched;

        return {
          updated: true,
          linesReplaced: input.endLine - input.startLine + 1,
          newCodeLength: patched.length,
        };
      },
    }),
  } as const;
}
