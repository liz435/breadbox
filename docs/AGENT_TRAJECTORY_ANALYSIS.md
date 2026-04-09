# Agent Placement Trajectory Analysis

> Analysis of actual agent runs from project "sunny-wren-band" (69b6ed38)

---

## Run Timeline

### Run 1: Core Agent (11 ops)

```
User: "build a potentiometer-controlled LED brightness circuit"

Step 1 — Agent plans and places 3 components:
  CALL: place_component({ type: "potentiometer", x: 5, y: 10, pins: { vcc: -1, gnd: -3, wiper: 14 } })
  CALL: place_component({ type: "led", x: 18, y: 10, pins: { anode: 9, cathode: null } })     ← x=18 OFF BOARD
  CALL: place_component({ type: "resistor", x: 23, y: 10, pins: { pin1: null, pin2: null } })  ← x=23 OFF BOARD
  → All return empty string (no error, no confirmation)

Step 2 — Agent wires components:
  CALL: wire_component_to_pin({ componentId: "d136103b...", arduinoPin: 14 })
  CALL: wire_component_to_pin({ componentId: "2dcbb21f...", arduinoPin: 9 })
  → Both return empty string

Step 3 — Agent reads state to verify:
  CALL: get_board_state({})
  → Returns empty string ← BUG: tool result not serialized

Step 4 — Agent sees empty board, thinks components didn't persist:
  TEXT: "It seems the components didn't persist. Let me place them fresh:"
  CALL: place_component({ type: "potentiometer", x: 5, y: 10 })  ← DUPLICATE at same position
  CALL: place_component({ type: "led", x: 18, y: 10 })           ← DUPLICATE, still off board
  CALL: place_component({ type: "resistor", x: 23, y: 10 })      ← DUPLICATE, still off board

Step 5 — Agent reads state again:
  CALL: get_board_state({})
  → Still returns empty string

Step 6 — Agent gives up, delegates to circuit agent:
  CALL: delegate_to_circuit_agent({ task: "Build potentiometer-controlled LED..." })
```

### Run 2: Circuit Agent (5 ops, child of Run 1)

```
Step 1 — Circuit agent places 3 components (strings first attempt):
  CALL: place_component({ type: "potentiometer", x: 5, y: 10, pins: { VCC: "-1", GND: "-3", Wiper: "14" } })
  CALL: place_component({ type: "resistor", x: 15, y: 5, pins: { A: "9", B: "15" } })
  CALL: place_component({ type: "led", x: 20, y: 5, pins: { Anode: "15", Cathode: "-3" } })
  → All return empty string ← pin values are STRINGS, not numbers

Step 2 — Agent notices pin type error, retries with numbers:
  TEXT: "Let me correct the pin values—they should be numbers, not strings:"
  CALL: place_component({ type: "potentiometer", x: 5, y: 10, pins: { VCC: -1, GND: -3, Wiper: 14 } })  ← 3rd pot at same position!
  CALL: place_component({ type: "resistor", x: 15, y: 5, pins: { A: 9, B: 15 } })
  CALL: place_component({ type: "led", x: 20, y: 5, pins: { Anode: 15, Cathode: -3 } })   ← x=20 OFF BOARD

Step 3 — Agent wires and validates:
  CALL: connect_wire({ fromRow: -999, fromCol: 14, toRow: 10, toCol: 5 })  ← correct
  CALL: connect_wire({ fromRow: -999, fromCol: 9, toRow: 5, toCol: 15 })   ← toCol=15 OFF BOARD
  CALL: validate_wiring({})
  → Returns empty string (should return validation results)
```

---

## Root Cause Analysis

### Problem 1: Components placed off the breadboard

| Component | Position | Valid Range | Status |
|---|---|---|---|
| Potentiometer | x=5, y=10 | x: 0-9, y: 0-29 | Valid |
| LED | x=18, y=10 | x: 0-9, y: 0-29 | **OFF BOARD** (x=18 > max 9) |
| Resistor | x=23, y=10 | x: 0-9, y: 0-29 | **OFF BOARD** (x=23 > max 9) |
| LED (circuit agent) | x=20, y=5 | x: 0-9, y: 0-29 | **OFF BOARD** |
| Resistor (circuit agent) | x=15, y=5 | x: 0-9, y: 0-29 | **OFF BOARD** |

**Cause:** The agent tool schema allows `x: 0-30` and `y: 0-30`, but the breadboard is only 10 columns wide (0-9) and 30 rows tall (0-29). The agent thinks x can go up to 30 and spreads components horizontally.

