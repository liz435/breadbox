import { useEffect, useMemo, useState } from "react";
import type { FrameTransformEdit, KeyframePose, MotionSegment } from "@dreamer/schemas";
import { Clock3, Crosshair } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { resolveMotionUrl } from "../api-client";

type KeyframeStripProps = {
  segment: MotionSegment | null;
  keyframes: KeyframePose[];
  frameEdit: FrameTransformEdit | null;
  selectedKeyframeId: string | null;
  disabled?: boolean;
  busy?: boolean;
  onSelect: (keyframeId: string) => void;
  onExtractFrame: (timeSeconds: number, role: "source" | "target") => void;
};

export function KeyframeStrip({
  segment,
  keyframes,
  frameEdit,
  selectedKeyframeId,
  disabled,
  busy,
  onSelect,
  onExtractFrame,
}: KeyframeStripProps) {
  const frameById = useMemo(() => new Map(keyframes.map((frame) => [frame.id, frame])), [keyframes]);
  const sourceFrame = frameEdit ? frameById.get(frameEdit.sourceFrameId) : undefined;
  const targetFrame = frameEdit ? frameById.get(frameEdit.targetFrameId) : undefined;
  const [sourceTime, setSourceTime] = useState("");
  const [targetTime, setTargetTime] = useState("");

  useEffect(() => {
    if (sourceFrame) setSourceTime(sourceFrame.timeSeconds.toFixed(2));
  }, [sourceFrame]);

  useEffect(() => {
    if (targetFrame) setTargetTime(targetFrame.timeSeconds.toFixed(2));
  }, [targetFrame]);

  const minTime = segment?.startTimeSeconds ?? 0;
  const maxTime = segment?.endTimeSeconds;
  const sourceNumber = Number(sourceTime);
  const targetNumber = Number(targetTime);
  const sourceInvalid = !isValidFrameTime(sourceNumber, minTime, maxTime);
  const targetInvalid = !isValidFrameTime(targetNumber, minTime, maxTime);
  const controlsDisabled = disabled || busy || !segment;

  return (
    <section className="shrink-0 rounded-md border border-border bg-card p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Crosshair className="size-3.5 text-muted-foreground" />
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Guidance Frames</h2>
        </div>
        <span className="text-xs text-muted-foreground">{keyframes.length} frames</span>
      </div>

      <div className="mb-3 grid grid-cols-1 gap-2 lg:grid-cols-2">
        <FrameTimeControl
          label="Source"
          value={sourceTime}
          minTime={minTime}
          maxTime={maxTime}
          disabled={controlsDisabled}
          invalid={sourceInvalid}
          onChange={setSourceTime}
          onExtract={() => onExtractFrame(sourceNumber, "source")}
        />
        <FrameTimeControl
          label="Target"
          value={targetTime}
          minTime={minTime}
          maxTime={maxTime}
          disabled={controlsDisabled}
          invalid={targetInvalid}
          onChange={setTargetTime}
          onExtract={() => onExtractFrame(targetNumber, "target")}
        />
      </div>

      {keyframes.length === 0 ? (
        <div className="flex h-20 items-center justify-center rounded-md bg-background text-xs text-muted-foreground">
          Create a segment to extract guidance frames
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-4">
          {keyframes.map((frame) => {
            const isSource = frameEdit?.sourceFrameId === frame.id;
            const isTarget = frameEdit?.targetFrameId === frame.id;
            return (
              <button
                key={frame.id}
                type="button"
                onClick={() => onSelect(frame.id)}
                className={cn(
                  "overflow-hidden rounded-md border bg-background text-left transition-colors",
                  selectedKeyframeId === frame.id ? "border-foreground" : "border-border hover:border-ring",
                )}
              >
                <div className="relative">
                  <img
                    src={resolveMotionUrl(frame.imageUrl)}
                    alt={`${frame.label} keyframe`}
                    className="aspect-video w-full object-cover"
                  />
                  <div className="absolute left-1 top-1 flex gap-1">
                    {isSource && <FrameBadge tone="source" label="S" />}
                    {isTarget && <FrameBadge tone="target" label="T" />}
                  </div>
                </div>
                <div className="flex items-center justify-between px-2 py-1 text-xs">
                  <span className="capitalize text-foreground">{frame.label}</span>
                  <span className="text-muted-foreground">{frame.timeSeconds.toFixed(2)}s</span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

function FrameTimeControl({
  label,
  value,
  minTime,
  maxTime,
  disabled,
  invalid,
  onChange,
  onExtract,
}: {
  label: string;
  value: string;
  minTime: number;
  maxTime: number | undefined;
  disabled?: boolean;
  invalid: boolean;
  onChange: (value: string) => void;
  onExtract: () => void;
}) {
  return (
    <label className="grid gap-1 text-xs text-muted-foreground">
      {label} frame time
      <div className="flex gap-2">
        <Input
          type="number"
          min={minTime}
          max={maxTime}
          step={0.01}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled || invalid}
          onClick={onExtract}
        >
          <Clock3 className="size-3.5" />
          Set
        </Button>
      </div>
      {maxTime !== undefined && (
        <span className={cn("text-[11px]", invalid ? "text-destructive" : "text-muted-foreground")}>
          {minTime.toFixed(2)}s to {maxTime.toFixed(2)}s
        </span>
      )}
    </label>
  );
}

function FrameBadge({ tone, label }: { tone: "source" | "target"; label: string }) {
  return (
    <span
      className={cn(
        "rounded-sm px-1.5 py-0.5 text-[10px] font-semibold text-white",
        tone === "source" ? "bg-sky-500" : "bg-orange-500",
      )}
    >
      {label}
    </span>
  );
}

function isValidFrameTime(value: number, minTime: number, maxTime: number | undefined): boolean {
  return Number.isFinite(value) && value >= minTime && (maxTime === undefined || value <= maxTime);
}
