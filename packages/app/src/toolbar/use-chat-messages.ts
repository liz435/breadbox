import { useState, useCallback, useEffect, useRef } from "react"
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
import { resolveFetchOptions } from "@/project/api-client"
import { toast } from "@/components/ui/toast"
import { refreshWallet } from "@/billing/use-wallet"

async function fetchThreadMessages(threadId: string): Promise<UIMessage[]> {
  try {
    const res = await fetch(
      `${API_ORIGIN}/api/threads/${threadId}/messages`,
      resolveFetchOptions(),
    )
    if (!res.ok) return []
    const data = await res.json()
    return (data.messages ?? []) as UIMessage[]
  } catch {
    return []
  }
}

export type ChildRunTokenUsage = {
  agent: string
  inputTokens: number
  outputTokens: number
  totalTokens: number
  model: string
}

export type TokenUsageData = {
  inputTokens: number
  outputTokens: number
  totalTokens: number
  model: string
  childRuns: ChildRunTokenUsage[]
}

export type UseChatMessagesReturn = {
  messages: UIMessage[]
  status: "ready" | "submitted" | "streaming" | "error"
  inputValue: string
  setInputValue: (value: string) => void
  handleSubmit: () => void
  stop: () => void
  /** Token usage from the most recent response */
  lastTokenUsage: TokenUsageData | null
  /** Accumulated token usage for the session */
  sessionTokenUsage: SessionTokenUsage
}

export type SessionTokenUsage = {
  sonnet: { inputTokens: number; outputTokens: number }
  haiku: { inputTokens: number; outputTokens: number }
}

export type UseChatMessagesOptions = {
  /** Agent snapshot version pin sent to the API on every request. */
  snapshotVersion?: string
}

export function useChatMessages(options: UseChatMessagesOptions = {}): UseChatMessagesReturn {
  const { snapshotVersion } = options
  const project = useProject()
  const { send: sceneSend } = useScene()
  const { send: graphSend } = useGraph()
  const { send: boardSend } = useBoard()
  const [inputValue, setInputValue] = useState("")
  const [lastTokenUsage, setLastTokenUsage] = useState<TokenUsageData | null>(null)
  const [sessionTokenUsage, setSessionTokenUsage] = useState<SessionTokenUsage>({
    sonnet: { inputTokens: 0, outputTokens: 0 },
    haiku: { inputTokens: 0, outputTokens: 0 },
  })

  const chat = useChat({
    transport: new DefaultChatTransport({
      api: `${API_ORIGIN}/api/chat`,
      credentials: "include",
      body: {
        projectId: project.projectId,
        sceneId: project.sceneId,
        threadId: project.threadId,
        sessionId: project.sessionId,
        expectedVersion: project.version,
        ...(snapshotVersion ? { snapshotVersion } : {}),
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
      if (dataPart.type === "data-token-usage") {
        const usage = dataPart.data as TokenUsageData
        setLastTokenUsage(usage)
        setSessionTokenUsage((prev) => {
          const next = { ...prev }
          // Accumulate core agent tokens
          if (usage.model.includes("sonnet")) {
            next.sonnet = {
              inputTokens: prev.sonnet.inputTokens + usage.inputTokens,
              outputTokens: prev.sonnet.outputTokens + usage.outputTokens,
            }
          } else {
            next.haiku = {
              inputTokens: prev.haiku.inputTokens + usage.inputTokens,
              outputTokens: prev.haiku.outputTokens + usage.outputTokens,
            }
          }
          // Accumulate child run tokens
          for (const child of usage.childRuns) {
            if (child.model.includes("sonnet")) {
              next.sonnet = {
                inputTokens: next.sonnet.inputTokens + child.inputTokens,
                outputTokens: next.sonnet.outputTokens + child.outputTokens,
              }
            } else {
              next.haiku = {
                inputTokens: next.haiku.inputTokens + child.inputTokens,
                outputTokens: next.haiku.outputTokens + child.outputTokens,
              }
            }
          }
          return next
        })
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
        // Wallet was just debited server-side by the post-stream
        // `debitForLlmRun` call. Refresh the chip so users see the
        // drop without needing to tab-focus the window. PR #52 added
        // the visibilitychange refresh; this closes the in-tab gap.
        void refreshWallet()
      }
      if (dataPart.type === "data-history-sanitized") {
        // Server dropped malformed tool-call blocks from this request's
        // conversation history so Anthropic didn't reject the call.
        // One calm summary toast — no mid-stream alarms.
        const d = dataPart.data as {
          toolCalls: number
          toolResults: number
          messages: number
          toolNames: string[]
        }
        const total = d.toolCalls + d.toolResults + d.messages
        if (total > 0) {
          const names = d.toolNames.length > 0 ? ` (${d.toolNames.join(", ")})` : ""
          toast.warning(
            `Recovered from ${total} malformed step${total === 1 ? "" : "s"}${names}. Chat continued normally.`,
            { duration: 6000 },
          )
        }
      }
    },
  })

  // Load chat history from server on mount
  const historyLoaded = useRef(false)
  useEffect(() => {
    if (historyLoaded.current) return
    historyLoaded.current = true
    fetchThreadMessages(project.threadId).then((msgs) => {
      if (msgs.length > 0) {
        chat.setMessages(msgs)
      }
    })
  }, [project.threadId]) // eslint-disable-line react-hooks/exhaustive-deps

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
    lastTokenUsage,
    sessionTokenUsage,
  }
}
