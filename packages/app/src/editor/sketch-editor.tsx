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
import { debugExtension } from "./debug-extension"
import { useBoard } from "@/store/board-context"
import { simulationRef } from "@/simulator/simulation-ref"
import { saveRef, editorContentRef } from "@/project/save-ref"
import { transpileErrorRef } from "@/simulator/transpile-error-ref"
import { sketchSizeRef } from "@/simulator/sketch-size-ref"
import { useElectricalReport } from "@/electrical/power-budget"
import { DEFAULT_BOARD_TARGET } from "@dreamer/schemas"

// ── 1. Syntax Highlighting Colors (Gruvbox Light — warm parchment) ─────────

const highlightColors = HighlightStyle.define([
  { tag: t.keyword, color: "#9d0006" }, // faded red
  { tag: t.controlKeyword, color: "#9d0006" },
  { tag: t.definitionKeyword, color: "#9d0006" },
  { tag: t.modifier, color: "#9d0006" },
  { tag: t.typeName, color: "#b57614" }, // ochre
  { tag: t.className, color: "#b57614" },
  { tag: [t.function(t.variableName), t.function(t.definition(t.variableName))], color: "#076678" }, // blue
  { tag: t.variableName, color: "#3c3836" }, // ink
  { tag: t.definition(t.variableName), color: "#3c3836" },
  { tag: t.propertyName, color: "#076678" },
  { tag: [t.number, t.integer, t.float], color: "#8f3f71" }, // purple
  { tag: t.string, color: "#79740e" }, // olive green
  { tag: t.character, color: "#79740e" },
  { tag: t.bool, color: "#8f3f71" },
  { tag: t.null, color: "#8f3f71" },
  { tag: [t.lineComment, t.blockComment], color: "#928374", fontStyle: "italic" }, // warm gray
  { tag: t.operator, color: "#af3a03" }, // burnt orange
  { tag: t.punctuation, color: "#5f5650" },
  { tag: t.bracket, color: "#b57614" }, // ochre
  { tag: t.macroName, color: "#427b58" }, // aqua
  { tag: t.meta, color: "#af3a03" },
  { tag: t.invalid, color: "#cc241d" },
])

// ── 10. Theme Polish ────────────────────────────────────────────────────────

const editorTheme = EditorView.theme(
  {
    "&": {
      backgroundColor: "#f7efd8", // warm parchment
      color: "#3c3836", // dark ink
      height: "100%",
    },
    ".cm-content": {
      caretColor: "#3c3836",
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
      fontSize: "13px",
      lineHeight: "1.6",
    },
    ".cm-cursor": {
      borderLeftColor: "#3c3836",
      borderLeftWidth: "2px",
    },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
      backgroundColor: "#ebdbb2",
    },
    ".cm-gutters": {
      backgroundColor: "#f7efd8",
      color: "#a89984",
      border: "none",
      paddingRight: "4px",
    },
    ".cm-activeLineGutter": {
      backgroundColor: "#efe2bd",
      color: "#7c6f64",
    },
    ".cm-activeLine": {
      backgroundColor: "#efe2bd66",
    },
    // Matching brackets
    ".cm-matchingBracket": {
      backgroundColor: "#d5c4a166",
      outline: "1px solid #b57614",
    },
    // Fold gutter
    ".cm-foldGutter .cm-gutterElement": {
      color: "#bdae93",
      cursor: "pointer",
      fontSize: "12px",
      lineHeight: "1.6",
      padding: "0 2px",
    },
    ".cm-foldGutter .cm-gutterElement:hover": {
      color: "#7c6f64",
    },
    // Selection match highlights
    ".cm-selectionMatch": {
      backgroundColor: "#d5c4a180",
      borderRadius: "2px",
    },
    // Search panel
    ".cm-panels": {
      backgroundColor: "#efe2bd",
      color: "#3c3836",
    },
    ".cm-searchMatch": {
      backgroundColor: "#e9d8a6",
      outline: "1px solid #b5761450",
    },
    ".cm-searchMatch.cm-searchMatch-selected": {
      backgroundColor: "#d79921",
    },
    // Tooltip & autocomplete
    ".cm-tooltip": {
      backgroundColor: "#f2e5bc",
      color: "#3c3836",
      border: "1px solid #d5c4a1",
      borderRadius: "3px",
      boxShadow: "0 2px 8px rgba(60,40,10,0.18)",
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
        backgroundColor: "#d79921",
        color: "#3c3836",
      },
    },
    ".cm-completionDetail": {
      color: "#928374",
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
      scrollbarColor: "#d5c4a1 #f7efd8",
    },
  },
  { dark: false },
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

