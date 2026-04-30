import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

const CLIP_DURATION = 4;

type SegmentSelectorProps = {
  disabled?: boolean;
  busy?: boolean;
  durationSeconds?: number;
  onCreateSegment: (startTimeSeconds: number, endTimeSeconds: number) => void;
};

export function SegmentSelector({
  disabled,
  busy,
  durationSeconds,
  onCreateSegment,
}: SegmentSelectorProps) {
  const [start, setStart] = useState("0");

  useEffect(() => {
    if (!durationSeconds || durationSeconds <= 0) return;
    const maxStart = Math.max(0, durationSeconds - CLIP_DURATION);
    setStart((prev) => {
      const n = Number(prev);
      return Number.isFinite(n) && n <= maxStart ? prev : String(maxStart.toFixed(2));
    });
  }, [durationSeconds]);

  const startNumber = Number(start);
  const endNumber = startNumber + CLIP_DURATION;

  const invalid =
    !Number.isFinite(startNumber) ||
    startNumber < 0 ||
    (durationSeconds !== undefined && endNumber > durationSeconds);

  const inputClass =
    "h-7 w-20 rounded bg-white/5 px-2 text-xs tabular-nums text-foreground border-0 outline-none focus:ring-1 focus:ring-ring disabled:opacity-40";

  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] uppercase tracking-widest text-muted-foreground/60">
        Segment
      </span>
      <input
        type="number"
        min={0}
        step={0.01}
        value={start}
        disabled={disabled || busy}
        onChange={(event) => setStart(event.target.value)}
        aria-label="Segment start time in seconds"
        className={inputClass}
      />
      <span aria-hidden="true" className="text-xs text-muted-foreground/40">
        + 4s
      </span>
      {durationSeconds !== undefined && (
        <span className="text-[11px] text-muted-foreground/40">
          {durationSeconds.toFixed(1)}s total
        </span>
      )}
      <Button
        type="button"
        size="sm"
        className="ml-auto h-7 px-3 text-xs"
        disabled={disabled || busy || invalid}
        onClick={() => onCreateSegment(startNumber, endNumber)}
      >
        Create
      </Button>
    </div>
  );
}
