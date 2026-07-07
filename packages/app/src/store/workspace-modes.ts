// ── Workspace modes ─────────────────────────────────────────────────────
//
// Three task-focused presets that drive which Dockview panels are open, so the
// layout always matches what you're doing. Switching a mode opens that mode's
// tab set and closes the rest:
//
//   • 2d     — 2D breadboard canvas, components, sketch/libraries, schematic & inspector
//   • 3d     — 3D breadboard canvas, components, sketch/libraries & inspector
//   • debug  — breadboard/serial, sketch, pin inspector & debugger
//
// The mode buttons live in edit-toolbar.tsx. This module owns the (persisted)
// mode state and the layout transform applied on each switch. Panel metadata
// (component key + title) is read from VIEW_PANELS so this stays in sync with
// the tab strip and command palette.

import { useSyncExternalStore } from "react"
import type { DockviewApi, IDockviewPanel } from "dockview-react"
import { VIEW_PANELS, type ViewPanelDirection } from "./view-panels"

export type WorkspaceMode = "2d" | "3d" | "debug"

export type WorkspaceModeMeta = {
  id: WorkspaceMode
  label: string
  hint: string
}

// Order here is the order the mode buttons render in the toolbar.
export const WORKSPACE_MODES: WorkspaceModeMeta[] = [
  {
    id: "2d",
    label: "2D",
    hint: "2D breadboard, components, sketch/libraries, schematic & inspector",
  },
  {
    id: "3d",
    label: "3D",
    hint: "3D breadboard, components, sketch/libraries & inspector",
  },
  {
    id: "debug",
    label: "Debug",
    hint: "Breadboard/serial, sketch, pin inspector & debugger",
  },
]

// A panel placed by a mode: its id plus where to dock it relative to a panel
// added earlier in the same spec. The first panel (no `position`) is the root.
type ModePanel = {
  id: string
  position?: { referenceId: string; direction: ViewPanelDirection }
  /** Raise this panel to the front of its tab group once the layout is built.
   *  Needed when a group has several tabs and a specific one should show. */
  active?: boolean
}

type ModeSpec = {
  /** Panel raised to the front after the layout is built. */
  primary: string
  /** Ordered so each `position.referenceId` is added before it's referenced. */
  panels: ModePanel[]
}

const MODE_SPECS: Record<WorkspaceMode, ModeSpec> = {
  // 2D breadboard canvas is the root and the focused panel. Project Files
  // anchors to its left; Sketch/Libraries and the Schematic+Inspector column
  // sit to its right.
  "2d": {
    primary: "breadboard",
    panels: [
      { id: "breadboard" },
      { id: "projectFiles", position: { referenceId: "breadboard", direction: "left" } },
      { id: "sketchEditor", position: { referenceId: "breadboard", direction: "right" } },
      { id: "libraryManager", position: { referenceId: "sketchEditor", direction: "within" } },
      { id: "schematic", position: { referenceId: "sketchEditor", direction: "right" } },
      { id: "inspector", position: { referenceId: "schematic", direction: "below" } },
    ],
  },
  // Same shell as 2D but with the 3D breadboard as the root/focused canvas.
  // No Schematic here — it's a 2D artifact; the right column is Sketch over
  // Inspector so you keep code + component details next to the 3D view.
  "3d": {
    primary: "breadboard3d",
    panels: [
      { id: "breadboard3d" },
      { id: "projectFiles", position: { referenceId: "breadboard3d", direction: "left" } },
      { id: "sketchEditor", position: { referenceId: "breadboard3d", direction: "right" } },
      { id: "libraryManager", position: { referenceId: "sketchEditor", direction: "within" } },
      { id: "inspector", position: { referenceId: "sketchEditor", direction: "below" } },
    ],
  },
  // Left column: Breadboard over Serial Monitor. Middle: Sketch, full height.
  // Right column: Pin Inspector over Debugger. Columns are built left→right
  // first, then each is split vertically (so the splits land in the right
  // column, not the middle).
  debug: {
    primary: "debugger",
    panels: [
      { id: "breadboard" },
      { id: "sketchEditor", position: { referenceId: "breadboard", direction: "right" } },
      { id: "pinInspector", position: { referenceId: "sketchEditor", direction: "right" } },
      { id: "debugger", position: { referenceId: "pinInspector", direction: "below" } },
      { id: "serialMonitor", position: { referenceId: "breadboard", direction: "below" } },
    ],
  },
}

/** Which modes show the Serial Monitor — used to clear the unread serial dot. */
export function modeShowsSerial(mode: WorkspaceMode): boolean {
  return mode === "debug"
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

  // Adding a tab "within" a group makes it the active tab, so raise each
  // explicitly-flagged panel to fix groups that should default to a different
  // tab. Focus `primary` last so it ends up the globally-active panel.
  for (const p of spec.panels) {
    if (p.active) api.getPanel(p.id)?.api.setActive()
  }
  api.getPanel(spec.primary)?.api.setActive()
}

// ── Persisted mode state ─────────────────────────────────────────────────

const MODE_KEY = "dreamer:workspace-mode"

function isWorkspaceMode(value: string | null): value is WorkspaceMode {
  return value === "2d" || value === "3d" || value === "debug"
}

function readStoredMode(): WorkspaceMode {
  const raw = localStorage.getItem(MODE_KEY)
  return isWorkspaceMode(raw) ? raw : "2d"
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

/**
 * Switch to `target` and reshape the Dockview layout to match.
 *
 * Every mode enforces its exact tab set, opening its panels and closing
 * everything else while keeping the size of any panel shared with the previous
 * mode. Re-selecting the active mode rebuilds its default layout (a handy
 * "reset this view" affordance).
 */
export function applyWorkspaceMode(
  api: DockviewApi | null,
  target: WorkspaceMode,
): void {
  if (!api) return
  buildModeLayout(api, MODE_SPECS[target])
  setStoredMode(target)
}
