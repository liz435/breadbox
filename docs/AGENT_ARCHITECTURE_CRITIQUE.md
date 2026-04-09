# Agent Architecture — Current State & Critique

> Audit date: 2026-04-08

---

## Architecture Overview

```
User message
  │
  ▼
Frontend (useChat + DefaultChatTransport)
  │  POST /api/chat { messages, projectId, threadId, expectedVersion }
  ▼
Chat Route (Elysia)
  │  Loads thread history, creates AgentRun record
  ▼
Core Agent (claude-sonnet-4-6)
  │  System prompt: Arduino pinout + component knowledge + delegation rules
  │  Tools: get_board_state, place_component, remove_component,
  │          connect_wire, update_sketch, get_sketch,
  │          delegate_to_graph_agent, delegate_to_circuit_agent
  │  Max 10 steps per turn
  │
  ├──→ Graph Agent (claude-haiku-4-5)        ← delegation
  │      Tools: list_graph, create/delete/move/connect/update nodes
  │      Max 8 steps, returns GraphOp[]
  │
  ├──→ Circuit Agent (claude-haiku-4-5)      ← delegation
  │      Tools: suggest_circuit, validate_wiring, list_components
  │      Max 8 steps, returns BoardOp[]
  │
  ▼
Ops streamed to frontend via SSE
  │  data-scene-ops  → applyBoardOpsToBoard() / applyGraphOpsToGraph()
  │  data-token-usage → session cost tracking
  │  data-scene-result → version bump
  ▼
XState machines (Board, Graph, Scene)
  │  PLACE_COMPONENT, ADD_WIRE, UPDATE_SKETCH, ADD_NODE, ADD_EDGE, etc.
  ▼
UI re-renders (breadboard, graph, editor, schematic)
```

---

## What Works Well

### 1. Streaming ops architecture
Ops stream to the client as the agent generates them — the user sees components appear in real-time, not all at once after the agent finishes. This is a strong UX pattern.

### 2. Multi-agent delegation
The core agent delegates to specialist graph/circuit agents using cheaper Haiku models. This keeps cost low for mechanical tasks (placing nodes, validating wiring) while using Sonnet for reasoning.

### 3. Shared op format
Both agent and human actions use the same op/event types through the same state machines. There's no "agent state" separate from "user state" — everything goes through PLACE_COMPONENT, ADD_WIRE, etc. This means undo/redo works for agent actions too.

### 4. Server-side persistence + client-side application
Ops are applied both server-side (persisted to project file) and client-side (XState events). The version number prevents stale writes. Good conflict avoidance.

### 5. Conversation history across turns
Thread-based history built from prior core runs. The agent has context of what it did previously. Only core run messages are included (not child delegation details), keeping context lean.

---

## Critique — What's Wrong

### CRITICAL: Agent can't modify existing components

The core agent has `place_component` and `remove_component` but **no `update_component` tool**. It cannot:
- Change a resistor's resistance value
- Change an LED's color
- Move a component to a different position
- Update pin assignments on a placed component

**Impact:** "Change the LED color to blue" requires the agent to remove the LED and re-place it — losing its wire connections and pin assignments. Users will ask for this constantly.

**Fix:** Add `update_component` tool that accepts `componentId` + partial changes (properties, pins, position). Map to the existing `UPDATE_COMPONENT` board machine event.

### CRITICAL: Agent can't edit wires

No `update_wire` or `remove_wire` tools. The agent can create wires but can't fix wiring mistakes or modify existing connections.

**Impact:** "Move the wire from pin 13 to pin 12" is impossible. The agent would need to tell the user to do it manually.

**Fix:** Add `remove_wire` and `update_wire` tools. The board machine already has both events.

### HIGH: No board state in agent context

The core agent has `get_board_state` as a tool it must explicitly call. But it doesn't automatically see the current board state in its system prompt or first message. On the first turn, the agent is blind — it must spend a tool call just to see what's on the board.

**Impact:** Every conversation starts with a wasted tool call. Multi-step requests ("add an LED and connect it to pin 13") require the agent to first read state, then plan.

