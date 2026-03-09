import type { GraphNode } from "@dreamer/schemas";

type ComposerContentProps = {
  node: GraphNode;
};

export function ComposerContent({ node: _node }: ComposerContentProps) {
  return (
    <div className="px-3 py-2 text-[10px] text-neutral-400">
      <span>Scene Composer</span>
    </div>
  );
}
