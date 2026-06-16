import { useState, useCallback } from "react";
import type { GraphNode } from "@dreamer/schemas";

type SpriteContentProps = {
  node: GraphNode;
  onDataChange?: (nodeId: string, patch: Record<string, unknown>) => void;
};

export function SpriteContent({ node, onDataChange }: SpriteContentProps) {
  const tint =
    typeof node.data.tint === "string" ? node.data.tint : "#4a9eff";
  const uri = typeof node.data.uri === "string" ? node.data.uri : null;
  const fileName =
    typeof node.data.fileName === "string" ? node.data.fileName : null;
  const script = typeof node.data.script === "string" ? node.data.script : "";
  const hasScript = script.trim().length > 0;

  const [showEditor, setShowEditor] = useState(false);

  const handleScriptChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      onDataChange?.(node.id, { script: e.target.value });
    },
    [node.id, onDataChange]
  );

  const handleToggleEditor = useCallback(() => {
    setShowEditor((prev) => !prev);
  }, []);

  const handleAddScript = useCallback(() => {
    onDataChange?.(node.id, { script: "// Write your script here\n" });
    setShowEditor(true);
  }, [node.id, onDataChange]);

  return (
    <div className="px-2 py-1">
      {uri ? (
        <div className="rounded border border-border overflow-hidden bg-background flex items-center justify-center">
          <img
            src={uri}
            alt={fileName ?? "Sprite"}
            className="max-w-full max-h-20 object-contain"
            style={{ imageRendering: "pixelated" }}
            draggable={false}
          />
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <div
            className="w-8 h-8 rounded border border-border shrink-0"
            style={{ backgroundColor: tint }}
          />
          <div className="min-w-0 flex-1">
            {fileName && (
              <div className="text-[10px] text-muted-foreground truncate">
                {fileName}
              </div>
            )}
            <div className="text-[10px] text-muted-foreground">
              {typeof node.data.width === "number" ? node.data.width : 64}
              &times;
              {typeof node.data.height === "number" ? node.data.height : 64}
            </div>
          </div>
        </div>
      )}
      {uri && fileName && (
        <div className="text-[9px] text-muted-foreground mt-1 truncate">
          {fileName}
        </div>
      )}

      {/* Script section */}
      {hasScript ? (
        <div className="mt-1">
          <button
            type="button"
            className="text-[9px] text-emerald-400/70 flex items-center gap-1 hover:text-emerald-400 transition-colors"
            onClick={handleToggleEditor}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400/70" />
            Script ({script.split("\n").length} lines)
            <span className="text-muted-foreground ml-auto">
              {showEditor ? "▼" : "▶"}
            </span>
          </button>
          {showEditor && (
            <textarea
              className="w-full mt-1 bg-background text-[10px] text-emerald-400 font-mono p-1.5 rounded border border-border resize-none outline-none focus:border-emerald-500"
              rows={6}
              value={script}
              onChange={handleScriptChange}
              spellCheck={false}
              onMouseDown={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
            />
          )}
        </div>
      ) : (
        <button
          type="button"
          className="mt-1 text-[9px] text-muted-foreground hover:text-emerald-400/70 transition-colors flex items-center gap-1"
          onClick={handleAddScript}
          onMouseDown={(e) => e.stopPropagation()}
        >
          + Add script
        </button>
      )}
    </div>
  );
}