**Fix:** Inject the current board state summary into the system prompt or as a prefilled assistant turn. Include: component list with positions/pins, wire connections, sketch code length. Cost is ~200 tokens, saves a round trip every time.

### HIGH: Circuit agent duplicates core agent capabilities

The circuit agent has `suggest_circuit` which places components — but the core agent also has `place_component`. When the core delegates to the circuit agent, both can try to place components. There's no coordination on who "owns" placement.

**Impact:** The circuit agent might place components at positions that conflict with what the core agent already placed. No deduplication of ops.

**Fix:** Either:
- Make circuit agent advisory-only (returns suggestions, core agent executes them)
- Or give circuit agent exclusive placement authority and remove placement from core

### HIGH: No error recovery for failed ops

When `projectRepo.applyBoardOps()` rejects ops (e.g., version conflict, invalid component position), the rejection is logged server-side but the agent doesn't learn about it. It continues thinking the op succeeded.

**Impact:** Agent places a component at an invalid position → op rejected → agent references the component ID in a follow-up wire connection → wire fails too → cascading silent failures.

**Fix:** Feed op application results back into the agent's tool result. If an op is rejected, the tool should return an error message so the agent can retry with corrected parameters.

### HIGH: Graph agent has no awareness of board state

The graph agent generates visual nodes for Arduino logic (digitalWrite, analogRead, etc.) but has no access to the board state. It doesn't know which components exist, which pins are assigned, or what wires are connected.

**Impact:** Graph agent creates a `digital_write` node for pin 13, but pin 13 isn't connected to anything on the breadboard. The generated code won't match the circuit.

**Fix:** Pass board state summary to the graph agent's context (component list + pin assignments). Or have the core agent pass relevant pin info in the delegation task description.

### MEDIUM: System prompt is stale relative to codebase

The core agent's system prompt describes 12 component types, but the codebase now has 22. The prompt doesn't mention NeoPixel, DHT, PIR, relay, DC motor, IR receiver, shift register, or OLED display.

**Impact:** Agent doesn't know about new components. User says "add a NeoPixel strip" → agent doesn't know the type, footprint, or default pins.

**Fix:** Generate the component section of the system prompt dynamically from `COMPONENT_REGISTRY` instead of hardcoding it.

### MEDIUM: No validation before placement

`place_component` accepts any (x, y) position without checking:
- Is the position on the breadboard?
- Does it overlap with an existing component?
- Is the footprint within bounds?

**Impact:** Agent can place components at invalid positions or on top of each other. The breadboard doesn't enforce bounds either, so the component just appears in empty space.

**Fix:** Add server-side validation in the `place_component` tool: check footprint doesn't overlap existing components, check position is within breadboard grid bounds.

### MEDIUM: Delegation overhead is high

Each delegation creates a full child agent run with its own conversation turn, token tracking, and persistence. For simple tasks like "place 3 nodes for a blink program," this adds ~2-3 seconds of latency and 500+ tokens of overhead (system prompt + tool schemas for the child agent).

**Impact:** A circuit suggestion that could be a single tool call instead spawns an entire Haiku agent conversation.

**Fix:** For simple, well-defined tasks, consider direct tool implementations instead of delegation. E.g., a `create_blink_circuit` tool that places LED + resistor + wires deterministically, no AI needed.

### MEDIUM: No streaming for delegated agent ops

Board ops from the core agent stream in real-time. But ops from delegated agents (graph, circuit) are collected and sent as a batch after the child agent finishes (chat.ts:273-277). The user sees nothing during delegation.

**Impact:** When the graph agent creates 10 nodes, the user stares at a loading indicator for 5-10 seconds, then all nodes appear at once. Breaks the real-time feel.

**Fix:** Stream child agent ops through the parent's `onNewOps` callback as they're generated, not as a post-collection batch.

### LOW: Token usage tracking is per-session, not persistent

`sessionTokenUsage` is stored in React state — it resets on page reload. There's no cumulative usage tracking across sessions.

**Impact:** Users can't see their total API usage. No cost awareness.

### LOW: No agent action preview / confirmation

