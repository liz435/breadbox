// ── CodeEditor ──────────────────────────────────────────────────────────────
//
// A small controlled CodeMirror editor for TS/JS source (custom-part authoring).
// Created once on mount; external `value` changes are synced in without
// resetting cursor/history on every keystroke. C-family highlighting (lang-cpp)
// is close enough for JS and is already a dependency.
//
// Folding: a language-agnostic bracket fold service collapses any multi-line
// `{…}` / `[…]` region (the JSON DSL and the JS module form alike). With
// `foldOnMount`, every region starts folded so the editor opens as a compact
// outline instead of a wall of source.

import { useEffect, useRef } from "react"
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter } from "@codemirror/view"
import { EditorState, type Text } from "@codemirror/state"
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands"
import { cpp } from "@codemirror/lang-cpp"
import {
  bracketMatching,
  indentOnInput,
  syntaxHighlighting,
  defaultHighlightStyle,
  codeFolding,
  foldGutter,
  foldKeymap,
  foldService,
  foldAll,
} from "@codemirror/language"

type CodeEditorProps = {
  value: string
  onChange: (value: string) => void
  /** Fold every collapsible region once the editor mounts (compact outline). */
  foldOnMount?: boolean
}

/**
 * Position of the bracket that closes the opener at `open`, scanning forward and
 * skipping string contents. Returns -1 if unbalanced. Authored sources are
 * small, so the linear per-call scan is fine.
 */
function matchingBracket(doc: Text, open: number): number {
  const text = doc.sliceString(open)
  let depth = 0
  let inString = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inString) {
      if (ch === "\\") i++
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') inString = true
    else if (ch === "{" || ch === "[") depth++
    else if (ch === "}" || ch === "]") {
      depth--
      if (depth === 0) return open + i
    }
  }
  return -1
}

/**
 * Fold any `{…}` / `[…]` block that spans more than one line, leaving the
 * brackets themselves visible. Works for both the JSON DSL and the JS module
 * form without a per-language grammar.
 */
const bracketFold = foldService.of((state, lineStart, lineEnd) => {
  const line = state.doc.sliceString(lineStart, lineEnd)
  let depth = 0
  let openRel = -1
  let inString = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inString) {
      if (ch === "\\") i++
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') inString = true
    else if (ch === "{" || ch === "[") {
      if (depth === 0) openRel = i
      depth++
    } else if (ch === "}" || ch === "]") {
      if (depth > 0) depth--
    }
  }
  // Nothing opened on this line stays open past its end → no foldable header here.
  if (depth <= 0 || openRel < 0) return null
  const openPos = lineStart + openRel
  const closePos = matchingBracket(state.doc, openPos)
  if (closePos <= lineEnd) return null
  return { from: openPos + 1, to: closePos }
})

export function CodeEditor({ value, onChange, foldOnMount = false }: CodeEditorProps) {
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
          codeFolding(),
          foldGutter(),
          bracketFold,
          syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
          cpp(),
          // Wrap long lines so the editor stays within the panel and reflows
          // when it's resized, instead of overflowing off the right edge.
          EditorView.lineWrapping,
          keymap.of([...defaultKeymap, ...historyKeymap, ...foldKeymap, indentWithTab]),
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
    if (foldOnMount) foldAll(view)
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

  // Absolutely fill the (relative) parent so CodeMirror gets a definite size
  // and reflows on resize, rather than growing to its content width.
  return <div ref={hostRef} className="absolute inset-0 overflow-hidden" />
}
