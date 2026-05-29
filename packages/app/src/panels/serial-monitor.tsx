import { useEffect, useMemo, useRef, useState, useCallback } from "react"
import { useBoard } from "@/store/board-context"
import { createLocalBoard, type LocalBoardConnection } from "@/simulator/local-board"
import { createWebSerialBoard } from "@/simulator/web-serial-board"
import { useBoardConnection } from "@/simulator/use-board-connection"
import { useCapabilities } from "@/project/use-capabilities"
import { usePairedPort } from "@/simulator/web-serial-port-store"
import { simulationRef } from "@/simulator/simulation-ref"
import { cn } from "@/utils/classnames"

type LineEnding = "none" | "nl" | "cr" | "both"

/**
 * Which serial source the monitor renders + routes typed input to.
 * - "simulator": only show avr8js sketch output; send input only to sim.
 * - "board": only show paired-port output; send input only to real board.
 * - "both": render everything interleaved + broadcast input to both (legacy).
 *
 * Entries from before this field shipped have no source — they appear in
 * every mode so old saves don't suddenly look blank.
 */
type SourceFilter = "simulator" | "board" | "both"

const SOURCE_LABELS: Record<SourceFilter, string> = {
  simulator: "Simulator",
  board: "Board",
  both: "Both",
}

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
  const [serialConnected, setSerialConnected] = useState(false)
  const boardRef = useRef<LocalBoardConnection | null>(null)
  // Default to "both" so existing UX is preserved on first render;
  // users who want filtered output toggle explicitly.
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("both")

  const { selectedPort } = useBoardConnection()
  const { capabilities } = useCapabilities()
  const { port: pairedPort } = usePairedPort()

  // On hosted, the SerialMonitor talks WebSerial directly (no server USB
  // proxy). The "active port" is the paired one; on local it's the
  // user-picked entry from the server's /api/boards list.
  const activePort = capabilities.hosted
    ? pairedPort
      ? `usb:${pairedPort.getInfo().vendorId ?? "????"}:${pairedPort.getInfo().productId ?? "????"}`
      : null
    : selectedPort

  // Create board connection once per environment. Recreating when `hosted`
  // flips keeps state simple — capabilities only flips once during boot.
  useEffect(() => {
    const callbacks = {
      onData: (text: string) => {
        // Tag as "board" so the source filter can distinguish from
        // simulator output (which bottom-toolbar.tsx tags as "simulator").
        send({ type: "APPEND_SERIAL", text, ts: Date.now(), source: "board" })
      },
      onConnect: () => setSerialConnected(true),
      onDisconnect: () => setSerialConnected(false),
      onReconnecting: () => {
        send({ type: "APPEND_SERIAL", text: "[Reconnecting after flash…]\n", ts: Date.now(), source: "board" })
      },
      onError: (err: string) => {
        send({ type: "APPEND_SERIAL", text: `[Serial Error] ${err}\n`, ts: Date.now(), source: "board" })
        setSerialConnected(false)
      },
    }
    const board = capabilities.hosted
      ? createWebSerialBoard(callbacks)
      : createLocalBoard(callbacks)
    boardRef.current = board
    return () => { void board.disconnect() }
  }, [send, capabilities.hosted])

  // Auto-connect when the active port changes
  useEffect(() => {
    const board = boardRef.current
    if (!board) return

    if (!activePort) {
      if (board.isConnected()) void board.disconnect()
      return
    }

    if (board.getPortPath() !== activePort) {
      board.connect(activePort, baudRate).catch(() => {})
    }
  }, [activePort, baudRate])

  // Auto-scroll on new output
  // Filtered view of serialOutput per the source toggle. Entries without
  // a source field (legacy or pre-tagging) are visible in every mode so
  // old saves aren't blank under "Simulator" or "Board".
  const visibleSerial = useMemo(() => {
    if (sourceFilter === "both") return state.serialOutput
    return state.serialOutput.filter(
      (entry) => entry.source === undefined || entry.source === sourceFilter,
    )
  }, [state.serialOutput, sourceFilter])

  useEffect(() => {
    if (!autoscroll) return
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [visibleSerial.length, autoscroll])

  const simBaudRate = state.libraryState.serialBaud
  // Mode comes from the live VM only — before a sketch has been run, the
  // VM doesn't exist and we intentionally render "not initialized"
  // instead of guessing from the board target (which would always show
  // "Simulated AVR" on Uno/Nano and hide whether anything is running).
  // AVR mode never dispatches Serial.begin to JS state, so simBaudRate
  // stays 0 in that mode — leaning on baud to detect mode doesn't work.
  const simMode = simulationRef.current?.runner?.kind

  const handleConnect = useCallback(async () => {
    const board = boardRef.current
    if (!board || !activePort) return
    if (board.isConnected()) {
      await board.disconnect()
    } else {
      await board.connect(activePort, baudRate).catch(() => {})
    }
  }, [activePort, baudRate])

  const handleSend = useCallback(() => {
    if (!input) return
    const data = input + LINE_ENDING_CHARS[lineEnding]

    // Echo the input into the serial output so the user sees what they sent.
    // Tag with the active filter so the echo follows the same lane.
    send({
      type: "APPEND_SERIAL",
      text: `> ${input}\n`,
      ts: Date.now(),
      source: sourceFilter === "both" ? undefined : sourceFilter,
    })

    // Route input by source. In "both" mode broadcast to both (legacy);
    // in a filtered mode send only to the selected destination so the
    // user's keystrokes don't leak to whichever lane they hid.
    if (sourceFilter !== "simulator" && boardRef.current?.isConnected()) {
      boardRef.current.write(data)
    }
    if (sourceFilter !== "board") {
      simulationRef.current?.sendSerialInput(data)
    }
    setInput("")
  }, [input, lineEnding, send, sourceFilter])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend],
  )

  const formatLine = (entry: { text: string; ts: number }, index: number) => {
    const isInput = entry.text.startsWith("> ")
    const tsStr = showTimestamps && entry.ts > 0
      ? (() => {
          const d = new Date(entry.ts)
          return d.toLocaleTimeString("en-US", {
            hour12: false,
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          }) + "." + String(d.getMilliseconds()).padStart(3, "0")
        })()
      : null

    return (
      <div key={index} className={isInput ? "text-blue-400" : undefined}>
        {tsStr && <span className="text-zinc-600 mr-2">[{tsStr}]</span>}
        {entry.text}
      </div>
    )
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
              {activePort ?? "Connected"}
            </span>
          ) : simMode === "avr" ? (
            <span className="text-[10px] text-zinc-500">
              Simulated AVR{simBaudRate > 0 ? ` · ${simBaudRate} baud` : ""}
            </span>
          ) : (
            <span className="text-[10px] text-zinc-500">not initialized</span>
          )}

          {/* Baud rate — only meaningful for real hardware. In simulation
              the VM emits serial via a direct JS callback and bypasses
              the UART, so the dropdown wouldn't change anything. */}
          {activePort ? (
            <select
              value={baudRate}
              onChange={(e) => setBaudRate(Number(e.target.value))}
              className="bg-zinc-800 border border-zinc-700 rounded px-1.5 py-0.5 text-[10px] text-zinc-300 outline-none"
            >
              {BAUD_RATES.map((r) => (
                <option key={r} value={r}>{r} baud</option>
              ))}
            </select>
          ) : null}

          {/* Connect/disconnect — only shown when a port is selected */}
          {activePort && (
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

          {/* Autoscroll */}
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

          {/* Timestamps */}
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

          {/* Source filter — pick which serial stream to show + send input to.
             "Both" preserves the legacy interleaved view. */}
          <div
            role="radiogroup"
            aria-label="Serial source"
            className="ml-1 flex overflow-hidden rounded border border-zinc-700"
          >
            {(["simulator", "board", "both"] as const).map((opt) => (
              <button
                key={opt}
                type="button"
                role="radio"
                aria-checked={sourceFilter === opt}
                onClick={() => setSourceFilter(opt)}
                title={
                  opt === "simulator"
                    ? "Show only avr8js (Run-button) output"
                    : opt === "board"
                      ? "Show only paired-board WebSerial output"
                      : "Interleave both streams (legacy)"
                }
                className={cn(
                  "px-2 py-0.5 text-[10px] transition-colors",
                  sourceFilter === opt
                    ? "bg-zinc-700 text-zinc-200"
                    : "text-zinc-500 hover:bg-zinc-800",
                )}
              >
                {SOURCE_LABELS[opt]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Input — sits directly under the header for quick access */}
      <div className="flex border-b border-zinc-700">
        <input
          type="text"
          className="flex-1 bg-zinc-800 px-3 py-1.5 text-xs text-green-300 placeholder-zinc-600 outline-none"
          placeholder="Type message and press Enter to send…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
        />
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

      {/* Output */}
      <pre
        ref={scrollRef}
        className="flex-1 overflow-y-auto whitespace-pre-wrap px-3 py-2 text-green-400"
      >
        {visibleSerial.length === 0 ? (
          <span className="text-zinc-600 italic">
            {state.serialOutput.length === 0
              ? activePort
                ? "No output yet. Run a sketch or connect a board."
                : "No output yet. Run a sketch to see output here, or select a board from the toolbar."
              : sourceFilter === "simulator"
                ? "No simulator output yet. Hit Run to start the simulator."
                : "No board output yet. Pair a board and flash a sketch."}
          </span>
        ) : (
          visibleSerial.map((entry, i) => formatLine(entry, i))
        )}
      </pre>
    </div>
  )
}
