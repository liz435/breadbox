import { useEffect, useRef, useState } from "react"
import { useBoard } from "@/store/board-context"
import { cn } from "@/utils/classnames"

export function SerialMonitor() {
  const { state, send } = useBoard()
  const scrollRef = useRef<HTMLPreElement>(null)
  const [input, setInput] = useState("")

  // Auto-scroll to bottom on new output
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [state.serialOutput.length])

  const baudRate = state.libraryState.serialBaud

  return (
    <div className="flex h-full w-full flex-col bg-zinc-900 font-mono text-sm">
      {/* Header bar */}
      <div className="flex items-center justify-between border-b border-zinc-700 px-3 py-1.5">
        <span className="text-xs font-semibold text-zinc-300">
          Serial Monitor
        </span>
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-zinc-500">
            {baudRate > 0 ? `${baudRate} baud` : "not initialized"}
          </span>
          <button
            type="button"
            className="rounded px-2 py-0.5 text-[10px] text-zinc-400 transition-colors hover:bg-zinc-700 hover:text-zinc-200"
            onClick={() => send({ type: "CLEAR_SERIAL" })}
          >
            Clear
          </button>
        </div>
      </div>

      {/* Scrolling output area */}
      <pre
        ref={scrollRef}
        className="flex-1 overflow-y-auto whitespace-pre-wrap px-3 py-2 text-green-400"
      >
        {state.serialOutput.length === 0 ? (
          <span className="text-zinc-600 italic">No serial output yet.</span>
        ) : (
          state.serialOutput.map((line, i) => (
            <div key={i}>{line}</div>
          ))
        )}
      </pre>

      {/* Input field (placeholder for Serial.read) */}
      <div className="flex border-t border-zinc-700">
        <input
          type="text"
          className="flex-1 bg-zinc-800 px-3 py-1.5 text-xs text-green-300 placeholder-zinc-600 outline-none"
          placeholder="Serial input (not yet connected)..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled
        />
        <button
          type="button"
          className="border-l border-zinc-700 px-3 py-1.5 text-[10px] text-zinc-500"
          disabled
        >
          Send
        </button>
      </div>
    </div>
  )
}