The agent applies ops immediately — there's no "preview" step where the user can approve changes before they're committed. Undo exists but isn't surfaced in the chat UX.

**Impact:** Agent places 5 components in the wrong positions → user must undo 5 times or doesn't realize what changed.

**Fix (future):** Add a "proposed changes" preview that shows a diff of what the agent wants to do, with Accept/Reject buttons.

---

## Missing Capabilities (vs. what users expect)

| User Request | Agent Can Do It? | Gap |
|---|---|---|
| "Add an LED to pin 13" | Yes | — |
| "Change LED color to blue" | No | No `update_component` tool |
| "Move the button to row 5" | No | No `move_component` tool |
| "Remove the wire from pin 13" | No | No `remove_wire` tool |
| "What voltage is across the LED?" | No | No circuit analysis tool |
| "Run the sketch" | No | No simulation control tool |
| "Fix the wiring" | Partial | Can validate but can't edit wires |
| "Make the LED blink faster" | Yes (sketch only) | Can update_sketch |
| "Add a NeoPixel strip" | No | System prompt doesn't list new components |
| "Explain this circuit" | Partial | Can read state but no analysis data |

---

## Tool-by-Tool Critique

### Core Agent Tools

#### `get_board_state` — Read-only query
**Problem:** Returns the full board state including all components, wires, pinStates, and sketch code. For a board with 20 components and a 100-line sketch, this is ~2,000 tokens of output. The agent burns tokens reading state it may not need.

**Fix:** Split into granular queries: `list_components` (names + IDs + positions), `get_component_details(id)`, `list_wires`, `get_sketch`. The agent calls only what it needs. Or better — inject a compact summary into the system prompt and eliminate the need for most queries.

#### `place_component` — Places a new component
**Problems:**
1. **Hardcoded 12 component types** in the z.enum — codebase now has 22. Agent can't place NeoPixel, DHT, PIR, relay, DC motor, IR receiver, shift register, or OLED.
2. **No position validation** — accepts any (x, y) including negative numbers, off-grid positions, or positions occupied by existing components.
3. **No footprint awareness** — doesn't check if the component's multi-hole footprint overlaps another component.
4. **`rotation` takes degrees** but the board machine uses 0-3 (90° increments). If the agent passes `90`, the component stores `90` instead of `1`.
5. **Pin names in `pins` schema are unvalidated** — agent can pass `{ anode: 13 }` for a button that expects `{ a: null, b: null }`. No error, just silently wrong.

**Fix:**
- Generate the enum from the schema or registry dynamically
- Add validation: check bounds, check footprint overlap, validate pin names against component definition
- Fix rotation to accept 0-3 or auto-divide by 90

#### `remove_component` — Removes by ID
**Problem:** Doesn't clean up connected wires. If the agent removes a component, wires connected to its grid positions become orphaned — dangling in space with no endpoints.

**Fix:** Either auto-remove connected wires (like a cascade), or return a warning listing wires that are now orphaned so the agent can remove them too.

#### `connect_wire` — Creates a wire
**Problems:**
1. **Raw grid coordinates are hard for the model** — the agent has to know that "connect LED anode to Arduino pin 13" means fromRow=5, fromCol=0, toRow=-999, toCol=13 (the Arduino pin sentinel). This coordinate system is internal implementation detail leaking into the tool interface.
2. **No Arduino-pin wire support** — there's no way to express "wire from Arduino pin 13 to breadboard hole". The sentinel `fromRow=-999` pattern isn't documented in the tool schema.
3. **No validation** — wires can connect two points that are already on the same net (redundant) or connect to empty space (useless).

**Fix:** Add a higher-level `wire_component_to_pin` tool: "connect component X's anode to Arduino pin 13" — resolves grid positions internally. Keep `connect_wire` for raw coordinate access. Add a note in the description explaining the Arduino pin sentinel pattern.

#### `update_sketch` — Replaces entire sketch
**Problem:** Requires the full sketch code every time. If the agent wants to add one line to a 100-line sketch, it must output all 100 lines plus the new one. This is wasteful — ~500 tokens for a one-line change.

