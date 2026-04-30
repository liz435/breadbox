import type { ReactNode } from "react";

type MotionEditorShellProps = {
  canvas: ReactNode;
  controls: ReactNode;
  sidebar: ReactNode;
  error?: ReactNode;
};

export function MotionEditorShell({ canvas, controls, sidebar, error }: MotionEditorShellProps) {
  return (
    <main className="flex h-full w-full flex-col overflow-hidden bg-background text-foreground">
      <header className="relative flex h-14 shrink-0 items-center justify-between border-b border-border/60 px-4">
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
        <h1 className="text-sm font-normal tracking-tight">Motion Editor</h1>
        <div className="text-[11px] uppercase tracking-widest text-muted-foreground/60">/motion</div>
      </header>
      {error}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="min-h-0 flex-1 overflow-hidden p-3">{canvas}</div>
          <div className="shrink-0 border-t border-border/60 px-3 py-2">{controls}</div>
        </div>
        <aside className="flex w-72 shrink-0 flex-col overflow-y-auto border-l border-border/60 bg-black/20 p-3">
          {sidebar}
        </aside>
      </div>
    </main>
  );
}
