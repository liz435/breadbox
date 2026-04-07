import { useEffect, useRef, useState, useCallback } from "react"
import { useBoard } from "@/store/board-context"
import { createWebSerial, isWebSerialSupported, type WebSerialConnection } from "@/simulator/web-serial"
import { simulationRef } from "@/simulator/simulation-ref"
import { cn } from "@/utils/classnames"

type LineEnding = "none" | "nl" | "cr" | "both"

const LINE_ENDING_LABELS: Record<LineEnding, string> = {
  none: "No line ending",
  nl: "Newline",
  cr: "Carriage return",
  both: "Both NL & CR",
}

const LINE_ENDING_CHARS: Record<LineEnding, string> = {
  none: "",
  nl: "\n",
  cr: "\r",
  both: "\r\n",
}

const BAUD_RATES = [300, 1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200]

export function SerialMonitor() {
  const { state, send } = useBoard()
  const scrollRef = useRef<HTMLPreElement>(null)
  const [input, setInput] = useState("")
  const [lineEnding, setLineEnding] = useState<LineEnding>("nl")
  const [baudRate, setBaudRate] = useState(9600)
  const [autoscroll, setAutoscroll] = useState(true)
  const [showTimestamps, setShowTimestamps] = useState(false)

  // Web Serial state
  const [serialConnected, setSerialConnected] = useState(false)
  const serialRef = useRef<WebSerialConnection | null>(null)
  const webSerialSupported = isWebSerialSupported()

  // Initialize Web Serial wrapper once
  useEffect(() => {
    const serial = createWebSerial({
      onData: (text) => {
        send({ type: "APPEND_SERIAL", text })
      },
      onConnect: () => setSerialConnected(true),
      onDisconnect: () => setSerialConnected(false),
      onError: (err) => {
        send({ type: "APPEND_SERIAL", text: `[Serial Error] ${err}\n` })
      },
    })
    serialRef.current = serial
    return () => { serial.disconnect() }
  }, [send])

  // Auto-scroll to bottom on new output
  useEffect(() => {
    if (!autoscroll) return
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [state.serialOutput.length, autoscroll])

  const simBaudRate = state.libraryState.serialBaud

  const handleConnect = useCallback(async () => {
    const serial = serialRef.current
    if (!serial) return
    if (serial.isConnected()) {
      await serial.disconnect()
    } else {
      await serial.connect(baudRate)
    }
  }, [baudRate])

  const handleSend = useCallback(() => {
    if (!input) return
    const data = input + LINE_ENDING_CHARS[lineEnding]

    // Send to real Arduino if connected
    if (serialRef.current?.isConnected()) {
      serialRef.current.write(data)
    }

    // Feed into the simulated VM's Serial.read buffer
    simulationRef.current?.sendSerialInput(data)

    setInput("")
  }, [input, lineEnding, send])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend],
  )

  const formatLine = (line: string, index: number) => {
    if (showTimestamps) {
      const ts = new Date().toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" })
      return <div key={index}><span className="text-zinc-600 mr-2">[{ts}]</span>{line}</div>
    }
    return <div key={index}>{line}</div>
  }

  return (
    <div className="flex h-full w-full flex-col bg-zinc-900 font-mono text-sm">
      {/* Header bar */}
      <div className="flex items-center justify-between border-b border-zinc-700 px-3 py-1.5 gap-2">
        <span className="text-xs font-semibold text-zinc-300 shrink-0">
          Serial Monitor
        </span>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Connection status */}
          {serialConnected ? (
            <span className="flex items-center gap-1 text-[10px] text-emerald-400">
              <span className="size-1.5 rounded-full bg-emerald-400" />
              Connected
            </span>
          ) : simBaudRate > 0 ? (
            <span className="text-[10px] text-zinc-500">
              Simulated {simBaudRate} baud
            </span>
          ) : (
            <span className="text-[10px] text-zinc-500">
              not initialized
            </span>
          )}

          {/* Baud rate selector */}
          <select
            value={baudRate}
            onChange={(e) => setBaudRate(Number(e.target.value))}
            className="bg-zinc-800 border border-zinc-700 rounded px-1.5 py-0.5 text-[10px] text-zinc-300 outline-none"
          >
            {BAUD_RATES.map((r) => (
              <option key={r} value={r}>{r} baud</option>
            ))}
          </select>

          {/* Web Serial connect button */}
          {webSerialSupported && (
            <button
              type="button"
              onClick={handleConnect}
              className={cn(
                "rounded px-2 py-0.5 text-[10px] transition-colors",
                serialConnected
                  ? "bg-red-600/20 text-red-400 hover:bg-red-600/30"
                  : "bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30",
              )}
            >
              {serialConnected ? "Disconnect" : "Connect"}
            </button>
          )}

          {/* Autoscroll toggle */}
          <button
            type="button"
            onClick={() => setAutoscroll((v) => !v)}
            className={cn(
              "rounded px-2 py-0.5 text-[10px] transition-colors",
              autoscroll ? "text-zinc-200 bg-zinc-700" : "text-zinc-500 hover:bg-zinc-800",
            )}
          >
            Autoscroll
          </button>

          {/* Timestamp toggle */}
          <button
            type="button"
            onClick={() => setShowTimestamps((v) => !v)}
            className={cn(
              "rounded px-2 py-0.5 text-[10px] transition-colors",
              showTimestamps ? "text-zinc-200 bg-zinc-700" : "text-zinc-500 hover:bg-zinc-800",
            )}
          >
            Timestamps
          </button>

          {/* Clear */}
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
          <span className="text-zinc-600 italic">
            {webSerialSupported
              ? "No serial output yet. Click Connect to attach a real Arduino, or Run a sketch."
              : "No serial output yet. Run a sketch to see output here."}
          </span>
        ) : (
          state.serialOutput.map((line, i) => formatLine(line, i))
        )}
      </pre>

      {/* Input field */}
      <div className="flex border-t border-zinc-700">
        <input
          type="text"
          className="flex-1 bg-zinc-800 px-3 py-1.5 text-xs text-green-300 placeholder-zinc-600 outline-none"
          placeholder="Type message and press Enter to send..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
        />

        {/* Line ending selector */}
        <select
          value={lineEnding}
          onChange={(e) => setLineEnding(e.target.value as LineEnding)}
          className="bg-zinc-800 border-l border-zinc-700 px-2 py-1.5 text-[10px] text-zinc-400 outline-none"
        >
          {(Object.entries(LINE_ENDING_LABELS) as [LineEnding, string][]).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>

        <button
          type="button"
          className="border-l border-zinc-700 px-3 py-1.5 text-[10px] text-zinc-300 hover:bg-zinc-700 transition-colors"
          onClick={handleSend}
        >
          Send
        </button>
      </div>
    </div>
  )
}
