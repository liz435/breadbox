import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import type { BodyKeypoint, BodyKeypointName, KeyframePose } from "@dreamer/schemas";
import { Copy, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { resolveMotionUrl } from "../api-client";

const skeletonEdges: Array<[BodyKeypointName, BodyKeypointName]> = [
  ["left_shoulder", "right_shoulder"],
  ["left_shoulder", "left_elbow"],
  ["left_elbow", "left_wrist"],
  ["right_shoulder", "right_elbow"],
  ["right_elbow", "right_wrist"],
  ["left_shoulder", "left_hip"],
  ["right_shoulder", "right_hip"],
  ["left_hip", "right_hip"],
  ["left_hip", "left_knee"],
  ["left_knee", "left_ankle"],
  ["right_hip", "right_knee"],
  ["right_knee", "right_ankle"],
];

const fallbackPose: Record<BodyKeypointName, { x: number; y: number }> = {
  nose: { x: 0.5, y: 0.18 },
  left_eye: { x: 0.47, y: 0.16 },
  right_eye: { x: 0.53, y: 0.16 },
  left_ear: { x: 0.43, y: 0.18 },
  right_ear: { x: 0.57, y: 0.18 },
  left_shoulder: { x: 0.39, y: 0.32 },
  right_shoulder: { x: 0.61, y: 0.32 },
  left_elbow: { x: 0.32, y: 0.48 },
  right_elbow: { x: 0.68, y: 0.48 },
  left_wrist: { x: 0.28, y: 0.64 },
  right_wrist: { x: 0.72, y: 0.64 },
  left_hip: { x: 0.43, y: 0.58 },
  right_hip: { x: 0.57, y: 0.58 },
  left_knee: { x: 0.39, y: 0.77 },
  right_knee: { x: 0.61, y: 0.77 },
  left_ankle: { x: 0.36, y: 0.93 },
  right_ankle: { x: 0.64, y: 0.93 },
};

type KeypointEditorProps = {
  keyframe: KeyframePose | null;
  previousKeyframe?: KeyframePose | null;
  disabled?: boolean;
  onChange: (keyframe: KeyframePose) => void;
  onCommit: (keyframe: KeyframePose, keypoints: BodyKeypoint[]) => void;
};

export function KeypointEditor({
  keyframe,
  previousKeyframe,
  disabled,
  onChange,
  onCommit,
}: KeypointEditorProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const latestKeypointsRef = useRef<BodyKeypoint[] | null>(null);
  const [dragging, setDragging] = useState<BodyKeypointName | null>(null);

  useEffect(() => {
    latestKeypointsRef.current = keyframe?.keypoints ?? null;
  }, [keyframe]);

  const pointsByName = useMemo(() => {
    const map = new Map<BodyKeypointName, BodyKeypoint>();
    keyframe?.keypoints.forEach((point) => map.set(point.name, point));
    return map;
  }, [keyframe]);

  if (!keyframe) {
    return (
      <section className="flex min-h-0 flex-1 items-center justify-center rounded-md border border-border bg-card text-sm text-muted-foreground">
        Select a segment keyframe to edit pose points
      </section>
    );
  }

  function eventToPoint(event: PointerEvent<SVGSVGElement>) {
    const bounds = svgRef.current?.getBoundingClientRect();
    if (!bounds) return null;
    return {
      x: clamp((event.clientX - bounds.left) / bounds.width),
      y: clamp((event.clientY - bounds.top) / bounds.height),
    };
  }

  function updatePoint(name: BodyKeypointName, event: PointerEvent<SVGSVGElement>) {
    if (!keyframe || disabled) return;
    const point = eventToPoint(event);
    if (!point) return;
    const updatedKeypoints = keyframe.keypoints.map((item) =>
      item.name === name ? { ...item, ...point } : item,
    );
    latestKeypointsRef.current = updatedKeypoints;
    onChange({ ...keyframe, keypoints: updatedKeypoints });
  }

  function finishDrag() {
    if (!keyframe || !dragging) return;
    setDragging(null);
    onCommit(keyframe, latestKeypointsRef.current ?? keyframe.keypoints);
  }

  function resetPose() {
    if (!keyframe || disabled) return;
    const keypoints = keyframe.keypoints.map((point) => ({
      ...point,
      ...fallbackPose[point.name],
    }));
    latestKeypointsRef.current = keypoints;
    const updated = { ...keyframe, keypoints };
    onChange(updated);
    onCommit(updated, keypoints);
  }

  function copyPreviousPose() {
    if (!keyframe || !previousKeyframe || disabled) return;
    const previous = new Map(previousKeyframe.keypoints.map((point) => [point.name, point]));
    const keypoints = keyframe.keypoints.map((point) => ({
      ...point,
      ...(previous.get(point.name) ?? point),
      name: point.name,
    }));
    latestKeypointsRef.current = keypoints;
    const updated = { ...keyframe, keypoints };
    onChange(updated);
    onCommit(updated, keypoints);
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col rounded-md border border-border bg-card p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pose Editor</h2>
          <p className="text-xs text-muted-foreground">
            {keyframe.label} frame at {keyframe.timeSeconds.toFixed(2)}s
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            size="icon-sm"
            variant="outline"
            disabled={disabled || !previousKeyframe}
            onClick={copyPreviousPose}
            title="Copy previous pose"
          >
            <Copy className="size-3.5" />
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant="outline"
            disabled={disabled}
            onClick={resetPose}
            title="Reset pose"
          >
            <RotateCcw className="size-3.5" />
          </Button>
        </div>
      </div>
      <div className="relative min-h-0 flex-1 overflow-hidden rounded-md border border-border bg-black">
        <img
          src={resolveMotionUrl(keyframe.imageUrl)}
          alt={`${keyframe.label} keyframe`}
          className="h-full w-full object-contain"
          draggable={false}
        />
        <svg
          ref={svgRef}
          viewBox="0 0 1 1"
          preserveAspectRatio="none"
          className="absolute inset-0 touch-none"
          onPointerMove={(event) => {
            if (dragging) updatePoint(dragging, event);
          }}
          onPointerUp={finishDrag}
          onPointerCancel={finishDrag}
        >
          {skeletonEdges.map(([from, to]) => {
            const a = pointsByName.get(from);
            const b = pointsByName.get(to);
            if (!a || !b || a.visible === false || b.visible === false) return null;
            return (
              <line
                key={`${from}-${to}`}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke="rgba(244,244,245,0.72)"
                strokeWidth={0.006}
                strokeLinecap="round"
              />
            );
          })}
          {keyframe.keypoints.map((point) => (
            <circle
              key={point.name}
              cx={point.x}
              cy={point.y}
              r={dragging === point.name ? 0.018 : 0.014}
              fill={point.name.includes("left") ? "#38bdf8" : point.name.includes("right") ? "#f97316" : "#fafafa"}
              stroke="#111"
              strokeWidth={0.004}
              className={disabled ? "cursor-not-allowed" : "cursor-grab"}
              onPointerDown={(event) => {
                if (disabled) return;
                event.preventDefault();
                setDragging(point.name);
                event.currentTarget.setPointerCapture(event.pointerId);
                updatePoint(point.name, event as unknown as PointerEvent<SVGSVGElement>);
              }}
            />
          ))}
        </svg>
      </div>
    </section>
  );
}

function clamp(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}
