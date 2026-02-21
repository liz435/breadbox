import { useState, useCallback } from "react"
import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport, type UIMessage } from "ai"
import type { SceneOp } from "@dreamer/schemas"
import { useProject } from "@/project/project-context"
import { useScene } from "@/store/scene-context"
import { applyOpsToScene } from "@/chat/apply-ops"
import { API_ORIGIN } from "@dreamer/config"

export type UseChatMessagesReturn = {
  messages: UIMessage[]
  status: "ready" | "submitted" | "streaming" | "error"
  inputValue: string
  setInputValue: (value: string) => void
  handleSubmit: () => void
  stop: () => void
}

export function useChatMessages(): UseChatMessagesReturn {
  const project = useProject()
  const { send } = useScene()
  const [inputValue, setInputValue] = useState("")

  const chat = useChat({
    transport: new DefaultChatTransport({
      api: `${API_ORIGIN}/api/chat`,
      body: {
        projectId: project.projectId,
        sceneId: project.sceneId,
        threadId: project.threadId,
        sessionId: project.sessionId,
        expectedVersion: project.version,
      },
    }),
    onData(dataPart) {
      if (dataPart.type === "data-scene-ops") {
        const ops = dataPart.data as SceneOp[]
        applyOpsToScene(ops, send)
      }
      if (dataPart.type === "data-scene-result") {
        const result = dataPart.data as {
          appliedOps: SceneOp[]
          newVersion: number
          runId: string
        }
        if (result.newVersion !== undefined) {
          project.setVersion(result.newVersion)
        }
      }
    },
  })

  const handleSubmit = useCallback(() => {
    const text = inputValue.trim()
    if (!text || chat.status !== "ready") return
    setInputValue("")
    chat.sendMessage({ text })
  }, [inputValue, chat])

  return {
    messages: chat.messages,
    status: chat.status,
    inputValue,
    setInputValue,
    handleSubmit,
    stop: chat.stop,
  }
}
