// ── Breadboard Embed ────────────────────────────────────────────────────
//
// Reusable interactive breadboard for /learn lesson pages. Wraps
// <BreadboardCanvas> in its own context stack, loads a pre-built board
// from the catalog, and auto-starts the simulator.
//
// Design notes:
// - Each embed gets its own BoardContext actor, isolated from the main
//   editor and from other embeds. Components, wires, and sketch are seeded
//   from the board catalog via LOAD_BOARD.
// - Read-only by default: no drag/place/wire/delete. Component-level
//   interactions (button presses, sensor sliders) still work because they
//   handle their own pointer events inside the component renderers.
// - Panels are composable. Always renders the canvas; optionally renders
//   a code viewer, schematic, inspector, and/or serial output alongside.
// - Simulator is scoped via useSimulation(), which binds to the embed's
//   own BoardContext actor — so each embed runs its own VM tick loop.
// - NOTE: pinStateStore and buttonPressStore are module-level singletons,
//   so two embeds running simulators simultaneously on the same page will
//   share pin state. For now, the recommended pattern is one embed per
//   /learn page. If multi-embed becomes necessary, those stores need to
//   become context-injected instances.

import React, { useEffect, useMemo, useState, useCallback } from "react"
import type { BoardState, LibraryState } from "@dreamer/schemas"
import { AppProviders } from "@/app-providers"
import { BreadboardCanvas } from "@/breadboard/breadboard-canvas"
import { BoardContext, useBoardSelector } from "@/store/board-context"
import { useSimulation } from "@/simulator/simulation-loop"
import { SchematicPanel } from "@/schematic/schematic-panel"
import { highlight } from "@/utils/syntax-highlight"
import { boardCatalog } from "./board-catalog"

type EmbedPanel = "code" | "schematic" | "serial"

export type BreadboardEmbedProps = {
  /** Board catalog key, e.g. "01-blink-led" — or an inline BoardState. */
  board: string | BoardState
  /** Which side panels to render alongside the canvas. Canvas is always shown. */
  panels?: readonly EmbedPanel[]
  /** Pixel height for the embed. Default 420. */
  height?: number
  /** Auto-start the simulator when the embed mounts. Default true. */
  autoRun?: boolean
  /** Show a title header above the embed. */
  title?: string
  /** Hide the "Open in IDE" link. Default false (link is shown). */
  hideOpenInIde?: boolean
}

/** Resolve a board prop to a concrete BoardState (or null if not found). */
function resolveBoard(board: string | BoardState): BoardState | null {
  if (typeof board !== "string") return board
  return boardCatalog[board] ?? null
}

/** Build an Open-in-IDE URL for a catalog key. */
function openInIdeUrl(board: string | BoardState): string | null {
  if (typeof board !== "string") return null
  return `/editor?learn=${encodeURIComponent(board)}`
}

export function BreadboardEmbed(props: BreadboardEmbedProps) {
  const resolved = useMemo(() => resolveBoard(props.board), [props.board])

  if (!resolved) {
    return (
      <EmbedFrame height={props.height ?? 420} title={props.title}>
        <EmbedErrorState board={props.board} />
      </EmbedFrame>
    )
  }

  return (
    <EmbedFrame height={props.height ?? 420} title={props.title}>
      <AppProviders>
        <EmbedInner
          boardState={resolved}
          panels={props.panels ?? []}
          autoRun={props.autoRun ?? true}
          boardKey={typeof props.board === "string" ? props.board : null}
          hideOpenInIde={props.hideOpenInIde ?? false}
        />
      </AppProviders>
    </EmbedFrame>
  )
}

// ── Frame ──────────────────────────────────────────────────────────────

function EmbedFrame({
  children,
  height,
  title,
}: {
  children: React.ReactNode
  height: number
  title?: string
}) {
  return (
    <div
      className="relative overflow-hidden rounded-lg border border-border bg-card"
      style={{ height }}
    >
      {title != null && (
        <div className="absolute left-3 top-3 z-10 rounded bg-background/70 px-2 py-0.5 text-[11px] font-medium text-foreground backdrop-blur">
          {title}
        </div>
      )}
      {children}
    </div>
  )
}