**Fix:** Add a `patch_sketch` tool that accepts line-range edits: `{ startLine, endLine, newCode }`. Keep `update_sketch` for full replacements. Or add `append_to_setup` / `append_to_loop` helpers for the common case.

#### `get_sketch` — Reads current sketch
**Mostly fine.** Could merge with `get_board_state` since they're often called together.

#### `delegate_to_graph_agent` / `delegate_to_circuit_agent` — Spawn child agents
**Problems:**
1. **No board state passed to child** — the delegation only passes the `task` string. The child graph/circuit agent has access to `project.boardState` via the project file, but this is the server-side persisted state which may not include ops from earlier in the current turn (they haven't been persisted yet).
2. **Task description is the only coordination** — the core agent must describe everything the child needs in a natural-language string. If it forgets to mention "pin 13 is already used," the child doesn't know.
3. **Child ops aren't validated against parent ops** — if the parent placed a component at row 5 and the child also places at row 5, both succeed (overlapping).

**Fix:** Pass accumulated `ops` snapshot and current board state to child agents. Or better — resolve the child's ops against the parent's accumulated ops before merging.

### Circuit Agent Tools

#### `suggest_circuit` — Keyword-matching circuit builder
**This is the weakest tool in the system.** It's not AI-powered — it's a hardcoded keyword matcher:
```ts
if (desc.includes("led")) → place LED + resistor
if (desc.includes("servo")) → place servo
```

**Problems:**
1. **No actual intelligence** — "I need an LED that fades in and out" and "I need an LED indicator" get the same result (LED on pin 13 + 220Ω resistor). The circuit agent (Claude Haiku) never reasons about the circuit — the tool does the work with string matching.
2. **Hardcoded positions** — all components placed at x=10, incrementing y by 5. No awareness of what's already on the board.
3. **Hardcoded pin assignments** — LED always on pin 13, button always on pin 2. Doesn't check if those pins are already used.
4. **Only 8 component patterns** — no NeoPixel, DHT, relay, motor, OLED, shift register.
5. **No wiring** — places components but doesn't connect any wires between them or to the Arduino. The user gets floating components with no connections.

**Why this matters:** This tool makes the circuit agent appear smart from the tool description, but it's actually a glorified template engine. The AI model's reasoning is wasted — it calls the tool, the tool does keyword matching, and the result is always the same template.

**Fix:** Remove the keyword matching. Let the circuit agent use `place_component` and `connect_wire` directly (like the core agent) and use its AI reasoning to decide what to place, where, and how to wire it. The current `suggest_circuit` tool should become a set of deterministic template tools (`create_blink_circuit`, `create_button_led_circuit`) for known patterns, called explicitly.

#### `validate_wiring` — Checks for common issues
**Decent but limited.** Checks:
- LED without resistor (heuristic: checks if any resistor exists, not if it's in series)
- Servo on non-PWM pin
- Serial pin conflicts (D0/D1)
- Pin conflicts (multiple components on same pin)
- Sketch pins without components

**Problems:**
1. **LED resistor check is too naive** — it just checks if any resistor exists anywhere on the board, not whether it's actually wired in series with the LED.
2. **No wire connectivity analysis** — can't tell if components are actually connected or just sitting on the board unlinked.
3. **Doesn't use the SPICE solver** — the app has a full circuit analysis engine but this tool doesn't access it.

**Fix:** Integrate with `resolveNets()` from `breadboard-grid.ts` to check actual electrical connectivity. Use `analyzeCircuit()` results for voltage/current validation.

#### `list_available_components` — Static reference
**Problem:** Returns a hardcoded list of 12 components with pin info. Same as `place_component` — missing the 8 new types.

**Fix:** Generate from `COMPONENT_REGISTRY` dynamically.

### Graph Agent Tools

#### `create_graph_node` — Creates a visual programming node
**Mostly fine.** Has proper default data per node type (24 types), creates unique IDs, returns port list for connection.

**Problem:** Default positions aren't smart — if no position specified, defaults to (100, 100) which may overlap existing nodes.

#### `connect_nodes` — Connects two node ports
**Good design.** Validates port types match (flow→flow, data→data), returns clear error messages.

**Problem:** Port ID format is fragile — expects `"nodeId:portName"` string splitting on `:`. If a node name contains `:`, it breaks.

#### `list_graph` — Reads current graph
**Fine.** Returns nodes and edges.

**Problem:** Returns ALL data for ALL nodes. For a graph with 30 nodes, this is ~3,000 tokens. Same issue as `get_board_state`.

### Missing Tools (gaps in capability)

| Tool | Why It's Needed | Priority |
|---|---|---|
| `update_component` | Change properties, pins, position of existing component | Critical |
| `remove_wire` | Delete a wire connection | Critical |
| `move_component` | Reposition a component on the board | High |
| `update_wire` | Change wire endpoints | High |
| `wire_component_to_pin` | High-level: "connect LED anode to pin 13" without raw coordinates | High |
| `read_circuit_analysis` | Get voltage, current, warnings from SPICE solver | Medium |
| `run_sketch` / `stop_sketch` | Start/stop simulation from chat | Medium |
| `patch_sketch` | Edit specific lines instead of full replacement | Medium |
| `get_component_by_name` | Find a component ID by its display name | Low |
| `list_wires_for_component` | Find wires connected to a specific component | Low |

---

## Recommended Fixes — Status

### ~~Phase 1 — Unblock basic interactions~~ DONE
1. ~~Add `update_component` tool~~ — Changes properties, pins, name. Validates component exists.
2. ~~Add `remove_wire` tool~~ — Removes wire by ID.
3. ~~Add `move_component` tool~~ — Moves to new position with bounds validation.
4. ~~Inject board state into system prompt~~ — `summarizeBoardState()` generates compact summary (components + positions + pins + wires), injected into system prompt for core, circuit, and graph agents. No more wasted `get_board_state` first call.
5. ~~Update system prompt with all 22 component types~~ — Grouped by category (output/input/passive/display/other) with wiring rules for each.

### ~~Phase 2 — Improve reliability~~ DONE
6. ~~Feed op rejection errors back to agent tool results~~ — `place_component` returns error if position occupied. `update_component`, `move_component`, `remove_wire`, `update_wire` return error if entity not found.
7. ~~Add position/overlap validation in `place_component`~~ — Checks existing components at same (x, y). Returns actionable error message with conflicting component name.
8. ~~Update component lists in circuit tools~~ — `list_available_components` now returns all 22 types. `validate_wiring` checks OLED I2C pins, servo/motor PWM pins, unassigned pins, unconnected components, LED resistor proximity.
9. ~~Pass board state to child agents~~ — Both circuit and graph agents receive `summarizeBoardState()` in their user message. `suggest_circuit` replaced with proper `place_component` + `connect_wire` tools on the circuit agent (AI-driven, not keyword-matched).

### ~~Phase 3 — Extend capabilities~~ DONE
10. `read_circuit_analysis` — Not yet implemented (requires wiring SPICE solver into API layer). Deferred.
11. `run_sketch` / `stop_sketch` — Not yet implemented (simulation runs client-side). Deferred.
12. ~~Add `update_wire` tool~~ — Removes old wire + creates new with updated endpoint.
13. ~~Add deterministic circuit templates~~ — `create_blink_circuit`, `create_button_led_circuit`, `create_servo_sweep_circuit`. Each places components + writes complete sketch in a single tool call. No AI round-trips needed for common patterns.

### Additional fixes applied
- ~~`place_component` enum expanded~~ — 12 → 22 component types
- ~~`place_component` rotation fixed~~ — Now 0-3 (90° increments) with int validation, not degrees
- ~~`wire_component_to_pin` tool added~~ — High-level: "wire component X to Arduino pin Y" without raw grid coordinates
- ~~`patch_sketch` tool added~~ — Line-range edits instead of full replacement
- ~~`remove_component` warns about orphaned wires~~ — Returns list of wires connected to removed component's position
- ~~`connect_wire` documented Arduino pin sentinel~~ — Description explains fromRow=-999 pattern with examples for 5V, GND, digital, and analog pins