function formatTsMs(ms: number): string {
  const d = new Date(ms)
  return (
    `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}` +
    `.${String(d.getMilliseconds()).padStart(3, "0")}`
  )
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
  const sim = simulationRef.current ?? { status: "stopped" as const, error: null, play: () => {}, pause: () => {}, resume: () => {}, stop: () => {}, sendSerialInput: () => {}, runner: null }
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
        debugExtension(),                 // Breakpoint gutter + current-line highlight
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
        editorTheme,

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

  const isRunning = sim.status === "running"
  const isPaused = sim.status === "paused"
  const electricalErrors = electrical.issues.filter((i) => i.severity === "error")
  const outputHasErrors = Boolean(sim.error || transpileErr || electricalErrors.length > 0)

  const buildLog = boardState.buildLog
  // Autoscroll the output pane to the tail whenever a new build-log line
  // arrives. Mirrors the serial-monitor pattern: ref on the scroll
  // container, effect keyed on buildLog length so re-renders from
  // unrelated state don't snap the scroll back to bottom.
  const outputScrollRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = outputScrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [buildLog.length])

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
    <div data-onboarding="sketch" className="flex h-full w-full flex-col bg-card">
      {/* Toolbar — run/stop lives in the bottom-toolbar PlayControls now; this
          strip just surfaces sim status + the Examples picker. */}
      <div className="flex items-center gap-1.5 border-b border-border px-3 py-1.5">
        {/* Status */}
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

      {/* Editor container — soft blue tint overlay while the sketch is running */}
      <div className="relative min-h-0 flex-1">
        <div ref={containerRef} className="absolute inset-0" />
        <div
          aria-hidden
          className={`pointer-events-none absolute inset-0 bg-blue-500/10 transition-opacity duration-200 ${
            isRunning ? "opacity-100" : "opacity-0"
          }`}
        />
      </div>

      {/* Code output window */}
      <div className="border-t border-border bg-background" style={{ height: `${outputHeight}px` }}>
        <div
          onPointerDown={handleResizeStart}
          className="h-1 cursor-row-resize bg-secondary hover:bg-muted"
          title="Drag to resize output panel"
        />
        <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-foreground">Code Output</span>
          <div className="flex items-center gap-3">
            {outputHasErrors ? (
              <span className="text-[10px] text-red-400">errors</span>
            ) : (
              <span className="text-[10px] text-muted-foreground">no errors</span>
            )}
            <button
              type="button"
              onClick={handleToggleOutputSize}
              className="rounded px-1.5 py-0.5 text-[10px] text-foreground hover:bg-muted"
            >
              {outputHeight < OUTPUT_EXPANDED_HEIGHT ? "Expand" : "Default"}
            </button>
          </div>
        </div>
        <div
          ref={outputScrollRef}
          className="h-[calc(100%-29px)] overflow-auto whitespace-pre-wrap break-words px-3 py-2 font-mono text-[11px] leading-5"
        >
          {!outputHasErrors && buildLog.length === 0 && (
            <div className="text-muted-foreground">Build and runtime messages will appear here.</div>
          )}

          {transpileErr && (
            <div className="text-red-400">
              <span className="text-muted-foreground">{formatTs(transpileErr.ts)}</span>{" "}
              <span className="text-red-300">[TRANSPILER]</span>{" "}
              {`line ${transpileErr.error.line}: ${transpileErr.error.message}`}
            </div>
          )}

          {sim.error && (
            <div className="text-red-400">
              <span className="text-muted-foreground">{formatTs(stampFor(`sim:${sim.error}`))}</span>{" "}
              <span className="text-red-300">[SIMULATION]</span>{" "}
              {sim.error}
            </div>
          )}

          {electricalErrors.map((issue) => {
            const key = `${issue.code}-${issue.componentId ?? ""}-${issue.pin ?? ""}`
            return (
              <div key={key} className="text-red-400">
                <span className="text-muted-foreground">{formatTs(stampFor(`electrical:${key}`))}</span>{" "}
                <span className="text-red-300">[ELECTRICAL]</span>{" "}
                {issue.message}
              </div>
            )
          })}

          {/* Size summary comes from the arduino-cli build log (see below). */}

          {/* Live arduino-cli / avrdude log (Arduino IDE "Output" pane). */}
          {buildLog.length > 0 && (
            <div className="mt-1 space-y-0 text-foreground">
              {buildLog.map((entry, i) => (
                <div key={`${entry.ts}-${i}`}>
                  <span className="text-muted-foreground">{formatTsMs(entry.ts)}</span>{" "}
                  <span
                    className={
                      entry.tag === "upload" ? "text-cyan-400" : "text-muted-foreground"
                    }
                  >
                    {entry.tag === "upload" ? "[UPLOAD]" : "[COMPILER]"}
                  </span>{" "}
                  {entry.line}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export const SketchEditor = React.memo(SketchEditorInner)
