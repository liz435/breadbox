import { useEffect, useState } from "react";
import type { DockviewApi } from "dockview-react";

/**
 * Track the id of Dockview's currently-active panel. Subscribes to
 * `onDidActivePanelChange` (a legitimate side effect — not derived state) and
 * re-syncs whenever the API instance changes, so the tab strip highlights the
 * right view as panels are focused via clicks, the command palette, or drags.
 */
export function useActivePanelId(api: DockviewApi | null): string | undefined {
  const [activeId, setActiveId] = useState<string | undefined>(
    () => api?.activePanel?.id,
  );

  useEffect(() => {
    if (!api) {
      setActiveId(undefined);
      return;
    }
    setActiveId(api.activePanel?.id);
    const disposable = api.onDidActivePanelChange((panel) =>
      setActiveId(panel?.id),
    );
    return () => disposable.dispose();
  }, [api]);

  return activeId;
}
