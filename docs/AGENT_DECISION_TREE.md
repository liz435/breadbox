# Agent Decision Tree

How a single user prompt is routed through Breadbox's agent stack — from raw text to a board mutation.

## High-level flow

```
USER PROMPT
   │
   ▼
┌──────────────────────────────────────────┐
│ 1. classifyIntent(prompt)                │  packages/api/src/agents/intent-classifier.ts
│    Regex router → template OR agent      │
└──────────────────────────────────────────┘
   │
   ├── template match ─────────────► TEMPLATE PATH
   │                                 (deterministic, 0 tokens)
   │
   └── no template / escape word ──► AGENT PATH
                                     (LLM reasoning)
```

## Stage 1 — Intent classifier (regex, ~0 ms, 0 tokens)

`classifyIntent(prompt)` returns one of:

| Result | When | Next step |
|---|---|---|
| `{ type: "template", template: "blink", ... }` | Prompt matches a known pattern (`blink LED`, `traffic light`, `servo sweep`, …) | Run hard-coded template — no LLM call |
| `{ type: "template", ..., additive: true }` | Same, plus additive trigger (`add a led`, `keep current`) | Template emits ops on top of existing board |
| `{ type: "agent" }` | No template match, OR escape phrase (`another circuit`, `keep only the led`, `replace with`) | Fall through to Stage 2 |

### Templates (deterministic, no LLM)

```
blink            → 1 LED + resistor + Arduino blink sketch
button_led       → button gates LED
servo_sweep      → servo + sweep loop
traffic_light    → 3 LEDs + state machine
pot_led          → pot reads ADC, PWM brightness
temperature_reading → temp sensor + Serial print
buzzer_tone      → buzzer + tone() melody
```

Templates are zero-token, deterministic, and always-correct. They short-circuit the agent entirely.

## Stage 2 — Core agent (LLM)

If no template fired, control reaches `streamCoreAgent` in [packages/api/src/agents/core/agent.ts](packages/api/src/agents/core/agent.ts).

The first thing it calls is `selectModelAndMode(prompt, projectId, board)`, which makes **two independent decisions**:

```
                    ┌─────────────────────────┐
                    │ selectModelAndMode()    │
                    └─────────────────────────┘
                       │              │
              ┌────────┘              └─────────┐
              ▼                                 ▼
   ┌─────────────────────┐          ┌──────────────────────┐
   │ MODEL (by prompt)   │          │ MODE (by board)      │
   │ classifyComplexity  │          │ board.components     │
   └─────────────────────┘          └──────────────────────┘
        │         │                       │          │
   simple│  complex│                  empty│   populated│
        ▼         ▼                       ▼          ▼
     HAIKU     SONNET                  BUILD       EDIT
```

### Dimension A — Model selection (cost / capability)

`classifyComplexity(prompt)` (regex):

| Returns | Triggered by | Model | Cost |
|---|---|---|---|
| `simple` | `add a/an/one/another`, `remove`, `delete`, `change color`, `move`, `rename`, `turn on/off`, greetings, `update sketch` | **Haiku 4.5** | ~$1/$5 per Mtok |
| `complex` | `debug`, `fix`, `why`, `not working`, `refactor`, `optimize`, `multiple`, `circuit`, `analyze`, `validate`, `i2c`, `spi`, `interrupt`, `lcd`, `oled`, `neopixel`, `node-block`, `visual`; ≥2 component types; prompts >200 chars | **Sonnet 4.6** | ~$3/$15 per Mtok |
| `complex` (default) | Anything not matching simple patterns | **Sonnet 4.6** | safety net |

### Dimension B — Tool mode (which tools are exposed)

| Board state | Mode | Tools available | System prompt |
|---|---|---|---|
| 0 user components | **`build`** | `get_board_state`, `get_wiring_guide`, `propose_circuit`, `delegate_to_*` | `BUILD_PROMPT` — "use propose_circuit, here's how" |
| ≥1 user component | **`edit`** | `get_board_state`, `get_wiring_guide`, `place/update/move/remove_component`, `connect/wire/remove/update_wire`, `update_sketch`, `patch_sketch`, `delegate_to_*` | `EDIT_PROMPT` — "preserve existing, smallest change" |

`createCoreTools({ mode })` filters its returned object via `BUILD_MODE_TOOLS` / `EDIT_MODE_TOOLS` sets in [packages/api/src/agents/core/tools.ts](packages/api/src/agents/core/tools.ts).

The two dimensions are **independent**: a "complex" prompt on an empty board → Sonnet + build; a "simple" prompt on a populated board → Haiku + edit; etc.

