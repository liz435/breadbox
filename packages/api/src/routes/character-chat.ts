import { Elysia } from "elysia"
import { z, ZodError } from "zod"
import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  convertToModelMessages,
  type UIMessage,
} from "ai"
import { streamCharacterAgent } from "../agents/character/agent"
import { characterSessionRepo } from "../db/character-session-repo"
import { createLogger } from "../logger"

const log = createLogger("character-chat")
let requestId = 0

const characterChatRequestSchema = z.object({
  messages: z.array(
    z.object({
      id: z.string(),
      role: z.enum(["user", "assistant", "system"]),
      parts: z.array(z.unknown()),
    })
  ),
  sessionId: z.string().min(1),
})

function extractLastUserPrompt(
  messages: z.infer<typeof characterChatRequestSchema>["messages"]
): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    if (msg.role === "user") {
      const texts: string[] = []
      for (const part of msg.parts) {
        if (
          typeof part === "object" &&
          part !== null &&
          "type" in part &&
          part.type === "text"
        ) {
          const textPart = part as { type: "text"; text: string }
          texts.push(textPart.text)
        }
      }
      return texts.join("\n")
    }
  }
  return ""
}

const characterChatSaveSchema = z.object({
  sessionId: z.string().min(1),
  messages: z.array(z.unknown()),
})

export const characterChatRoutes = new Elysia()
  .get(
    "/api/character-chat/:sessionId",
    async ({ params, set }) => {
      const session = await characterSessionRepo.readSession(params.sessionId)
      if (!session) {
        set.status = 404
        return { error: "Session not found" }
      }
      return { messages: session.messages, assets: session.assets }
    }
  )
  .post(
    "/api/character-chat/save",
    async ({ body, set }) => {
      let input
      try {
        input = characterChatSaveSchema.parse(body)
      } catch (err) {
        if (err instanceof ZodError) {
          set.status = 400
          return { error: "Invalid request payload", details: err.flatten() }
        }
        throw err
      }
      await characterSessionRepo.updateMessages(input.sessionId, input.messages)
      return { ok: true }
    }
  )
  .post(
  "/api/character-chat",
  async ({ body, set }) => {
    const id = ++requestId
    const start = performance.now()
    const reqLog = log.child(`req-${id}`)

    let input
    try {
      input = characterChatRequestSchema.parse(body)
    } catch (err) {
      if (err instanceof ZodError) {
        set.status = 400
        return { error: "Invalid request payload", details: err.flatten() }
      }
      throw err
    }

    const prompt = extractLastUserPrompt(input.messages)
    if (!prompt) {
      set.status = 400
      return { error: "No user message found" }
    }

    reqLog.info(
      `incoming — session: ${input.sessionId}, prompt: ${prompt.slice(0, 80)}`
    )

    const priorMessages = input.messages.slice(0, -1)
    const history =
      priorMessages.length > 0
        ? await convertToModelMessages(
            priorMessages as unknown as UIMessage[]
          )
        : undefined

    const agentStream = streamCharacterAgent({
      prompt,
      history,
      sessionId: input.sessionId,
      parentLog: reqLog,
    })

    const uiStream = createUIMessageStream({
      async execute({ writer }) {
        agentStream.onImageGenerated((image) => {
          reqLog.info(`image generated — ${image.url.slice(0, 80)}`)
          writer.write({ type: "data-character-image", data: image })
        })

        await writer.merge(agentStream.uiMessageStream)

        const elapsed = (performance.now() - start).toFixed(1)
        reqLog.info(`completed — ${elapsed}ms`)
      },
      onError(error) {
        const elapsed = (performance.now() - start).toFixed(1)
        reqLog.error(`failed after ${elapsed}ms`, error)
        return String(error)
      },
    })

    return createUIMessageStreamResponse({ stream: uiStream })
  }
)
