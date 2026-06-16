// ── Workspace modes ─────────────────────────────────────────────────────
//
// Three task-focused presets that drive which Dockview panels are open, so the
// layout always matches what you're doing. Switching a mode opens that mode's
// tab set and closes the rest:
//
//   • build     — Components, Canvas, Sketch/Libraries, Schematic, Inspector
//   • debug     — Breadboard/Serial, Sketch, Pin Inspector/Debugger
//   • freeform  — every panel at once by default, then remembers your layout
//
// The mode buttons live in edit-toolbar.tsx. This module owns the (persisted)
// mode state and the layout transform applied on each switch. Panel metadata
// (component key + title) is read from VIEW_PANELS so this stays in sync with
// the tab strip and command palette.

import { useSyncExternalStore } from "react"
import type { DockviewApi, IDockviewPanel } from "dockview-react"
import { VIEW_PANELS, type ViewPanelDirection } from "./view-panels"

export type WorkspaceMode = "build" | "debug" | "freeform"

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
    hint: "Components, canvas, sketch/libraries, schematic & inspector",
  },
  {
    id: "debug",
    label: "Debug",
    hint: "Breadboard/serial, sketch, pin inspector & debugger",
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

// Structured modes only — freeform has no fixed spec.
const MODE_SPECS: Record<Exclude<WorkspaceMode, "freeform">, ModeSpec> = {
  build: {
    primary: "sketchEditor",
    // Breadboard is the root (it's in every structured mode, so it persists
    // across switches and never gets re-added into the active group). Project
    // Files anchors to its left so the two always stay separate columns.
    panels: [
      { id: "breadboard" },
      { id: "projectFiles", position: { referenceId: "breadboard", direction: "left" } },
      { id: "sketchEditor", position: { referenceId: "breadboard", direction: "right" } },
      { id: "libraryManager", position: { referenceId: "sketchEditor", direction: "within" } },
      { id: "schematic", position: { referenceId: "sketchEditor", direction: "right" } },
      { id: "inspector", position: { referenceId: "schematic", direction: "below" } },
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

// Freeform's first-run starting point: every working panel on screen at once.
// Four columns built left→right, then the outer two split vertically and the
// tabbed groups raise their default tab:
//   Project Files | Breadboard / Serial | Sketch+Libraries | (Inspector+Schematic) / (Pin Inspector+Debugger+Diagram)
const FREEFORM_DEFAULT: ModeSpec = {
  primary: "breadboard",
  panels: [
    { id: "breadboard" },
    { id: "projectFiles", position: { referenceId: "breadboard", direction: "left" } },
    { id: "sketchEditor", position: { referenceId: "breadboard", direction: "right" }, active: true },
    { id: "libraryManager", position: { referenceId: "sketchEditor", direction: "within" } },
    { id: "inspector", position: { referenceId: "sketchEditor", direction: "right" }, active: true },
    { id: "schematic", position: { referenceId: "inspector", direction: "within" } },
    { id: "pinInspector", position: { referenceId: "inspector", direction: "below" }, active: true },
    { id: "debugger", position: { referenceId: "pinInspector", direction: "within" } },
    { id: "diagram", position: { referenceId: "pinInspector", direction: "within" } },
    { id: "serialMonitor", position: { referenceId: "breadboard", direction: "below" } },
  ],
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

/** Freeform's starting layout when there's no saved arrangement yet. Cleared
 *  and rebuilt from scratch so the result is exact regardless of the mode we
 *  came from (buildModeLayout alone leaves shared panels in their old spots).
 *  Once the user rearranges and leaves freeform, their snapshot takes over. */
function buildFreeformDefault(api: DockviewApi): void {
  api.clear()
  buildModeLayout(api, FREEFORM_DEFAULT)

  // Approximate the four-column proportions; vertical splits keep Dockview's
  // default ~50/50. The user can resize freely — freeform remembers it.
  const w = api.width
  api.getPanel("projectFiles")?.api.setSize({ width: w * 0.15 })
  api.getPanel("breadboard")?.api.setSize({ width: w * 0.34 })
  api.getPanel("sketchEditor")?.api.setSize({ width: w * 0.26 })
  api.getPanel("inspector")?.api.setSize({ width: w * 0.25 })
}

// ── Persisted mode state ─────────────────────────────────────────────────

const MODE_KEY = "dreamer:workspace-mode"
// Suffix bumped (v2) so pre-default snapshots are ignored and the new freeform
// default shows on next entry.
const FREEFORM_KEY = "dreamer:workspace-freeform-layout-v2"

type LayoutJSON = ReturnType<DockviewApi["toJSON"]>

function isWorkspaceMode(value: string | null): value is WorkspaceMode {
  return value === "build" || value === "debug" || value === "freeform"
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
 * Structured modes (build/debug) enforce their exact tab set, opening
 * their panels and closing everything else while keeping the size of any panel
 * shared with the previous mode. Re-selecting the active structured mode rebuilds
 * its default layout (a handy "reset this view" affordance).
 *
 * Freeform restores your last freeform arrangement if there is one; on the
 * first visit it builds a default "everything open" layout instead. Leaving
 * freeform snapshots it first, so the next visit comes back to the same place.
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
        buildFreeformDefault(api) // corrupt snapshot → fall back to the default
      }
    } else {
      buildFreeformDefault(api) // first visit → lay out every panel at once
    }
  } else {
    buildModeLayout(api, MODE_SPECS[target])
  }

  setStoredMode(target)
}
