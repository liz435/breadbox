// ── Debugger editor extension ───────────────────────────────────────────────
//
// CodeMirror 6 extension wiring the gutter + current-line highlight to the
// `debugStateStore`:
//   • a breakpoint gutter (click a line to toggle a breakpoint),
//   • a "current execution line" decoration that tracks the paused PC's line.
//
// State flows store → editor via a ViewPlugin that subscribes to the store and
// dispatches effects, and editor → store via the gutter's mousedown handler.
// Self-contained (own theme) so sketch-editor.tsx just drops it into the
// extensions array.

import {
  EditorView,
  Decoration,
  gutter,
  GutterMarker,
  ViewPlugin,
  type DecorationSet,
} from "@codemirror/view"
import { StateField, StateEffect, type Extension } from "@codemirror/state"
import { debugStateStore } from "@/simulator/debug-state-store"
import { simulationRef } from "@/simulator/simulation-ref"

// ── Effects: carry store state into editor transactions ─────────────────────

type BreakpointState = {
  all: ReadonlySet<number>
  armed: ReadonlySet<number>
  // Whether the runner reported a source-line table. Only then can we know a
  // breakpoint is "unbound" (no generated code); before a run we can't, so we
  // render every breakpoint as bound.
  hasLineTable: boolean
}

const setBreakpointState = StateEffect.define<BreakpointState>()
const setCurrentLine = StateEffect.define<number | null>()

function sameSet(a: ReadonlySet<number>, b: ReadonlySet<number>): boolean {
  if (a.size !== b.size) return false
  for (const v of a) if (!b.has(v)) return false
  return true
}

// ── Breakpoint gutter ───────────────────────────────────────────────────────

const breakpointField = StateField.define<BreakpointState>({
  create: () => ({ all: new Set(), armed: new Set(), hasLineTable: false }),
  update(value, tr) {
    for (const e of tr.effects) if (e.is(setBreakpointState)) return e.value
    return value
  },
})

class BreakpointMarker extends GutterMarker {
  constructor(readonly bound: boolean) {
    super()
  }
  override eq(other: BreakpointMarker): boolean {
    return other.bound === this.bound
  }
  override toDOM(): HTMLElement {
    const el = document.createElement("span")
    el.className = `cm-breakpoint${this.bound ? "" : " cm-breakpoint-unbound"}`
    el.textContent = "●"
    return el
  }
}

const breakpointGutter = gutter({
  class: "cm-breakpoint-gutter",
  lineMarker(view, line) {
    const bp = view.state.field(breakpointField, false)
    if (!bp) return null
    const lineNo = view.state.doc.lineAt(line.from).number
    if (!bp.all.has(lineNo)) return null
    // Only dim when we actually have a line table and the line didn't map.
    const bound = !bp.hasLineTable || bp.armed.has(lineNo)
    return new BreakpointMarker(bound)
  },
  lineMarkerChange(update) {
    return (
      update.startState.field(breakpointField, false) !==
      update.state.field(breakpointField, false)
    )
  },
  initialSpacer: () => new BreakpointMarker(true),
  domEventHandlers: {
    mousedown(view, line) {
      const lineNo = view.state.doc.lineAt(line.from).number
      debugStateStore.toggleBreakpoint(lineNo)
      // Push immediately to a running runner so the breakpoint takes effect
      // mid-run (no-op when stopped; re-armed on the next Play either way).
      simulationRef.current?.applyBreakpoints()
      return true
    },
  },
})

// ── Current execution line decoration ───────────────────────────────────────

const currentLineDecoration = Decoration.line({ class: "cm-debugCurrentLine" })

const currentLineField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, tr) {
    for (const e of tr.effects) {
      if (e.is(setCurrentLine)) {
        const line = e.value
        if (line === null || line < 1 || line > tr.state.doc.lines) {
          return Decoration.none
        }
        const pos = tr.state.doc.line(line).from
        return Decoration.set([currentLineDecoration.range(pos)])
      }
    }
    return value.map(tr.changes)
  },
  provide: (f) => EditorView.decorations.from(f),
})

// ── Store → editor sync ──────────────────────────────────────────────────────

const debugSync = ViewPlugin.fromClass(
  class {
    private unsubscribe: () => void
    private lastLine: number | null = null

    constructor(private readonly view: EditorView) {
      this.unsubscribe = debugStateStore.subscribe(() => this.sync())
      // Defer the initial sync: dispatching during view construction is not
      // allowed. A microtask runs after the editor is live.
      queueMicrotask(() => this.sync())
    }

    private sync(): void {
      const snap = debugStateStore.getSnapshot()
      const effects: StateEffect<unknown>[] = []

      const current = this.view.state.field(breakpointField, false)
      if (
        current &&
        (!sameSet(current.all, snap.breakpoints) ||
          !sameSet(current.armed, snap.armed) ||
          current.hasLineTable !== snap.hasLineTable)
      ) {
        effects.push(
          setBreakpointState.of({
            all: new Set(snap.breakpoints),
            armed: new Set(snap.armed),
            hasLineTable: snap.hasLineTable,
          }),
        )
      }

      const line = snap.status === "paused" ? snap.current?.line ?? null : null
      if (line !== this.lastLine) {
        this.lastLine = line
        effects.push(setCurrentLine.of(line))
      }

      if (effects.length > 0) this.view.dispatch({ effects })
    }

    destroy(): void {
      this.unsubscribe()
    }
  },
)

// ── Theme ─────────────────────────────────────────────────────────────────

const debugTheme = EditorView.theme({
  ".cm-breakpoint-gutter": {
    width: "16px",
    cursor: "pointer",
  },
  ".cm-breakpoint-gutter .cm-gutterElement": {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  // Faint affordance on hover over an empty gutter slot.
  ".cm-breakpoint-gutter .cm-gutterElement:hover::after": {
    content: '"●"',
    color: "#e5140055",
    fontSize: "12px",
  },
  ".cm-breakpoint": {
    color: "#e51400",
    fontSize: "12px",
    lineHeight: "1.6",
  },
  ".cm-breakpoint-unbound": {
    // Set on a line with no generated code — shown dimmed/hollow.
    color: "#e5140066",
  },
  ".cm-debugCurrentLine": {
    backgroundColor: "#5a4a0066",
    boxShadow: "inset 3px 0 0 #ffcc00",
  },
})

/** All debugger editor extensions, ready to drop into the editor config. */
export function debugExtension(): Extension {
  return [breakpointField, breakpointGutter, currentLineField, debugSync, debugTheme]
}
