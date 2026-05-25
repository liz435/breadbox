import { tool } from "ai";
import {
  circuitProgramSchema,
  circuitProgramTemplateSchema,
  compileCircuitProgram,
  generateCircuitProgram,
  validateCircuitProgram,
} from "@dreamer/schemas";
import type { ToolContext } from "./shared";

export function createCircuitProgramTools(ctx: ToolContext) {
  const { commitBoardState, buildBoardStateFromDiagram } = ctx;

  return {
    generate_circuit_program: tool({
      description: `Generate a canonical CircuitProgram v1 from a higher-level circuit plan. Use this when you know the modules, pin roles, and sketch intent, but want the tool to fill in nets, semantic labels, edit handles, default component profiles, example references, and runtime behavior contracts.

Pass the plan body directly. If program.nets is omitted, the tool derives nets by grouping module pins that share the same pinIntent.net string.

This does NOT mutate the board. It returns { program } for the next validate/compile/apply step.`,
      inputSchema: circuitProgramTemplateSchema,
      execute: async (input) => {
        const program = generateCircuitProgram(input);
        return {
          ok: true,
          program,
          moduleCount: program.program.modules.length,
          netCount: program.program.nets.length,
          behaviorCount: program.profiles.behaviors.length,
        };
      },
    }),

    validate_circuit_program: tool({
      description: `Validate a CircuitProgram v1 without mutating the board. Checks module references, pin names, Arduino pin tokens, net membership, and behavior/runtime constraints such as analog-capable pins, PWM-capable pins, Servo.h guidance, and WS2812 library guidance.

Pass the full CircuitProgram body directly. Returns { ok, errors[], warnings[], normalizedProgram }.`,
      inputSchema: circuitProgramSchema,
      execute: async (input) => {
        const result = validateCircuitProgram(input);
        return {
          ok: result.ok,
          errorCount: result.errors.length,
          warningCount: result.warnings.length,
          errors: result.errors,
          warnings: result.warnings,
          normalizedProgram: result.program,
        };
      },
    }),

    compile_circuit_program: tool({
      description: `Compile a CircuitProgram v1 into a DreamerDiagram plus runtime behavior contracts, without mutating the board. Use this to inspect the exact compiled board layout and wiring before applying.

Returns { ok, diagram, runtimeContracts, errors[], warnings[] }.`,
      inputSchema: circuitProgramSchema,
      execute: async (input) => {
        const result = compileCircuitProgram(input);
        return {
          ok: result.ok,
          diagram: result.diagram,
          runtimeContracts: result.runtimeContracts ?? [],
          errors: result.errors,
          warnings: result.warnings,
        };
      },
    }),

    apply_circuit_program: tool({
      description: `Build a circuit from a CircuitProgram v1. This is the CircuitProgram-first whole-board path.

Workflow inside the tool:
1. validate the CircuitProgram
2. compile it to a DreamerDiagram
3. run the same diagram import + sketch validation gate used by apply_design
4. replace the board atomically with one load_board op

Use this for new builds or full rebuilds. For explicit pasted DreamerDiagram payloads, use apply_design instead. For small edits on an existing board, prefer propose_fix or the granular CRUD tools.`,
      inputSchema: circuitProgramSchema,
      execute: async (input) => {
        const compiled = compileCircuitProgram(input);
        if (!compiled.ok || !compiled.diagram) {
          return {
            ok: false,
            error: "CircuitProgram compilation failed",
            errors: compiled.errors,
            warnings: compiled.warnings,
          };
        }

        const prepared = buildBoardStateFromDiagram(compiled.diagram);
        if (!prepared.ok) return prepared.error;

        return {
          ...commitBoardState(prepared.boardState),
          runtimeContracts: compiled.runtimeContracts ?? [],
          compileWarnings: compiled.warnings,
        };
      },
    }),
  } as const;
}
