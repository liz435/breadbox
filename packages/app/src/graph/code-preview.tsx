import { useState, useMemo, useCallback } from "react";
import { useGraph } from "@/store/graph-context";
import { generateArduinoCode } from "./arduino-codegen";

export function CodePreview() {
  const [isOpen, setIsOpen] = useState(false);
  const { state } = useGraph();

  const code = useMemo(
    () => generateArduinoCode(state.nodes, state.edges),
    [state.nodes, state.edges],
  );

  const toggleOpen = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  return (
    <div className="absolute bottom-10 left-2 z-20">
      <button
        type="button"
        onClick={toggleOpen}
        className="rounded bg-secondary px-2 py-1 text-[10px] font-medium text-foreground hover:bg-muted border border-border"
      >
        {isOpen ? "Hide Code" : "Show Code"}
      </button>

      {isOpen && (
        <div className="mt-1 w-[360px] max-h-[300px] overflow-auto rounded border border-border bg-card p-3 shadow-lg">
          <pre className="text-[11px] leading-relaxed text-foreground font-mono whitespace-pre-wrap">
            {code}
          </pre>
        </div>
      )}
    </div>
  );
}
