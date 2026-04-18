// ── Sketch Editor Panel ─────────────────────────────────────────────────────
//
// CodeMirror 6 editor for Arduino sketches with syntax highlighting,
// Arduino-specific autocomplete, and a custom linter.

import React, { useRef, useEffect, useCallback, useState } from "react"
import { ExampleButton } from "./example-button"
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
  drawSelection,
  dropCursor,
  highlightSpecialChars,
} from "@codemirror/view"
import { EditorState } from "@codemirror/state"
import { cpp } from "@codemirror/lang-cpp"
import {
  autocompletion,
  acceptCompletion,
  completionKeymap,
  closeBrackets,
  closeBracketsKeymap,
} from "@codemirror/autocomplete"
import { linter, lintGutter } from "@codemirror/lint"
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands"
import {
  bracketMatching,
  indentOnInput,
  foldGutter,
  foldKeymap,
  syntaxHighlighting,
  HighlightStyle,
} from "@codemirror/language"
import { highlightSelectionMatches, searchKeymap } from "@codemirror/search"
import { tags as t } from "@lezer/highlight"
import { arduinoCompletionSource } from "./arduino-completions"
import { arduinoLinter } from "./arduino-linter"
import { useBoard } from "@/store/board-context"
import { simulationRef } from "@/simulator/simulation-ref"
import { saveRef, editorContentRef } from "@/project/save-ref"
import { transpileErrorRef } from "@/simulator/transpile-error-ref"
import { sketchSizeRef } from "@/simulator/sketch-size-ref"
import { resetAllCapVoltages } from "@/simulator/capacitor-state"
import { useElectricalReport } from "@/electrical/power-budget"
import { DEFAULT_BOARD_TARGET } from "@dreamer/schemas"

// ── 1. Syntax Highlighting Colors (VS Code Dark+ inspired) ─────────────────

const highlightColors = HighlightStyle.define([
  { tag: t.keyword, color: "#569cd6" },
  { tag: t.controlKeyword, color: "#c586c0" },
  { tag: t.definitionKeyword, color: "#569cd6" },
  { tag: t.modifier, color: "#569cd6" },
  { tag: t.typeName, color: "#4ec9b0" },
  { tag: t.className, color: "#4ec9b0" },
  { tag: [t.function(t.variableName), t.function(t.definition(t.variableName))], color: "#dcdcaa" },
  { tag: t.variableName, color: "#9cdcfe" },
  { tag: t.definition(t.variableName), color: "#9cdcfe" },
  { tag: t.propertyName, color: "#9cdcfe" },
  { tag: [t.number, t.integer, t.float], color: "#b5cea8" },
  { tag: t.string, color: "#ce9178" },
  { tag: t.character, color: "#ce9178" },
  { tag: t.bool, color: "#569cd6" },
  { tag: t.null, color: "#569cd6" },
  { tag: [t.lineComment, t.blockComment], color: "#6a9955", fontStyle: "italic" },
  { tag: t.operator, color: "#d4d4d4" },
  { tag: t.punctuation, color: "#d4d4d4" },
  { tag: t.bracket, color: "#ffd700" },
  { tag: t.macroName, color: "#bd63c5" },
  { tag: t.meta, color: "#c586c0" },
  { tag: t.invalid, color: "#f44747" },
])

// ── 10. Theme Polish ────────────────────────────────────────────────────────

