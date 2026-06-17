// ── View panel registry ─────────────────────────────────────────────────
//
// Single source of truth for the project's view panels. Drives two things
// that must stay in sync:
//   1. the Cmd+K command palette "Panels" commands (command-palette.tsx)
//   2. the native macOS View menu (packages/desktop/src-tauri/src/lib.rs)
//
// IMPORTANT: the order of VIEW_PANELS is the ordering authority for the
// Next/Previous-tab cycle and the Cmd+1..9 accelerators in the native menu.
// If you reorder these, mirror the change in lib.rs's View submenu (it maps
// the first 9 entries to Cmd+1..Cmd+9 in this same order).

import type { DockviewApi } from "dockview-react";

export type ViewPanelDirection =
  | "right"
  | "left"
  | "above"
  | "below"
  | "within";

export type ViewPanel = {
  /** Dockview panel id. */
  id: string;
  /** Label shown in the tab strip, command palette, and native menu. */
  label: string;
  /** Dockview component key; defaults to `id` when omitted. */
  component?: string;
  /** Position used by addPanel when the panel isn't in the current layout. */
  defaultPosition?: { referencePanel: string; direction: ViewPanelDirection };
  /** Set false to keep a view out of the top tab strip (palette-only). */
  inTabStrip?: boolean;
};

// `defaultPosition` mirrors the default layout built in app.tsx's onReady, so a
// view that was closed reopens in its original spot. `within` re-adds a view as
// a tab in its original group (e.g. Libraries lives with Sketch; Diagram lives
// with Inspector). Schematic and Inspector share the right column (Schematic on
// top, Inspector below). When the referenced panel is itself closed, showPanel
// falls back to letting Dockview place the panel (see below).
export const VIEW_PANELS: ViewPanel[] = [
  { id: "breadboard", label: "Breadboard" },
  {
    id: "sketchEditor",
    label: "Sketch",
    defaultPosition: { referencePanel: "breadboard", direction: "right" },
  },
  {
    id: "schematic",
    label: "Schematic",
    defaultPosition: { referencePanel: "inspector", direction: "above" },
  },
  {
    id: "inspector",
    label: "Inspector",
    defaultPosition: { referencePanel: "schematic", direction: "below" },
  },
  {
    id: "serialMonitor",
    label: "Serial Monitor",
    defaultPosition: { referencePanel: "breadboard", direction: "below" },
  },
  {
    id: "pinInspector",
    label: "Pin Inspector",
    defaultPosition: { referencePanel: "inspector", direction: "below" },
  },
  {
    id: "projectFiles",
    label: "Project Files",
    defaultPosition: { referencePanel: "breadboard", direction: "left" },
  },
  {
    id: "libraryManager",
    label: "Libraries",
    defaultPosition: { referencePanel: "sketchEditor", direction: "within" },
  },
  {
    id: "diagram",
    label: "Diagram",
    defaultPosition: { referencePanel: "inspector", direction: "within" },
  },
  {
    id: "oledDisplay",
    label: "OLED Display",
    defaultPosition: { referencePanel: "breadboard", direction: "right" },
  },
  {
    id: "debugger",
    label: "Debugger",
    defaultPosition: { referencePanel: "sketchEditor", direction: "below" },
  },
  // Palette-only: no registered Dockview component, so keep it out of the
  // strip and menu (addPanel would mount an empty panel).
  { id: "electricalReport", label: "Electrical Report", inTabStrip: false },
];

/**
 * Bring a view to the front of its group, or — if it's been closed — recreate
 * it in its original spot (via `defaultPosition`). If the panel is a background
 * tab, `setActive()` raises it. When the original group's reference panel is
 * also closed, we drop the position and let Dockview place it rather than
 * throwing on a dangling reference.
 */
export function showPanel(api: DockviewApi | null, id: string): void {
  if (!api) return;
  const existing = api.getPanel(id);
  if (existing) {
    existing.api.setActive();
    return;
  }
  const panel = VIEW_PANELS.find((v) => v.id === id);
  const position =
    panel?.defaultPosition && api.getPanel(panel.defaultPosition.referencePanel)
      ? panel.defaultPosition
      : undefined;
  api.addPanel({
    id,
    component: panel?.component ?? id,
    title: panel?.label ?? id,
    position,
  });
}

/**
 * Cycle the active panel to the next/previous view. Only iterates panels that
 * are currently open in the layout (ordered by VIEW_PANELS), wrapping around —
 * so it behaves like real tab cycling and never spawns hidden views.
 */
export function cycleView(api: DockviewApi | null, dir: 1 | -1): void {
  if (!api) return;
  const open = VIEW_PANELS.map((v) => v.id).filter(
    (id) => api.getPanel(id) !== undefined,
  );
  if (open.length === 0) return;
  const activeId = api.activePanel?.id;
  const current = activeId ? open.indexOf(activeId) : -1;
  const start = current === -1 ? 0 : current;
  const next = (start + dir + open.length) % open.length;
  showPanel(api, open[next]);
}
