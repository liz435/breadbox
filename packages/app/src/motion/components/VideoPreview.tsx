import { Film } from "lucide-react";
import { resolveMotionUrl } from "../api-client";

type VideoPreviewProps = {
  videoUrl?: string;
  onDurationChange?: (duration: number) => void;
};

export function VideoPreview({ videoUrl, onDurationChange }: VideoPreviewProps) {
  return (
    <section className="rounded-md border border-border bg-card p-3">
      <div className="mb-2 flex items-center gap-2">
        <Film className="size-3.5 text-muted-foreground" />
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Preview</h2>
      </div>
      {videoUrl ? (
        <video
          src={resolveMotionUrl(videoUrl)}
          controls
          className="aspect-video w-full rounded-md bg-black"
          onLoadedMetadata={(event) => {
            const duration = event.currentTarget.duration;
            if (Number.isFinite(duration)) onDurationChange?.(duration);
          }}
        />
      ) : (
        <div className="flex aspect-video w-full items-center justify-center rounded-md bg-background text-xs text-muted-foreground">
          Upload a video to start
        </div>
      )}
    </section>
  );
}
