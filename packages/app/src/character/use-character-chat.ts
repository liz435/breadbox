import { useState, useCallback, useRef, useEffect } from "react"
import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport, type UIMessage } from "ai"
import type { GeneratedImage } from "@dreamer/schemas"
import { API_ORIGIN } from "@dreamer/config"

const SESSION_STORAGE_KEY = "dreamer:characterSessionId"

function getOrCreateSessionId(): string {
  const existing = localStorage.getItem(SESSION_STORAGE_KEY)
  if (existing) return existing
  const id = crypto.randomUUID()
  localStorage.setItem(SESSION_STORAGE_KEY, id)
  return id
}

export type UseCharacterChatReturn = {
  messages: UIMessage[]
  status: "ready" | "submitted" | "streaming" | "error"
  inputValue: string
  setInputValue: (value: string) => void
  handleSubmit: () => void
  stop: () => void
  images: GeneratedImage[]
  isLoadingSession: boolean
}

export function useCharacterChat(): UseCharacterChatReturn {
  const [inputValue, setInputValue] = useState("")
  const [images, setImages] = useState<GeneratedImage[]>([])
  const [isLoadingSession, setIsLoadingSession] = useState(true)
  const sessionIdRef = useRef(getOrCreateSessionId())
  const hasFetched = useRef(false)

  const chat = useChat({
    transport: new DefaultChatTransport({
      api: `${API_ORIGIN}/api/character-chat`,
      body: {
        sessionId: sessionIdRef.current,
      },
    }),
    onData(dataPart) {
      if (dataPart.type === "data-character-image") {
        const image = dataPart.data as GeneratedImage
        setImages((prev) => [...prev, image])
      }
    },
    onFinish({ messages }) {
      fetch(`${API_ORIGIN}/api/character-chat/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: sessionIdRef.current,
          messages,
        }),
      }).catch(() => {
        // Best-effort save
      })
    },
  })

  // Load saved session on mount and hydrate via setMessages
  useEffect(() => {
    if (hasFetched.current) return
    hasFetched.current = true

    fetch(`${API_ORIGIN}/api/character-chat/${sessionIdRef.current}`)
      .then((res) => {
        if (!res.ok) return null
        return res.json()
      })
      .then((data) => {
        if (data?.messages && Array.isArray(data.messages) && data.messages.length > 0) {
          chat.setMessages(data.messages as UIMessage[])
        }
      })
      .catch(() => {
        // Session doesn't exist yet
      })
      .finally(() => {
        setIsLoadingSession(false)
      })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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
    images,
    isLoadingSession,
  }
}
