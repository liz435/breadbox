# Agent

The hardware agent lives in `packages/api/src/agents/`. It is a Vercel AI
SDK harness (`streamText` + `tool()`) that turns a natural-language request
into a stream of `BoardOp` values. Those ops are applied server-side
(persisted to the project file + board tracker) and streamed to the browser
to mutate the XState board machine.

## Request/response shape

```
Browser                                Elysia /api/chat                   AI SDK
───────                                ────────────────                   ──────
useChatMessages (useChat)  ──POST──>   chatRoutes.post                    anthropic()
  transport=DefaultChat                  validate body                    streamText({
    Transport({                          classify intent                    model, tools,
      api:/api/chat,                     if template: fast path             messages,
      body:{projectId,                   else:                              stopWhen:
           sceneId,                        streamCoreAgent(ctx)              stepCountIs(10)
           threadId,                        buildTieredMemory()           })
           sessionId,                       streamText(...)
           expectedVersion}                 projectRepo.applyBoardOps
    })                                     agentRunRepo.completeRun
                                           <─── SSE back ────
  onData(dataPart):
    'data-scene-ops'  -> applyBoardOpsToBoard (XState send)
    'data-token-usage'-> session token tracker
    'data-scene-result'-> bump local project version
    'data-plan-preview'-> confirmation UI for destructive ops
    'data-trace'      -> trace panel
```

- **Transport** is `DefaultChatTransport` from `ai` (`@ai-sdk/react`). Body
  fields are merged with the UIMessage array; the backend schema in
  `routes/chat.ts:26` validates them with zod.
- **Versioning**: `expectedVersion` is the board version the client last saw.
  If the server applied a concurrent mutation, `projectRepo.applyBoardOps`
  throws `VersionConflictError` and the backend aborts both board and graph
  ops atomically, streaming an `error` part.

## File layout

```
packages/api/src/agents/
├─ core/
│  ├─ agent.ts        streamCoreAgent — main entry
│  ├─ tools/           28 tool() definitions + createCoreTools()
│  └─ prompts.ts      BUILD / EDIT system prompts (versioned snapshots)
├─ router.ts          routeRequest — picks model + mode (build|edit) + domain
├─ planner.ts         generatePlan — lightweight pre-stream plan generator
├─ reflection.ts      reflectOnOutput — post-run "does output match prompt?"
├─ policy-engine.ts   runPolicies — power/routing checks + remediations
├─ tiered-memory.ts   buildTieredMemory — per-request history reconstruction
├─ history-summarizer.ts
├─ intent-classifier.ts   template-match shortcut
├─ circuit-templates.ts   hard-coded LED/button/etc templates
├─ prompt-normalizer.ts   rewrites prompt if domain component detected
├─ trace.ts           span tracking for observability
├─ make-op.ts         makeBoardOp({projectId, sceneId, expectedVersion}, body)
├─ types.ts           AgentContext, AgentResult
├─ version.ts         AGENT_VERSION + snapshot resolver
└─ skills.ts          (currently-unused specialist skill registry)
```

## Core agent flow

`streamCoreAgent(ctx)` in `core/agent.ts`:

1. **Prompt normalization** (`prompt-normalizer.ts`). If the prompt mentions
   a known component (`"buzzer"`, `"LCD"`, …) the normalizer rewrites it
   into a structured form. The original is still passed to the router.
2. **Routing** (`router.ts`). Picks:
   - **Model** — `claude-haiku-4-5-20251001` for cheap edits, `claude-sonnet-4-6`
     for build or complex edits. The decision is logged and persisted on the
     run file.
   - **Tool mode** — `"build"` when the board is empty (use `propose_circuit`
     as the primary tool), `"edit"` otherwise.
   - **Domain** and **complexity** — feed into prompt snapshot selection
     and the planner.
3. **Tool construction** (`createCoreTools(...)` in `core/tools/index.ts`).
   Returns 28 tools bound to shared mutable state (`workingBoard`, `ops` array).
4. **System prompt** — `core/prompts.ts` exports `CORE_PROMPT_SNAPSHOTS`
   keyed by `AGENT_VERSION`. Each snapshot has `{ buildPrompt, editPrompt }`.
   The chosen prompt is concatenated with a compact board summary and
   wrapped in Anthropic ephemeral cache control so the prefix is cached.
5. **Planner** (`planner.ts`). Generates an `AgentPlan` (steps + destructive
   flag) in parallel with the stream. Non-blocking — `collectResult` awaits
   it. If `isDestructive`, the chat route emits a `data-plan-preview` part
   before the stream's text.
6. **streamText** with `stopWhen: stepCountIs(10)` and `prepareStep` hook
   that compacts older tool results at each step (tool-result objects get
   rewritten to tiny summaries after step 2 — saves ~40% of accumulated
   input tokens). Token usage is attributed per tool by splitting each
   step's `usage` across the `toolCalls` it produced.
7. **Policy engine** (`policy-engine.ts`). After streaming, runs
   power-budget + routing policies over `workingBoard + ops`. Either
   appends remediation ops (e.g. `remove_wire` for a short) or blocks the
   entire set if the violations are fatal (`blocked: true`). Blocked means
   the user gets an explanation and zero applied ops.
8. **Reflection** (`reflection.ts`). One extra model call comparing the
   assistant text against the prompt + plan; if it diverges badly,
   `shouldReplan` returns true and we append an advisory note to the
   assistant text (full re-plan not yet implemented).
9. **Completion**. Tokens roll up, the run is persisted via `agentRunRepo`,
   board ops are applied via `projectRepo.applyBoardOps`, and the board
   tracker is updated.

