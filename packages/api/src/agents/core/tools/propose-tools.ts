import { tool } from "ai";
import { z } from "zod";
import type { BoardOp } from "@dreamer/schemas";
import { isBoardComponentType } from "@dreamer/schemas";
import { makeBoardOp } from "../../make-op";
import { analyzePowerBudget } from "../../../electrical/power-budget-analyzer";
import { analyzeRoutingPolicy } from "../../../electrical/routing-policy";
import { validateSketch } from "../../../utils/sketch-validator";
import { formatSuggestion, type IdCandidate } from "./id-resolver";
import type { ToolContext, SketchState, ToolMode, PinRole } from "./shared";
import {
  ALL_COMPONENT_TYPES,
  PIN_ROLE_VALUES,
  getComponentPinNames,
  isGroundPin,
  isPowerPin,
  isSignalPin,
  isSignalRole,
  resolveComponentPinTarget,
} from "./shared";

const MAX_PROPOSE_FIX_ATTEMPTS = 5;
// v1.5.1: code-enforced cap mirroring the prompt's "max 3 attempts/turn"
// rule. Pre-1.5.1 the rule was advisory and Haiku ignored it in retry
// spirals; the bug was 8+ propose_circuit calls in one turn stacking
// components until "board too constrained" errors.
const MAX_PROPOSE_CIRCUIT_ATTEMPTS = 3;

