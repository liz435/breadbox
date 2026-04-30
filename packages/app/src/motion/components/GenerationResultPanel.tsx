import type { GenerationJob } from "@dreamer/schemas";
import { Loader2, X } from "lucide-react";
import { resolveMotionUrl } from "../api-client";

type GenerationResultPanelProps = {
  job: GenerationJob | null;
  resultVideoUrl?: string | null;
  originalVideoUrl?: string;
  retimedSegmentUrl?: string;
  stitchedVideoUrl?: string;
  stitching?: boolean;
  onLoadStitched?: () => void;
  onCancelJob?: () => void;
};

export function GenerationResultPanel({
  job,
  resultVideoUrl,
  originalVideoUrl,
  retimedSegmentUrl,
  stitchedVideoUrl,
  stitching,
  onLoadStitched,
  onCancelJob,
}: GenerationResultPanelProps) {
  const active = job?.status === "queued" || job?.status === "running";
  const labelClass =
    "text-[10px] uppercase tracking-wider text-muted-foreground/50";

  return (
    <div className="mt-3 flex flex-col gap-3 border-t border-border/40 pt-3">
      {active && (
        <div
          className="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2 text-xs text-muted-foreground"
          role="status"
          aria-live="polite"
        >
          <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
          <span className="flex-1">
            {job.provider === "veo"
              ? "Veo is generating the segment"
              : "Mock provider is preparing the segment"}
          </span>
          {onCancelJob && (
            <button
              type="button"
              onClick={onCancelJob}
              className="ml-1 flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-muted-foreground/60 hover:bg-white/10 hover:text-destructive"
              title="Cancel generation"
            >
              <X className="size-3" />
              Cancel
            </button>
          )}
        </div>
      )}
      {stitching && (
        <div
          className="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2 text-xs text-muted-foreground"
          role="status"
          aria-live="polite"
        >
          <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
          <span>Stitching generated clip into the original video</span>
        </div>
      )}
      {stitchedVideoUrl && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center">
            <p className={labelClass}>Stitched</p>
            <button
              type="button"
              onClick={onLoadStitched}
              className="ml-auto text-[10px] text-white/50 hover:text-white/80 underline underline-offset-2"
            >
              Load into player
            </button>
          </div>
          <video
            src={resolveMotionUrl(stitchedVideoUrl)}
            controls
            className="aspect-video w-full overflow-hidden rounded-lg bg-black/60"
          />
        </div>
      )}
      {retimedSegmentUrl && (
        <div className="flex flex-col gap-1.5">
          <p className={labelClass}>Retimed insert</p>
          <video
            src={resolveMotionUrl(retimedSegmentUrl)}
            controls
            className="aspect-video w-full overflow-hidden rounded-lg bg-black/60"
          />
        </div>
      )}
      {originalVideoUrl && (
        <div className="flex flex-col gap-1.5">
          <p className={labelClass}>Original segment</p>
          <video
            src={resolveMotionUrl(originalVideoUrl)}
            controls
            className="aspect-video w-full overflow-hidden rounded-lg bg-black/60"
          />
        </div>
      )}
      {resultVideoUrl ? (
        <div className="flex flex-col gap-1.5">
          <p className={labelClass}>Raw Veo output</p>
          <video
            src={resolveMotionUrl(resultVideoUrl)}
            controls
            className="aspect-video w-full overflow-hidden rounded-lg bg-black/60"
          />
        </div>
      ) : (
        <div className="flex aspect-video items-center justify-center rounded-lg bg-black/60 text-[11px] text-muted-foreground/50">
          Generated segment will appear here
        </div>
      )}
      {job?.status === "failed" && (
        <p
          role="alert"
          className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive/90"
        >
          {job.error ?? "Generation failed"}
        </p>
      )}
    </div>
  );
}
