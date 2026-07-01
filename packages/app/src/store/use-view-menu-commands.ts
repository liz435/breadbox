import { useEffect } from "react";
import type { DockviewApi } from "dockview-react";
import { showPanel, cycleView } from "@/store/view-panels";

/**
 * Window event dispatched by the native macOS menu (via the Tauri shell's
 * `window.eval`) to drive view switching. In a plain browser this event never
 * fires, so the bridge is a no-op there — no desktop detection needed.
 */
const MENU_COMMAND_EVENT = "dreamer:menu-command";

type MenuCommandDetail = { action: string };

/**
 * Listen for native-menu view commands and route them to the Dockview API:
 *   - "next-tab" / "prev-tab" cycle through open panels
 *   - "show:<panelId>" focuses (or creates) a specific view
 */
export function useViewMenuCommands(api: DockviewApi | null): void {
  useEffect(() => {
    function handle(event: Event) {
      const detail = (event as CustomEvent<MenuCommandDetail>).detail;
      if (!detail) return;
      const { action } = detail;
      if (action === "next-tab") {
        cycleView(api, 1);
      } else if (action === "prev-tab") {
        cycleView(api, -1);
      } else if (action.startsWith("show:")) {
        showPanel(api, action.slice("show:".length));
      }
    }
    window.addEventListener(MENU_COMMAND_EVENT, handle);
    return () => window.removeEventListener(MENU_COMMAND_EVENT, handle);
  }, [api]);
}
