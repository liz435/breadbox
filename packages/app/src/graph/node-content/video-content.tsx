import type { GraphNode } from "@dreamer/schemas";

type VideoContentProps = {
  node: GraphNode;
};

export function VideoContent({ node }: VideoContentProps) {
  const fileName =
    typeof node.data.fileName === "string" ? node.data.fileName : null;
  const rate =
    typeof node.data.playbackRate === "number" ? node.data.playbackRate : 1.0;
  const loop = node.data.loop === true;

  return (
    <div className="px-2 py-1">
      {fileName ? (
        <div className="text-[10px] text-neutral-300 truncate mb-1">
          {fileName}
        </div>
      ) : (
        <div className="text-[10px] text-neutral-500 italic mb-1">
          No video file
        </div>
      )}
      <div className="h-12 bg-neutral-950 rounded border border-neutral-700 flex items-center justify-center">
        <svg
          className="w-6 h-6 text-neutral-600"
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <path d="M8 5v14l11-7z" />
        </svg>
      </div>
      <div className="flex justify-between mt-1 text-[9px] text-neutral-500">
        <span>{rate}x</span>
        {loop && <span>Loop</span>}
      </div>
    </div>
  );
}
