import type { ComfyPipeline, ComfyPipelineStep, GenerationJob } from "@dreamer/schemas";
import { AlertTriangle, CheckCircle2, CircleDashed, Loader2, WandSparkles, X } from "lucide-react";
import { resolveMotionUrl } from "../api-client";

type GenerationResultPanelProps = {
  job: GenerationJob | null;
  resultVideoUrl?: string | null;
  originalVideoUrl?: string;
  retimedSegmentUrl?: string;
  rifeSegmentUrl?: string;
  motionPreviewUrl?: string;
  stitchedVideoUrl?: string;
  comfyPipeline?: ComfyPipeline;
  stitching?: boolean;
  preparingComfy?: boolean;
  onPrepareComfy?: () => void;
  onLoadStitched?: () => void;
  onCancelJob?: () => void;
};

export function GenerationResultPanel({
  job,
  resultVideoUrl,
  originalVideoUrl,
  retimedSegmentUrl,
  rifeSegmentUrl,
  motionPreviewUrl,
  stitchedVideoUrl,
  comfyPipeline,
  stitching,
  preparingComfy,
  onPrepareComfy,
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
      <ComfyPipelineStatus
        pipeline={comfyPipeline}
        preparing={preparingComfy}
        previewUrl={motionPreviewUrl}
        onPrepare={onPrepareComfy}
      />
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
      {rifeSegmentUrl && (
        <div className="flex flex-col gap-1.5">
          <p className={labelClass}>Comfy transition insert</p>
          <video
            src={resolveMotionUrl(rifeSegmentUrl)}
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

const COMFY_STEPS: Array<{ key: keyof ComfyPipeline; label: string }> = [
  { key: "targetFrame", label: "Target frame" },
  { key: "subjectMask", label: "Mask" },
  { key: "motionPreview", label: "Preview" },
  { key: "controlGuidance", label: "Controls" },
  { key: "provider", label: "Provider" },
  { key: "transition", label: "Transition" },
  { key: "stitchBridge", label: "Bridge" },
];

function ComfyPipelineStatus({
  pipeline,
  preparing,
  previewUrl,
  onPrepare,
}: {
  pipeline?: ComfyPipeline;
  preparing?: boolean;
  previewUrl?: string;
  onPrepare?: () => void;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2.5">
      <div className="mb-2 flex items-center gap-2">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60">
          ComfyUI motion pipeline
        </p>
        <button
          type="button"
          disabled={preparing || !onPrepare}
          onClick={onPrepare}
          className="ml-auto inline-flex h-6 items-center gap-1 rounded border border-white/10 px-2 text-[10px] text-muted-foreground hover:bg-white/10 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
        >
          {preparing ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <WandSparkles className="size-3" />
          )}
          Prep
        </button>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {COMFY_STEPS.map((item) => (
          <ComfyStepBadge
            key={item.key}
            label={item.label}
            step={pipeline?.[item.key]}
          />
        ))}
      </div>
      {previewUrl ? (
        <div className="mt-2 flex flex-col gap-1.5">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground/50">
            Cheap preview
          </p>
          <video
            src={resolveMotionUrl(previewUrl)}
            controls
            className="aspect-video w-full overflow-hidden rounded-md bg-black/60"
          />
        </div>
      ) : null}
    </div>
  );
}

function ComfyStepBadge({ label, step }: { label: string; step?: ComfyPipelineStep }) {
  const status = step?.status ?? "idle";
  const icon =
    status === "running" ? (
      <Loader2 className="size-3 animate-spin text-muted-foreground" />
    ) : status === "succeeded" ? (
      <CheckCircle2 className="size-3 text-emerald-400" />
    ) : status === "failed" ? (
      <AlertTriangle className="size-3 text-destructive" />
    ) : (
      <CircleDashed className="size-3 text-muted-foreground/50" />
    );

  const tone =
    status === "succeeded"
      ? "text-emerald-300"
      : status === "failed"
        ? "text-destructive"
        : "text-muted-foreground";

  return (
    <div
      className="flex min-w-0 items-center gap-1 rounded border border-white/10 bg-black/20 px-1.5 py-1"
      title={step?.message ?? `${label}: ${status}`}
    >
      {icon}
      <span className={`truncate text-[10px] ${tone}`}>{label}</span>
    </div>
  );
}
