// ── View Tab Strip ──────────────────────────────────────────────────────
//
// Horizontal tab bar across the top of the window for switching between the
// project's view panels. Clicking a tab brings the matching Dockview panel to
// the front of its group (or creates it), keeping the split layout intact.
// Mirrors the command palette and the native macOS View menu via the shared
// VIEW_PANELS registry.

import type { DockviewApi } from "dockview-react";
import { VIEW_PANELS, showPanel } from "@/store/view-panels";
import { useActivePanelId } from "@/store/use-active-panel-id";
import { cn } from "@/lib/utils";

type ViewTabStripProps = {
  api: DockviewApi | null;
};

export function ViewTabStrip({ api }: ViewTabStripProps) {
  const activeId = useActivePanelId(api);
  const tabs = VIEW_PANELS.filter((v) => v.inTabStrip !== false);

  return (
    <div
      role="tablist"
      aria-label="Views"
      className="flex h-9 shrink-0 items-stretch gap-1 overflow-x-auto border-b border-neutral-800 bg-neutral-950 px-2"
    >
      {tabs.map((view) => {
        const active = view.id === activeId;
        return (
          <button
            key={view.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => showPanel(api, view.id)}
            className={cn(
              "-mb-px whitespace-nowrap border-b-2 px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
              active
                ? "border-blue-500 text-blue-300"
                : "border-transparent text-neutral-400 hover:text-neutral-200",
            )}
          >
            {view.label}
          </button>
        );
      })}
    </div>
  );
}
