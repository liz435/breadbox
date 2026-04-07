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
        className="rounded bg-neutral-800 px-2 py-1 text-[10px] font-medium text-neutral-300 hover:bg-neutral-700 border border-neutral-700"
      >
        {isOpen ? "Hide Code" : "Show Code"}
      </button>

      {isOpen && (
        <div className="mt-1 w-[360px] max-h-[300px] overflow-auto rounded border border-neutral-700 bg-neutral-900 p-3 shadow-lg">
          <pre className="text-[11px] leading-relaxed text-neutral-300 font-mono whitespace-pre-wrap">
            {code}
          </pre>
        </div>
      )}
    </div>
  );
}