const darkTheme = EditorView.theme(
  {
    "&": {
      backgroundColor: "#1e1e1e",
      color: "#d4d4d4",
      height: "100%",
    },
    ".cm-content": {
      caretColor: "#aeafad",
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
      fontSize: "13px",
      lineHeight: "1.6",
    },
    ".cm-cursor": {
      borderLeftColor: "#aeafad",
      borderLeftWidth: "2px",
    },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
      backgroundColor: "#264f78",
    },
    ".cm-gutters": {
      backgroundColor: "#1e1e1e",
      color: "#858585",
      border: "none",
      paddingRight: "4px",
    },
    ".cm-activeLineGutter": {
      backgroundColor: "#2a2d2e",
      color: "#c6c6c6",
    },
    ".cm-activeLine": {
      backgroundColor: "#2a2d2e44",
    },
    // Matching brackets
    ".cm-matchingBracket": {
      backgroundColor: "#3a3d4166",
      outline: "1px solid #888",
    },
    // Fold gutter
    ".cm-foldGutter .cm-gutterElement": {
      color: "#555",
      cursor: "pointer",
      fontSize: "12px",
      lineHeight: "1.6",
      padding: "0 2px",
    },
    ".cm-foldGutter .cm-gutterElement:hover": {
      color: "#ccc",
    },
    // Selection match highlights
    ".cm-selectionMatch": {
      backgroundColor: "#515c6a40",
      borderRadius: "2px",
    },
    // Search panel
    ".cm-panels": {
      backgroundColor: "#252526",
      color: "#d4d4d4",
    },
    ".cm-searchMatch": {
      backgroundColor: "#515c6a80",
      outline: "1px solid #74879f50",
    },
    ".cm-searchMatch.cm-searchMatch-selected": {
      backgroundColor: "#613214",
    },
    // Tooltip & autocomplete
    ".cm-tooltip": {
      backgroundColor: "#252526",
      color: "#d4d4d4",
      border: "1px solid #454545",
      borderRadius: "3px",
      boxShadow: "0 2px 8px rgba(0,0,0,0.5)",
    },
    ".cm-tooltip-autocomplete": {
      "& > ul": {
        maxHeight: "250px",
        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
        fontSize: "12px",
      },
      "& > ul > li": {
        padding: "2px 8px",
      },
      "& > ul > li[aria-selected]": {
        backgroundColor: "#04395e",
        color: "#fff",
      },
    },
    ".cm-completionDetail": {
      color: "#888",
      fontStyle: "italic",
      marginLeft: "8px",
    },
    // Lint gutter markers
    ".cm-lint-marker": {
      width: "8px",
      height: "8px",
    },
    // Scrollbar
    ".cm-scroller": {
      scrollbarWidth: "thin",
      scrollbarColor: "#4e4e4e #1e1e1e",
    },
  },
  { dark: true },
)

const OUTPUT_HEIGHT_STORAGE_KEY = "dreamer:sketch-output-height"
const OUTPUT_MIN_HEIGHT = 96
const OUTPUT_DEFAULT_HEIGHT = 256
const OUTPUT_EXPANDED_HEIGHT = 400
const OUTPUT_MAX_HEIGHT = 520

function clampOutputHeight(height: number): number {
  return Math.max(OUTPUT_MIN_HEIGHT, Math.min(OUTPUT_MAX_HEIGHT, Math.round(height)))
}

function loadStoredOutputHeight(): number {
  if (typeof window === "undefined") return OUTPUT_DEFAULT_HEIGHT
  const raw = window.localStorage.getItem(OUTPUT_HEIGHT_STORAGE_KEY)
  if (!raw) return OUTPUT_DEFAULT_HEIGHT
  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) return OUTPUT_DEFAULT_HEIGHT
  return clampOutputHeight(parsed)
}

function persistOutputHeight(height: number): void {
  if (typeof window === "undefined") return
  window.localStorage.setItem(OUTPUT_HEIGHT_STORAGE_KEY, String(clampOutputHeight(height)))
}

// ── Component ─────────────────────────────────────────────────────────────

/**
 * Format an epoch millisecond timestamp as HH:MM:SS. Call sites pass the
 * time the message was *produced* — never call this with `Date.now()` at
 * render time, or the stamp will advance on every React re-render.
 */
