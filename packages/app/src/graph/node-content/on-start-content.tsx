import type { GraphNode } from "@dreamer/schemas";

type OnStartContentProps = {
  node: GraphNode;
};

export function OnStartContent({ node: _node }: OnStartContentProps) {
  return (
    <div className="px-2 py-1">
      <div className="text-[10px] text-muted-foreground">
        Fires once when play mode starts
      </div>
    </div>
  );
}
