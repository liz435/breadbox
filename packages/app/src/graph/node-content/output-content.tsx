import type { GraphNode } from "@dreamer/schemas";

type OutputContentProps = {
  node: GraphNode;
};

export function OutputContent({ node }: OutputContentProps) {
  const resolution = node.data.resolution as
    | { width: number; height: number }
    | undefined;
  const bg = (node.data.background as string) ?? "#000000";

  return (
    <div className="px-3 py-2 text-[10px] text-neutral-400 space-y-1">
      <div className="flex items-center gap-1.5">
        <span
          className="w-3 h-3 rounded border border-neutral-600"
          style={{ backgroundColor: bg }}
        />
        <span>Render Output</span>
      </div>
      {resolution && (
        <div className="text-neutral-500">
          {resolution.width}&times;{resolution.height}
        </div>
      )}
    </div>
  );
}