## The 2×2 routing matrix

|              | empty board (build mode)             | populated board (edit mode)              |
|--------------|--------------------------------------|------------------------------------------|
| **simple**   | Haiku + `propose_circuit` only       | Haiku + granular CRUD tools              |
| **complex**  | Sonnet + `propose_circuit` only      | Sonnet + granular CRUD tools             |

### Worked examples

```
"blink an LED"
  → classifyIntent → template "blink" → ops emitted, no LLM call

"another circuit, traffic light"
  → classifyIntent → REPLACEMENT_PATTERNS escape → agent
  → empty board? assume yes → BUILD mode
  → "circuit" matches COMPLEX_PATTERNS → SONNET
  → Sonnet + build mode + propose_circuit

"add a buzzer to D8"
  → classifyIntent → ADDITIVE_PATTERNS → no matching template → agent
  → board has components → EDIT mode
  → "add a" matches SIMPLE_PATTERNS → HAIKU
  → Haiku + edit mode + place_component/connect_wire

"why is my LED not blinking"
  → classifyIntent → no template → agent
  → board has components → EDIT mode
  → "not working" / "why" → COMPLEX → SONNET
  → Sonnet + edit mode + read tools + sketch tools

"build me a NeoPixel rainbow with a button"
  → classifyIntent → no template → agent
  → empty board → BUILD mode
  → "neopixel" → COMPLEX → SONNET
  → Sonnet + build mode + propose_circuit
```

## Stage 3 — Inside the LLM loop

Once model + mode + tools are pinned, `streamText` runs up to 10 steps:

```
┌───────────────────────────────────────────────┐
│ streamText(model, tools, messages)            │
│   stopWhen: stepCountIs(10)                   │
└───────────────────────────────────────────────┘
            │
            ▼
   ┌─────────────────┐
   │ LLM step        │◄──────────────┐
   └─────────────────┘                │
            │                         │
   tool calls? ──no──► finish text ──┘
            │
           yes
            ▼
   ┌─────────────────┐
   │ execute tool    │  appends BoardOp(s) to ops[]
   └─────────────────┘
            │
            ▼
   onStepFinish → stream new ops to client (live preview)
            │
            └──────► next step
```

Tools that call other agents (`delegate_to_graph_agent`, `delegate_to_circuit_agent`) recursively run their own runners and merge ops back into the parent's `ops[]`.

## Stage 4 — Eval (post-run)

After `agentRunRepo.completeRun(...)` writes the run, the auto-eval hook fires:

```
RunFile → evaluateRun() → analyzers ──┐
                                       ├─ path     (trace, hallucinations)
                                       ├─ tokens   (cost, waste)
                                       ├─ tools    (error rate, popularity)
                                       └─ circuit  (placement, wires, sketch compile)
                                       │
                                       ▼
                                  computeScore() → 0-100
```

Each run's eval feeds the dashboard at `GET /api/eval/dashboard`.

## Files involved

| Concern | File |
|---|---|
| Regex router & complexity classifier | [packages/api/src/agents/intent-classifier.ts](packages/api/src/agents/intent-classifier.ts) |
| Templates (deterministic ops) | [packages/api/src/agents/templates.ts](packages/api/src/agents/templates.ts) |
| Core agent — model + mode wiring | [packages/api/src/agents/core/agent.ts](packages/api/src/agents/core/agent.ts) |
| Core tool definitions + mode filtering | [packages/api/src/agents/core/tools.ts](packages/api/src/agents/core/tools.ts) |
| Graph agent (visual node-block) | [packages/api/src/agents/graph/agent.ts](packages/api/src/agents/graph/agent.ts) |
| Circuit agent (validation) | [packages/api/src/agents/circuit/agent.ts](packages/api/src/agents/circuit/agent.ts) |
| Auto-eval | [packages/api/src/eval/run-evaluator.ts](packages/api/src/eval/run-evaluator.ts) |

## Why this layout

- **Templates** absorb the high-frequency "blink an LED" cases at zero cost.
- **Mode filtering** prevents the largest class of agent mistakes — using `propose_circuit` (which clears the board) on an in-progress edit, or wandering into granular CRUD when a single `propose_circuit` would do.
- **Complexity routing** keeps the trivial 80% of edits on cheap Haiku while reserving Sonnet for genuinely hard reasoning. Cost drops without quality loss because the routing is conservative (defaults to complex).
- **Independent dimensions** mean each axis can be tuned without touching the other — adding a new template doesn't affect model choice, and tightening the complexity regex doesn't affect tool exposure.
