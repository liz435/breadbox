import type { GraphNode } from "@dreamer/schemas";

type AudioContentProps = {
  node: GraphNode;
};

export function AudioContent({ node }: AudioContentProps) {
  const fileName =
    typeof node.data.fileName === "string" ? node.data.fileName : null;
  const volume =
    typeof node.data.volume === "number" ? node.data.volume : 1.0;
  const loop = node.data.loop === true;

  return (
    <div className="px-2 py-1">
      {fileName ? (
        <div className="text-[10px] text-neutral-300 truncate mb-1">
          {fileName}
        </div>
      ) : (
        <div className="text-[10px] text-neutral-500 italic mb-1">
          No audio file
        </div>
      )}
      <div className="h-6 bg-neutral-950 rounded border border-neutral-700 flex items-center px-1.5">
        {/* Simple waveform visualization placeholder */}
        <div className="flex items-center gap-px flex-1 h-4">
          {Array.from({ length: 24 }).map((_, i) => {
            const h = Math.sin(i * 0.5) * 0.5 + 0.5;
            return (
              <div
                key={i}
                className="flex-1 bg-pink-500 rounded-sm opacity-40"
                style={{ height: `${h * 100}%` }}
              />
            );
          })}
        </div>
      </div>
      <div className="flex justify-between mt-1 text-[9px] text-neutral-500">
        <span>Vol: {Math.round(volume * 100)}%</span>
        {loop && <span>Loop</span>}
      </div>
    </div>
  );
}
