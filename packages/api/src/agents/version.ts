/**
 * Agent architecture version.
 *
 * Bump this whenever a change would alter the decision-flow diagram —
 * i.e. any change to routing logic, tool availability, step limits,
 * delegation rules, stop conditions, or model-selection thresholds.
 *
 * Every run record stores this value so the debug visualizer can
 * flag runs that were produced by a different agent layout.
 *
 * Patch bumps (x.y.Z): parameter tweaks that don't change the shape
 *   of the diagram (e.g. adjusting a token threshold, changing a prompt).
 * Minor bumps (x.Y.0): new branches or tools added to existing paths.
 * Major bumps (X.0.0): structural rewrites — new agents, removed paths,
 *   fundamentally different routing logic.
 */
export const AGENT_VERSION = "2.0.0";

/**
 * Snapshot version controls which frozen agent behavior profile is used at
 * runtime (prompts/config). Defaults to the current agent version, but can be
 * overridden per-request or via AGENT_SNAPSHOT_VERSION.
 */
export const DEFAULT_AGENT_SNAPSHOT_VERSION =
  process.env.AGENT_SNAPSHOT_VERSION ?? AGENT_VERSION;

/**
 * Explicitly listed snapshots that can be selected safely. Add a new entry
 * whenever introducing a new behavior profile.
 */
export const SUPPORTED_AGENT_SNAPSHOTS = ["1.0.0", "1.0.1", "1.0.2", "1.0.3", "1.0.4", "1.0.5", "1.0.6", "1.0.7", "1.0.8", "1.1.0", "1.1.1", "1.2.0", "1.2.1", "1.2.2", "1.2.3", "1.2.4", "1.2.5", "1.3.0", "1.3.1", "1.3.2", "1.3.3", "1.3.4", "1.3.5", "1.3.6", "1.4.0", "1.5.0", "1.5.1", "1.5.2", "2.0.0"] as const;

export type AgentSnapshotVersion = (typeof SUPPORTED_AGENT_SNAPSHOTS)[number];

export function resolveAgentSnapshotVersion(
  requested?: string,
): AgentSnapshotVersion {
  if (
    requested &&
    (SUPPORTED_AGENT_SNAPSHOTS as readonly string[]).includes(requested)
  ) {
    return requested as AgentSnapshotVersion;
  }
  if (
    (SUPPORTED_AGENT_SNAPSHOTS as readonly string[]).includes(
      DEFAULT_AGENT_SNAPSHOT_VERSION,
    )
  ) {
    return DEFAULT_AGENT_SNAPSHOT_VERSION as AgentSnapshotVersion;
  }
  return AGENT_VERSION as AgentSnapshotVersion;
}

/**
 * Changelog — newest entry first.
 *
 * Each entry documents what changed and why, so the diagram maintainer
 * knows what to update when the version is bumped.
 */
