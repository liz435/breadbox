// ── AppProviders ───────────────────────────────────────────────────────
//
// Context stack shared by the main editor (/editor) and every
// <BreadboardEmbed> on /learn pages. Holds only XState actor contexts —
// no side effects, no project loading, no persistence.
//
// Each mount of <AppProviders> instantiates a fresh XState actor per
// context (BoardContext, SceneContext, GraphContext), so embeds are
// isolated from each other and from the main editor.

import type { ReactNode } from "react";
import { BoardContext } from "@/store/board-context";
import { SceneContext } from "@/store/scene-context";
import { GraphContext } from "@/store/graph-context";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <BoardContext.Provider>
      <SceneContext.Provider>
        <GraphContext.Provider>{children}</GraphContext.Provider>
      </SceneContext.Provider>
    </BoardContext.Provider>
  );
}
