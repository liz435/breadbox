import type { GraphNode } from "@dreamer/schemas";

type GroupContentProps = {
  node: GraphNode;
};

export function GroupContent({ node }: GroupContentProps) {
  const childIds = Array.isArray(node.data.childNodeIds)
    ? (node.data.childNodeIds as string[])
    : [];

  return (
    <div className="px-2 py-1">
      <div className="text-[10px] text-neutral-500">
        {childIds.length === 0
          ? "Empty group"
          : `${childIds.length} node${childIds.length === 1 ? "" : "s"}`}
      </div>
    </div>
  );
}
