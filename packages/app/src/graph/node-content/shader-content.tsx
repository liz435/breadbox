import { useCallback } from "react";
import type { GraphNode } from "@dreamer/schemas";

type ShaderContentProps = {
  node: GraphNode;
  onDataChange?: (nodeId: string, patch: Record<string, unknown>) => void;
};

export function ShaderContent({ node, onDataChange }: ShaderContentProps) {
  const code = typeof node.data.code === "string" ? node.data.code : "";
  const language =
    typeof node.data.language === "string" ? node.data.language : "glsl";
  const lines = code.split("\n");
  const preview = lines.slice(0, 5).join("\n");

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      onDataChange?.(node.id, { code: e.target.value });
    },
    [node.id, onDataChange]
  );

  return (
    <div className="px-2 py-1">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[9px] uppercase tracking-wider text-neutral-500">
          {language}
        </span>
        <span className="text-[9px] text-neutral-600">
          {lines.length} lines
        </span>
      </div>
      <textarea
        className="w-full bg-neutral-950 text-[10px] text-green-400 font-mono p-1.5 rounded border border-neutral-700 resize-none outline-none focus:border-violet-500"
        rows={4}
        value={code}
        onChange={handleChange}
        spellCheck={false}
        onMouseDown={(e) => e.stopPropagation()}
      />
    </div>
  );
}
