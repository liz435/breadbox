// ── Workspace modes ─────────────────────────────────────────────────────
//
// Four task-focused presets that drive which Dockview panels are open, so the
// layout always matches what you're doing. Switching a mode opens that mode's
// tab set and closes the rest:
//
//   • build     — Components, Canvas, Sketch, Inspector, Schematic
//   • simulate  — Canvas, Sketch, Serial Monitor, Pin Inspector, OLED
//   • debug     — Debugger, Sketch, Canvas, Serial Monitor, Pin Inspector
//   • freeform  — unconstrained; never force-closes, remembers your layout
//
// The mode buttons live in edit-toolbar.tsx. This module owns the (persisted)
// mode state and the layout transform applied on each switch. Panel metadata
// (component key + title) is read from VIEW_PANELS so this stays in sync with
// the tab strip and command palette.

import { useSyncExternalStore } from "react"
import type { DockviewApi, IDockviewPanel } from "dockview-react"
import { VIEW_PANELS, type ViewPanelDirection } from "./view-panels"

export type WorkspaceMode = "build" | "simulate" | "debug" | "freeform"

export type WorkspaceModeMeta = {
  id: WorkspaceMode
  label: string
  hint: string
}

// Order here is the order the mode buttons render in the toolbar.
export const WORKSPACE_MODES: WorkspaceModeMeta[] = [
  {
    id: "build",
    label: "Build",
    hint: "Components, canvas, sketch, inspector & schematic",
  },
  {
    id: "simulate",
    label: "Simulate",
    hint: "Canvas, sketch, serial, pin inspector & OLED",
  },
  {
    id: "debug",
    label: "Debug",
    hint: "Debugger, sketch, canvas, serial & pin inspector",
  },
  {
    id: "freeform",
    label: "Freeform",
    hint: "Open and arrange any tabs — remembers your layout",
  },
]

// A panel placed by a mode: its id plus where to dock it relative to a panel
// added earlier in the same spec. The first panel (no `position`) is the root.
type ModePanel = {
  id: string
  position?: { referenceId: string; direction: ViewPanelDirection }
}

type ModeSpec = {
  /** Panel raised to the front after the layout is built. */
  primary: string
  /** Ordered so each `position.referenceId` is added before it's referenced. */
  panels: ModePanel[]
}

// Structured modes only — freeform has no fixed spec.
const MODE_SPECS: Record<Exclude<WorkspaceMode, "freeform">, ModeSpec> = {
  build: {
    primary: "sketchEditor",
    panels: [
      { id: "projectFiles" },
      { id: "breadboard", position: { referenceId: "projectFiles", direction: "right" } },
      { id: "sketchEditor", position: { referenceId: "breadboard", direction: "right" } },
      { id: "schematic", position: { referenceId: "sketchEditor", direction: "within" } },
      { id: "inspector", position: { referenceId: "sketchEditor", direction: "right" } },
    ],
  },
  simulate: {
    primary: "breadboard",
    panels: [
      { id: "breadboard" },
      { id: "sketchEditor", position: { referenceId: "breadboard", direction: "right" } },
      { id: "oledDisplay", position: { referenceId: "sketchEditor", direction: "right" } },
      { id: "pinInspector", position: { referenceId: "oledDisplay", direction: "below" } },
      { id: "serialMonitor", position: { referenceId: "breadboard", direction: "below" } },
    ],
  },
  debug: {
    primary: "debugger",
    panels: [
      { id: "breadboard" },
      { id: "sketchEditor", position: { referenceId: "breadboard", direction: "right" } },
      { id: "pinInspector", position: { referenceId: "sketchEditor", direction: "right" } },
      { id: "debugger", position: { referenceId: "sketchEditor", direction: "below" } },
      { id: "serialMonitor", position: { referenceId: "breadboard", direction: "below" } },
    ],
  },
}

/** Which modes show the Serial Monitor — used to clear the unread serial dot. */
export function modeShowsSerial(mode: WorkspaceMode): boolean {
  return mode === "simulate" || mode === "debug"
}

function panelMeta(id: string): { component: string; title: string } {
  const view = VIEW_PANELS.find((p) => p.id === id)
  return { component: view?.component ?? id, title: view?.label ?? id }
}

