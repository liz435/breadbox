import type { GraphNode } from "@dreamer/schemas";

type SpriteContentProps = {
  node: GraphNode;
};

export function SpriteContent({ node }: SpriteContentProps) {
  const tint =
    typeof node.data.tint === "string" ? node.data.tint : "#4a9eff";
  const fileName =
    typeof node.data.fileName === "string" ? node.data.fileName : null;

  return (
    <div className="px-2 py-1 flex items-center gap-2">
      <div
        className="w-8 h-8 rounded border border-neutral-600 shrink-0"
        style={{ backgroundColor: tint }}
      />
      <div className="min-w-0 flex-1">
        {fileName && (
          <div className="text-[10px] text-neutral-400 truncate">
            {fileName}
          </div>
        )}
        <div className="text-[10px] text-neutral-500">
          {typeof node.data.width === "number" ? node.data.width : 64}
          &times;
          {typeof node.data.height === "number" ? node.data.height : 64}
        </div>
      </div>
    </div>
  );
}
