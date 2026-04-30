import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { WheelEvent } from "react";
import type { FrameTransformEdit, KeyframePose, MotionSegment } from "@dreamer/schemas";
import { cn } from "@/lib/utils";
import { resolveMotionUrl } from "../api-client";

const RULER_H = 22;
const TRACK_H = 40;
const THUMB_H = 60;
const RETIME_H = 28;
const TOTAL_H = RULER_H + TRACK_H + THUMB_H + RETIME_H;

type FilmstripFrame = { time: number; dataUrl: string };
type TimelineSeekMode = "preview" | "commit";

function useFilmstrip(
  sourceVideoUrl: string | undefined,
  segment: MotionSegment | null,
): { frames: FilmstripFrame[]; failed: boolean } {
  const [frames, setFrames] = useState<FilmstripFrame[]>([]);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!sourceVideoUrl || !segment) {
      setFrames([]);
      setFailed(false);
      return;
    }

    let aborted = false;
    setFrames([]);
    setFailed(false);

    const duration = segment.endTimeSeconds - segment.startTimeSeconds;
    const count = Math.min(36, Math.max(12, Math.round(duration / 0.11)));
    const times = Array.from(
      { length: count },
      (_, i) => segment.startTimeSeconds + (i / (count - 1)) * duration,
    );

    const video = document.createElement("video");
    video.crossOrigin = "anonymous";
    video.muted = true;
    video.playsInline = true;

    const canvas = document.createElement("canvas");
    canvas.width = 96;
    canvas.height = 54;
    const ctx = canvas.getContext("2d");

    const collected: FilmstripFrame[] = [];
    let idx = 0;

    function seekNext() {
      if (aborted) return;
      if (idx >= times.length) {
        if (collected.length > 0) setFrames([...collected]);
        return;
      }
      video.currentTime = times[idx];
    }

    function onSeeked() {
      if (aborted || !ctx) return;
      try {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        collected.push({ time: times[idx], dataUrl: canvas.toDataURL("image/jpeg", 0.55) });
      } catch {
        // CORS taint — skip frame silently; filmstrip won't show
        setFailed(true);
      }
      idx++;
      seekNext();
    }

    function onMetadata() {
      if (!aborted) seekNext();
    }

    video.addEventListener("seeked", onSeeked);
    video.addEventListener("loadedmetadata", onMetadata);
    video.src = resolveMotionUrl(sourceVideoUrl) ?? sourceVideoUrl ?? "";

    return () => {
      aborted = true;
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("loadedmetadata", onMetadata);
      video.src = "";
    };
  }, [sourceVideoUrl, segment?.id]);

  return { frames, failed };
}

type TimelineStripProps = {
  segment: MotionSegment | null;
  keyframes: KeyframePose[];
  frameEdit: FrameTransformEdit | null;
  selectedKeyframeId: string | null;
  sourceVideoUrl?: string;
  maxRangeSeconds?: number;
  disabled?: boolean;
  busy?: boolean;
  /** Current video playback time — keeps the timeline playhead in sync while the video plays */
  externalCurrentTime?: number;
  onSelect: (keyframeId: string) => void;
  onExtractFrame: (timeSeconds: number, role: "source" | "target") => void;
  onRangeCommit?: (sourceTimeSeconds: number, targetTimeSeconds: number) => void;
  /** Called when the user scrubs the timeline playhead — seek the video to this time */
  onSeek?: (time: number, mode?: TimelineSeekMode) => void;
};

