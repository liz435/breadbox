import { useState, useCallback } from "react"
import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport, type UIMessage } from "ai"
import type { SceneOp, BoardOp } from "@dreamer/schemas"
import { useProject } from "@/project/project-context"
import { useScene } from "@/store/scene-context"
import { useGraph } from "@/store/graph-context"
import { useBoard } from "@/store/board-context"
import { applyOpsToScene, isBoardOp, applyBoardOpsToBoard } from "@/chat/apply-ops"
import { applyGraphOpsToGraph, isGraphOp } from "@/chat/apply-graph-ops"
import type { GraphOp } from "@dreamer/schemas"
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
  const { send: sceneSend } = useScene()
  const { send: graphSend } = useGraph()
  const { send: boardSend } = useBoard()
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
        const allOps = dataPart.data as Array<SceneOp | GraphOp | BoardOp>
        const graphOps = allOps.filter((op) => isGraphOp(op)) as unknown as GraphOp[]
        const boardOps = allOps.filter((op) => isBoardOp(op) && !isGraphOp(op)) as unknown as BoardOp[]
        const sceneOps = allOps.filter((op) => !isGraphOp(op) && !isBoardOp(op)) as SceneOp[]
        if (sceneOps.length > 0) applyOpsToScene(sceneOps, sceneSend)
        if (graphOps.length > 0) applyGraphOpsToGraph(graphOps, graphSend)
        if (boardOps.length > 0) applyBoardOpsToBoard(boardOps, boardSend)
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
