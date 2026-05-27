import type { ProjectFile } from "../../../db/schemas";
import type { BoardOp, BoardState, DreamerDiagramInput } from "@dreamer/schemas";
import {
  createDefaultBoardState,
  diagramToBoardState,
  withDiagramSchemaVersion,
} from "@dreamer/schemas";
import { boardTracker } from "../../../db/board-state-tracker";
import { makeBoardOp } from "../../make-op";
import { validateSketch } from "../../../utils/sketch-validator";
import {
  BUILD_MODE_TOOLS,
  EDIT_MODE_TOOLS,
  createSketchState,
  syncWorkingBoard,
} from "./shared";
import type { ToolContext, ToolMode } from "./shared";
import { createReadTools } from "./read-tools";
import { createCircuitProgramTools } from "./circuit-program-tools";
import { createComponentTools } from "./component-tools";
import { createWireTools } from "./wire-tools";
import { createSketchTools } from "./sketch-tools";
import { createDesignTools } from "./design-tools";
import { createProposeTools } from "./propose-tools";
import { createVerifyTools } from "./verify-tools";

// Re-exports preserve the public API of the old `./tools` module so callers
// (agent.ts, router.ts, tests) keep importing from the same path.
export { summarizeBoardState } from "./shared";
export type { ToolMode } from "./shared";

export function createCoreTools(params: {
  project: ProjectFile;
  sceneId: string;
  ops: BoardOp[];
  mode?: ToolMode;
  /**
   * Pre-existing mutable working board. If omitted, a fresh clone is made
   * from the project + tracker.
   */
  workingBoard?: BoardState;
}) {
  const { project, sceneId, ops, mode = "all" } = params;
  const projectId = project.project.id;
  const expectedVersion = project.project.version;
  const opCtx = { projectId, sceneId, expectedVersion };

  // Working copy: prefer the one passed in (shared with delegation), else the
  // live tracker, else fall back to the project file.
  const trackedBoard = boardTracker.get(projectId);
  const workingBoard: BoardState = params.workingBoard ?? structuredClone(
    trackedBoard ?? project.boardState ?? createDefaultBoardState()
  );

  // commitBoardState and buildBoardStateFromDiagram close over the local
  // ops/opCtx/workingBoard so groups (apply_design, apply_circuit_program)
  // can mutate the same shared state without re-implementing the plumbing.
  function commitBoardState(target: BoardState): Record<string, unknown> {
    ops.push(
      makeBoardOp(opCtx, {
        kind: "load_board",
        payload: { state: target },
      }),
    );
    syncWorkingBoard(workingBoard, target);
    return {
      ok: true,
      componentCount: Object.keys(target.components).length,
      wireCount: Object.keys(target.wires).length,
      sketchBytes: target.sketchCode.length,
      boardTarget: target.boardTarget,
      customLibraries: Object.keys(target.customLibraries).length,
      obstacleCount: Object.keys(target.environment.obstacles).length,
      boundaryEnabled: target.environment.boundaryEnabled,
    };
  }

  function buildBoardStateFromDiagram(
    input: DreamerDiagramInput | Omit<DreamerDiagramInput, "$schema">,
  ): { ok: true; boardState: BoardState } | { ok: false; error: Record<string, unknown> } {
    const result = diagramToBoardState(withDiagramSchemaVersion(input));
    if (!result.ok) {
      return {
        ok: false,
        error: {
          error: "Diagram validation failed",
          issues: result.errors.map((entry) => ({
            path: entry.path,
            message: entry.message,
            suggestion: entry.suggestion,
          })),
        },
      };
    }

    if (result.boardState.sketchCode) {
      const check = validateSketch(result.boardState.sketchCode);
      if (!check.valid) {
        return {
          ok: false,
          error: {
            error: `Sketch validation failed: ${check.error}${check.line ? ` (line ${check.line})` : ""}`,
          },
        };
      }
    }

    return { ok: true, boardState: result.boardState };
  }

  const ctx: ToolContext = {
    project,
    workingBoard,
    ops,
    opCtx,
    commitBoardState,
    buildBoardStateFromDiagram,
  };

  const sketchState = createSketchState();

  const allTools = {
    ...createReadTools(ctx),
    ...createCircuitProgramTools(ctx),
    ...createComponentTools(ctx),
    ...createWireTools(ctx),
    ...createSketchTools(ctx, sketchState, mode),
    ...createDesignTools(ctx),
    ...createProposeTools(ctx, sketchState, mode),
    ...createVerifyTools(ctx),
  } as const;

  let filteredTools: typeof allTools;
  if (mode === "build") {
    filteredTools = Object.fromEntries(
      Object.entries(allTools).filter(([name]) => BUILD_MODE_TOOLS.has(name)),
    ) as typeof allTools;
  } else if (mode === "edit") {
    filteredTools = Object.fromEntries(
      Object.entries(allTools).filter(([name]) => EDIT_MODE_TOOLS.has(name)),
    ) as typeof allTools;
  } else {
    filteredTools = allTools;
  }

  return {
    tools: filteredTools,
    /** Check after tool loop: true if sketch recovery was exhausted and the agent should abandon. */
    isSketchRecoveryAbandoned: () => sketchState.recoveryAbandoned,
  };
}
