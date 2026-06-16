import { useCallback } from "react";
import type { GraphNode } from "@dreamer/schemas";
import { MATH_OPERATIONS, type MathOperation } from "../node-factory";

type MathContentProps = {
  node: GraphNode;
  onDataChange?: (nodeId: string, patch: Record<string, unknown>) => void;
};

export function MathContent({ node, onDataChange }: MathContentProps) {
  const operation = (
    typeof node.data.operation === "string"
      ? node.data.operation
      : "add"
  ) as MathOperation;

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      onDataChange?.(node.id, { operation: e.target.value });
    },
    [node.id, onDataChange]
  );

  return (
    <div className="px-2 py-1">
      <select
        className="w-full bg-background text-[11px] text-foreground px-1.5 py-1 rounded border border-border outline-none focus:border-border"
        value={operation}
        onChange={handleChange}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {MATH_OPERATIONS.map((op) => (
          <option key={op.value} value={op.value}>
            {op.label}
          </option>
        ))}
      </select>
    </div>
  );
}