### Tool result compaction

`prepareStep({ messages, stepNumber })` in `core/agent.ts:354`:

- Before step 2: passthrough.
- Steps 2–3: keep the 4 most recent messages, compact tool results older
  than that.
- Step 4+: keep only the 2 most recent.

Each tool has a bespoke compactor in `compactToolResult(name, value)`
(`core/agent.ts:54`). The pattern is: keep status flags + counters, drop
the bulky layout/wiring-guide/board-state payload. For example,
`propose_circuit` keeps `success`, `errors`, `hint`, `componentsPlaced`,
and replaces `layout` with a single string breadcrumb.

## Tool registry

`packages/api/src/agents/core/tools/index.ts` exports `createCoreTools({ project,
sceneId, ops, mode, workingBoard })`. Tools are grouped as:

| Group | Tools |
| --- | --- |
| Read-only board | `get_board_overview`, `list_components`, `list_wires`, `get_component_details`, `get_sketch_code`, `get_board_state`, `read_serial_monitor` |
| Safety / analysis | `analyze_power_budget`, `get_wiring_guide` |
| Mutators | `place_component`, `update_component`, `move_component`, `remove_component`, `connect_wire`, `wire_component_to_pin`, `remove_wire`, `update_wire` |
| Sketch edit | `update_sketch`, `patch_sketch` |
| Macro | `propose_circuit` (build-mode hero), `propose_fix` (edit-mode recovery) |
| Circuit program | `generate_circuit_program`, `validate_circuit_program`, `compile_circuit_program`, `apply_circuit_program` |
| Full design | `validate_design`, `apply_design` |
| Verification | `verify_circuit` |

Each tool is a `tool({ inputSchema, execute })` from `ai`. Mutators build a
`BoardOp` via `makeBoardOp(opCtx, { kind, payload })` (where `opCtx` carries
`{ projectId, sceneId, expectedVersion }`) and push it onto the shared
`ops` array. The same op is also applied optimistically to `workingBoard`
so subsequent tool calls in the same stream see the mutation without a
round-trip.

### Why `propose_circuit` is the primary build tool

A full circuit takes 5–20 wires + 3–10 components + a sketch. Running one
tool call per mutation means (a) each call is a full LLM round-trip, (b)
intermediate board states are nonsensical (placed components with no
wires yet), and (c) error recovery has to unwind partial boards. So
`propose_circuit` is a single macro that:

- Accepts components, wires (indexed by component position), ledResistorPairs,
  throughComponent hints, and the sketch text.
- Auto-positions components on the 63-row full-size breadboard.
- Runs layout + sketch validation before emitting ops. If validation fails,
  the return value includes `hint` and `errors` for the next step to retry.
- Emits the whole op set atomically to the ops array.

A per-run counter in `createCoreTools` caps `propose_circuit` sketch-fix
retries at 2. Exceeded → `isSketchRecoveryAbandoned()` fires and the stream
aborts via `abortController.abort()`.

## Chat transport contract

The Elysia chat route (`routes/chat.ts`) uses AI SDK's
`createUIMessageStream` + `createUIMessageStreamResponse` to produce a
mixed stream of SDK-native UI parts + custom data parts:

| Part type | Payload | Purpose |
| --- | --- | --- |
| `text-start` / `text-delta` / `text-end` | text chunks | Assistant's visible reply |
| `data-scene-ops` | `Array<BoardOp \| GraphOp \| SceneOp>` | Incremental mutations to apply client-side |
| `data-token-usage` | `{inputTokens, outputTokens, model, childRuns[]}` | Usage breakdown for the session tracker |
| `data-scene-result` | `{appliedOps, newVersion, runId, tokenUsage}` | Final per-run summary; commits the version bump |
| `data-plan-preview` | `{summary, steps, isDestructive, approvalReason}` | Only emitted for destructive plans |
| `data-trace` | Serialized span tree | Trace panel debug |
| `error` | `{errorText}` | Version conflict, policy block, etc. |

Board ops are streamed **in batches** as they are produced during `onNewOps`
inside `onStepFinish`, so the board mutates incrementally while the model is
still writing the response. The client partitions board, graph, and legacy
scene operations before dispatching them to their respective actors; graph
operations are persisted with the final project update rather than being a
separate board mutation path.

## Intent classifier and template fast path

`agents/intent-classifier.ts` runs a regex/keyword pass over the prompt.
If it matches a template (e.g. `"blink an LED"`), the route skips the entire
`streamCoreAgent` path and runs a hard-coded template function
(`agents/circuit-templates.ts`). The template returns `{ ops, description }`
and the route synthesizes a fake streaming response from those. This is
what makes simple requests feel instant — no LLM round-trip at all.

## Tiered memory

`agents/tiered-memory.ts` assembles the message history for each request.
It combines:

- The cached thread summary (if `agentRunRepo.readThreadSummary` has one),
- The most-recent few runs verbatim,
- Older runs surfaced via TF-IDF against the current prompt.

After the request completes, a fire-and-forget background job updates the
thread summary (`agents/history-summarizer.ts`). The summarizer's token
cost is rolled back into the parent run's `tokenUsage.overhead` so usage
reporting stays accurate.

## Run persistence

Every agent invocation is written to `packages/api/data/agent-runs/<runId>.json`
via `agentRunRepo`. Threads are linked via `agentRunRepo.attachRunToThread`
so `/api/threads/:id/messages` can rebuild the chat history on reconnect.
Routing decisions, tool inventory, plan, reflection, token usage, and the
raw AI SDK messages are all persisted for replay/eval.
