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
  // Diagnostic counter — how many bytes the WebSerial read loop has
  // delivered since this Monitor instance mounted. Visible in the
  // status line so users can tell "no output because nothing arrived"
  // apart from "no output because the filter is wrong".
  const [boardBytesReceived, setBoardBytesReceived] = useState(0)
  // Tracks whether the user manually picked a baud. If false, we
  // auto-match Serial.begin(N) from the sketch source so the most
  // common case (sketch declares 115200, default monitor is 9600,
  // user sees "no output" because of mismatch) just works.
  const userPickedBaud = useRef(false)

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
        setBoardBytesReceived((n) => n + text.length)
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
      // Surface auto-connect failures via the createXxxBoard callbacks
      // (onError) rather than dispatching APPEND_SERIAL from inside this
      // effect — dispatching here changes `send`'s ref, re-firing this
      // effect, retrying connect, failing again → infinite storm.
      // The board callbacks already log one [Serial Error] per failure;
      // that's enough.
      board.connect(activePort, baudRate).catch(() => {
        // Intentionally silent — the createXxxBoard callbacks already
        // emit a one-shot [Serial Error] via onError. Logging here would
        // duplicate that AND re-trigger the effect (see above).
      })
    }
  }, [activePort, baudRate])

  // Auto-scroll on new output
  // Auto-derive baud from the sketch's Serial.begin(N) call so users
  // don't have to think about it. Skipped if the user explicitly picked
  // a baud via the dropdown (tracked via userPickedBaud ref). Comments
  // are stripped first so `// Serial.begin(115200)` doesn't override
  // an actual Serial.begin(9600). Cheap regex — full parsing would be
  // overkill for one declaration.
  const sketchBaud = useMemo<number | null>(() => {
    const stripped = state.sketchCode
      .replace(/\/\/.*$/gm, "")
      .replace(/\/\*[\s\S]*?\*\//g, "")
    const m = stripped.match(/Serial\.begin\s*\(\s*(\d+)/)
    if (!m) return null
    const n = Number(m[1])
    if (BAUD_RATES.includes(n)) return n
    return null
  }, [state.sketchCode])

  useEffect(() => {
    if (!userPickedBaud.current && sketchBaud && sketchBaud !== baudRate) {
      setBaudRate(sketchBaud)
    }
  }, [sketchBaud, baudRate])

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
          {/* Connection status — prioritized:
               1. Real board connected → green
               2. Real board AVAILABLE but disconnected → amber (most actionable;
                  previously this state silently rendered "Simulated AVR" which
                  hid the fact that one Connect-click stood between the user
                  and real-board output)
               3. Simulator running → grey
               4. Nothing → grey */}
          {serialConnected ? (
            <span
              className="flex items-center gap-1 text-[10px] text-emerald-400"
              title={`Open at ${baudRate} baud · ${boardBytesReceived} bytes received`}
            >
              <span className="size-1.5 rounded-full bg-emerald-400" />
              {activePort ?? "Connected"}
              <span className="text-zinc-500">
                · {baudRate} baud · {boardBytesReceived}B rx
              </span>
            </span>
          ) : activePort ? (
            <span
              className="flex items-center gap-1 text-[10px] text-amber-300"
              title="A board is paired but the read loop isn't running. Click Connect."
            >
              <span className="size-1.5 rounded-full bg-amber-300/80" />
              Board disconnected
              <span className="text-zinc-500">· click Connect →</span>
            </span>
          ) : simMode === "avr" ? (
            <span className="text-[10px] text-zinc-500">
              Simulated AVR{simBaudRate > 0 ? ` · ${simBaudRate} baud` : ""}
            </span>
          ) : (
            <span className="text-[10px] text-zinc-500">not initialized</span>
          )}

          {/* Baud mismatch hint — if the sketch declares Serial.begin(N)
              and the monitor isn't on N, surface a one-click fix. The
              auto-derive effect handles this on first load; this catches
              the case where the user manually picked a wrong baud. */}
          {sketchBaud && sketchBaud !== baudRate ? (
            <button
              type="button"
              onClick={() => {
                userPickedBaud.current = false
                setBaudRate(sketchBaud)
              }}
              title="Click to match the sketch's Serial.begin() baud"
              className="rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-300 hover:bg-amber-500/20"
            >
              sketch uses {sketchBaud} baud · match
            </button>
          ) : null}

          {/* Baud rate — only meaningful for real hardware. In simulation
              the VM emits serial via a direct JS callback and bypasses
              the UART, so the dropdown wouldn't change anything. */}
          {activePort ? (
            <select
              value={baudRate}
              onChange={(e) => {
                userPickedBaud.current = true
                setBaudRate(Number(e.target.value))
              }}
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
            {sourceFilter === "board" && activePort && !serialConnected
              ? "No board output yet. Click Connect (top right) to start reading from the paired port — the read loop only runs while connected."
              : sourceFilter === "board" && !activePort
                ? "No board output yet. Pair a board via the toolbar first, then click Connect."
                : sourceFilter === "board" && serialConnected && boardBytesReceived === 0
                  ? "Connected but the board hasn't sent any bytes yet. Check that (1) your sketch was flashed (Upload), (2) the sketch calls Serial.begin(N) + Serial.println(...), and (3) the baud matches."
                  : sourceFilter === "simulator"
                    ? "No simulator output yet. Hit Run (top of the editor) to start the simulator. Run only starts the simulator — it doesn't touch the real board."
                    : state.serialOutput.length === 0
                      ? activePort
                        ? "No output yet. Run a sketch or connect a board."
                        : "No output yet. Run a sketch to see output here, or select a board from the toolbar."
                      : "No matching output for this filter."}
          </span>
        ) : (
          visibleSerial.map((entry, i) => formatLine(entry, i))
        )}
      </pre>
    </div>
  )
}
