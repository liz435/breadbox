# Character Agent Prototype — Revised Plan

## Summary

`/character` page — just a chat panel that talks to a character agent backed by PixelLab. Images/animations render inline in chat via AI SDK React components. Sessions persist to JSON so images survive refresh.

---

## Schemas (`packages/schemas/src/character.ts`)

```ts
// PixelLab enums
cameraViewSchema, directionSchema, outlineSchema, shadingSchema, detailSchema

// Tool input schemas (agent fills these to call PixelLab)
generateConceptInputSchema — maps to generateImagePixflux params
generateAnimationInputSchema — maps to animateWithText params

// Output schemas (streamed to frontend)
base64ImageSchema, conceptImageSchema, animationResultSchema
```

Re-export from `packages/schemas/src/index.ts`.

---

## Persistence

### `packages/api/src/db/schemas/character.ts`

Persistence schemas (same shape as existing agent run schemas):

```ts
characterThreadFileSchema: {
  thread: { id, createdAt, updatedAt },
  runIds: string[]
}

characterRunFileSchema: {
  run: { id, threadId, sessionId, status, createdAt, completedAt?, error? },
  prompt: string,
  assistantText?: string,
  messages: unknown[],           // ModelMessage[] for history rebuild
  concepts: ConceptImage[],      // concepts generated in this run
  animations: AnimationResult[], // animations generated in this run
}
```

Re-export from `packages/api/src/db/schemas/index.ts`.

### `packages/api/src/db/character-session-repo.ts`

Same pattern as `agent-run-repo.ts`:
- `data/character-threads/{threadId}.json`
- `data/character-runs/{runId}.json`
- Functions: `getOrCreateThread`, `createRun`, `completeRun`, `attachRunToThread`, `listRunsForThread`
- `buildCharacterHistory(runs)` — rebuilds `ModelMessage[]` from completed runs

---

## API

### `packages/api/src/agents/character/tools.ts`

2 tools — the only ones that hit PixelLab:

| Tool | PixelLab call | Input schema |
|------|--------------|--------------|
| `generate_concept` | `pixellab.generateImagePixflux(...)` | `generateConceptInputSchema` |
| `generate_animation` | `pixellab.animateWithText(...)` | `generateAnimationInputSchema` |

Shared mutable state for callbacks:
```ts
type CharacterToolState = {
  concepts: ConceptImage[]
  animations: AnimationResult[]
  referenceImage?: Base64Image       // set from first concept, used for animations
  onConceptGenerated?: (c: ConceptImage) => void
  onAnimationGenerated?: (a: AnimationResult) => void
}
```

`generate_animation` requires a `referenceImage` — it grabs the first concept's image if not explicitly set.

### `packages/api/src/agents/character/agent.ts`

Follows `streamCoreAgent` pattern:
- Model: `anthropic("claude-sonnet-4-6")`, `stopWhen: stepCountIs(15)`
- System prompt guides the conversation (discovery → concept → animation)
- `onStepFinish` fires callbacks for new concepts/animations
- Returns `{ uiMessageStream, onConceptGenerated, onAnimationGenerated, collectResult }`

### `packages/api/src/routes/character-chat.ts`

`POST /api/character-chat`:
1. Parse `{ messages, threadId, sessionId }`
2. Get/create thread, create run, attach to thread
3. Rebuild history from prior runs
4. Stream agent, register callbacks:
   - `writer.write({ type: "data-character-concept", data })`
   - `writer.write({ type: "data-character-animation", data })`
5. `writer.merge(agentStream.uiMessageStream)`
6. On completion: `completeRun(...)` persists everything

### Modified: `packages/api/src/index.ts` — add `.use(characterChatRoutes)`
### Modified: `packages/api/.env.example` — add `PIXELLAB_SECRET=`

---

## Frontend

### `packages/app/src/character/use-character-chat.ts`

Wraps `useChat()` targeting `/api/character-chat`:
- `body: { threadId, sessionId }` — persisted to localStorage
- `onData` dispatches `data-character-concept` and `data-character-animation` into state
- Returns `{ messages, status, inputValue, setInputValue, handleSubmit, stop, characterState }`

### `packages/app/src/character/character-page.tsx`

Just a chat page. Renders messages using AI SDK React patterns (iterate `message.parts`). Concept images and animation frames render inline as `<img>` tags with `imageRendering: pixelated`. PromptBox at the bottom.

### Modified: `packages/app/src/index.tsx`

Check `window.location.pathname` — render `CharacterPage` at `/character`, `App` otherwise. No router component.

---

## File Manifest

### New Files (7)

| # | Path |
|---|------|
| 1 | `packages/schemas/src/character.ts` |
| 2 | `packages/api/src/db/schemas/character.ts` |
| 3 | `packages/api/src/db/character-session-repo.ts` |
| 4 | `packages/api/src/agents/character/tools.ts` |
| 5 | `packages/api/src/agents/character/agent.ts` |
| 6 | `packages/api/src/routes/character-chat.ts` |
| 7 | `packages/app/src/character/character-page.tsx` |

### Modified Files (4)

| # | Path | Change |
|---|------|--------|
| 1 | `packages/schemas/src/index.ts` | Re-export character schemas |
| 2 | `packages/api/src/db/schemas/index.ts` | Re-export character persistence schemas |
| 3 | `packages/api/src/index.ts` | `.use(characterChatRoutes)` |
| 4 | `packages/api/.env.example` | `PIXELLAB_SECRET=` |
| 5 | `packages/app/src/index.tsx` | Pathname check → CharacterPage or App |

---

## Implementation Order

1. Schemas + re-exports
2. Persistence schemas + repo
3. Agent tools (2 tools)
4. Agent
5. Route + wire into server
6. Frontend hook + page
7. Wire into entry point
8. `bun run typecheck`