/** Close every panel outside the mode's set, then open any of its panels that
 *  aren't already present. Panels shared with the previous mode are left in
 *  place, so they keep their size across the switch. */
function buildModeLayout(api: DockviewApi, spec: ModeSpec): void {
  const keep = new Set(spec.panels.map((p) => p.id))

  // Snapshot the panel list first — removePanel mutates api.panels.
  for (const panel of [...api.panels] as IDockviewPanel[]) {
    if (!keep.has(panel.id)) api.removePanel(panel)
  }

  for (const p of spec.panels) {
    if (api.getPanel(p.id)) continue
    const { component, title } = panelMeta(p.id)
    const ref = p.position ? api.getPanel(p.position.referenceId) : undefined
    api.addPanel({
      id: p.id,
      component,
      title,
      position:
        p.position && ref
          ? { referencePanel: ref, direction: p.position.direction }
          : undefined,
    })
  }

  api.getPanel(spec.primary)?.api.setActive()
}

// ── Persisted mode state ─────────────────────────────────────────────────

const MODE_KEY = "dreamer:workspace-mode"
const FREEFORM_KEY = "dreamer:workspace-freeform-layout"

type LayoutJSON = ReturnType<DockviewApi["toJSON"]>

function isWorkspaceMode(value: string | null): value is WorkspaceMode {
  return (
    value === "build" ||
    value === "simulate" ||
    value === "debug" ||
    value === "freeform"
  )
}

function readStoredMode(): WorkspaceMode {
  const raw = localStorage.getItem(MODE_KEY)
  return isWorkspaceMode(raw) ? raw : "build"
}

let currentMode: WorkspaceMode = readStoredMode()
const listeners = new Set<() => void>()

export function getWorkspaceMode(): WorkspaceMode {
  return currentMode
}

export function useWorkspaceMode(): WorkspaceMode {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => {
        listeners.delete(cb)
      }
    },
    getWorkspaceMode,
  )
}

function setStoredMode(mode: WorkspaceMode): void {
  if (mode === currentMode) return
  currentMode = mode
  localStorage.setItem(MODE_KEY, mode)
  for (const fn of listeners) fn()
}

function saveFreeformLayout(api: DockviewApi): void {
  try {
    localStorage.setItem(FREEFORM_KEY, JSON.stringify(api.toJSON()))
  } catch {
    /* ignore quota / serialization failures — freeform just won't be restored */
  }
}

function readFreeformLayout(): LayoutJSON | null {
  const raw = localStorage.getItem(FREEFORM_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as LayoutJSON
  } catch {
    return null
  }
}

/**
 * Switch to `target` and reshape the Dockview layout to match.
 *
 * Structured modes (build/simulate/debug) enforce their exact tab set, opening
 * their panels and closing everything else while keeping the size of any panel
 * shared with the previous mode. Re-selecting the active structured mode rebuilds
 * its default layout (a handy "reset this view" affordance).
 *
 * Freeform never force-closes: it restores your last freeform arrangement if
 * there is one, otherwise leaves the current layout as the starting point.
 * Leaving freeform snapshots it first, so the next visit comes back to the same
 * place.
 */
export function applyWorkspaceMode(
  api: DockviewApi | null,
  target: WorkspaceMode,
): void {
  if (!api) return
  // Re-clicking freeform is a no-op (don't clobber unsaved freeform edits with
  // the older snapshot). Re-clicking a structured mode rebuilds it.
  if (target === currentMode && target === "freeform") return

  // Snapshot freeform as we leave it so re-entering restores the arrangement.
  if (currentMode === "freeform" && target !== "freeform") {
    saveFreeformLayout(api)
  }

  if (target === "freeform") {
    const saved = readFreeformLayout()
    if (saved) {
      try {
        api.fromJSON(saved)
      } catch {
        /* corrupt snapshot — keep whatever is currently open */
      }
    }
    // No saved layout → leave the current tabs as the freeform starting point.
  } else {
    buildModeLayout(api, MODE_SPECS[target])
  }

  setStoredMode(target)
}