export function TimelineStrip({
  segment,
  keyframes,
  frameEdit,
  selectedKeyframeId,
  sourceVideoUrl,
  maxRangeSeconds,
  disabled,
  busy,
  externalCurrentTime,
  onSelect,
  onExtractFrame,
  onRangeCommit,
  onSeek,
}: TimelineStripProps) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);

  const [zoom, setZoom] = useState(1);
  const [localTime, setLocalTime] = useState(0);
  const [playheadDragging, setPlayheadDragging] = useState(false);
  const scrubTimeRef = useRef(0);
  const lastPreviewSeekMsRef = useRef(0);

  const [markerRole, setMarkerRole] = useState<"source" | "target" | null>(null);
  const [markerDragTime, setMarkerDragTime] = useState<number>(0);
  const markerRoleRef = useRef<"source" | "target" | null>(null);
  const markerDragTimeRef = useRef<number>(0);

  const [retimeTimes, setRetimeTimes] = useState<Map<string, number>>(new Map());
  const [retimeDragging, setRetimeDragging] = useState(false);
  const [retimeDragTime, setRetimeDragTime] = useState(0);
  const retimeDragTimeRef = useRef(0);

  const [pinnedTime, setPinnedTime] = useState<number | null>(null);

  const minTime = segment?.startTimeSeconds ?? 0;
  const maxTime = segment?.endTimeSeconds ?? 1;
  const totalDuration = Math.max(maxTime - minTime, 0.001);

  const [sTime, setSTime] = useState(minTime);
  const [tTime, setTTime] = useState(maxTime);
  const sTimeRef = useRef(minTime);
  const tTimeRef = useRef(maxTime);

  const { frames: filmstrip, failed: filmstripFailed } = useFilmstrip(sourceVideoUrl, segment);

  useEffect(() => {
    return () => {
      lastPreviewSeekMsRef.current = 0;
    };
  }, []);

  useEffect(() => {
    const initialS = segment?.startTimeSeconds ?? 0;
    const initialT = segment
      ? Math.min(
          segment.endTimeSeconds,
          initialS + Math.min(maxRangeSeconds ?? Infinity, segment.endTimeSeconds - initialS),
        )
      : 1;
    setLocalTime(segment?.startTimeSeconds ?? 0);
    setRange(initialS, initialT);
    setZoom(1);
    setRetimeTimes(new Map());
    setPinnedTime(null);
    if (outerRef.current) outerRef.current.scrollLeft = 0;
  }, [segment?.id, segment?.startTimeSeconds, segment?.endTimeSeconds, maxRangeSeconds]);

  // Sync S/T positions when frameEdit changes externally
  useEffect(() => {
    if (!frameEdit) return;
    const src = keyframes.find((f) => f.id === frameEdit.sourceFrameId);
    const tgt = keyframes.find((f) => f.id === frameEdit.targetFrameId);
    if (src && tgt) setRange(src.timeSeconds, tgt.timeSeconds);
    else if (src) setRange(src.timeSeconds, tTimeRef.current);
    else if (tgt) setRange(sTimeRef.current, tgt.timeSeconds);
  }, [frameEdit?.sourceFrameId, frameEdit?.targetFrameId]);

  const displayTime = playheadDragging ? localTime : (externalCurrentTime ?? localTime);

  const timeToPercent = useCallback(
    (t: number) => ((t - minTime) / totalDuration) * 100,
    [minTime, totalDuration],
  );

  const clientXToTime = useCallback(
    (clientX: number) => {
      const inner = innerRef.current;
      if (!inner) return minTime;
      const bounds = inner.getBoundingClientRect();
      const ratio = (clientX - bounds.left) / inner.clientWidth;
      return Math.max(minTime, Math.min(maxTime, minTime + ratio * totalDuration));
    },
    [minTime, maxTime, totalDuration],
  );

  const ticks = useMemo(() => {
    const visibleDuration = totalDuration / zoom;
    const raw = visibleDuration / 7;
    const steps = [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 30, 60];
    const interval = steps.find((s) => s >= raw) ?? 60;
    const result: number[] = [];
    const first = Math.ceil(minTime / interval) * interval;
    for (let t = first; t <= maxTime + 0.0001; t += interval) {
      result.push(Math.round(t * 10000) / 10000);
    }
    return result;
  }, [totalDuration, zoom, minTime, maxTime]);

  function handleWheel(e: WheelEvent<HTMLDivElement>) {
    e.preventDefault();
    const outer = outerRef.current;
    if (!outer || !segment) return;
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    const newZoom = Math.max(1, Math.min(20, zoom * factor));
    const bounds = outer.getBoundingClientRect();
    const mouseX = e.clientX - bounds.left;
    const oldWidth = outer.clientWidth * zoom;
    const mouseRatio = (outer.scrollLeft + mouseX) / oldWidth;
    const newWidth = outer.clientWidth * newZoom;
    setZoom(newZoom);
    requestAnimationFrame(() => {
      if (outer) outer.scrollLeft = Math.max(0, mouseRatio * newWidth - mouseX);
    });
  }

  function handleTrackPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (disabled || !segment) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setPlayheadDragging(true);
    scheduleScrub(clientXToTime(e.clientX));
  }

  function handleTrackPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!playheadDragging) return;
    scheduleScrub(clientXToTime(e.clientX));
  }

  function handleTrackPointerUp() {
    commitScrub();
    setPlayheadDragging(false);
  }

  const selectedKf = selectedKeyframeId
    ? keyframes.find((f) => f.id === selectedKeyframeId)
    : undefined;

  const committedRetimeTime = selectedKf
    ? (retimeTimes.get(selectedKf.id) ?? selectedKf.timeSeconds)
    : undefined;

  const retimeDisplayTime = retimeDragging ? retimeDragTime : committedRetimeTime;

  function handleRetimePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (disabled || !selectedKf) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const t = clientXToTime(e.clientX);
    setRetimeDragging(true);
    setRetimeDragTime(t);
    retimeDragTimeRef.current = t;
  }

  function handleRetimePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!retimeDragging) return;
    const t = clientXToTime(e.clientX);
    setRetimeDragTime(t);
    retimeDragTimeRef.current = t;
  }

  function handleRetimePointerUp() {
    if (!retimeDragging || !selectedKf) return;
    setRetimeDragging(false);
    const committed = retimeDragTimeRef.current;
    setRetimeTimes((prev) => new Map(prev).set(selectedKf.id, committed));
    onExtractFrame(committed, "target");
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (disabled || !segment) return;
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const frameStep = 1 / 30;
    const current = externalCurrentTime ?? localTime;
    const next =
      e.key === "ArrowLeft"
        ? Math.max(minTime, current - frameStep)
        : Math.min(maxTime, current + frameStep);
    setLocalTime(next);
    onSeek?.(next, "commit");
  }

  const controlsDisabled = disabled || busy || !segment;
  const playheadLeft = `${timeToPercent(displayTime)}%`;

  const maxSelectableRange = Math.min(maxRangeSeconds ?? totalDuration, totalDuration);
  const minSelectableRange = Math.min(0.05, totalDuration);

  function scheduleScrub(time: number) {
    scrubTimeRef.current = time;
    setLocalTime(time);
    const nowMs = performance.now();
    if (nowMs - lastPreviewSeekMsRef.current < 140) return;
    lastPreviewSeekMsRef.current = nowMs;
    onSeek?.(time, "preview");
  }

  function commitScrub() {
    lastPreviewSeekMsRef.current = 0;
    setLocalTime(scrubTimeRef.current);
    onSeek?.(scrubTimeRef.current, "commit");
  }

  function clampTime(time: number, min: number, max: number) {
    return Math.max(min, Math.min(max, time));
  }

  function setRange(sourceTime: number, targetTime: number) {
    const source = clampTime(sourceTime, minTime, maxTime);
    const earliestTarget = Math.min(maxTime, source + minSelectableRange);
    const latestTarget = Math.min(maxTime, source + maxSelectableRange);
    const target = clampTime(targetTime, earliestTarget, Math.max(earliestTarget, latestTarget));
    setSTime(source);
    setTTime(target);
    sTimeRef.current = source;
    tTimeRef.current = target;
  }

  function setConstrainedMarkerTime(role: "source" | "target", time: number) {
    if (role === "source") {
      const currentTarget = tTimeRef.current;
      const lower = Math.max(minTime, currentTarget - maxSelectableRange);
      const upper = Math.max(lower, currentTarget - minSelectableRange);
      const nextSource = clampTime(time, lower, upper);
      setRange(nextSource, currentTarget);
      return;
    }
    const currentSource = sTimeRef.current;
    const lower = Math.min(maxTime, currentSource + minSelectableRange);
    const upper = Math.max(lower, Math.min(maxTime, currentSource + maxSelectableRange));
    const nextTarget = clampTime(time, lower, upper);
    setRange(currentSource, nextTarget);
  }

  if (!segment) {
    return (
      <div className="shrink-0">
        <div className="flex h-[150px] items-center justify-center text-[11px] text-muted-foreground/50">
          Upload a video to use the timeline
        </div>
      </div>
    );
  }

  return (
    <div
      className="shrink-0 outline-none focus-within:ring-1 focus-within:ring-ring/20"
      tabIndex={segment ? 0 : -1}
      onKeyDown={handleKeyDown}
    >
      <div className="mb-1.5 flex items-center justify-between px-0.5">
        <span className="text-[11px] uppercase tracking-widest text-muted-foreground/60">
          Timeline
        </span>
        <span className="font-mono text-[11px] tabular-nums text-muted-foreground/70">
          {displayTime.toFixed(2)}s
        </span>
      </div>

      <div
        ref={outerRef}
        className="relative overflow-hidden overflow-x-auto rounded-sm"
        style={{ height: TOTAL_H }}
        onWheel={handleWheel}
      >
        <div
          ref={innerRef}
          className="relative"
          style={{ width: `${zoom * 100}%`, height: TOTAL_H, minWidth: "100%" }}
        >
          {/* Ruler */}
          <div
            className="absolute left-0 right-0 top-0 select-none bg-black/40"
            style={{ height: RULER_H }}
          >
            {ticks.map((t) => (
              <div
                key={t}
                className="absolute top-0 flex flex-col items-center"
                style={{ left: `${timeToPercent(t)}%`, transform: "translateX(-50%)" }}
              >
                <div className="h-2.5 w-px bg-border" />
                <span className="mt-0.5 font-mono text-[9px] text-muted-foreground">
                  {t.toFixed(2)}s
                </span>
              </div>
            ))}
          </div>

          {/* Track */}
          <div
            className={cn(
              "absolute left-0 right-0 border-y border-border/40 bg-black/20",
              !disabled && segment ? "cursor-col-resize" : "",
            )}
            style={{ top: RULER_H, height: TRACK_H }}
            onPointerDown={handleTrackPointerDown}
            onPointerMove={handleTrackPointerMove}
            onPointerUp={handleTrackPointerUp}
            onPointerCancel={handleTrackPointerUp}
          >
            {keyframes.map((frame) => {
              const isSelected = selectedKeyframeId === frame.id;
              return (
                <button
                  key={frame.id}
                  type="button"
                  className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 focus:outline-none"
                  style={{ left: `${timeToPercent(frame.timeSeconds)}%` }}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => onSelect(frame.id)}
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" className="overflow-visible">
                    <polygon
                      points="6,1 11,6 6,11 1,6"
                      fill={isSelected ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground))"}
                      stroke={isSelected ? "hsl(var(--foreground))" : "hsl(var(--border))"}
                      strokeWidth="1"
                    />
                  </svg>
                </button>
              );
            })}

            {/* S–T range bar — drag to slide both handles together */}
            {!controlsDisabled && (() => {
              const left = timeToPercent(Math.min(sTime, tTime));
              const right = timeToPercent(Math.max(sTime, tTime));
              const width = right - left;
              return (
                <div
                  className="absolute top-1/2 -translate-y-1/2 cursor-grab rounded-sm bg-white/10 hover:bg-white/15 active:cursor-grabbing"
                  style={{ left: `${left}%`, width: `${width}%`, height: TRACK_H - 10 }}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    e.currentTarget.setPointerCapture(e.pointerId);
                    const startX = e.clientX;
                    const startS = sTime;
                    const startT = tTime;
                    const duration = Math.min(startT - startS, maxSelectableRange);
                    const inner = innerRef.current;
                    if (!inner) return;
                    const pxPerSec = inner.clientWidth / totalDuration;

                    function onMove(ev: PointerEvent) {
                      const deltaSec = (ev.clientX - startX) / pxPerSec;
                      const newS = Math.max(minTime, Math.min(maxTime - duration, startS + deltaSec));
                      const newT = newS + duration;
                      setRange(newS, newT);
                    }
                    function onUp() {
                      onRangeCommit?.(sTimeRef.current, tTimeRef.current);
                      e.currentTarget.removeEventListener("pointermove", onMove);
                      e.currentTarget.removeEventListener("pointerup", onUp);
                    }
                    e.currentTarget.addEventListener("pointermove", onMove);
                    e.currentTarget.addEventListener("pointerup", onUp);
                  }}
                />
              );
            })()}

            {(["source", "target"] as const).map((role) => (
              <MarkerHandle
                key={role}
                role={role}
                time={role === "source" ? sTime : tTime}
                activeRole={markerRole}
                activeTime={markerDragTime}
                timeToPercent={timeToPercent}
                trackHeight={TRACK_H}
                onDragStart={(r, t) => {
                  setMarkerRole(r);
                  setMarkerDragTime(t);
                  markerRoleRef.current = r;
                  markerDragTimeRef.current = t;
                }}
                onDragMove={(t) => {
                  setConstrainedMarkerTime(role, t);
                  const nextTime = role === "source" ? sTimeRef.current : tTimeRef.current;
                  setMarkerDragTime(nextTime);
                  markerDragTimeRef.current = nextTime;
                }}
                onDragEnd={() => {
                  if (markerRoleRef.current !== null) {
                    onRangeCommit?.(sTimeRef.current, tTimeRef.current);
                    if (!onRangeCommit) onExtractFrame(markerDragTimeRef.current, markerRoleRef.current);
                  }
                  setMarkerRole(null);
                  markerRoleRef.current = null;
                }}
                clientXToTime={clientXToTime}
                disabled={controlsDisabled}
              />
            ))}
          </div>

          {/* Thumbnail strip — filmstrip background + extracted keyframe overlays */}
          <div
            className="absolute left-0 right-0 overflow-hidden border-t border-border/40 bg-black/40"
            style={{ top: RULER_H + TRACK_H, height: THUMB_H }}
          >
            {filmstrip.length === 0 && filmstripFailed && (
              <div className="absolute inset-0 flex items-center justify-center text-[10px] text-muted-foreground/30">
                Frame preview unavailable
              </div>
            )}
            {/* Filmstrip: equidistant frames tiling the full width */}
            {filmstrip.length > 0 && (() => {
              const currentTime = externalCurrentTime ?? localTime;
              const activeIdx = filmstrip.reduce(
                (best, frame, i) =>
                  Math.abs(frame.time - currentTime) < Math.abs(filmstrip[best].time - currentTime)
                    ? i
                    : best,
                0,
              );
              return (
              <div className="absolute inset-0 flex">
                {filmstrip.map((frame, i) => {
                  const isActive = i === activeIdx;
                  return (
                    <button
                      key={frame.time}
                      type="button"
                      className={cn(
                        "relative min-w-0 flex-1 overflow-hidden border-r border-black/30 last:border-r-0",
                        "transition-[outline] outline-2 outline-offset-[-2px]",
                        isActive ? "outline outline-white/70" : "outline-transparent hover:outline-white/30",
                      )}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={() => {
                        setLocalTime(frame.time);
                        setPinnedTime(frame.time);
                      onSeek?.(frame.time, "commit");
                      }}
                    >
                      <img
                        src={frame.dataUrl}
                        alt={`${frame.time.toFixed(2)}s`}
                        className="h-full w-full object-cover"
                        draggable={false}
                      />
                      {i % 2 === 0 && (
                        <>
                          <div className="pointer-events-none absolute left-1/2 top-0.5 h-1.5 w-1 -translate-x-1/2 rounded-sm bg-black/50" />
                          <div className="pointer-events-none absolute bottom-0.5 left-1/2 h-1.5 w-1 -translate-x-1/2 rounded-sm bg-black/50" />
                        </>
                      )}
                    </button>
                  );
                })}
              </div>
              );
            })()}

          </div>

          {/* Retime lane */}
          <div
            className="absolute left-0 right-0 border-t border-border/20 bg-black/15"
            style={{ top: RULER_H + TRACK_H + THUMB_H, height: RETIME_H }}
          >
            {/* Pinned frame indicator */}
            {pinnedTime !== null && (
              <div
                className="pointer-events-none absolute top-0 flex flex-col items-center"
                style={{
                  left: `${timeToPercent(pinnedTime)}%`,
                  transform: "translateX(-50%)",
                  height: RETIME_H,
                }}
              >
                <div className="w-px flex-1 bg-amber-400/60" />
                <svg width="8" height="8" viewBox="0 0 8 8" className="shrink-0">
                  <polygon points="4,0 8,4 4,8 0,4" fill="rgb(251 191 36 / 0.85)" />
                </svg>
              </div>
            )}
            {selectedKf && retimeDisplayTime !== undefined && (
              <div
                className={cn(
                  "absolute top-1/2 z-10 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center",
                  disabled ? "cursor-not-allowed" : retimeDragging ? "cursor-grabbing" : "cursor-ew-resize",
                )}
                style={{ left: `${timeToPercent(retimeDisplayTime)}%`, width: 24, height: RETIME_H }}
                onPointerDown={handleRetimePointerDown}
                onPointerMove={handleRetimePointerMove}
                onPointerUp={handleRetimePointerUp}
                onPointerCancel={handleRetimePointerUp}
              >
                <svg width="10" height="10" viewBox="0 0 10 10">
                  <polygon
                    points="5,0 10,5 5,10 0,5"
                    fill={retimeDragging ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.7)"}
                    stroke="rgba(255,255,255,0.25)"
                    strokeWidth="0.5"
                  />
                </svg>
              </div>
            )}
          </div>

          {/* Connector: dashed line from selected keyframe to retime indicator */}
          {selectedKf && retimeDisplayTime !== undefined && (
            <svg
              className="pointer-events-none absolute left-0 top-0"
              style={{ width: "100%", height: TOTAL_H }}
              viewBox={`0 0 100 ${TOTAL_H}`}
              preserveAspectRatio="none"
            >
              <line
                x1={timeToPercent(selectedKf.timeSeconds)}
                y1={RULER_H + TRACK_H + THUMB_H}
                x2={timeToPercent(retimeDisplayTime)}
                y2={RULER_H + TRACK_H + THUMB_H + RETIME_H / 2}
                stroke="rgba(255,255,255,0.22)"
                strokeWidth="1"
                strokeDasharray="3 2"
                vectorEffect="non-scaling-stroke"
              />
              <circle
                cx={timeToPercent(selectedKf.timeSeconds)}
                cy={RULER_H + TRACK_H + THUMB_H}
                r="2"
                fill="rgba(255,255,255,0.35)"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
          )}

          {/* Playhead */}
          {/* Playhead — zero-width anchor so left edge == playheadLeft exactly */}
          <div
            className="pointer-events-none absolute top-0 z-20"
            style={{ left: playheadLeft, width: 0, height: TOTAL_H }}
          >
            {/* Draggable triangle head */}
            <div
              className={cn(
                "pointer-events-auto absolute",
                !disabled && segment ? "cursor-ew-resize" : "",
              )}
              style={{ top: 0, left: -8, width: 16, height: 16 }}
              onPointerDown={(e) => {
                if (disabled || !segment) return;
                e.stopPropagation();
                e.currentTarget.setPointerCapture(e.pointerId);
                setPlayheadDragging(true);
                scheduleScrub(clientXToTime(e.clientX));
              }}
              onPointerMove={(e) => {
                if (!playheadDragging) return;
                scheduleScrub(clientXToTime(e.clientX));
              }}
              onPointerUp={() => {
                commitScrub();
                setPlayheadDragging(false);
              }}
              onPointerCancel={() => {
                commitScrub();
                setPlayheadDragging(false);
              }}
            >
              <svg width="16" height="16" viewBox="0 0 16 16">
                <polygon points="0,0 16,0 8,14" fill="rgba(255,255,255,0.85)" />
              </svg>
            </div>
            {/* Vertical line — sits exactly at left:0 = playheadLeft */}
            <div
              className="absolute left-0 w-px bg-white/70"
              style={{ top: 14, height: TOTAL_H - 14 }}
            />
          </div>
        </div>
      </div>

      <div className="mt-2 flex items-center gap-2">
        <span className="inline-flex items-center gap-1 text-[10px] text-sky-400/70">
          <span className="inline-block h-2 w-2 rounded-sm bg-sky-400/70" />
          S drag to set source
        </span>
        <span className="inline-flex items-center gap-1 text-[10px] text-orange-400/70">
          <span className="inline-block h-2 w-2 rounded-sm bg-orange-400/70" />
          T drag to set target
        </span>
        {maxRangeSeconds ? (
          <span className="text-[10px] text-muted-foreground/45">
            max {maxRangeSeconds.toFixed(0)}s
          </span>
        ) : null}
        <span className="ml-auto text-[10px] text-muted-foreground/40">
          ←/→ frame · scroll to zoom
        </span>
      </div>
    </div>
  );
}

