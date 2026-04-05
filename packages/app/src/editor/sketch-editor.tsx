// ── Sketch Editor Panel ─────────────────────────────────────────────────────
//
// CodeMirror 6 editor for Arduino sketches with syntax highlighting,
// Arduino-specific autocomplete, and a custom linter.

import React, { useRef, useEffect, useCallback } from "react"
import { EditorView, keymap, lineNumbers } from "@codemirror/view"
import { EditorState } from "@codemirror/state"
import { cpp } from "@codemirror/lang-cpp"
import { autocompletion } from "@codemirror/autocomplete"
import { linter } from "@codemirror/lint"
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands"
import { bracketMatching } from "@codemirror/language"
import { arduinoCompletionSource } from "./arduino-completions"
import { arduinoLinter } from "./arduino-linter"
import { useBoard } from "@/store/board-context"
import { useSimulation } from "@/simulator/simulation-loop"

// ── Dark Theme ────────────────────────────────────────────────────────────

const darkTheme = EditorView.theme(
  {
    "&": {
      backgroundColor: "#1e1e1e",
      color: "#d4d4d4",
      height: "100%",
    },
    ".cm-content": {
      caretColor: "#aeafad",
      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      fontSize: "13px",
    },
    ".cm-cursor": {
      borderLeftColor: "#aeafad",
    },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
      backgroundColor: "#264f78",
    },
    ".cm-gutters": {
      backgroundColor: "#1e1e1e",
      color: "#858585",
      border: "none",
    },
    ".cm-activeLineGutter": {
      backgroundColor: "#2a2d2e",
    },
    ".cm-activeLine": {
      backgroundColor: "#2a2d2e44",
    },
    ".cm-tooltip": {
      backgroundColor: "#252526",
      color: "#d4d4d4",
      border: "1px solid #454545",
    },
    ".cm-tooltip-autocomplete ul li[aria-selected]": {
      backgroundColor: "#04395e",
    },
  },
  { dark: true },
)

// ── Component ─────────────────────────────────────────────────────────────

function SketchEditorInner() {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const isExternalUpdate = useRef(false)

  const { state: boardState, send } = useBoard()
  const sim = useSimulation()

  // Keep latest sketchCode in a ref for the update listener
  const lastCodeRef = useRef(boardState.sketchCode)
  lastCodeRef.current = boardState.sketchCode

  // Dispatch UPDATE_SKETCH when the editor content changes
  const handleEditorChange = useCallback(
    (code: string) => {
      send({ type: "UPDATE_SKETCH", code })
    },
    [send],
  )

  // Create the CodeMirror editor on mount
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged && !isExternalUpdate.current) {
        const code = update.state.doc.toString()
        handleEditorChange(code)
      }
    })

    const state = EditorState.create({
      doc: lastCodeRef.current,
      extensions: [
        lineNumbers(),
        history(),
        bracketMatching(),
        cpp(),
        autocompletion({
          override: [arduinoCompletionSource],
        }),
        linter(arduinoLinter),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        darkTheme,
        updateListener,
        EditorView.lineWrapping,
      ],
    })

    const view = new EditorView({ state, parent: container })
    viewRef.current = view

    return () => {
      view.destroy()
      viewRef.current = null
    }
    // Only run on mount — deps are stable refs/callbacks
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Sync external sketchCode changes into the editor
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

  const handleCompile = useCallback(() => {
    const code = viewRef.current?.state.doc.toString() ?? boardState.sketchCode
    sim.play(code)
  }, [sim, boardState.sketchCode])

  const handleStop = useCallback(() => {
    sim.stop()
  }, [sim])

  return (
    <div className="flex h-full w-full flex-col bg-[#1e1e1e]">
      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b border-neutral-700 px-3 py-1.5">
        <button
          type="button"
          onClick={handleCompile}
          disabled={sim.status === "compiling"}
          className="rounded bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
        >
          {sim.status === "compiling" ? "Compiling..." : "Compile & Run"}
        </button>
        <button
          type="button"
          onClick={handleStop}
          disabled={sim.status === "stopped"}
          className="rounded bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-500 disabled:opacity-50"
        >
          Stop
        </button>
        {sim.status === "running" && (
          <span className="ml-2 text-xs text-emerald-400">Running</span>
        )}
        {sim.status === "error" && sim.error && (
          <span className="ml-2 text-xs text-red-400">{sim.error}</span>
        )}
      </div>

      {/* Editor container */}
      <div ref={containerRef} className="min-h-0 flex-1" />
    </div>
  )
}

export const SketchEditor = React.memo(SketchEditorInner)