export const AGENT_CHANGELOG: Array<{
  version: string;
  date: string;
  changes: string[];
}> = [
  {
    version: "2.0.0",
    date: "2026-05-28",
    changes: [
      "STRUCTURAL REWRITE: single-agent step loop split into two specialized sub-agents with a dispatcher. Motivated by three production symptoms (repeated tool calls, chaotic step ordering, poor propose_fix per-call success) that the v1.5.x patches could not fix without changing the underlying architecture.",
      "Dispatcher (`agents/core/agent.ts:streamDispatchAgent`): routes to BuildAgent if the board has zero non-surface components, otherwise to FixAgent. Replaces the v1.x router.toolMode three-way decision (build / edit / all) with a simpler two-way board-state check. The vestigial `\"all\"` mode is gone.",
      "BuildAgent (`agents/core/build-agent.ts`): empty-board build workflow. 7-tool surface (propose_circuit, propose_fix, verify_circuit, update_sketch, list_components, list_wires, analyze_power_budget). State machine enforces propose_circuit → verify_circuit → terminate, with a recovery branch (propose_fix + update_sketch) when verify_circuit reports unwired_pin_referenced.",
      "FixAgent (`agents/core/fix-agent.ts`): populated-board edit workflow. 21-tool surface (full v1.5.2 EDIT_MODE_TOOLS including granular CRUDs — kept for safety, trim later with data). State machine: full read+write surface at start, narrows to verify_circuit after any successful write.",
      "State machines (`agents/core/agent-states.ts`): pure module, 220 lines including types. Each transition consumes a ToolOutcome (toolName + success + failureKind + optional verifyIssues) and returns the next allowed tool set. Empty set forces terminal text response. Default-deny on unknown tool transitions.",
      "Tool gating implementation: AI SDK's `prepareStep` returns `activeTools: Array<keyof TOOLS>` per step. Verified the @ai-sdk v6 pinned in this repo supports the mechanism (`ai/dist/index.d.ts:1220`). The existing prepareStep callback (which already handles sanitization + compaction) is extended with state-machine-derived activeTools.",
      "Engine refactor: `streamCoreAgent` becomes a 5-line dispatcher. The 770-line body moves to `streamCoreAgentInternal` and accepts an optional `SpecializedConfig` parameter (prompt, tool name set, state machine). Legacy 1.x runs pass `null` config → bit-identical behavior. Sub-agents pass their own configs.",
      "Prompts: BUILD_PROMPT_V2_0_0 (40 lines, down from v1.5.1's 80) and EDIT_PROMPT_V2_0_0 (35 lines). Workflow ordering instructions removed since the state machine enforces them. Earlier 1.5.x edit prompt frozen as EDIT_PROMPT_V1_5_0 so 1.5.x snapshots stay reproducible.",
      "Reversibility: legacy single-agent codepath stays intact in agent.ts under streamCoreAgentInternal. Routes are unchanged (still call streamCoreAgent / runCoreAgent). To roll back, pin the frontend to AGENT_SNAPSHOT_VERSION = '1.5.2' — all turns route through the legacy path. Git tag `pre-v2.0.0` on the previous HEAD provides a clean revert target.",
      "Frontend pin: 1.5.2 → 2.0.0. Dashboard version registry adds 2.0.0 with new dispatcher → BuildAgent | FixAgent Mermaid layout. introducedNodesForVersion('2.0.0') = ['DSP', 'BA', 'FA', 'BSM', 'FSM'].",
    ],
  },
  {
    version: "1.5.2",
    date: "2026-05-28",
    changes: [
      "Fix: propose_circuit now mirrors its emitted connect_wire ops into workingBoard.wires so mid-turn read tools (verify_circuit, list_wires) see fresh state. Pre-1.5.2 propose_circuit pushed ops to the queue but never mutated workingBoard.wires directly — only components and sketchCode got updated. verify_circuit reads workingBoard.wires, so right after a successful propose_circuit it would report wiredPins=[] and the agent's prompt would route the (apparent) wiring failure to propose_fix. propose_fix would re-add the same wires, creating duplicates on the board.",
      "Side effect of the same fix: propose_circuit's own internal electrical gate (analyzePowerBudget + analyzeRoutingPolicy at lines 868-869) was passing trivially because it also reads workingBoard.wires which was empty. The gate now sees the real wires and can catch electrical issues before returning success — the same way propose_fix's gate has always worked.",
      "Forensic trace from run d0a55856 (v1.5.1) shows the bug end-to-end: propose_circuit created 7 wires correctly; verify_circuit reported wiredPins=[]; propose_fix #1 failed (missing BTN.b→GND in agent's input); propose_fix #2 added 5 wires (3 duplicates + 2 corrections); board ended with 12 wires where 7 were sufficient. Post-fix simulation: 3 tool calls instead of 6, no duplicates.",
      "Regression test: `propose-circuit-guards.test.ts:verify_circuit sees the wires propose_circuit just created`.",
      "Prompts unchanged from v1.5.1 (PROMPTS_1_5_2 reuses BUILD_PROMPT_V1_5_1). Frontend pin bumped 1.5.1 → 1.5.2. Dashboard version registry updated.",
    ],
  },
  {
    version: "1.5.1",
    date: "2026-05-27",
    changes: [
      "Fixes a propose_circuit retry-loop visible in a real v1.5.0 production trace: 8+ propose_circuit calls in a single turn, 75.6k tokens, no usable output. The agent stacked components from each retry on top of the previous build until the breadboard ran out of rows, narrating its own confusion (\"the board is too constrained\") without realizing propose_circuit itself was causing the constraint.",
      "Hard-cap propose_circuit attempts in code (`tools/propose-tools.ts`): `MAX_PROPOSE_CIRCUIT_ATTEMPTS = 3`, mirrored after `MAX_PROPOSE_FIX_ATTEMPTS`. A 4th call returns `failureKind: \"attempt_limit\"` with `abandoned: true`. The v1.5.0 prompt said \"max 3 attempts/turn\" but it was prose-only — Haiku ignored it once in retry mode.",
      "Refuse propose_circuit on a non-empty board (`failureKind: \"board_not_empty\"`). propose_circuit's auto-positioning (`propose-tools.ts:243`) places new parts AFTER existing components rather than replacing — every retry stacked. The guard makes the bug structurally impossible.",
      "Add `propose_fix` to `BUILD_MODE_TOOLS`. propose_fix's remove/move ops skip safely when not used (`propose-tools.ts:1037,1047`), so addComponents/addWires/sketch behaves identically on empty + populated boards. After the first propose_circuit lands, propose_fix is the right tool for the missing wire or pin correction that verify_circuit flagged. Build surface 6 → 7 tools.",
      "BUILD_PROMPT_V1_5_1: teaches the propose_circuit → verify_circuit → propose_fix pattern explicitly. Drops the v1.5.0 instruction to retry propose_circuit on verify_circuit failure (the cause of the loop). Adds explicit \"Common mistake\" entries documenting the budget + board_not_empty errors so the agent recognizes them.",
      "Dashboard: register '1.5.1' in `eval/dashboard.ts` version resolver + dropdown + introducedNodesForVersion (['WPC','WPF'] — WPC label updated to mention the budget/guard, WPF newly reachable from the build-mode SL lane).",
      "Frontend pin bumped 1.5.0 → 1.5.1 in `app/src/toolbar/bottom-toolbar.tsx`. v1.5.0 stays frozen.",
    ],
  },
  {
    version: "1.5.0",
    date: "2026-05-27",
    changes: [
      "BUILD_PROMPT flipped back to propose_circuit-first after the v1.3.x DSL-first experiment underperformed. Eval over 44 stored build-mode runs: propose_circuit converged on 100% of runs at 19,471 avg total tokens; apply_design converged on only 84% of runs at 27,903 avg total tokens (~43% more expensive, terminal failures on malformed DSL blocks despite a 3-retry budget).",
      "BUILD_MODE_TOOLS trimmed from 17 → 6 (propose_circuit, verify_circuit, update_sketch, list_components, list_wires, analyze_power_budget). Dropped: apply_design + validate_design (DSL stays as an HTTP endpoint for paste-import/export, but is hidden from the agent), the 4 CircuitProgram tools (generate/validate/compile/apply_circuit_program — zero adoption in eval), and the 4 redundant reads + patch_sketch (never called; per-turn board summary covers them).",
      "New tool `verify_circuit` (`packages/api/src/agents/core/tools/verify-tools.ts`): read-only cross-check that every pin referenced by pinMode/digitalRead/digitalWrite/analogRead/analogWrite/pulseIn/Servo.attach in the current sketch is actually wired on the board. Best-effort identifier resolution (const int / #define / A0–A5 tokens). Available in BOTH build and edit modes — in edit mode the agent calls it after a successful propose_fix to catch sketch/wiring drift from mutations.",
      "New `extractPinReferences()` in `packages/api/src/utils/sketch-validator.ts` reuses the existing comment/string stripper from validateSketch so the new tool doesn't carry its own parser.",
      "Cache split restored in `agents/core/agent.ts` rawMessages — stable system prompt (ephemeral-cached) + per-turn board summary (uncached). Commit 77a873b silently reverted the v1.3.6 split when adding the tool-call sanitizer; this restores the intent of commit 8814e1d. Pure billing fix, no behavior change.",
      "propose_fix reliability pass — stored eval showed propose_fix at 22% per-call success vs propose_circuit's 83% across 19+30 calls. The gap is structural (UUIDs to reference, six op arrays vs two, populated-state divergence) but the biggest contributor is ID hallucination. v1.5.0 targets that specifically:",
      "  • `summarizeBoardState` (`agents/core/tools/shared.ts`) now lists every wire ID inline (previously elided entirely) and raises the per-turn display limits from 8 components / 6 wires to 24 / 32. The system-prompt block is uncached since the cache split above, so growing it does not bust the prefix cache. Edit-mode agents can read all IDs they need from the summary without a list_components/list_wires roundtrip.",
      "  • propose_fix returns 'Did you mean X (name=Y, type=led)?' suggestions when addWires.toExistingComponent, throughExistingComponent, or moveComponents.componentId references an unknown ID. New `agents/core/tools/id-resolver.ts` scores candidates by exact-id > exact-name > id-prefix > substring > Levenshtein ≤3. Previously a hallucinated ID burned one of the 5 retry attempts on a flat 'not found'.",
      "EDIT_PROMPT rewritten to leverage the wider summary (no longer mandates the list_components/list_wires preflight), document the did-you-mean error path, and instruct the agent to call verify_circuit after a successful propose_fix.",
      "Dashboard: nodeClasses (`eval/dashboard.ts`) was never reading propose_fix or verify_circuit from the trace, so WPF and VFY always rendered ghost-styled regardless of run data — now classified by trace contents with warn styling on failures. buildCurrentFlowchart adds the WPF → VFY edge so the edit-mode lane mirrors build's WPC → VFY flow, and routes VFY's failure edge to SL so the agent picks the right retry tool for its active mode.",
      "Frontend pin bumped from 1.3.6 → 1.5.0 in `packages/app/src/toolbar/bottom-toolbar.tsx`. Snapshots 1.3.6 and 1.4.0 stay frozen for reproducibility.",
    ],
  },
  {
    version: "1.4.0",
    date: "2026-04-28",
    changes: [
      "BUILD_MODE_TOOLS: added CircuitProgram-first whole-board tools — generate_circuit_program, validate_circuit_program, compile_circuit_program, and apply_circuit_program.",
      "BUILD_PROMPT: default build path is now CircuitProgram-first instead of hand-authored DreamerDiagram-first. The agent now plans modules, nets, sketch contracts, and runtime behavior contracts before compiling to DreamerDiagram under the hood.",
      "apply_design remains available for explicit pasted DreamerDiagram imports; propose_circuit remains as the fallback auto-placement path when CircuitProgram attempts fail or the user explicitly asks for it.",
      "Introduced CircuitProgram v1 as a breadboard IR that separates circuit structure (program), semantic handles (words), and component/runtime identity (profiles), so the agent can reason about servo pulse, analog input, WS2812 timing, and similar component-specific behavior earlier in the flow.",
    ],
  },
  {
    version: "1.3.6",
    date: "2026-05-27",
    changes: [
      "BUILD_PROMPT: removed the stale 'user can switch to AUTO mode' sentence in the 3-failure stop instruction. The DSL/AUTO toggle was removed from the bottom toolbar (`packages/app/src/toolbar/bottom-toolbar.tsx`), so suggesting that mode would mislead the user. DSL is now documented as the only build path.",
      "BUILD_PROMPT: added a `Common pitfalls` block with 8 WRONG→RIGHT pairs covering supply fan-out vs rail distribution, INPUT vs INPUT_PULLUP, canonical pin names, resistor/button `at:[row,3]`, 2D array initializers, const-array initializers, echoing JSON/code in chat, and suggesting nonexistent build modes. Negative examples reinforce the prose rules that Haiku tends to skim.",
      "BUILD_PROMPT: added four worked examples — servo+potentiometer (analog input + PWM, shared 5V/GND rails), SSD1306 OLED over I²C (SDA=A4, SCL=A5), HC-SR04 ultrasonic, and 4 LEDs on D2–D5 with rail distribution. Haiku's accuracy on these classes was limited by the prompt only having LED/button/7-seg examples.",
      "Companion change in `packages/api/src/agents/core/agent.ts:281-302`: the system message is now split into two `{role:'system'}` blocks — stable prompt (ephemeral cache_control) + per-turn board summary (uncached). Previously the combined message busted the cache on every board mutation, re-billing the full prefix each turn.",
      "Frontend pin: `bottom-toolbar.tsx` updated to `AGENT_SNAPSHOT_VERSION = '1.3.6'`. Snapshot 1.3.5 stays frozen for reproducibility of prior runs.",
    ],
  },
  {
    version: "1.3.5",
    date: "2026-04-19",
    changes: [
      "BUILD_PROMPT: GND/5V rail distribution is now mandatory when ≥2 components share a supply. Previous strict-DSL prompt let the model fan N direct wires out of `arduino.GND`, which fails electrical validation and doesn't match real-breadboard topology.",
      "BUILD_PROMPT: documents the `grid.<row>,<col>` endpoint syntax for addressing the breadboard's power rails: col -1 / 10 = GND rails, col -2 / 11 = 5V rails. The DSL adapter already supports this syntax (`packages/schemas/src/diagram-adapter.ts:155`); the prompt now exposes it.",
      "BUILD_PROMPT: 7-seg counter example rewritten to demonstrate rail distribution — one `arduino.GND → grid.0,-1` lead, then per-row `grid.<componentRow>,-1 → comp.gnd` branches. Single-consumer circuits (LED+resistor, single button) keep direct wires.",
    ],
  },
  {
    version: "1.3.4",
    date: "2026-04-19",
    changes: [
      "BUILD_PROMPT: strict DSL mode — removed all references to `propose_circuit` from the prompt. The DSL toggle now genuinely tests DSL end-to-end. v1.3.3's 7-seg/LCD-with-per-segment-resistors exception was making the toggle a no-op for that pattern (the model would always route to propose_circuit). User wants to evaluate DSL capability honestly even when the layout is dense.",
      "Workflow tightened: up to 3 `apply_design` attempts per turn. On exhaustion the model STOPS and reports the blocking issues to the user instead of silently switching to propose_circuit (the user can switch to AUTO mode if they want auto-positioning).",
      "Added a worked DSL example for 7-seg counter with per-segment resistors and INPUT_PULLUP button (each resistor on the same row as its target segment pin). Calls out the visual-stacking caveat so the model doesn't try to 'improve' the layout by routing away.",
      "Companion fix in `tools.ts:1469-1542` (no agent version impact per README): propose_circuit's throughComponent codegen now detects when the entry pin's bus already shares the target's bus (the resistor would be shorted via the breadboard bus rather than current actually flowing through the body) and auto-swaps entry/exit. Surfaced when v1.3.3 routed a 7-seg counter through propose_circuit and the simulator showed current bypassing every resistor.",
    ],
  },
  {
    version: "1.3.3",
    date: "2026-04-19",
    changes: [
      "BUILD_PROMPT: resistor and button placements now MUST be `at: [row, 3]`. The renderer (resistor-renderer.tsx:52-53) and simulator footprint (registry.tsx:210, breadboard-grid.ts:692) hardcode pin positions to cols 3/6 regardless of `at[col]` — so writing `at: [row, 1]` electrically works (the body straddles the gap as always) but renders with the resistor body bridging cols 3-6 while the diagram says col=1, causing wires to visually 'miss' the resistor. The only sane DSL coord is the col where the body actually draws: 3.",
      "BUILD_PROMPT: added a targeted fallback exception — for 7-seg or LCD displays driven by per-segment series resistors, the agent now routes to `propose_circuit` with `throughComponent` instead of DSL. DSL would require N resistors on N consecutive breadboard rows (one per segment pin), causing dense visual stacking. The auto-router handles this case more cleanly. This is the one structurally-bad-in-DSL pattern; everything else (LED+resistor, single button, OLED, sensors) stays on DSL.",
      "BUILD_PROMPT: added a 7-seg counter example using propose_circuit + throughComponent so the model has a worked reference for the new exception path.",
    ],
  },
  {
    version: "1.3.2",
    date: "2026-04-19",
    changes: [
      "BUILD_PROMPT: removed the `>8 components` propose_circuit fallback trigger. v1.3.1's rule routed any 7-seg + per-segment resistors circuit (≥9 components) away from DSL even when the user toggled DSL — making the toggle effectively no-op for a common class of build. Fallback now fires only on two consecutive `apply_design` failures.",
      "BUILD_PROMPT: added a `Pin-name reference` section enumerating the canonical pin names per component type (`seven_segment.gnd` not `com`, `lcd_16x2.vss` not `gnd`, button = `a`/`b` not `+`/`-`, etc.). The single biggest cost in the previous run was an ~11k-token retry caused by `pinRoles: { com: ... }` instead of `gnd`.",
      "Companion fix in `packages/schemas/src/diagram-adapter.ts` (no agent version impact per README): wires written as `<componentId>.<pin> → arduino.<pin>` are now normalized to keep the Arduino sentinel on the `from` side, matching the invariant every downstream electrical analyzer assumes. Without this, post-stream `BUTTON_REFERENCE_MISSING` was throwing away successful apply_design results.",
    ],
  },
  {
    version: "1.3.1",
    date: "2026-04-19",
    changes: [
      "BUILD_PROMPT (DSL-first path): drop the mandatory `validate_design` step. `apply_design` already validates and returns structured `issues[]` on failure with no board mutation, so the pre-validation pass was sending the diagram twice for the same diagnostic. New default is `apply_design` directly, with at most one retry on validation failure. `validate_design` is now opt-in for cases where the model is uncertain about pin names or wire endpoints.",
      "BUILD_PROMPT: gate `analyze_power_budget` explicitly. v1.3.0 was auto-calling it (~13k tok/run) on every passive circuit because it was listed as a default read tool. Now restricted to circuits with servo/motor/relay/buzzer/external supply, ≥5 simultaneously-driven LEDs, or explicit user questions about power.",
      "prompt-normalizer.ts: the brief no longer includes 'short power budget summary' as a default deliverable — same gating signals as the BUILD_PROMPT rule above.",
      "Frozen v1.3.0 snapshot path: `BUILD_PROMPT_V1_3_0` captures the original DSL-first prompt verbatim so AGENT_SNAPSHOT_VERSION=1.3.0 still reproduces the heavier behavior for comparison runs.",
      "Together these recover roughly 50% of the per-run token cost vs v1.3.0 on passive circuits while keeping DSL-first as the default path — based on the v1.3.0 vs v1.2.1 cost decomposition (validate+apply two-step ≈28% of overhead, power-budget auto-call ≈27%).",
    ],
  },
  {
    version: "1.3.0",
    date: "2026-04-19",
    changes: [
      "BUILD_PROMPT flipped to DSL-first: `validate_design` → `apply_design` is now the default tool path for empty-board generation. propose_circuit is documented as the FALLBACK, used only for layout-heavy circuits (>8 components, dense series resistor banks) or when DSL repeatedly fails validation.",
      "Added DSL layout reference (breadboard grid, component footprints, ID conventions) so the agent can compute `at: [row, col]` placements without auto-positioning help.",
      "Added DSL-form examples for LED blink and INPUT_PULLUP button as the primary patterns; propose_circuit examples retained but tagged as fallback.",
      "Rollback path: AGENT_SNAPSHOT_VERSION=1.2.5 — pinned to the propose_circuit-first BUILD_PROMPT_V1_2_5 frozen snapshot.",
      "Toolset unchanged — both apply_design/validate_design and propose_circuit remain in BUILD_MODE_TOOLS so the agent can fall back without a snapshot switch.",
    ],
  },
  {
    version: "1.2.5",
    date: "2026-04-19",
    changes: [
      "COMMON_PROMPT: removed the post-generation `breadbox-diagram` chat-block instruction. Agent must no longer echo diagram JSON in chat replies — describe results in plain language. Board UI is the source of truth; diagram payloads belong in tool calls only.",
      "BUILD_PROMPT: dropped the `$schema` chat-block reference from the validate_design/apply_design guidance and points at the new COMMON_PROMPT rule.",
    ],
  },
  {
    version: "1.2.4",
    date: "2026-04-19",
    changes: [
      "validate_design / apply_design: tool-input schema now omits the DSL's `$schema` field. Anthropic rejects tool JSON Schemas whose property keys start with `$` (pattern `^[a-zA-Z0-9_.-]{1,64}$`), so every chat request was failing with a 400 before hitting the model. Handlers re-attach `$schema: 'breadbox-diagram-v1'` internally before validation.",
      "Added regression test (`tool-input-schema-keys.test.ts`) that JSON-schema-converts every core tool's inputSchema and asserts every property key is Anthropic-compatible.",
      "BUILD/EDIT prompts: tool-args example + guidance updated to drop `$schema` when calling validate_design/apply_design. Chat-displayed `breadbox-diagram` blocks still carry `$schema` (user-facing DSL contract unchanged).",
    ],
  },
  {
    version: "1.2.3",
    date: "2026-04-19",
    changes: [
      "BUILD_PROMPT: added apply_design example (LED blink in DSL form) alongside the existing propose_circuit example so the model can contrast the two whole-circuit paths.",
      "BUILD_PROMPT: added validate_design → apply_design workflow — call validate_design first, fix issues, then commit with apply_design.",
      "COMMON_PROMPT: after any successful whole-circuit generation (propose_circuit OR apply_design), agent must emit a fenced `breadbox-diagram` code block with the resulting diagram so users can save/share/re-apply.",
      "apply_design: now returns obstacleCount in its response so the model can acknowledge environment payload made it through.",
      "validator: added MISSING_I2C_WIRING semantic check — flags OLED displays whose sda/scl pins aren't wired to the board's SDA/SCL pins (Uno A4/A5).",
      "CLI: added `dreamer diagram validate <file>` and `dreamer diagram apply <file> --project <project-file>` subcommands for headless diagram workflows.",
    ],
  },
  {
    version: "1.2.2",
    date: "2026-04-18",
    changes: [
      "Read tools (get_board_state, list_components, list_wires) now return DreamerDiagram-shaped payloads (DSL v1) so read format equals write format across the agent surface.",
      "get_board_state: returns the full DreamerDiagram ({$schema, board, sketch, components[], wires[], environment?, customLibraries?}).",
      "list_components: returns diagram.components[] — { id, type, at: [x, y], rotation, properties, pins? }. Arduino board filtered out.",
      "list_wires: returns diagram.wires[] with readable endpoint strings ('arduino.13', 'led1.anode', 'psu1.+', or 'grid.<row>,<col>' fallback) instead of raw fromRow/fromCol grid coords.",
      "COMMON_PROMPT documents the symmetry between reads and apply_design / validate_design writes.",
    ],
  },
  {
    version: "1.2.1",
    date: "2026-04-16",
    changes: [
      "propose_fix: unknown removeWires / removeComponents IDs are now non-blocking warnings instead of hard validation failures, so stale-ID references don't waste an attempt.",
      "propose_fix: shared GND/power fanout normalized to a single direct Arduino lead with branched rail distribution (reuses an existing direct source if one is already on the board — no extra direct ops).",
      "EDIT_PROMPT: agent must now call list_components + list_wires first in the same turn before proposing removals/rewires on existing parts, and must copy exact existing IDs from tool output (no placeholder IDs).",
      "EDIT_PROMPT: added wiring-only retry guidance — if a propose_fix fails with electrical_validation about direct fanout, retry with wiring-only (omit sketch), then apply sketch in a separate call.",
      "Added regression tests in propose-fix.test.ts for the three behaviors above.",
    ],
  },
  {
    version: "1.2.0",
    date: "2026-04-16",
    changes: [
      "Raised propose_fix attempt budget from 3 → 5 to give the agent more runway when mixing schema, electrical, and sketch errors.",
      "propose_fix schema failures now count toward the budget and surface detailed error messages (field path + invalid value + allowed enum values) instead of being silently rejected by the AI SDK.",
      "Added schema_validation failureKind with hint field listing exact valid pinRoles values and addWires shape requirements.",
      "Tightened pinRoles field description in propose_fix schema to list allowed enum values inline.",
    ],
  },
  {
    version: "1.1.1",
    date: "2026-04-15",
    changes: [
      "Added propose_fix tool — atomic batch editor for edit mode (add/remove/move components, add/remove wires, update sketch in one call).",
      "Auto-positioning, wire resolution, series routing, LED+resistor pairing, fanout distribution — same engine as propose_circuit.",
      "Max 3 attempts per run with full rollback on validation, electrical, or sketch failures.",
      "Edit-mode prompt updated to prefer propose_fix for multi-step changes, granular tools as fallback.",
    ],
  },
  {
    version: "1.1.0",
    date: "2026-04-15",
    changes: [
      "Removed circuit and graph specialist agents — all work now handled by the core agent directly.",
      "Removed delegation tools (delegate_to_circuit_agent, delegate_to_graph_agent) and CIRCUIT_MODE.",
      "Tool modes simplified to build / edit / all (was build / edit / circuit / all).",
      "Agent kind reduced to 'core' only.",
    ],
  },
  {
    version: "1.0.8",
    date: "2026-04-15",
    changes: [
      "Added button wiring convention to COMMON_PROMPT: buttons are always wired pin-A→signal, pin-B→GND; sketch MUST use INPUT_PULLUP with active-LOW detection (lastButtonState=HIGH).",
      "Updated build-mode example sketch to show INPUT_PULLUP + active-LOW pattern explicitly.",
      "Wire color now required on every wire: all prompt examples include explicit color fields (red=#ef4444 power, black=#1e293b GND, distinct colors per signal).",
      "Fixed component overlap: seven_segment and lcd_16x2 now placed on right strip (col 5) so series resistors (cols 3/6) don't visually overlap the display body.",
    ],
  },
  {
    version: "1.0.7",
    date: "2026-04-14",
    changes: [
      "Added wire color convention to system prompt and wiring guide: red=#ef4444 for power, black=#1e293b for GND, distinct colors for each signal line.",
      "Added response style rule: agent must not quote full sketch code in chat replies — describe behavior in plain language instead.",
    ],
  },
  {
    version: "1.0.6",
    date: "2026-04-14",
    changes: [
      "Compaction: get_board_overview now drops to a stub in older steps (board summary is already in system prompt), eliminating redundant re-sends.",
      "Compaction: KEEP_RECENT window narrows from 4 to 2 messages after step 4, cutting per-step accumulation for longer runs.",
    ],
  },
  {
    version: "1.0.5",
    date: "2026-04-14",
    changes: [
      "Fixed layout_overflow false rejection: series intermediates (throughComponent) now excluded from row estimate since they share their target's row.",
      "Added board row budget guidance to system prompt so agent can pre-check fit before calling propose_circuit.",
      "Fixed frontend button pin B coordinate (was row y+1, now row y) in power-budget analyzer — eliminated false BUTTON_REFERENCE_MISSING errors.",
      "Fixed bus-short false positive: wires landing on power/ground rails (col<0 or col>9) no longer classified as main-strip shorts.",
      "Token breakdown: unattributed steps now tracked as named rows ([prompt/system], [reasoning], [final_response]) instead of a single opaque bucket.",
      "Dashboard trace: per-step and cumulative token cost shown next to each trace event.",
    ],
  },
  {
    version: "1.0.4",
    date: "2026-04-14",
    changes: [
      "propose_circuit now requires pinRoles for every component pin (no optional fallback).",
      "Added strict pin-role validation (coverage + role-to-wire compatibility for signal/power/ground references).",
      "Updated build-mode prompt examples to include required pinRoles payloads.",
    ],
  },
  {
    version: "1.0.3",
    date: "2026-04-14",
    changes: [
      "Increased propose_circuit layout separation using larger row gaps to reduce accidental shared-net collisions.",
      "Updated component footprint height assumptions for seven-segment and LCD placement to avoid overly dense packing.",
    ],
  },
  {
    version: "1.0.2",
    date: "2026-04-14",
    changes: [
      "propose_circuit now runs a final electrical validation gate and fails fast on power-budget errors instead of returning a successful build.",
      "Series-intermediate placement now avoids reusing breadboard bus rows that collide with existing unrelated component pins (prevents button/segment net collisions).",
      "Eval resistor lead check aligned with Breadbox resistor footprint (3/6 columns) to reduce false-positive unconnected resistor issues.",
    ],
  },
  {
    version: "1.0.1",
    date: "2026-04-14",
    changes: [
      "Added snapshot-version pinning support for runs (agentSnapshotVersion) so behavior profiles can be selected per request and reproduced later.",
      "Core agent now reads prompt/config snapshots by version, with safe fallback to current defaults.",
      "Delegated child runs inherit parent snapshot version for consistent behavior within a turn.",
    ],
  },
  {
    version: "1.0.0",
    date: "2026-04-14",
    changes: [
      "Initial versioned baseline.",
      "Core agent: max 10 steps (stepCountIs(10)), Sonnet for complex/debug, Haiku for simple.",
      "Circuit specialist: max 8 steps, 30s timeout, no recursion.",
      "Graph specialist: max 8 steps, 30s timeout, Haiku.",
      "Tool modes: build (empty board), edit (populated), all (rebuild).",
      "Delegation: max 1 circuit + 1 graph per turn, 2 retries with backoff.",
      "Sketch recovery: max 2 consecutive failures before hard abort.",
      "Post-stream: policy engine → power budget + routing checks; reflection with confidence threshold 0.5.",
      "Message compaction starts after step 2, keeps last 4 messages.",
    ],
  },
];