export function createProposeTools(
  ctx: ToolContext,
  sketchState: SketchState,
  mode: ToolMode,
) {
  const { workingBoard, ops, opCtx } = ctx;

  let proposeFixAttempts = 0;
  let proposeCircuitAttempts = 0;

  return {
    // ── Plan-then-execute: propose_circuit ────────────────────────
    //
    // The model describes WHAT it wants (component types + wire connections).
    // The tool handles HOW (positioning, ID generation, validation, wiring).
    // No UUIDs, no grid coordinates — eliminates hallucination.

    propose_circuit: tool({
      description: `Build an entire circuit in one call. Describe components and wires — the tool handles positioning, IDs, and validation automatically.

Components: list type + name + properties. They'll be auto-positioned on the breadboard.
  - Each component MUST include pinRoles for every logical pin it exposes.
Wires: reference components by their INDEX in the components array (0, 1, 2...).
  - Every wire MUST specify a logical target pin via "toPin" (e.g. anode/cathode, a/b, signal/vcc/gnd).
  - For LED circuits: pair each LED with a resistor — the tool wires LED→resistor→GND correctly.
Sketch: provide full Arduino sketch code.

Example — LED blink:
  components: [{type:"led", name:"LED"}, {type:"resistor", name:"R1", properties:{resistance:220}}]
  wires: [{arduinoPin:13, toComponent:0, toPin:"anode"}]
  ledResistorPairs: [{ledIndex:0, resistorIndex:1}]
  sketch: "void setup(){...}"`,

      inputSchema: z.object({
        components: z.array(z.object({
          type: z.enum(ALL_COMPONENT_TYPES),
          name: z.string(),
          properties: z.record(z.string(), z.unknown()).optional(),
          pinRoles: z.record(z.string(), z.enum(PIN_ROLE_VALUES))
            .describe("Required: role for every logical pin on this component. Roles: signal/signal_input/signal_output/reference_ground/reference_power/ground_or_supply/passive_series."),
        })).describe("Components to place. Referenced by array index in wires."),

        wires: z.array(z.object({
          arduinoPin: z.number().describe("Arduino pin number (D0-D13=0-13, A0-A5=14-19, 5V=-1, GND=-3)"),
          toComponent: z.number().int().min(0).describe("Index into components array"),
          toPin: z.string().describe("Logical target pin on that component (required)."),
          color: z.string().optional(),
          pinOffset: z.number().int().optional().describe("Deprecated fallback offset. Prefer toPin."),
          // Series routing: route signal through an intermediate component (e.g., resistor)
          throughComponent: z.number().int().min(0).optional()
            .describe("Index of intermediate component to route through (e.g., a series resistor between Arduino pin and target)"),
          throughEntryPin: z.string().optional()
            .describe("Pin on the intermediate component where signal enters (e.g., 'b' for resistor right side)"),
          throughExitPin: z.string().optional()
            .describe("Pin on the intermediate component where signal exits toward the target (e.g., 'a' for resistor left side)"),
        })).describe("Wires from Arduino pins to components. Use throughComponent for series routing (e.g., resistor in series with a display segment)."),

        ledResistorPairs: z.array(z.object({
          ledIndex: z.number().int().min(0).describe("Index of LED in components array"),
          resistorIndex: z.number().int().min(0).describe("Index of its series resistor"),
        })).optional().describe("LED+resistor pairs — tool auto-wires cathode→resistor→GND"),

        sketch: z.string().optional().describe("Complete Arduino sketch code"),
      }),

      execute: async (input) => {
        const workingBoardSnapshot = structuredClone(workingBoard);
        function restoreWorkingBoardSnapshot() {
          workingBoard.components = structuredClone(workingBoardSnapshot.components);
          workingBoard.wires = structuredClone(workingBoardSnapshot.wires);
          workingBoard.libraryState = structuredClone(workingBoardSnapshot.libraryState);
          workingBoard.serialOutput = structuredClone(workingBoardSnapshot.serialOutput);
          workingBoard.sketchCode = workingBoardSnapshot.sketchCode;
          workingBoard.customLibraries = structuredClone(workingBoardSnapshot.customLibraries);
          workingBoard.boardTarget = workingBoardSnapshot.boardTarget;
        }

        if (mode === "build" && sketchState.recoveryAbandoned) {
          return {
            success: false,
            blocked: true,
            abandoned: true,
            failureKind: "sketch_fix_attempt_limit",
            errors: [
              "Sketch recovery is exhausted for this run. Do not retry propose_circuit with new sketch variants in this turn.",
            ],
            nextStep: "Stop retrying. Ask user to simplify the sketch or provide a transpiler-safe version.",
          };
        }
        if (mode === "build" && sketchState.recoveryRequiredInBuild) {
          return {
            success: false,
            blocked: true,
            failureKind: "sketch_recovery_required",
            errors: [
              "Build is paused on sketch recovery. Use update_sketch or patch_sketch to submit a valid sketch before calling propose_circuit again.",
            ],
          };
        }

        // v1.5.1: code-enforced attempt budget. Counts every call (success
        // or fail) so a turn with 3 successful builds also stops here —
        // the user shouldn't see 4+ propose_circuit invocations in one turn
        // regardless of outcome.
        proposeCircuitAttempts += 1;
        if (proposeCircuitAttempts > MAX_PROPOSE_CIRCUIT_ATTEMPTS) {
          return {
            success: false,
            blocked: true,
            abandoned: true,
            failureKind: "attempt_limit",
            errors: [
              `propose_circuit attempt budget exhausted (${MAX_PROPOSE_CIRCUIT_ATTEMPTS} this turn). Stop retrying and report the blocking issue to the user. For incremental fixes on a populated board use propose_fix; for sketch-only changes use update_sketch.`,
            ],
            nextStep: "Stop and report. Do not call propose_circuit again this turn.",
          };
        }

        // v1.5.1: refuse propose_circuit on a non-empty board. propose_circuit
        // auto-positions new parts AFTER existing components (see the
        // estimatedNextRow loop below), so calling it on a populated board
        // stacks parts rather than replacing — which is what produced the
        // "board too constrained" retry-loop bug. propose_fix is the right
        // tool for additive changes on any board state.
        // `isBoardComponentType` excludes Arduino + breadboard/perfboard
        // surfaces (those are always present); we only count user-placed parts.
        const existingNonBoardComponents = Object.values(workingBoard.components)
          .filter((c) => !isBoardComponentType(c.type)).length;
        if (existingNonBoardComponents > 0) {
          return {
            success: false,
            blocked: true,
            failureKind: "board_not_empty",
            errors: [
              `propose_circuit is for empty-board builds. Board currently has ${existingNonBoardComponents} component(s). Use propose_fix to add wires, fix pin assignments, or update the sketch — it accepts the same addComponents/addWires/sketch shape and the remove/move ops just skip when not used.`,
            ],
            nextStep: "Switch to propose_fix. It works on populated boards (and empty ones).",
          };
        }

        const errors: string[] = [];

        // Validate component pinRoles coverage and basic role semantics.
        for (let i = 0; i < input.components.length; i++) {
          const comp = input.components[i]!;
          const allowedPins = getComponentPinNames(comp.type);
          const roleKeys = Object.keys(comp.pinRoles ?? {});
          const missing = allowedPins.filter((p) => !(p in comp.pinRoles));
          const extras = roleKeys.filter((k) => !allowedPins.includes(k));
          if (missing.length > 0) {
            errors.push(
              `Component ${i} (${comp.type}) is missing pinRoles for: ${missing.join(", ")}.`,
            );
          }
          if (extras.length > 0) {
            errors.push(
              `Component ${i} (${comp.type}) has invalid pinRoles keys: ${extras.join(", ")}.`,
            );
          }

          if (comp.type === "button") {
            const aRole = comp.pinRoles.a as PinRole | undefined;
            const bRole = comp.pinRoles.b as PinRole | undefined;
            const aSignal = !!aRole && isSignalRole(aRole);
            const bSignal = !!bRole && isSignalRole(bRole);
            const aRef = aRole === "reference_ground" || aRole === "reference_power";
            const bRef = bRole === "reference_ground" || bRole === "reference_power";
            if (!((aSignal && bRef) || (bSignal && aRef))) {
              errors.push(
                `Component ${i} (button) pinRoles invalid: one side must be signal and the opposite side must be reference_ground/reference_power.`,
              );
            }
          }

        }

        // Validate indices
        const usedTargetPins = new Set<string>();
        for (const wire of input.wires) {
          if (wire.toComponent >= input.components.length) {
            errors.push(`Wire references component index ${wire.toComponent} but only ${input.components.length} components defined.`);
            continue;
          }
          const compType = input.components[wire.toComponent]?.type;
          const allowedPins = getComponentPinNames(compType);
          if (allowedPins.length === 0) {
            errors.push(`Component ${wire.toComponent} (${compType}) does not expose logical pins for toPin wiring.`);
            continue;
          }
          if (!wire.toPin) {
            errors.push(`Wire to component ${wire.toComponent} is missing toPin. Use explicit logical pins.`);
            continue;
          }
          if (!allowedPins.includes(wire.toPin)) {
            errors.push(`Invalid toPin "${wire.toPin}" for component ${wire.toComponent} (${compType}). Allowed: ${allowedPins.join(", ")}`);
            continue;
          }
          const targetRole = input.components[wire.toComponent]?.pinRoles?.[wire.toPin] as PinRole | undefined;
          if (!targetRole) {
            errors.push(`Wire target ${wire.toComponent}.${wire.toPin} is missing pinRoles metadata.`);
            continue;
          }
          if (targetRole === "reference_ground" && !isGroundPin(wire.arduinoPin)) {
            errors.push(`Wire to ${wire.toComponent}.${wire.toPin} expects ground reference but got pin ${wire.arduinoPin}.`);
          }
          if (targetRole === "reference_power" && !isPowerPin(wire.arduinoPin)) {
            errors.push(`Wire to ${wire.toComponent}.${wire.toPin} expects power reference but got pin ${wire.arduinoPin}.`);
          }
          if (targetRole === "ground_or_supply" && !isGroundPin(wire.arduinoPin) && !isPowerPin(wire.arduinoPin)) {
            errors.push(`Wire to ${wire.toComponent}.${wire.toPin} expects ground/power reference but got signal pin ${wire.arduinoPin}.`);
          }
          if (isSignalRole(targetRole) && !isSignalPin(wire.arduinoPin)) {
            errors.push(`Wire to ${wire.toComponent}.${wire.toPin} expects signal pin but got reference pin ${wire.arduinoPin}.`);
          }
          const pinKey = `${wire.toComponent}:${wire.toPin}`;
          if (usedTargetPins.has(pinKey)) {
            errors.push(`Duplicate pin target ${pinKey}. Each logical component pin can only be connected once in propose_circuit.`);
          } else {
            usedTargetPins.add(pinKey);
          }

          // Validate throughComponent (series routing)
          if (wire.throughComponent !== undefined) {
            if (wire.throughComponent >= input.components.length) {
              errors.push(`Wire throughComponent index ${wire.throughComponent} out of range.`);
            } else {
              const throughType = input.components[wire.throughComponent]?.type;
              const throughPins = getComponentPinNames(throughType);
              if (!wire.throughEntryPin || !wire.throughExitPin) {
                errors.push(`Wire with throughComponent ${wire.throughComponent} must specify both throughEntryPin and throughExitPin.`);
              } else {
                if (!throughPins.includes(wire.throughEntryPin)) {
                  errors.push(`Invalid throughEntryPin "${wire.throughEntryPin}" for component ${wire.throughComponent} (${throughType}). Allowed: ${throughPins.join(", ")}`);
                }
                if (!throughPins.includes(wire.throughExitPin)) {
                  errors.push(`Invalid throughExitPin "${wire.throughExitPin}" for component ${wire.throughComponent} (${throughType}). Allowed: ${throughPins.join(", ")}`);
                }
              }
            }
          }
        }
        for (const pair of input.ledResistorPairs ?? []) {
          if (pair.ledIndex >= input.components.length) errors.push(`ledResistorPair references LED index ${pair.ledIndex} — out of range.`);
          if (pair.resistorIndex >= input.components.length) errors.push(`ledResistorPair references resistor index ${pair.resistorIndex} — out of range.`);
          if (input.components[pair.ledIndex]?.type !== "led" && input.components[pair.ledIndex]?.type !== "rgb_led") {
            errors.push(`Component ${pair.ledIndex} is ${input.components[pair.ledIndex]?.type}, not an LED.`);
          }
          if (input.components[pair.resistorIndex]?.type !== "resistor") {
            errors.push(`Component ${pair.resistorIndex} is ${input.components[pair.resistorIndex]?.type}, not a resistor.`);
          }
        }
        if (errors.length > 0) return { success: false, failureKind: "validation", errors };

        // ── Layout feasibility pre-check ────────────────────────
        // Estimate total rows needed before doing expensive sketch
        // validation. This avoids burning tokens on a valid sketch
        // for a circuit that won't fit on the board.
        {
          const MAX_BOARD_ROW = 27;
          const ROW_GAP = 2;
          let estimatedNextRow = 0;
          for (const c of Object.values(workingBoard.components)) {
            if (c.type !== "arduino_uno") estimatedNextRow = Math.max(estimatedNextRow, c.y + 4);
          }
          // Series intermediates (throughComponent) share a row with their target —
          // exclude them from the row estimate to avoid false overflow rejections.
          const seriesIntermediateIndices = new Set(
            input.wires
              .filter(w => w.throughComponent !== undefined)
              .map(w => w.throughComponent as number)
          );
          for (let i = 0; i < input.components.length; i++) {
            if (seriesIntermediateIndices.has(i)) continue;
            const comp = input.components[i];
            estimatedNextRow += componentHeight(comp.type) + ROW_GAP;
          }
          if (estimatedNextRow > MAX_BOARD_ROW + 5) {
            return {
              success: false,
              failureKind: "layout_overflow",
              errors: [
                `Too many components (${input.components.length}) — estimated ${estimatedNextRow} rows needed, but the board only has 30 rows.`,
              ],
              hint: "Reduce the component count. For 7-segment displays, skip individual series resistors — the display's built-in forward voltage drop is usually safe at 5V with the simulator's virtual LEDs.",
            };
          }
        }

        if (input.sketch) {
          const check = validateSketch(input.sketch);
          if (!check.valid) {
            sketchState.noteFailureClass(check);
            if (mode === "build") {
              sketchState.recoveryRequiredInBuild = true;
            }
            return {
              success: false,
              failureKind: "sketch_validation",
              errors: [`Sketch has errors: ${sketchState.formatError(check)}`],
              nextStep:
                mode === "build"
                  ? "Recover sketch first with update_sketch/patch_sketch, then retry propose_circuit."
                  : "Fix sketch and retry.",
            };
          }
        }

        // ── Auto-position components ──
        // Build a working copy for position checks
        const tempBoard = structuredClone(workingBoard);
        const placedComponents: Array<{ id: string; type: string; name: string; row: number; col: number }> = [];
        const pairedResistors = new Set((input.ledResistorPairs ?? []).map(p => p.resistorIndex));
        const pairedLeds = new Set((input.ledResistorPairs ?? []).map(p => p.ledIndex));

        // Build throughComponent mapping: which components are series intermediates,
        // and which target component + pin they connect to.
        // seriesMap: intermediateIndex → { targetIndex, targetPin, entryPin, exitPin }
        const seriesMap = new Map<number, { targetIndex: number; targetPin: string; entryPin: string; exitPin: string }>();
        for (const wire of input.wires) {
          if (wire.throughComponent !== undefined && wire.throughEntryPin && wire.throughExitPin) {
            seriesMap.set(wire.throughComponent, {
              targetIndex: wire.toComponent,
              targetPin: wire.toPin,
              entryPin: wire.throughEntryPin,
              exitPin: wire.throughExitPin,
            });
          }
        }
        // Components that are series intermediates get placed alongside their target, not sequentially
        const seriesIntermediates = new Set(seriesMap.keys());

        let nextRow = 0;
        // Find first open row
        for (const c of Object.values(tempBoard.components)) {
          if (c.type !== "arduino_uno") nextRow = Math.max(nextRow, c.y + 4);
        }

        // Component height in rows
        const ROW_GAP = 2;

        function componentHeight(type: string): number {
          if (type === "led" || type === "rgb_led") return 2;
          if (type === "servo" || type === "potentiometer" || type === "temperature_sensor" || type === "capacitor") return 3;
          if (type === "button") return 2;
          if (type === "resistor") return 1;
          if (type === "seven_segment") return 9;
          if (type === "lcd_16x2") return 12;
          return 1;
        }

        // Default column for component types.
        // Resistors and buttons use fixed columns matching the registry footprint.
        // Wide components (seven_segment, lcd) go on the right strip so series
        // resistors (always cols 3/6) don't visually overlap the component body.
        function componentCol(type: string): number {
          if (type === "button") return 3; // straddles gap at cols 3/6
          if (type === "resistor") return 3; // straddles gap at cols 3/6
          if (type === "seven_segment" || type === "lcd_16x2") return 5; // right strip — avoids overlap with resistors
          return 2; // left strip
        }

        // Default pin map (all null)
        function defaultPins(type: string): Record<string, null> {
          const names = getComponentPinNames(type);
          const result: Record<string, null> = {};
          for (const n of names) result[n] = null;
          return result;
        }

        function isSameBreadboardBus(
          a: { row: number; col: number },
          b: { row: number; col: number },
        ): boolean {
          if (a.row !== b.row) return false;
          const aLeft = a.col >= 0 && a.col <= 4;
          const aRight = a.col >= 5 && a.col <= 9;
          const bLeft = b.col >= 0 && b.col <= 4;
          const bRight = b.col >= 5 && b.col <= 9;
          return (aLeft && bLeft) || (aRight && bRight);
        }

        function rowConflictsWithExistingPins(params: {
          candidateType: string;
          candidateX: number;
          candidateY: number;
          candidatePins: string[];
          allowedTargetIndex: number;
        }): boolean {
          const candidatePoints = params.candidatePins
            .map((pin) => resolveComponentPinTarget(
              { type: params.candidateType, x: params.candidateX, y: params.candidateY },
              pin,
            ))
            .filter((p): p is { row: number; col: number } => !!p);

          for (let idx = 0; idx < placedComponents.length; idx++) {
            if (idx === params.allowedTargetIndex) continue;
            const existing = placedComponents[idx];
            if (!existing) continue;

            const pinNames = getComponentPinNames(existing.type);
            for (const pinName of pinNames) {
              const pos = resolveComponentPinTarget(
                { type: existing.type, x: existing.col, y: existing.row },
                pinName,
              );
              if (!pos) continue;
              for (const cp of candidatePoints) {
                if (isSameBreadboardBus(cp, pos)) return true;
              }
            }
          }
          return false;
        }

        for (let i = 0; i < input.components.length; i++) {
          const comp = input.components[i];

          // Skip components that will be positioned alongside their target
          if (pairedResistors.has(i) || seriesIntermediates.has(i)) continue;

          const col = componentCol(comp.type);
          const row = nextRow;
          const id = crypto.randomUUID();

          placedComponents[i] = { id, type: comp.type, name: comp.name, row, col };

          // If this is an LED with a paired resistor, place resistor in cathode row
          if (pairedLeds.has(i)) {
            const pair = (input.ledResistorPairs ?? []).find(p => p.ledIndex === i);
            if (pair) {
              const resComp = input.components[pair.resistorIndex];
              const cathodeRow = row + 1;
              const resId = crypto.randomUUID();
              placedComponents[pair.resistorIndex] = {
                id: resId, type: "resistor", name: resComp.name, row: cathodeRow, col: 3,
              };
              nextRow = cathodeRow + 2;
            }
          } else {
            nextRow = row + componentHeight(comp.type) + ROW_GAP;
          }
        }

        // Place series intermediates alongside their target components.
        // For each intermediate (e.g., resistor), place it on the same row as the
        // target pin it connects to, so the exit pin shares a breadboard bus with
        // the target and no extra jumper wire is needed.
        for (const [intermediateIdx, seriesInfo] of seriesMap.entries()) {
          if (placedComponents[intermediateIdx]) continue; // already placed
          const target = placedComponents[seriesInfo.targetIndex];
          if (!target) continue;

          const comp = input.components[intermediateIdx];
          const targetPinPos = resolveComponentPinTarget(
            { type: target.type, x: target.col, y: target.row },
            seriesInfo.targetPin,
          );

          if (targetPinPos) {
            // Place the intermediate (resistor) on the target pin's row.
            // Resistors always use cols 3/6 regardless of placement col.
            const col = componentCol(comp.type);
            const preferredRow = targetPinPos.row;
            const conflict = rowConflictsWithExistingPins({
              candidateType: comp.type,
              candidateX: col,
              candidateY: preferredRow,
              candidatePins: [seriesInfo.entryPin, seriesInfo.exitPin],
              allowedTargetIndex: seriesInfo.targetIndex,
            });

            if (!conflict) {
              placedComponents[intermediateIdx] = {
                id: crypto.randomUUID(),
                type: comp.type,
                name: comp.name,
                row: preferredRow,
                col,
              };
            } else {
              // Fallback: keep isolation over adjacency to avoid accidental bus shorts
              // (e.g. button side and segment series lead sharing the same strip row).
              placedComponents[intermediateIdx] = {
                id: crypto.randomUUID(),
                type: comp.type,
                name: comp.name,
                row: nextRow,
                col,
              };
              nextRow += componentHeight(comp.type) + ROW_GAP;
            }
          } else {
            // Fallback: place sequentially
            const col = componentCol(comp.type);
            placedComponents[intermediateIdx] = {
              id: crypto.randomUUID(),
              type: comp.type,
              name: comp.name,
              row: nextRow,
              col,
            };
            nextRow += componentHeight(comp.type) + ROW_GAP;
          }
        }

        // Fill in any remaining components that weren't positioned
        for (let i = 0; i < input.components.length; i++) {
          if (placedComponents[i]) continue;
          const comp = input.components[i];
          const col = componentCol(comp.type);
          const id = crypto.randomUUID();
          placedComponents[i] = { id, type: comp.type, name: comp.name, row: nextRow, col };
          nextRow += componentHeight(comp.type) + ROW_GAP;
        }

        // Validate all positions are on board
        for (const pc of placedComponents) {
          if (pc.row > 27) {
            errors.push(`Component "${pc.name}" would be placed at row ${pc.row}, which is near the board edge. Board has 30 rows.`);
          }
        }
        if (errors.length > 0) return { success: false, errors, hint: "Too many components for the board. Try reducing the circuit." };

        // ── Generate ops ──
        const generatedOps: BoardOp[] = [];

        // Place components
        for (let i = 0; i < input.components.length; i++) {
          const comp = input.components[i];
          const pos = placedComponents[i];
          generatedOps.push(makeBoardOp(opCtx, {
            kind: "place_component",
            payload: {
              component: {
                id: pos.id,
                type: comp.type,
                name: comp.name,
                x: pos.col,
                y: pos.row,
                rotation: 0,
                pins: defaultPins(comp.type),
                properties: comp.properties ?? {},
              },
            },
          }));
          // Update working state
          workingBoard.components[pos.id] = {
            id: pos.id, type: comp.type, name: comp.name,
            x: pos.col, y: pos.row, rotation: 0,
            pins: defaultPins(comp.type), properties: comp.properties ?? {},
          } as typeof workingBoard.components[string];
        }

        // Wire Arduino pins to components.
        // For wires with throughComponent (series routing), we generate:
        //   1. Arduino pin → throughComponent.throughEntryPin
        //   2. throughComponent.throughExitPin → toComponent.toPin (if not same bus)
        // For direct wires, we generate: Arduino pin → toComponent.toPin (as before)
        const wiresByPin = new Map<number, Array<{
          target: { row: number; col: number };
          color: string;
        }>>();
        // Extra wires generated by series routing (component-to-component jumpers)
        const seriesJumperOps: BoardOp[] = [];

        for (const wire of input.wires) {
          const color = wire.color ?? "#22c55e";

          if (wire.throughComponent !== undefined && wire.throughEntryPin && wire.throughExitPin) {
            // Series routing: Arduino → throughComponent.entryPin
            const through = placedComponents[wire.throughComponent];

            const resolveBoth = (entryPin: string, exitPin: string) => {
              const ep = resolveComponentPinTarget(
                { type: through.type, x: through.col, y: through.row },
                entryPin,
              );
              const xp = resolveComponentPinTarget(
                { type: through.type, x: through.col, y: through.row },
                exitPin,
              );
              return { ep, xp };
            };

            let { ep: entryPoint, xp: exitPoint } = resolveBoth(
              wire.throughEntryPin,
              wire.throughExitPin,
            );
            if (!entryPoint || !exitPoint) {
              errors.push(`Unable to resolve throughComponent ${wire.throughComponent}.${wire.throughEntryPin}`);
              continue;
            }

            const finalTarget = placedComponents[wire.toComponent];
            const finalPoint = resolveComponentPinTarget(
              { type: finalTarget.type, x: finalTarget.col, y: finalTarget.row },
              wire.toPin,
            );
            if (!finalPoint) {
              errors.push(`Unable to resolve series endpoints for through=${wire.throughComponent}.${wire.throughExitPin} → ${wire.toComponent}.${wire.toPin}`);
              continue;
            }

            // Strip-membership helpers — used twice below.
            const onSameBus = (
              a: { row: number; col: number },
              b: { row: number; col: number },
            ) => {
              if (a.row !== b.row) return false;
              const aLeft = a.col >= 0 && a.col <= 4;
              const aRight = a.col >= 5 && a.col <= 9;
              const bLeft = b.col >= 0 && b.col <= 4;
              const bRight = b.col >= 5 && b.col <= 9;
              return (aLeft && bLeft) || (aRight && bRight);
            };

            // **Resistor-short guard.** If the entry pin's bus already
            // includes the final target (e.g. resistor at row 0 with pin
            // b at col 6 RIGHT strip, target seg.a at col 5 RIGHT strip),
            // wiring Arduino → entry would put the supply on the same
            // net as the load, with the resistor body in parallel to a
            // zero-resistance bus path. The model picked the wrong pin
            // as "entry"; the resistor body is supposed to be the only
            // crossing between the two strips. Swap entry and exit so
            // Arduino enters via the gap-opposite pin and the body
            // becomes the only conductive path. Symptom we're fixing:
            // current bypasses the resistor entirely on 7-seg + per-
            // segment-resistor circuits with throughComponent.
            if (onSameBus(entryPoint, finalPoint)) {
              const swapped = resolveBoth(wire.throughExitPin, wire.throughEntryPin);
              if (swapped.ep && swapped.xp) {
                entryPoint = swapped.ep;
                exitPoint = swapped.xp;
              }
            }

            // Wire Arduino pin to the intermediate's entry pin (post-swap).
            if (!wiresByPin.has(wire.arduinoPin)) wiresByPin.set(wire.arduinoPin, []);
            wiresByPin.get(wire.arduinoPin)!.push({ target: entryPoint, color });

            // If exit and target share a bus, the breadboard does the
            // jumper for us. Otherwise emit an explicit wire.
            if (!onSameBus(exitPoint, finalPoint)) {
              seriesJumperOps.push(makeBoardOp(opCtx, {
                kind: "connect_wire",
                payload: {
                  wire: {
                    id: crypto.randomUUID(),
                    fromRow: exitPoint.row,
                    fromCol: exitPoint.col,
                    toRow: finalPoint.row,
                    toCol: finalPoint.col,
                    color,
                  },
                },
              }));
            }
          } else {
            // Direct wire (no series routing)
            const target = placedComponents[wire.toComponent];
            const to = resolveComponentPinTarget(
              { type: target.type, x: target.col, y: target.row },
              wire.toPin,
            );
            if (!to) {
              errors.push(`Unable to resolve target for component ${wire.toComponent}.${wire.toPin}`);
              continue;
            }
            if (!wiresByPin.has(wire.arduinoPin)) wiresByPin.set(wire.arduinoPin, []);
            wiresByPin.get(wire.arduinoPin)!.push({ target: to, color });
          }
        }

        // Auto-wire LED+resistor pairs: GND → resistor pin B.
        // Feed these through the same per-pin fanout path so ground/power
        // distribution stays normalized (single Arduino lead + rail branches).
        for (const pair of input.ledResistorPairs ?? []) {
          const res = placedComponents[pair.resistorIndex];
          const resistorPinB = resolveComponentPinTarget(
            { type: res.type, x: res.col, y: res.row },
            "b",
          );
          if (!resistorPinB) {
            errors.push(`Unable to resolve resistor pin B for component ${pair.resistorIndex}.`);
            continue;
          }
          if (!wiresByPin.has(-3)) wiresByPin.set(-3, []);
          wiresByPin.get(-3)!.push({ target: resistorPinB, color: "#42a5f5" });
        }

        if (errors.length > 0) return { success: false, failureKind: "validation", errors };

        function railColForPin(pin: number): number {
          if (pin === -3 || pin === -4 || pin === -6) return -1;
          if (pin === -1) return -2;
          if (pin === -2) return 11;
          return -1;
        }

        function sameStrip(a: { row: number; col: number }, b: { row: number; col: number }): boolean {
          if (a.row !== b.row) return false;
          const aLeft = a.col >= 0 && a.col <= 4;
          const aRight = a.col >= 5 && a.col <= 9;
          const bLeft = b.col >= 0 && b.col <= 4;
          const bRight = b.col >= 5 && b.col <= 9;
          return (aLeft && bLeft) || (aRight && bRight);
        }

        function hasEquivalentWire(
          fromRow: number,
          fromCol: number,
          toRow: number,
          toCol: number,
        ): boolean {
          for (const existing of Object.values(workingBoard.wires)) {
            if (
              existing.fromRow === fromRow &&
              existing.fromCol === fromCol &&
              existing.toRow === toRow &&
              existing.toCol === toCol
            ) return true;
          }
          for (const op of generatedOps) {
            if (op.kind !== "connect_wire") continue;
            const w = op.payload.wire;
            if (
              w.fromRow === fromRow &&
              w.fromCol === fromCol &&
              w.toRow === toRow &&
              w.toCol === toCol
            ) return true;
          }
          return false;
        }

        function pushConnectWire(
          fromRow: number,
          fromCol: number,
          toRow: number,
          toCol: number,
          color: string,
        ) {
          if (fromRow === toRow && fromCol === toCol) return;
          if (hasEquivalentWire(fromRow, fromCol, toRow, toCol)) return;
          generatedOps.push(makeBoardOp(opCtx, {
            kind: "connect_wire",
            payload: {
              wire: {
                id: crypto.randomUUID(),
                fromRow,
                fromCol,
                toRow,
                toCol,
                color,
              },
            },
          }));
        }

        function findExistingDirectSource(pin: number): { row: number; col: number } | null {
          const existing = Object.values(workingBoard.wires).find(
            (w) => w.fromRow === -999 && w.fromCol === pin,
          );
          if (!existing) return null;
          return { row: existing.toRow, col: existing.toCol };
        }

        for (const [pin, fanout] of wiresByPin.entries()) {
          if (fanout.length === 0) continue;
          const isPowerOrGround = pin < 0;
          const existingSource = findExistingDirectSource(pin);

          if (existingSource) {
            const anchor = existingSource;
            if (isPowerOrGround && anchor.col === railColForPin(pin)) {
              const railCol = anchor.col;
              for (const branch of fanout) {
                if (branch.target.col === railCol) continue;
                pushConnectWire(branch.target.row, railCol, branch.target.row, branch.target.col, branch.color);
              }
              continue;
            }
            for (const branch of fanout) {
              if (sameStrip(anchor, branch.target)) continue;
              pushConnectWire(anchor.row, anchor.col, branch.target.row, branch.target.col, branch.color);
            }
            continue;
          }

          if (isPowerOrGround) {
            const railCol = railColForPin(pin);
            pushConnectWire(-999, pin, 0, railCol, fanout[0]!.color);

            for (const branch of fanout) {
              if (branch.target.col === railCol) continue;
              pushConnectWire(branch.target.row, railCol, branch.target.row, branch.target.col, branch.color);
            }
            continue;
          }

          if (fanout.length === 1) {
            const only = fanout[0]!;
            pushConnectWire(-999, pin, only.target.row, only.target.col, only.color);
            continue;
          }

          const anchor = {
            row: fanout[0]!.target.row,
            col: fanout[0]!.target.col <= 4 ? 0 : 5,
          };
          pushConnectWire(-999, pin, anchor.row, anchor.col, fanout[0]!.color);

          for (const branch of fanout) {
            if (sameStrip(anchor, branch.target)) continue;
            pushConnectWire(anchor.row, anchor.col, branch.target.row, branch.target.col, branch.color);
          }
        }

        // Append series jumper wires (throughComponent exit → target)
        for (const op of seriesJumperOps) {
          generatedOps.push(op);
        }

        if (errors.length > 0) return { success: false, failureKind: "validation", errors };

        // Write sketch (already validated before placement)
        if (input.sketch) {
          generatedOps.push(makeBoardOp(opCtx, {
            kind: "update_sketch",
            payload: { code: input.sketch },
          }));
          workingBoard.sketchCode = input.sketch;
        }

        // Final safety gate on the fully assembled tentative board.
        // This prevents propose_circuit from "succeeding" with known electrical
        // errors and forces the model to repair before completion.
        {
          const power = analyzePowerBudget(workingBoard);
          const routing = analyzeRoutingPolicy(workingBoard);
          const powerErrors = power.issues
            .filter((issue) => issue.severity === "error")
            .map((issue) => issue.message);
          const routingWarnings = routing.violations.map((v) => v.message);

          if (powerErrors.length > 0) {
            restoreWorkingBoardSnapshot();
            return {
              success: false,
              failureKind: "electrical_validation",
              errors: powerErrors.slice(0, 8),
              warnings: routingWarnings.slice(0, 4),
              nextStep:
                "Repair wiring/power topology (single signal side on buttons, rail distribution, and external supply for high-current loads), then retry propose_circuit.",
            };
          }
        }

        // Push all ops
        for (const op of generatedOps) ops.push(op);

        // Build summary
        const summary = placedComponents.map((pc, i) =>
          `  [${i}] ${pc.name} (${pc.type}) → row=${pc.row} col=${pc.col} id=${pc.id}`
        ).join("\n");

        return {
          success: true,
          componentsPlaced: placedComponents.length,
          wiresCreated: generatedOps.filter((op) => op.kind === "connect_wire").length,
          sketchUpdated: !!input.sketch,
          layout: summary,
        };
      },
    }),

    // ── Plan-then-execute: propose_fix ──────────────────────────────
    //
    // The edit-mode counterpart to propose_circuit. Batches multiple
    // modifications (add/remove/move components, add/remove wires,
    // update sketch) into a single atomic tool call with auto-positioning,
    // validation, and rollback. Max 3 attempts per run.

    propose_fix: tool({
      description: `Modify an existing circuit in one atomic call. Describe ALL changes — the tool handles positioning, IDs, wire resolution, and validation automatically. Rolls back on failure.

Operations:
  - removeWires: wire IDs to delete (runs first to clean up before changes)
  - removeComponents: component IDs to delete (also removes connected wires)
  - addComponents: new components to place (auto-positioned, referenced by index in addWires)
  - moveComponents: relocate existing components by ID
  - addWires: new wires — can target existing components (by ID) or new ones (by addComponents index)
  - sketch: full replacement Arduino sketch code (optional)

Max ${MAX_PROPOSE_FIX_ATTEMPTS} attempts per run. Each failed call counts toward the limit.

Example — add a button + wire to an existing circuit:
  addComponents: [{type:"button", name:"BTN", pinRoles:{a:"signal_input", b:"reference_ground"}}]
  addWires: [{arduinoPin:2, toNewComponent:0, toPin:"a"}, {arduinoPin:-3, toNewComponent:0, toPin:"b"}]

Example — rewire an existing component:
  removeWires: ["old-wire-id"]
  addWires: [{arduinoPin:9, toExistingComponent:"component-uuid", toPin:"signal"}]`,

      // Loose schema — we re-parse strictly inside execute() so Zod failures
      // count toward the attempt budget AND surface detailed error messages
      // to the agent (otherwise the AI SDK rejects silently before execute).
      inputSchema: z.object({
        removeWires: z.array(z.string()).optional()
          .describe("Wire IDs to remove"),
        removeComponents: z.array(z.string()).optional()
          .describe("Component IDs to remove (also removes connected wires)"),
        addComponents: z.array(z.object({
          type: z.string(),
          name: z.string(),
          properties: z.record(z.string(), z.unknown()).optional(),
          pinRoles: z.record(z.string(), z.string())
            .describe(`Required: role per logical pin. Allowed values (EXACT strings): ${PIN_ROLE_VALUES.join(", ")}.`),
        })).optional()
          .describe("New components to place. Referenced by array index in addWires.toNewComponent."),
        moveComponents: z.array(z.object({
          componentId: z.string(),
          x: z.number().int().min(0).max(9).describe("Target column"),
          y: z.number().int().min(0).max(29).describe("Target row"),
        })).optional()
          .describe("Move existing components to new positions"),
        addWires: z.array(z.object({
          arduinoPin: z.number().describe("Arduino pin (D0-D13=0-13, A0-A5=14-19, 5V=-1, GND=-3)"),
          toExistingComponent: z.string().optional()
            .describe("ID of an existing component on the board"),
          toNewComponent: z.number().int().min(0).optional()
            .describe("Index into addComponents array"),
          toPin: z.string().describe("Logical pin on the target component"),
          color: z.string().optional(),
          throughExistingComponent: z.string().optional()
            .describe("ID of existing intermediate component for series routing"),
          throughNewComponent: z.number().int().min(0).optional()
            .describe("Index into addComponents for intermediate component"),
          throughEntryPin: z.string().optional(),
          throughExitPin: z.string().optional(),
        })).optional()
          .describe("New wires. Each must specify either toExistingComponent or toNewComponent."),
        ledResistorPairs: z.array(z.object({
          ledIndex: z.number().int().min(0).describe("Index of LED in addComponents"),
          resistorIndex: z.number().int().min(0).describe("Index of resistor in addComponents"),
        })).optional()
          .describe("LED+resistor pairs among addComponents — auto-wires cathode→resistor→GND"),
        sketch: z.string().optional().describe("Full replacement Arduino sketch code"),
      }),

      execute: async (inputRaw) => {
        // ── Attempt budget (counts EVERY call, including schema failures) ──
        proposeFixAttempts += 1;
        if (proposeFixAttempts > MAX_PROPOSE_FIX_ATTEMPTS) {
          return {
            success: false,
            blocked: true,
            abandoned: true,
            failureKind: "attempt_limit",
            errors: [
              `propose_fix attempt budget exhausted (${MAX_PROPOSE_FIX_ATTEMPTS}). Use granular tools or explain to the user what went wrong.`,
            ],
          };
        }

        // ── Strict schema re-parse ──
        // Catch invalid enums (e.g. pinRoles: "analog_input") here so the
        // agent sees the exact field + allowed values on the next turn.
        const strictSchema = z.object({
          removeWires: z.array(z.string()).optional(),
          removeComponents: z.array(z.string()).optional(),
          addComponents: z.array(z.object({
            type: z.enum(ALL_COMPONENT_TYPES),
            name: z.string(),
            properties: z.record(z.string(), z.unknown()).optional(),
            pinRoles: z.record(z.string(), z.enum(PIN_ROLE_VALUES)),
          })).optional(),
          moveComponents: z.array(z.object({
            componentId: z.string(),
            x: z.number().int().min(0).max(9),
            y: z.number().int().min(0).max(29),
          })).optional(),
          addWires: z.array(z.object({
            arduinoPin: z.number(),
            toExistingComponent: z.string().optional(),
            toNewComponent: z.number().int().min(0).optional(),
            toPin: z.string(),
            color: z.string().optional(),
            throughExistingComponent: z.string().optional(),
            throughNewComponent: z.number().int().min(0).optional(),
            throughEntryPin: z.string().optional(),
            throughExitPin: z.string().optional(),
          })).optional(),
          ledResistorPairs: z.array(z.object({
            ledIndex: z.number().int().min(0),
            resistorIndex: z.number().int().min(0),
          })).optional(),
          sketch: z.string().optional(),
        });
        const parsed = strictSchema.safeParse(inputRaw);
        if (!parsed.success) {
          const zodErrors = parsed.error.issues.slice(0, 5).map((issue) => {
            const path = issue.path.join(".") || "(root)";
            const gotValue = issue.path.reduce<unknown>((acc, seg) => {
              if (acc && typeof acc === "object" && (typeof seg === "string" || typeof seg === "number")) {
                return (acc as Record<string | number, unknown>)[seg];
              }
              return undefined;
            }, inputRaw);
            const got = gotValue === undefined ? "" : ` (got ${JSON.stringify(gotValue)})`;
            return `${path}: ${issue.message}${got}`;
          });
          return {
            success: false,
            failureKind: "schema_validation",
            errors: zodErrors,
            hint:
              `pinRoles must use one of: ${PIN_ROLE_VALUES.join(", ")}. ` +
              `addWires wire shape: { arduinoPin, toExistingComponent or toNewComponent, toPin }.`,
            attemptsRemaining: MAX_PROPOSE_FIX_ATTEMPTS - proposeFixAttempts,
          };
        }
        const input = parsed.data;

        // ── Snapshot for rollback ──
        const snapshot = {
          components: structuredClone(workingBoard.components),
          wires: structuredClone(workingBoard.wires),
          sketchCode: workingBoard.sketchCode,
          libraryState: structuredClone(workingBoard.libraryState),
          serialOutput: structuredClone(workingBoard.serialOutput),
          customLibraries: structuredClone(workingBoard.customLibraries),
          boardTarget: workingBoard.boardTarget,
        };
        const opsStartIndex = ops.length;

        function rollback() {
          workingBoard.components = snapshot.components;
          workingBoard.wires = snapshot.wires;
          workingBoard.sketchCode = snapshot.sketchCode;
          workingBoard.libraryState = snapshot.libraryState;
          workingBoard.serialOutput = snapshot.serialOutput;
          workingBoard.customLibraries = snapshot.customLibraries;
          workingBoard.boardTarget = snapshot.boardTarget;
          ops.length = opsStartIndex;
        }

        const errors: string[] = [];
        const warnings: string[] = [];
        const generatedOps: BoardOp[] = [];

        // ── 1. Remove wires ──
        for (const wireId of input.removeWires ?? []) {
          if (!workingBoard.wires[wireId]) {
            warnings.push(`Wire ${wireId} not found (skipped).`);
            continue;
          }
          generatedOps.push(makeBoardOp(opCtx, { kind: "remove_wire", payload: { wireId } }));
          delete workingBoard.wires[wireId];
        }

        // ── 2. Remove components (+ their connected wires) ──
        for (const componentId of input.removeComponents ?? []) {
          const comp = workingBoard.components[componentId];
          if (!comp) {
            warnings.push(`Component ${componentId} not found (skipped).`);
            continue;
          }
          // Find and remove connected wires
          for (const [wId, w] of Object.entries(workingBoard.wires)) {
            const connectedToComp =
              (w.toRow === comp.y && w.toCol === comp.x) ||
              (w.fromRow === comp.y && w.fromCol === comp.x);
            if (connectedToComp) {
              generatedOps.push(makeBoardOp(opCtx, { kind: "remove_wire", payload: { wireId: wId } }));
              delete workingBoard.wires[wId];
            }
          }
          generatedOps.push(makeBoardOp(opCtx, { kind: "remove_component", payload: { componentId } }));
          delete workingBoard.components[componentId];
        }

        // ── 3. Move components ──
        // Build the candidate list here (before deletions in step 2 affected
        // it, those IDs are already gone). Reused by every move-target lookup.
        const moveCandidates: IdCandidate[] = Object.entries(workingBoard.components).map(
          ([id, c]) => ({ id, name: c.name, type: c.type }),
        );
        for (const move of input.moveComponents ?? []) {
          const comp = workingBoard.components[move.componentId];
          if (!comp) {
            const hint = formatSuggestion(move.componentId, moveCandidates);
            errors.push(`Component ${move.componentId} not found for move.${hint}`);
            continue;
          }
          const overlap = Object.values(workingBoard.components).find(
            (c) => c.type !== "arduino_uno" && c.id !== move.componentId && c.x === move.x && c.y === move.y,
          );
          if (overlap) {
            errors.push(`Move target (row=${move.y}, col=${move.x}) occupied by ${overlap.name}.`);
            continue;
          }
          generatedOps.push(makeBoardOp(opCtx, {
            kind: "move_component",
            payload: { componentId: move.componentId, x: move.x, y: move.y },
          }));
          comp.x = move.x;
          comp.y = move.y;
        }

        if (errors.length > 0) {
          rollback();
          return {
            success: false,
            failureKind: "validation",
            errors,
            attemptsRemaining: MAX_PROPOSE_FIX_ATTEMPTS - proposeFixAttempts,
          };
        }

        // ── 4. Add components (auto-position) ──
        const addedComponents = input.addComponents ?? [];
        const placedNew: Array<{ id: string; type: string; name: string; row: number; col: number }> = [];

        // Validate pinRoles coverage
        for (let i = 0; i < addedComponents.length; i++) {
          const comp = addedComponents[i]!;
          const allowedPins = getComponentPinNames(comp.type);
          const roleKeys = Object.keys(comp.pinRoles ?? {});
          const missing = allowedPins.filter((p) => !(p in comp.pinRoles));
          const extras = roleKeys.filter((k) => !allowedPins.includes(k));
          if (missing.length > 0) {
            errors.push(`addComponents[${i}] (${comp.type}) missing pinRoles for: ${missing.join(", ")}.`);
          }
          if (extras.length > 0) {
            errors.push(`addComponents[${i}] (${comp.type}) invalid pinRoles keys: ${extras.join(", ")}.`);
          }
        }
        if (errors.length > 0) {
          rollback();
          return {
            success: false,
            failureKind: "validation",
            errors,
            attemptsRemaining: MAX_PROPOSE_FIX_ATTEMPTS - proposeFixAttempts,
          };
        }

        // Find next available row
        let nextRow = 0;
        for (const c of Object.values(workingBoard.components)) {
          if (c.type !== "arduino_uno") nextRow = Math.max(nextRow, c.y + 4);
        }

        const ROW_GAP = 2;
        function componentHeight(type: string): number {
          if (type === "led" || type === "rgb_led") return 2;
          if (type === "servo" || type === "potentiometer" || type === "temperature_sensor" || type === "capacitor") return 3;
          if (type === "button") return 2;
          if (type === "resistor") return 1;
          if (type === "seven_segment") return 9;
          if (type === "lcd_16x2") return 12;
          return 1;
        }
        function componentCol(type: string): number {
          if (type === "button") return 3;
          if (type === "resistor") return 3;
          if (type === "seven_segment" || type === "lcd_16x2") return 5;
          return 2;
        }
        function defaultPins(type: string): Record<string, null> {
          const names = getComponentPinNames(type);
          const result: Record<string, null> = {};
          for (const n of names) result[n] = null;
          return result;
        }

        // Identify LED+resistor pairs and series intermediates
        const pairedResistors = new Set((input.ledResistorPairs ?? []).map(p => p.resistorIndex));
        const pairedLeds = new Set((input.ledResistorPairs ?? []).map(p => p.ledIndex));

        // Series map for throughNewComponent wires
        const seriesMap = new Map<number, { targetIndex: number; targetPin: string; entryPin: string; exitPin: string }>();
        for (const wire of input.addWires ?? []) {
          if (wire.throughNewComponent !== undefined && wire.throughEntryPin && wire.throughExitPin && wire.toNewComponent !== undefined) {
            seriesMap.set(wire.throughNewComponent, {
              targetIndex: wire.toNewComponent,
              targetPin: wire.toPin,
              entryPin: wire.throughEntryPin,
              exitPin: wire.throughExitPin,
            });
          }
        }
        const seriesIntermediates = new Set(seriesMap.keys());

        // Place non-series, non-paired components
        for (let i = 0; i < addedComponents.length; i++) {
          if (pairedResistors.has(i) || seriesIntermediates.has(i)) continue;
          const comp = addedComponents[i]!;
          const col = componentCol(comp.type);
          const row = nextRow;
          const id = crypto.randomUUID();
          placedNew[i] = { id, type: comp.type, name: comp.name, row, col };

          if (pairedLeds.has(i)) {
            const pair = (input.ledResistorPairs ?? []).find(p => p.ledIndex === i);
            if (pair) {
              const resComp = addedComponents[pair.resistorIndex]!;
              const cathodeRow = row + 1;
              const resId = crypto.randomUUID();
              placedNew[pair.resistorIndex] = { id: resId, type: "resistor", name: resComp.name, row: cathodeRow, col: 3 };
              nextRow = cathodeRow + 2;
            }
          } else {
            nextRow = row + componentHeight(comp.type) + ROW_GAP;
          }
        }

        // Place series intermediates alongside their target
        for (const [intermediateIdx, seriesInfo] of seriesMap.entries()) {
          if (placedNew[intermediateIdx]) continue;
          const target = placedNew[seriesInfo.targetIndex];
          if (!target) continue;
          const comp = addedComponents[intermediateIdx]!;
          const targetPinPos = resolveComponentPinTarget(
            { type: target.type, x: target.col, y: target.row },
            seriesInfo.targetPin,
          );
          if (targetPinPos) {
            const col = componentCol(comp.type);
            placedNew[intermediateIdx] = { id: crypto.randomUUID(), type: comp.type, name: comp.name, row: targetPinPos.row, col };
          } else {
            const col = componentCol(comp.type);
            placedNew[intermediateIdx] = { id: crypto.randomUUID(), type: comp.type, name: comp.name, row: nextRow, col };
            nextRow += componentHeight(comp.type) + ROW_GAP;
          }
        }

        // Fill in any remaining
        for (let i = 0; i < addedComponents.length; i++) {
          if (placedNew[i]) continue;
          const comp = addedComponents[i]!;
          const col = componentCol(comp.type);
          placedNew[i] = { id: crypto.randomUUID(), type: comp.type, name: comp.name, row: nextRow, col };
          nextRow += componentHeight(comp.type) + ROW_GAP;
        }

        // Validate positions
        for (const pc of placedNew) {
          if (pc && pc.row > 27) {
            errors.push(`Component "${pc.name}" would be at row ${pc.row}, near board edge.`);
          }
        }
        if (errors.length > 0) {
          rollback();
          return {
            success: false,
            failureKind: "layout_overflow",
            errors,
            attemptsRemaining: MAX_PROPOSE_FIX_ATTEMPTS - proposeFixAttempts,
          };
        }

        // Generate place ops
        for (let i = 0; i < addedComponents.length; i++) {
          const comp = addedComponents[i]!;
          const pos = placedNew[i]!;
          generatedOps.push(makeBoardOp(opCtx, {
            kind: "place_component",
            payload: {
              component: {
                id: pos.id,
                type: comp.type,
                name: comp.name,
                x: pos.col,
                y: pos.row,
                rotation: 0,
                pins: defaultPins(comp.type),
                properties: comp.properties ?? {},
              },
            },
          }));
          workingBoard.components[pos.id] = {
            id: pos.id, type: comp.type, name: comp.name,
            x: pos.col, y: pos.row, rotation: 0,
            pins: defaultPins(comp.type), properties: comp.properties ?? {},
          } as typeof workingBoard.components[string];
        }

        // ── 5. Add wires ──
        const wiresByPin = new Map<number, Array<{ target: { row: number; col: number }; color: string }>>();
        const seriesJumperOps: BoardOp[] = [];

        // v1.6.0: build once, reuse across every "component not found" path.
        // Lets us return "did you mean X?" instead of a flat 404 and burning
        // a retry attempt. Includes both UUIDs and human names because agents
        // hallucinate friendly aliases ('led1') more often than mistype UUIDs.
        const componentCandidates: IdCandidate[] = Object.entries(workingBoard.components).map(
          ([id, c]) => ({ id, name: c.name, type: c.type }),
        );

        for (const wire of input.addWires ?? []) {
          const color = wire.color ?? "#22c55e";

          // Resolve target component (existing or new)
          let targetComp: { type: string; x: number; y: number } | undefined;
          if (wire.toExistingComponent) {
            const existing = workingBoard.components[wire.toExistingComponent];
            if (!existing) {
              const hint = formatSuggestion(wire.toExistingComponent, componentCandidates);
              errors.push(`Wire target component ${wire.toExistingComponent} not found.${hint}`);
              continue;
            }
            targetComp = existing;
          } else if (wire.toNewComponent !== undefined) {
            const placed = placedNew[wire.toNewComponent];
            if (!placed) {
              errors.push(`Wire references addComponents[${wire.toNewComponent}] which doesn't exist.`);
              continue;
            }
            targetComp = { type: placed.type, x: placed.col, y: placed.row };
          } else {
            errors.push("Wire must specify either toExistingComponent or toNewComponent.");
            continue;
          }

          // Validate toPin
          const allowedPins = getComponentPinNames(targetComp.type);
          if (!allowedPins.includes(wire.toPin)) {
            errors.push(`Invalid toPin "${wire.toPin}" for ${targetComp.type}. Allowed: ${allowedPins.join(", ")}`);
            continue;
          }

          // Resolve through-component for series routing
          let throughComp: { type: string; x: number; y: number } | undefined;
          if (wire.throughExistingComponent) {
            const existing = workingBoard.components[wire.throughExistingComponent];
            if (!existing) {
              const hint = formatSuggestion(wire.throughExistingComponent, componentCandidates);
              errors.push(`Through-component ${wire.throughExistingComponent} not found.${hint}`);
              continue;
            }
            throughComp = existing;
          } else if (wire.throughNewComponent !== undefined) {
            const placed = placedNew[wire.throughNewComponent];
            if (!placed) {
              errors.push(`Through-component references addComponents[${wire.throughNewComponent}] which doesn't exist.`);
              continue;
            }
            throughComp = { type: placed.type, x: placed.col, y: placed.row };
          }

          if (throughComp && wire.throughEntryPin && wire.throughExitPin) {
            // Series routing: Arduino → through.entryPin, then through.exitPin → target.toPin
            const entryPoint = resolveComponentPinTarget(throughComp, wire.throughEntryPin);
            if (!entryPoint) {
              errors.push(`Cannot resolve through-component pin ${wire.throughEntryPin}.`);
              continue;
            }
            if (!wiresByPin.has(wire.arduinoPin)) wiresByPin.set(wire.arduinoPin, []);
            wiresByPin.get(wire.arduinoPin)!.push({ target: entryPoint, color });

            const exitPoint = resolveComponentPinTarget(throughComp, wire.throughExitPin);
            const finalPoint = resolveComponentPinTarget(targetComp, wire.toPin);
            if (!exitPoint || !finalPoint) {
              errors.push(`Cannot resolve series endpoints for through.${wire.throughExitPin} → target.${wire.toPin}.`);
              continue;
            }

            // Check if same bus — no jumper needed
            const sameBus =
              exitPoint.row === finalPoint.row &&
              ((exitPoint.col <= 4 && finalPoint.col <= 4) || (exitPoint.col >= 5 && finalPoint.col >= 5));
            if (!sameBus) {
              seriesJumperOps.push(makeBoardOp(opCtx, {
                kind: "connect_wire",
                payload: {
                  wire: {
                    id: crypto.randomUUID(),
                    fromRow: exitPoint.row, fromCol: exitPoint.col,
                    toRow: finalPoint.row, toCol: finalPoint.col,
                    color,
                  },
                },
              }));
            }
          } else {
            // Direct wire
            const to = resolveComponentPinTarget(targetComp, wire.toPin);
            if (!to) {
              errors.push(`Cannot resolve target pin ${targetComp.type}.${wire.toPin}.`);
              continue;
            }
            if (!wiresByPin.has(wire.arduinoPin)) wiresByPin.set(wire.arduinoPin, []);
            wiresByPin.get(wire.arduinoPin)!.push({ target: to, color });
          }
        }

        // Auto-wire LED+resistor pairs through the same fanout path, so GND
        // distribution is always normalized (single Arduino lead + branches).
        for (const pair of input.ledResistorPairs ?? []) {
          const res = placedNew[pair.resistorIndex];
          if (!res) continue;
          const resistorPinB = resolveComponentPinTarget({ type: res.type, x: res.col, y: res.row }, "b");
          if (!resistorPinB) {
            errors.push(`Cannot resolve resistor pin B for addComponents[${pair.resistorIndex}].`);
            continue;
          }
          if (!wiresByPin.has(-3)) wiresByPin.set(-3, []);
          wiresByPin.get(-3)!.push({ target: resistorPinB, color: "#42a5f5" });
        }

        if (errors.length > 0) {
          rollback();
          return {
            success: false,
            failureKind: "validation",
            errors,
            warnings: warnings.length > 0 ? warnings : undefined,
            attemptsRemaining: MAX_PROPOSE_FIX_ATTEMPTS - proposeFixAttempts,
          };
        }

        // Generate wire ops (with fanout distribution)
        function railColForPin(pin: number): number {
          if (pin === -3 || pin === -4 || pin === -6) return -1;
          if (pin === -1) return -2;
          if (pin === -2) return 11;
          return -1;
        }
        function sameStrip(a: { row: number; col: number }, b: { row: number; col: number }): boolean {
          if (a.row !== b.row) return false;
          return (a.col <= 4 && b.col <= 4) || (a.col >= 5 && b.col >= 5);
        }

        function hasEquivalentWire(
          fromRow: number,
          fromCol: number,
          toRow: number,
          toCol: number,
        ): boolean {
          for (const existing of Object.values(workingBoard.wires)) {
            if (
              existing.fromRow === fromRow &&
              existing.fromCol === fromCol &&
              existing.toRow === toRow &&
              existing.toCol === toCol
            ) return true;
          }
          for (const op of generatedOps) {
            if (op.kind !== "connect_wire") continue;
            const w = op.payload.wire;
            if (
              w.fromRow === fromRow &&
              w.fromCol === fromCol &&
              w.toRow === toRow &&
              w.toCol === toCol
            ) return true;
          }
          return false;
        }

        function pushConnectWire(
          fromRow: number,
          fromCol: number,
          toRow: number,
          toCol: number,
          color: string,
        ) {
          if (fromRow === toRow && fromCol === toCol) return;
          if (hasEquivalentWire(fromRow, fromCol, toRow, toCol)) return;
          generatedOps.push(makeBoardOp(opCtx, {
            kind: "connect_wire",
            payload: {
              wire: {
                id: crypto.randomUUID(),
                fromRow,
                fromCol,
                toRow,
                toCol,
                color,
              },
            },
          }));
        }

        function findExistingDirectSource(pin: number): { row: number; col: number } | null {
          const existing = Object.values(workingBoard.wires).find(
            (w) => w.fromRow === -999 && w.fromCol === pin,
          );
          if (!existing) return null;
          return { row: existing.toRow, col: existing.toCol };
        }

        for (const [pin, fanout] of wiresByPin.entries()) {
          if (fanout.length === 0) continue;
          const isPowerOrGround = pin < 0;
          const existingSource = findExistingDirectSource(pin);

          if (existingSource) {
            const anchor = existingSource;
            if (isPowerOrGround && anchor.col === railColForPin(pin)) {
              const railCol = anchor.col;
              for (const branch of fanout) {
                if (branch.target.col === railCol) continue;
                pushConnectWire(branch.target.row, railCol, branch.target.row, branch.target.col, branch.color);
              }
              continue;
            }
            for (const branch of fanout) {
              if (sameStrip(anchor, branch.target)) continue;
              pushConnectWire(anchor.row, anchor.col, branch.target.row, branch.target.col, branch.color);
            }
            continue;
          }

          if (isPowerOrGround) {
            const railCol = railColForPin(pin);
            pushConnectWire(-999, pin, 0, railCol, fanout[0]!.color);
            for (const branch of fanout) {
              if (branch.target.col === railCol) continue;
              pushConnectWire(branch.target.row, railCol, branch.target.row, branch.target.col, branch.color);
            }
          } else {
            if (fanout.length === 1) {
              const only = fanout[0]!;
              pushConnectWire(-999, pin, only.target.row, only.target.col, only.color);
              continue;
            }
            const anchor = { row: fanout[0]!.target.row, col: fanout[0]!.target.col <= 4 ? 0 : 5 };
            pushConnectWire(-999, pin, anchor.row, anchor.col, fanout[0]!.color);
            for (const branch of fanout) {
              if (sameStrip(anchor, branch.target)) continue;
              pushConnectWire(anchor.row, anchor.col, branch.target.row, branch.target.col, branch.color);
            }
          }
        }

        // Append series jumpers
        for (const op of seriesJumperOps) generatedOps.push(op);

        if (errors.length > 0) {
          rollback();
          return {
            success: false,
            failureKind: "validation",
            errors,
            warnings: warnings.length > 0 ? warnings : undefined,
            attemptsRemaining: MAX_PROPOSE_FIX_ATTEMPTS - proposeFixAttempts,
          };
        }

        // ── 6. Sketch ──
        if (input.sketch) {
          const check = validateSketch(input.sketch);
          if (!check.valid) {
            const failureClass = sketchState.noteFailureClass(check);
            sketchState.fixValidationFailures += 1;
            if (
              sketchState.fixValidationFailures >= sketchState.maxFixFailures ||
              sketchState.consecutiveSameFailureClass >= sketchState.maxConsecutiveSameFailures
            ) {
              sketchState.recoveryAbandoned = true;
              rollback();
              return {
                success: false,
                blocked: true,
                abandoned: true,
                failureKind: "sketch_fix_attempt_limit",
                errors: [`Sketch validation failed: ${sketchState.formatError(check)}`],
                limiter: `repeated_${failureClass}`,
              };
            }
            rollback();
            return {
              success: false,
              failureKind: "sketch_validation",
              errors: [`Sketch has errors: ${sketchState.formatError(check)}`],
              attemptsRemaining: MAX_PROPOSE_FIX_ATTEMPTS - proposeFixAttempts,
            };
          }
          sketchState.clearTracking();
          generatedOps.push(makeBoardOp(opCtx, { kind: "update_sketch", payload: { code: input.sketch } }));
          workingBoard.sketchCode = input.sketch;
        }

        // ── 7. Update working wires ──
        for (const op of generatedOps) {
          if (op.kind === "connect_wire") {
            const w = op.payload.wire;
            workingBoard.wires[w.id] = w;
          }
        }

        // ── 8. Electrical validation ──
        {
          const power = analyzePowerBudget(workingBoard);
          const routing = analyzeRoutingPolicy(workingBoard);
          const powerErrors = power.issues
            .filter((issue) => issue.severity === "error")
            .map((issue) => issue.message);
          const routingWarnings = routing.violations.map((v) => v.message);

          if (powerErrors.length > 0) {
            rollback();
            return {
              success: false,
              failureKind: "electrical_validation",
              errors: powerErrors.slice(0, 8),
              warnings: routingWarnings.slice(0, 4),
              nonBlockingWarnings: warnings.length > 0 ? warnings : undefined,
              attemptsRemaining: MAX_PROPOSE_FIX_ATTEMPTS - proposeFixAttempts,
            };
          }
        }

        // ── 9. Commit all ops ──
        for (const op of generatedOps) ops.push(op);

        const summary = [
          ...(input.removeWires?.length ? [`Removed ${input.removeWires.length} wire(s)`] : []),
          ...(input.removeComponents?.length ? [`Removed ${input.removeComponents.length} component(s)`] : []),
          ...(input.moveComponents?.length ? [`Moved ${input.moveComponents.length} component(s)`] : []),
          ...(placedNew.length > 0 ? [`Added ${placedNew.length} component(s)`] : []),
          ...([`Created ${generatedOps.filter(op => op.kind === "connect_wire").length} wire(s)`]),
          ...(input.sketch ? ["Updated sketch"] : []),
        ].join(", ");

        const layout = placedNew.length > 0
          ? placedNew.map((pc, i) => `  [${i}] ${pc.name} (${pc.type}) → row=${pc.row} col=${pc.col} id=${pc.id}`).join("\n")
          : undefined;

        return {
          success: true,
          summary,
          componentsAdded: placedNew.length,
          componentsRemoved: input.removeComponents?.length ?? 0,
          wiresCreated: generatedOps.filter(op => op.kind === "connect_wire").length,
          wiresRemoved: input.removeWires?.length ?? 0,
          sketchUpdated: !!input.sketch,
          layout,
          warnings: warnings.length > 0 ? warnings : undefined,
        };
      },
    }),
  } as const;
}