function formatTs(ms: number): string {
  const d = new Date(ms)
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`
}

function SketchEditorInner() {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const isExternalUpdate = useRef(false)

  const { state: boardState, send } = useBoard()
  const boardTargetRef = useRef(boardState.boardTarget ?? DEFAULT_BOARD_TARGET)
  boardTargetRef.current = boardState.boardTarget ?? DEFAULT_BOARD_TARGET
  const electrical = useElectricalReport()

  // Use the shared simulation from PlayControls (not a separate instance)
  const [, tickRender] = React.useReducer((c: number) => c + 1, 0)
  useEffect(() => {
    // Poll simulation status at 10fps so buttons stay in sync
    const id = setInterval(tickRender, 100)
    return () => clearInterval(id)
  }, [])
  const sim = simulationRef.current ?? { status: "stopped" as const, error: null, play: () => {}, pause: () => {}, resume: () => {}, stop: () => {}, sendSerialInput: () => {}, vm: null }
  const transpileErr = transpileErrorRef.current
  const sketchSize = sketchSizeRef.current

  // First-seen timestamp map for output-panel messages that don't have
  // their own capture point (sim.error, electrical issues). Without this,
  // rendering `new Date()` each frame makes the stamp appear to "roll"
  // across tick renders. Entries are never updated — first-seen wins —
  // so the visible stamp is stable for the lifetime of the message.
  const seenAtRef = useRef<Map<string, number>>(new Map())
  function stampFor(key: string): number {
    const existing = seenAtRef.current.get(key)
    if (existing !== undefined) return existing
    const now = Date.now()
    seenAtRef.current.set(key, now)
    return now
  }
  const [outputHeight, setOutputHeight] = useState(loadStoredOutputHeight)
  const resizeStartYRef = useRef(0)
  const resizeStartHeightRef = useRef(OUTPUT_DEFAULT_HEIGHT)

  const lastCodeRef = useRef(boardState.sketchCode)
  lastCodeRef.current = boardState.sketchCode

  const handleEditorChange = useCallback(
    (code: string) => {
      send({ type: "UPDATE_SKETCH", code })
    },
    [send],
  )

  // Refs for Cmd+S flush
  const sendRef = useRef(send)
  sendRef.current = send

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged && !isExternalUpdate.current) {
        // Clear stale transpile errors when user edits code
        transpileErrorRef.current = null
        const code = update.state.doc.toString()
        handleEditorChange(code)
      }
    })

    const state = EditorState.create({
      doc: lastCodeRef.current,
      extensions: [
        // ── Gutter ──
        lineNumbers(),
        foldGutter(),                     // 3. Code folding
        lintGutter(),                     // 8. Lint gutter

        // ── Core editing ──
        history(),
        drawSelection(),
        dropCursor(),
        highlightSpecialChars(),
        highlightActiveLine(),            // 5. Active line highlight
        highlightActiveLineGutter(),      // 5. Active line gutter
        indentOnInput(),                  // 9. Auto-indent after {
        bracketMatching(),
        closeBrackets(),                  // 2. Auto-close brackets/quotes
        highlightSelectionMatches(),      // 7. Selection match highlight

        // ── Language ──
        cpp(),
        syntaxHighlighting(highlightColors), // 1. Syntax highlighting colors

        // ── Autocomplete ──
        autocompletion({
          override: [arduinoCompletionSource],
        }),

        // ── Linting ──
        linter((view) => arduinoLinter(view, boardTargetRef.current)),

        // ── Keymaps ──
        keymap.of([
          // Cmd+S: flush current editor content to board state immediately
          // so the global Cmd+S handler saves the latest code
          {
            key: "Mod-s",
            run: (view) => {
              // Flush editor content to board state, then save immediately
              const code = view.state.doc.toString()
              sendRef.current({ type: "UPDATE_SKETCH", code })
              saveRef.current?.()
              return true // handled — prevent browser save dialog
            },
          },
          { key: "Tab", run: acceptCompletion },
          indentWithTab,                  // 6. Tab to indent, Shift-Tab to dedent
          ...closeBracketsKeymap,         // 2. Bracket keymap
          ...completionKeymap,
          ...searchKeymap,                // 4. Cmd+F / Cmd+H search
          ...foldKeymap,                  // 3. Fold keybindings
          ...defaultKeymap,
          ...historyKeymap,
        ]),

        // ── Theme ──
        darkTheme,

        // ── Misc ──
        updateListener,
        EditorView.lineWrapping,
      ],
    })

    const view = new EditorView({ state, parent: container })
    viewRef.current = view

    // Expose editor content globally so saveNow can read the live text
    editorContentRef.current = () => view.state.doc.toString()

    return () => {
      view.destroy()
      viewRef.current = null
      editorContentRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return

    const currentDoc = view.state.doc.toString()
    if (boardState.sketchCode !== currentDoc) {
      isExternalUpdate.current = true
      view.dispatch({
        changes: {
          from: 0,
          to: currentDoc.length,
          insert: boardState.sketchCode,
        },
      })
      isExternalUpdate.current = false
    }
  }, [boardState.sketchCode])

  const handlePlay = useCallback(() => {
    if (electrical.hasErrors) return
    if (sim.status === "paused") {
      sim.resume()
      return
    }
    const code = viewRef.current?.state.doc.toString() ?? boardState.sketchCode
    sim.play(code)
  }, [electrical.hasErrors, sim, boardState.sketchCode])

  const handlePause = useCallback(() => {
    sim.pause()
  }, [sim])

  const handleStop = useCallback(() => {
    sim.stop()
    resetAllCapVoltages()
    send({ type: "RESET_PINS" } as never)
  }, [sim, send])

  const isRunning = sim.status === "running"
  const isPaused = sim.status === "paused"
  const isCompiling = sim.status === "compiling"
  const isStopped = sim.status === "stopped"
  const electricalErrors = electrical.issues.filter((i) => i.severity === "error")
  const outputHasErrors = Boolean(sim.error || transpileErr || electricalErrors.length > 0)

  const handleResizeStart = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    resizeStartYRef.current = e.clientY
    resizeStartHeightRef.current = outputHeight
    document.body.style.cursor = "row-resize"
    document.body.style.userSelect = "none"
    let latestHeight = outputHeight

    const onPointerMove = (ev: PointerEvent) => {
      const deltaY = ev.clientY - resizeStartYRef.current
      latestHeight = clampOutputHeight(resizeStartHeightRef.current - deltaY)
      setOutputHeight(latestHeight)
    }

    const onPointerUp = () => {
      document.body.style.cursor = ""
      document.body.style.userSelect = ""
      window.removeEventListener("pointermove", onPointerMove)
      window.removeEventListener("pointerup", onPointerUp)
      persistOutputHeight(latestHeight)
    }

    window.addEventListener("pointermove", onPointerMove)
    window.addEventListener("pointerup", onPointerUp)
  }, [outputHeight])

  const handleToggleOutputSize = useCallback(() => {
    setOutputHeight((prev) => {
      const next = prev < OUTPUT_EXPANDED_HEIGHT ? OUTPUT_EXPANDED_HEIGHT : OUTPUT_DEFAULT_HEIGHT
      persistOutputHeight(next)
      return next
    })
  }, [])

  return (
    <div className="flex h-full w-full flex-col bg-[#1e1e1e]">
      {/* Toolbar */}
      <div className="flex items-center gap-1.5 border-b border-neutral-700 px-3 py-1.5">
        {/* Play / Pause */}
        {isRunning ? (
          <button
            type="button"
            onClick={handlePause}
            className="flex items-center gap-1.5 rounded bg-yellow-600/80 px-2.5 py-1 text-xs font-medium text-white hover:bg-yellow-500/80"
          >
            <svg viewBox="0 0 16 16" className="size-3 fill-current"><rect x={3} y={2} width={4} height={12} rx={1} /><rect x={9} y={2} width={4} height={12} rx={1} /></svg>
            Pause
          </button>
        ) : (
          <button
            type="button"
            onClick={handlePlay}
            disabled={isCompiling || electrical.hasErrors}
            className="flex items-center gap-1.5 rounded bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            {isCompiling ? (
              <>
                <svg viewBox="0 0 16 16" className="size-3 fill-current animate-pulse"><rect x={2} y={2} width={12} height={12} rx={2} /></svg>
                Compiling...
              </>
            ) : (
              <>
                <svg viewBox="0 0 16 16" className="size-3 fill-current"><polygon points="3,1 14,8 3,15" /></svg>
                {isPaused ? "Resume" : "Run"}
              </>
            )}
          </button>
        )}

        {/* Stop */}
        <button
          type="button"
          onClick={handleStop}
          disabled={isStopped}
          className="flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium text-neutral-300 hover:bg-neutral-700 disabled:opacity-30"
        >
          <svg viewBox="0 0 16 16" className="size-3 fill-current"><rect x={2} y={2} width={12} height={12} rx={2} /></svg>
          Stop
        </button>

        {/* Status */}
        {isRunning && (
          <span className="ml-1 flex items-center gap-1 text-[10px] text-emerald-400">
            <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
            running
          </span>
        )}
        {isPaused && (
          <span className="ml-1 text-[10px] text-yellow-400">paused</span>
        )}
        {sim.status === "error" && sim.error && (
          <span className="ml-1 text-[10px] text-red-400" title={sim.error}>error</span>
        )}
        {electrical.hasErrors && (
          <span
            className="ml-1 text-[10px] text-red-400"
            title={electrical.issues.find((i) => i.severity === "error")?.message}
          >
            error
          </span>
        )}

        {/* Spacer pushes Example button to the right */}
        <div className="flex-1" />

        <ExampleButton />
      </div>

      {/* Editor container */}
      <div ref={containerRef} className="min-h-0 flex-1" />

      {/* Code output window */}
      <div className="border-t border-neutral-700 bg-[#161616]" style={{ height: `${outputHeight}px` }}>
        <div
          onPointerDown={handleResizeStart}
          className="h-1 cursor-row-resize bg-neutral-800 hover:bg-neutral-700"
          title="Drag to resize output panel"
        />
        <div className="flex items-center justify-between border-b border-neutral-800 px-3 py-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-300">Code Output</span>
          <div className="flex items-center gap-3">
            {outputHasErrors ? (
              <span className="text-[10px] text-red-400">errors</span>
            ) : (
              <span className="text-[10px] text-neutral-500">no errors</span>
            )}
            <button
              type="button"
              onClick={handleToggleOutputSize}
              className="rounded px-1.5 py-0.5 text-[10px] text-neutral-300 hover:bg-neutral-700"
            >
              {outputHeight < OUTPUT_EXPANDED_HEIGHT ? "Expand" : "Default"}
            </button>
          </div>
        </div>
        <div className="h-[calc(100%-29px)] overflow-auto whitespace-pre-wrap break-words px-3 py-2 font-mono text-[11px] leading-5">
          {!outputHasErrors && (
            <div className="text-neutral-500">Build and runtime messages will appear here.</div>
          )}

          {transpileErr && (
            <div className="text-red-400">
              <span className="text-neutral-600">{formatTs(transpileErr.ts)}</span>{" "}
              <span className="text-red-300">[TRANSPILER]</span>{" "}
              {`line ${transpileErr.error.line}: ${transpileErr.error.message}`}
            </div>
          )}

          {sim.error && (
            <div className="text-red-400">
              <span className="text-neutral-600">{formatTs(stampFor(`sim:${sim.error}`))}</span>{" "}
              <span className="text-red-300">[SIMULATION]</span>{" "}
              {sim.error}
            </div>
          )}

          {electricalErrors.map((issue) => {
            const key = `${issue.code}-${issue.componentId ?? ""}-${issue.pin ?? ""}`
            return (
              <div key={key} className="text-red-400">
                <span className="text-neutral-600">{formatTs(stampFor(`electrical:${key}`))}</span>{" "}
                <span className="text-red-300">[ELECTRICAL]</span>{" "}
                {issue.message}
              </div>
            )
          })}

          {sketchSize && !outputHasErrors && (
            <div className="mt-1 space-y-0.5 text-neutral-400">
              <div>
                <span className="text-neutral-600">{formatTs(sketchSize.ts)}</span>{" "}
                <span className="text-neutral-500">{sketchSize.source === "actual" ? "[COMPILER]" : "[ESTIMATE]"}</span>{" "}
                Sketch uses <span className="text-neutral-200">{sketchSize.flashUsed.toLocaleString()}</span> bytes ({sketchSize.flashPercent}%) of program storage space. Maximum is {sketchSize.flashMax.toLocaleString()} bytes.
              </div>
              <div>
                <span className="text-neutral-600">{formatTs(sketchSize.ts)}</span>{" "}
                <span className="text-neutral-500">{sketchSize.source === "actual" ? "[COMPILER]" : "[ESTIMATE]"}</span>{" "}
                Global variables use <span className="text-neutral-200">{sketchSize.ramUsed.toLocaleString()}</span> bytes ({sketchSize.ramPercent}%) of dynamic memory, leaving {(sketchSize.ramMax - sketchSize.ramUsed).toLocaleString()} bytes for local variables. Maximum is {sketchSize.ramMax.toLocaleString()} bytes.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export const SketchEditor = React.memo(SketchEditorInner)
