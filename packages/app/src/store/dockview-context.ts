import { createContext, useContext, type RefObject } from "react";
import type { DockviewApi } from "dockview-react";

const DockviewCtx = createContext<RefObject<DockviewApi | null> | null>(null);

export const DockviewContext = DockviewCtx;

export function useDockviewApi(): DockviewApi | null {
  const ref = useContext(DockviewCtx);
  return ref?.current ?? null;
}
