import type { GraphNode } from "@dreamer/schemas";

type OnInputContentProps = {
  node: GraphNode;
};

export function OnInputContent({ node }: OnInputContentProps) {
  const keys = Array.isArray(node.data.listenKeys)
    ? (node.data.listenKeys as string[])
    : [];

  return (
    <div className="px-2 py-1">
      <div className="text-[10px] text-muted-foreground mb-1">
        Fires on key press
      </div>
      {keys.length > 0 && (
        <div className="flex flex-wrap gap-0.5">
          {keys.slice(0, 5).map((key) => (
            <span
              key={key}
              className="text-[9px] px-1 py-0.5 bg-card rounded border border-border text-foreground"
            >
              {key}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
