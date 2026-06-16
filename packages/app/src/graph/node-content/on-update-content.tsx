import type { GraphNode } from "@dreamer/schemas";

type OnUpdateContentProps = {
  node: GraphNode;
};

export function OnUpdateContent({ node: _node }: OnUpdateContentProps) {
  return (
    <div className="px-2 py-1">
      <div className="text-[10px] text-muted-foreground">
        Fires every frame with delta time
      </div>
    </div>
  );
}
