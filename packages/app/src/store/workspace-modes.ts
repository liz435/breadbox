// ── Workspace modes ─────────────────────────────────────────────────────
//
// Task-focused presets that drive which Dockview panels are open, so the
// layout always matches what you're doing. Switching a mode opens that mode's
// tab set and closes the rest:
//
//   • 2d     — 2D breadboard canvas, components, sketch/libraries, schematic & inspector
//   • 3d     — 3D breadboard canvas, 3D components, and sketch/libraries
//   • physical — standalone 3D test scene, sketch, sensors & test cases
//   • debug  — breadboard/serial, sketch, pin inspector & debugger
//
// The mode buttons live in edit-toolbar.tsx. This module owns the (persisted)
// mode state and the layout transform applied on each switch. Panel metadata
// (component key + title) is read from VIEW_PANELS so this stays in sync with
// the tab strip and command palette.

import { useSyncExternalStore } from "react"
import type { DockviewApi } from "dockview-react"
import { VIEW_PANELS, type ViewPanelDirection } from "./view-panels"

export type WorkspaceMode = "2d" | "3d" | "physical" | "debug"

/** Bump when the default Dockview tree changes enough that old layouts should
 * be discarded instead of being silently reused. */
export const WORKSPACE_LAYOUT_VERSION = "arduino-sim-v19"

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
    hint: "Breadboard, components, sketch/libraries, schematic & inspector",
  },
  {
    id: "3d",
    label: "3D",
    hint: "3D breadboard, components, sketch/libraries",
  },
  {
    id: "physical",
    label: "Physical Test",
    hint: "3D test scene, sketch, sensors & test cases",
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
  /** Fractions of the available Dockview width/height for the major groups. */
  sizes?: Record<string, { width?: number; height?: number }>
}

// These are intentionally task-specific rather than one shared shell:
// - 2D needs a large canvas and a stacked analysis/code column.
// - 3D needs the scene to dominate while keeping the 3D action sidebar useful.
// - Physical Test already owns its scene controls, so the generic Components
//   and Inspector panels would be redundant.
const MODE_SIZES = {
  "2d": {
    projectFiles: { width: 0.2 },
    breadboard: { width: 0.46 },
    sketchEditor: { width: 0.34, height: 0.5 },
    schematic: { height: 0.28 },
    inspector: { height: 0.22 },
  },
  "3d": {
    projectFiles: { width: 0.2 },
    breadboard3d: { width: 0.55 },
    sketchEditor: { width: 0.25 },
  },
  physical: {
    physicalTest: { width: 0.68 },
    sketchEditor: { width: 0.32 },
  },
} satisfies Partial<Record<WorkspaceMode, Record<string, { width?: number; height?: number }>>>

const MODE_SPECS: Record<WorkspaceMode, ModeSpec> = {
  // 2D: Components | Breadboard | Sketch/Libraries → Schematic → Inspector.
  // Keeping the three right-side views in one vertical column leaves the
  // breadboard wide enough to wire comfortably.
  "2d": {
    primary: "breadboard",
    panels: [
      { id: "breadboard" },
      { id: "projectFiles", position: { referenceId: "breadboard", direction: "left" } },
      { id: "sketchEditor", position: { referenceId: "breadboard", direction: "right" } },
      { id: "libraryManager", position: { referenceId: "sketchEditor", direction: "within" } },
      { id: "schematic", position: { referenceId: "sketchEditor", direction: "below" } },
      { id: "inspector", position: { referenceId: "schematic", direction: "below" } },
    ],
    sizes: MODE_SIZES["2d"],
  },
  // 3D: Components | 3D Breadboard | Sketch/Libraries. The 3D Components
  // sidebar already owns model actions and assembly selection, so a generic
  // Inspector would duplicate controls and make the scene unnecessarily small.
  "3d": {
    primary: "breadboard3d",
    panels: [
      { id: "breadboard3d" },
      { id: "projectFiles", position: { referenceId: "breadboard3d", direction: "left" } },
      { id: "sketchEditor", position: { referenceId: "breadboard3d", direction: "right" } },
      { id: "libraryManager", position: { referenceId: "sketchEditor", direction: "within" } },
    ],
    sizes: MODE_SIZES["3d"],
  },
  // Physical Test already contains its scene tree, runtime controls and
  // diagnostics. Keep the editable sketch beside it, but omit the generic
  // Components/Inspector panels that do not operate on physical bodies.
  physical: {
    primary: "physicalTest",
    panels: [
      { id: "physicalTest" },
      { id: "sketchEditor", position: { referenceId: "physicalTest", direction: "right" } },
      { id: "libraryManager", position: { referenceId: "sketchEditor", direction: "within" } },
    ],
    sizes: MODE_SIZES.physical,
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

function applyModeSizes(api: DockviewApi, spec: ModeSpec): void {
  if (!spec.sizes || api.width <= 0 || api.height <= 0) return

  for (const [id, ratio] of Object.entries(spec.sizes)) {
    const panel = api.getPanel(id)
    if (!panel) continue
    const size: { width?: number; height?: number } = {}
    if (ratio.width !== undefined) size.width = Math.round(api.width * ratio.width)
    if (ratio.height !== undefined) size.height = Math.round(api.height * ratio.height)
    panel.api.setSize(size)
  }
}

/** Rebuild the exact panel tree for the mode, then apply its task-specific
 * proportions. Reusing panels across modes preserved stale Dockview split
 * topology, which is why switching modes previously produced inconsistent
 * columns and tiny viewports. Panel state itself lives in the shared stores,
 * so remounting the view shells is safe and makes the preset deterministic. */
function buildModeLayout(api: DockviewApi, spec: ModeSpec): void {
  api.clear()

  for (const p of spec.panels) {
    const { component, title } = panelMeta(p.id)
    const ref = p.position ? api.getPanel(p.position.referenceId) : undefined
    api.addPanel({
      id: p.id,
      component,
      title,
      inactive: p.id !== spec.primary,
      position:
        p.position && ref
          ? { referencePanel: ref, direction: p.position.direction }
          : undefined,
    })
  }

  applyModeSizes(api, spec)

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
  return value === "2d" || value === "3d" || value === "physical" || value === "debug"
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
 * Every mode enforces its exact tab set and deterministic panel proportions.
 * Re-selecting the active mode resets that mode's layout as well.
 */
export function applyWorkspaceMode(
  api: DockviewApi | null,
  target: WorkspaceMode,
): void {
  if (!api) return
  buildModeLayout(api, MODE_SPECS[target])
  setStoredMode(target)
}