**Reason the agent picks high x values:** The system prompt says "Rows are numbered, columns are lettered" but the tool takes numeric x/y. The agent interprets the breadboard as much wider than it is — it thinks x=18 is a valid column because the schema allows it.

### Problem 2: Duplicate components at same position

**Sequence:**
1. Core agent places pot at (5, 10) → succeeds (op pushed)
2. Core agent calls `get_board_state` → returns empty (bug)
3. Core agent thinks placement failed → places AGAIN at (5, 10)
4. Circuit agent also places pot at (5, 10) → 3rd duplicate

**Cause:** `get_board_state` returns the server's persisted state, but ops from the current turn haven't been applied yet. The tool reads `project.boardState` which is a snapshot from before the turn started. The agent sees an empty board and retries.

### Problem 3: Tool results return empty strings

All tool calls return `""` in the run log. This means either:
- The tool's return value isn't being serialized into the message
- Or the tool returns `{ componentId: "..." }` but the AI SDK logs it as empty

**Impact:** The agent can't verify its actions. It places a component, gets no confirmation, calls `get_board_state`, sees stale state, and retries — creating duplicates.

### Problem 4: Pin names don't match registry

| Agent Used | Registry Expected |
|---|---|
| `{ pin1, pin2 }` | `{ a, b }` (resistor) |
| `{ VCC, GND, Wiper }` | `{ vcc, gnd, signal }` (potentiometer) |
| `{ Anode, Cathode }` | `{ anode, cathode }` (LED) |
| `{ A, B }` | `{ a, b }` (resistor) |

**Cause:** The tool description says "provide pin assignments" but doesn't list the exact expected pin names per component type. The agent guesses and gets the casing wrong.

### Problem 5: Wire endpoints go to off-board positions

Wire `toCol=15` puts the wire endpoint at column 15, which is off the 10-column breadboard. This happens because `wire_component_to_pin` resolves to the component's stored position, which was already off-board.

---

## Validation Gap Map

```
Agent calls place_component(x=18)
    │
    ├─ Tool schema: z.number().int().min(0).max(30) ← WRONG, should be max(9)
    │  → Passes validation
    │
    ├─ Overlap check: only checks exact (x,y) match
    │  → No overlap at (18, 10) — but position is off-board
    │
    ├─ No bounds check against ROWS/COLS constants
    │  → Op created with x=18
    │
    ▼
makeBoardOp stamps the op
    │  → No validation
    ▼
Server applies op
    │  → boardComponentSchema: x is z.number() with NO min/max
    │  → applyBoardOp: blind insertion into components record
    │  → No overlap check, no bounds check
    ▼
Client receives op
    │  → applyBoardOpsToBoard: dispatches PLACE_COMPONENT directly
    │  → Board machine: blind insertion
    ▼
gridToPixel(row=10, col=18)
    │  → Extrapolates off-board → pixel position in empty space
    ▼
Component renders outside the visible breadboard
```

---

## Fixes Required

### 1. Fix tool schema bounds (CRITICAL)
```
x: z.number().int().min(0).max(9)    // was max(30)
y: z.number().int().min(0).max(29)   // was max(30)
```

### 2. Fix stale board state in tool reads (CRITICAL)
`get_board_state` must include ops from the current turn. Either:
- Maintain an in-memory board state that's updated as ops are pushed
- Or apply pending ops to a working copy before returning

### 3. Add pin name validation (HIGH)
Look up `defaultPins` from the component registry. Reject or warn if pin names don't match.

### 4. Add footprint-aware overlap check (HIGH)
Current check only tests the primary (x, y) position. A resistor spans 5 columns (x to x+4). Two components can overlap if their footprints intersect even though their primary positions differ.

### 5. Improve system prompt with breadboard dimensions (MEDIUM)
Add to system prompt:
```
Breadboard grid: 30 rows (y: 0-29) × 10 columns (x: 0-9)
Left terminal strip: columns 0-4
Right terminal strip: columns 5-9  
Center gap between columns 4 and 5
Power rails: columns -2, -1 (left) and 10, 11 (right)
```

### 6. Add expected pin names per component to tool description (MEDIUM)
Either in the tool description or as a reference tool the agent can call.

### 7. Fix boardComponentSchema bounds (LOW — defense in depth)
```
x: z.number().int().min(-2).max(11)   // include power rails
y: z.number().int().min(0).max(29)
```
