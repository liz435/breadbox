import type { GraphNode } from "@dreamer/schemas";

type MaterialContentProps = {
  node: GraphNode;
};

export function MaterialContent({ node }: MaterialContentProps) {
  const blend =
    typeof node.data.blend === "string" ? node.data.blend : "normal";

  return (
    <div className="px-2 py-1">
      <div className="h-8 bg-neutral-950 rounded border border-neutral-700 flex items-center justify-center">
        <div className="flex gap-1">
          <div className="w-4 h-4 rounded bg-gradient-to-br from-teal-400 to-teal-700" />
          <div className="w-4 h-4 rounded bg-gradient-to-br from-neutral-400 to-neutral-600" />
          <div className="w-4 h-4 rounded bg-gradient-to-br from-violet-400 to-violet-700" />
        </div>
      </div>
      <div className="text-[9px] text-neutral-500 mt-1">
        Blend: {blend}
      </div>
    </div>
  );
}
