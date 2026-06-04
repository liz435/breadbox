import { useEffect } from "react";
import type { DockviewApi } from "dockview-react";
import { VIEW_PANELS } from "@/store/view-panels";
import { emitToDesktop } from "@/lib/tauri";

/**
 * Tauri event carrying the JSON array of currently-open view panel ids. The
 * desktop shell (lib.rs) listens for it to keep the native View menu's
 * checkmarks in sync. Must match VIEW_STATE_EVENT in lib.rs.
 */
export const VIEW_STATE_EVENT = "dreamer-view-state";

/**
 * Report the set of currently-open view panels to the desktop shell whenever
 * the Dockview layout changes (panels added/removed), plus once on mount. The
 * emit is a no-op in a plain browser.
 */
export function useViewMenuSync(api: DockviewApi | null): void {
  useEffect(() => {
    if (!api) return;
    const push = () => {
      const open = VIEW_PANELS.filter((v) => v.inTabStrip !== false)
        .map((v) => v.id)
        .filter((id) => api.getPanel(id) !== undefined);
      emitToDesktop(VIEW_STATE_EVENT, open);
    };
    push();
    const disposable = api.onDidLayoutChange(push);
    return () => disposable.dispose();
  }, [api]);
}
