// ── CodeEditor ──────────────────────────────────────────────────────────────
//
// A small controlled CodeMirror editor for TS/JS source (custom-part authoring).
// Created once on mount; external `value` changes are synced in without
// resetting cursor/history on every keystroke. C-family highlighting (lang-cpp)
// is close enough for JS and is already a dependency.

import { useEffect, useRef } from "react"
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter } from "@codemirror/view"
import { EditorState } from "@codemirror/state"
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands"
import { cpp } from "@codemirror/lang-cpp"
import { bracketMatching, indentOnInput, syntaxHighlighting, defaultHighlightStyle } from "@codemirror/language"

type CodeEditorProps = {
  value: string
  onChange: (value: string) => void
}

export function CodeEditor({ value, onChange }: CodeEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    if (!hostRef.current) return
    const view = new EditorView({
      parent: hostRef.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(),
          highlightActiveLineGutter(),
          highlightActiveLine(),
          history(),
          bracketMatching(),
          indentOnInput(),
          syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
          cpp(),
          keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) onChangeRef.current(update.state.doc.toString())
          }),
          EditorView.theme({
            "&": { height: "100%", fontSize: "12px" },
            ".cm-scroller": { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", overflow: "auto" },
          }),
        ],
      }),
    })
    viewRef.current = view
    return () => {
      view.destroy()
      viewRef.current = null
    }
    // Created once; external value is reconciled by the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const current = view.state.doc.toString()
    if (current !== value) {
      view.dispatch({ changes: { from: 0, to: current.length, insert: value } })
    }
  }, [value])

  return <div ref={hostRef} className="h-full w-full overflow-hidden" />
}