function EmbedErrorState({ board }: { board: string | BoardState }) {
  const key = typeof board === "string" ? board : "(inline board)"
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-muted-foreground">
      <p className="text-sm">Board not found: <code className="text-foreground">{key}</code></p>
      <p className="text-xs text-muted-foreground">
        Add the JSON to packages/app/src/learn/boards/ and rebuild.
      </p>
    </div>
  )
}

// ── Inner (inside providers) ───────────────────────────────────────────

type EmbedInnerProps = {
  boardState: BoardState
  panels: readonly EmbedPanel[]
  autoRun: boolean
  boardKey: string | null
  hideOpenInIde: boolean
}

function EmbedInner({ boardState, panels, autoRun, boardKey, hideOpenInIde }: EmbedInnerProps) {
  const boardSend = BoardContext.useActorRef().send

  // Hydrate this embed's board actor with the lesson state once on mount.
  // We use a ref-guard inline so re-renders (e.g., hot reload) don't clobber
  // interactive changes like button presses.
  const hydratedRef = React.useRef(false)
  useEffect(() => {
    if (hydratedRef.current) return
    hydratedRef.current = true
    boardSend({ type: "LOAD_BOARD", state: boardState })
  }, [boardSend, boardState])

  // Publish peripheral state (NeoPixel pixels, servo angles, LCD/OLED buffers)
  // into this embed's board actor. Without this, syncLibraryState early-returns
  // and library-driven parts (NeoPixel/servo/LCD/OLED) never light or animate.
  const onLibraryStateChange = useCallback(
    (changes: Partial<LibraryState>) => {
      boardSend({ type: "SET_LIBRARY_STATE", changes })
    },
    [boardSend],
  )
  const sim = useSimulation({ onLibraryStateChange })
  const { status, play, pause, resume, stop } = sim

  // Auto-run: start the simulator once the board has been loaded.
  const autoRanRef = React.useRef(false)
  useEffect(() => {
    if (!autoRun) return
    if (autoRanRef.current) return
    if (!hydratedRef.current) return
    autoRanRef.current = true
    play(boardState.sketchCode)
  }, [autoRun, play, boardState.sketchCode])

  const showCode = panels.includes("code")
  const showSchematic = panels.includes("schematic")
  const showSerial = panels.includes("serial")
  const hasSidePanels = showCode || showSchematic || showSerial

  return (
    <div className="flex h-full w-full">
      {/* Canvas area. panMode=true makes left-click-drag pan the view —
          since nothing is editable, there's nothing else for drag to do. */}
      <div className="relative flex-1 min-w-0">
        <BreadboardCanvas panMode={true} readOnly />
        <EmbedControls
          status={status}
          onPlay={() => {
            if (status === "paused") resume()
            else play(boardState.sketchCode)
          }}
          onPause={pause}
          onStop={stop}
          openInIdeHref={hideOpenInIde ? null : (boardKey ? openInIdeUrl(boardKey) : null)}
        />
      </div>

      {/* Side panels */}
      {hasSidePanels && (
        <div className="flex w-80 flex-shrink-0 flex-col border-l border-border bg-background">
          {showCode && <CodeViewPanel sketchCode={boardState.sketchCode} />}
          {showSchematic && (
            <div className="flex-1 min-h-0 border-t border-border first:border-t-0">
              <SchematicPanel />
            </div>
          )}
          {showSerial && (
            <div className="flex-1 min-h-0 border-t border-border first:border-t-0">
              <SerialViewPanel />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Controls overlay ───────────────────────────────────────────────────

type ControlsProps = {
  status: "stopped" | "compiling" | "running" | "paused" | "error"
  onPlay: () => void
  onPause: () => void
  onStop: () => void
  openInIdeHref: string | null
}

function EmbedControls({ status, onPlay, onPause, onStop, openInIdeHref }: ControlsProps) {
  const isRunning = status === "running"
  const isPaused = status === "paused"

  return (
    <div className="absolute bottom-3 left-3 z-10 flex items-center gap-1 rounded-md border border-border bg-card/90 p-1 shadow-lg backdrop-blur">
      {!isRunning && (
        <button
          type="button"
          onClick={onPlay}
          className="flex h-7 items-center gap-1 rounded bg-emerald-600 px-2 text-xs font-medium text-white hover:bg-emerald-500"
          title={isPaused ? "Resume" : "Play"}
        >
          <PlayIcon />
          {isPaused ? "Resume" : "Play"}
        </button>
      )}
      {isRunning && (
        <>
          <button
            type="button"
            onClick={onPause}
            className="flex h-7 items-center gap-1 rounded bg-muted px-2 text-xs font-medium text-foreground hover:bg-accent"
            title="Pause"
          >
            <PauseIcon />
            Pause
          </button>
          <button
            type="button"
            onClick={onStop}
            className="flex h-7 items-center gap-1 rounded bg-muted px-2 text-xs font-medium text-foreground hover:bg-accent"
            title="Stop"
          >
            <StopIcon />
            Stop
          </button>
        </>
      )}
      {status === "compiling" && (
        <span className="px-2 text-xs text-muted-foreground">Compiling…</span>
      )}
      {status === "error" && (
        <span className="px-2 text-xs text-red-400">Error</span>
      )}
      {openInIdeHref && (
        <a
          href={openInIdeHref}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-1 flex h-7 items-center rounded border border-border px-2 text-xs font-medium text-foreground hover:bg-secondary"
          title="Open this circuit in the full editor"
        >
          Open in IDE →
        </a>
      )}
    </div>
  )
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 16 16" width={12} height={12} fill="currentColor" aria-hidden="true" focusable="false">
      <path d="M4 3l10 5-10 5z" />
    </svg>
  )
}
function PauseIcon() {
  return (
    <svg viewBox="0 0 16 16" width={12} height={12} fill="currentColor" aria-hidden="true" focusable="false">
      <rect x={4} y={3} width={3} height={10} />
      <rect x={9} y={3} width={3} height={10} />
    </svg>
  )
}
function StopIcon() {
  return (
    <svg viewBox="0 0 16 16" width={12} height={12} fill="currentColor" aria-hidden="true" focusable="false">
      <rect x={3} y={3} width={10} height={10} />
    </svg>
  )
}

// ── Read-only code viewer ──────────────────────────────────────────────

function CodeViewPanel({ sketchCode }: { sketchCode: string }) {
  return (
    <div className="flex flex-1 min-h-0 flex-col">
      <div className="border-b border-border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Sketch
      </div>
      <pre className="flex-1 overflow-auto px-3 py-2 text-[11px] leading-[1.5] text-foreground font-mono">
        <code className="language-cpp">{highlight(sketchCode, "cpp")}</code>
      </pre>
    </div>
  )
}

// ── Read-only serial output viewer ─────────────────────────────────────

function SerialViewPanel() {
  const serialOutput = useBoardSelector((s) => s.serialOutput)
  const scrollRef = React.useRef<HTMLPreElement>(null)

  // Auto-scroll on new output
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [serialOutput])

  const [lines, setLines] = useState<string[]>([])
  useEffect(() => {
    setLines(serialOutput.map((entry) => entry.text))
  }, [serialOutput])

  return (
    <div className="flex flex-1 min-h-0 flex-col">
      <div className="border-b border-border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Serial Monitor
      </div>
      <pre
        ref={scrollRef}
        className="flex-1 overflow-auto px-3 py-2 text-[11px] leading-[1.4] text-emerald-300 font-mono whitespace-pre-wrap"
      >
        {lines.length === 0 ? (
          <span className="text-muted-foreground">No output yet.</span>
        ) : (
          lines.join("")
        )}
      </pre>
    </div>
  )
}