type MarkerHandleProps = {
  role: "source" | "target";
  time: number;
  activeRole: "source" | "target" | null;
  activeTime: number;
  timeToPercent: (t: number) => number;
  trackHeight: number;
  onDragStart: (role: "source" | "target", t: number) => void;
  onDragMove: (t: number) => void;
  onDragEnd: () => void;
  clientXToTime: (clientX: number) => number;
  disabled?: boolean;
};

function MarkerHandle({
  role,
  time,
  activeRole,
  activeTime,
  timeToPercent,
  trackHeight,
  onDragStart,
  onDragMove,
  onDragEnd,
  clientXToTime,
  disabled,
}: MarkerHandleProps) {
  const isDragging = activeRole === role;
  const displayTime = isDragging ? activeTime : time;
  const isSource = role === "source";
  const color = isSource ? "#38bdf8" : "#f97316";
  const label = isSource ? "S" : "T";

  return (
    <div
      className={cn(
        "absolute top-0 flex flex-col items-center",
        disabled ? "cursor-not-allowed" : isDragging ? "cursor-grabbing" : "cursor-ew-resize",
      )}
      style={{
        left: `${timeToPercent(displayTime)}%`,
        height: trackHeight,
        width: 20,
        transform: "translateX(-50%)",
        zIndex: 10,
      }}
      onPointerDown={(e) => {
        if (disabled) return;
        e.stopPropagation();
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        onDragStart(role, clientXToTime(e.clientX));
      }}
      onPointerMove={(e) => {
        if (!isDragging) return;
        onDragMove(clientXToTime(e.clientX));
      }}
      onPointerUp={() => {
        if (isDragging) onDragEnd();
      }}
      onPointerCancel={() => {
        if (isDragging) onDragEnd();
      }}
    >
      <div
        className="flex h-4 w-4 shrink-0 items-center justify-center rounded-sm text-[9px] font-bold text-white"
        style={{ backgroundColor: color }}
      >
        {label}
      </div>
      <div className="w-px flex-1" style={{ backgroundColor: color, opacity: 0.7 }} />
    </div>
  );
}
