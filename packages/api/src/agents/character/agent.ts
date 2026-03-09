import { streamText, stepCountIs } from "ai"
import { anthropic } from "@ai-sdk/anthropic"
import type { ModelMessage } from "ai"
import type { GeneratedImage } from "@dreamer/schemas"
import { createCharacterTools, createCharacterToolState } from "./tools"
import type { Logger } from "../../logger"

const SYSTEM_PROMPT = `You are the Dreamer Character Creator — a pixel art character designer.

You help users create game characters and sprite sheets.

## Tools
- generate_image: Generate a character concept image
- generate_sprite_sheet: Generate a 2x2 sprite sheet from a concept image
- remove_background: Remove background from an image (use before extracting frames)
- extract_frames: Split a 2x2 sprite sheet into 4 individual frames

## Workflow
1. Chat with the user about what character they want
2. Generate a concept image with generate_image
3. Show it, get feedback, iterate if needed
4. Once the user is happy with the character, ask what animations they want
5. For each animation:
   a. Call generate_sprite_sheet with the concept image URL and animation name
   b. Call remove_background on the sprite sheet
   c. Call extract_frames on the cleaned sprite sheet
6. Present the extracted frames to the user

## Guidelines
- Always include "pixel art" in generate_image prompts
- Be conversational — don't overwhelm with questions
- Keep responses concise (2-3 sentences)
- Common animations: walk, idle, jump, attack, run
- Use 1:1 aspect ratio for sprite sheets by default
- When generating sprite sheets, craft detailed prompts describing the 2x2 grid layout
- If the user gives a vague description, fill in the gaps with good defaults and generate`

export type CharacterAgentStream = {
  uiMessageStream: ReturnType<ReturnType<typeof streamText>["toUIMessageStream"]>
  onImageGenerated: (cb: (image: GeneratedImage) => void) => void
  collectResult: () => Promise<{ assistantText: string; messages: ModelMessage[] }>
}

export function streamCharacterAgent(params: {
  prompt: string
  history?: ModelMessage[]
  sessionId: string
  parentLog: Logger
}): CharacterAgentStream {
  const { prompt, history, sessionId, parentLog } = params
  const log = parentLog.child("character-agent")
  const start = performance.now()

  log.info(`starting — prompt: ${prompt.slice(0, 100)}`)

  const state = createCharacterToolState()
  const tools = createCharacterTools(state, sessionId)

  const messages: ModelMessage[] = [
    {
      role: "system",
      content: SYSTEM_PROMPT,
      providerOptions: {
        anthropic: { cacheControl: { type: "ephemeral" } },
      },
    },
    ...(history ?? []),
    { role: "user", content: prompt },
  ]

  let stepCount = 0

  const stream = streamText({
    model: anthropic("claude-haiku-4-5-20251001"),
    tools,
    messages,
    stopWhen: stepCountIs(10),
    onStepFinish({ toolCalls, usage, finishReason }) {
      stepCount++
      const elapsed = (performance.now() - start).toFixed(1)
      for (const call of toolCalls) {
        log.info(`tool [${call.toolName}]`, call.input)
      }
      log.info(
        `step ${stepCount} — reason: ${finishReason}, +${elapsed}ms`,
        usage
          ? { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens }
          : undefined
      )
    },
  })

  async function collectResult() {
    const text = await stream.text
    const allMessages = (await stream.response).messages as ModelMessage[]
    const elapsed = (performance.now() - start).toFixed(1)
    log.info(`completed — ${stepCount} steps, ${elapsed}ms`)
    return { assistantText: text, messages: allMessages }
  }

  return {
    uiMessageStream: stream.toUIMessageStream(),
    onImageGenerated(cb) {
      state.onImageGenerated = cb
    },
    collectResult,
  }
}
