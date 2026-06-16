import { useCallback } from "react";
import type { GraphNode } from "@dreamer/schemas";

type TextContentProps = {
  node: GraphNode;
  onDataChange?: (nodeId: string, patch: Record<string, unknown>) => void;
};

export function TextContent({ node, onDataChange }: TextContentProps) {
  const content =
    typeof node.data.content === "string" ? node.data.content : "";

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      onDataChange?.(node.id, { content: e.target.value });
    },
    [node.id, onDataChange]
  );

  return (
    <div className="px-2 py-1">
      <textarea
        className="w-full bg-background text-[10px] text-orange-300 p-1.5 rounded border border-border resize-none outline-none focus:border-orange-500"
        rows={3}
        value={content}
        onChange={handleChange}
        placeholder="Enter text..."
        onMouseDown={(e) => e.stopPropagation()}
      />
    </div>
  );
}
