import { useMemo, useRef, useState, type PointerEvent, type ReactNode } from "react";
import type { FrameTransformEdit, KeyframePose, MotionSegment } from "@dreamer/schemas";
import { ImagePlus, Move, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { resolveMotionUrl } from "../api-client";

type DragMode = "source" | "target";

type FrameTransformEditorProps = {
  segment: MotionSegment | null;
  edit: FrameTransformEdit | null;
  sourceFrame: KeyframePose | null;
  targetFrame: KeyframePose | null;
  disabled?: boolean;
  onChange: (edit: FrameTransformEdit) => void;
  onRender: (edit: FrameTransformEdit) => void;
};

export function FrameTransformEditor({
  segment,
  edit,
  sourceFrame,
  targetFrame,
  disabled,
  onChange,
  onRender,
}: FrameTransformEditorProps) {
  const sourceSvgRef = useRef<SVGSVGElement | null>(null);
  const targetSvgRef = useRef<SVGSVGElement | null>(null);
  const [dragMode, setDragMode] = useState<DragMode | null>(null);
  const destination = useMemo(() => {
    if (!edit) return null;
    return {
      x: clamp(edit.subjectBox.x + edit.transform.translateX, -1, 1),
      y: clamp(edit.subjectBox.y + edit.transform.translateY, -1, 1),
      width: edit.subjectBox.width * edit.transform.scale,
      height: edit.subjectBox.height * edit.transform.scale,
    };
  }, [edit]);

  if (!segment || !edit || !sourceFrame || !targetFrame || !destination) {
    return (
      <section className="flex min-h-0 flex-1 items-center justify-center rounded-md border border-border bg-card text-sm text-muted-foreground">
        Create a segment to edit guidance frames
      </section>
    );
  }

  const activeEdit = edit;
  const activeDestination = destination;

  function pointFromEvent(event: PointerEvent<SVGElement>, svg: SVGSVGElement | null) {
    const bounds = svg?.getBoundingClientRect();
    if (!bounds) return null;
    return {
      x: (event.clientX - bounds.left) / bounds.width,
      y: (event.clientY - bounds.top) / bounds.height,
    };
  }

  function updateSourceFromPointer(event: PointerEvent<SVGElement>) {
    if (disabled) return;
    const point = pointFromEvent(event, sourceSvgRef.current);
    if (!point) return;
    const nextBox = {
      ...activeEdit.subjectBox,
      x: clamp(point.x - activeEdit.subjectBox.width / 2, 0, 1 - activeEdit.subjectBox.width),
      y: clamp(point.y - activeEdit.subjectBox.height / 2, 0, 1 - activeEdit.subjectBox.height),
    };
    onChange({ ...activeEdit, subjectBox: nextBox, renderedFrameUrl: undefined });
  }

  function updateTargetFromPointer(event: PointerEvent<SVGElement>) {
    if (disabled) return;
    const point = pointFromEvent(event, targetSvgRef.current);
    if (!point) return;
    const nextTransform = {
      ...activeEdit.transform,
      translateX: clamp(point.x - activeEdit.subjectBox.x - activeDestination.width / 2, -1, 1),
      translateY: clamp(point.y - activeEdit.subjectBox.y - activeDestination.height / 2, -1, 1),
    };
    onChange({ ...activeEdit, transform: nextTransform, renderedFrameUrl: undefined });
  }

  function updateScale(scale: number) {
    if (!Number.isFinite(scale)) return;
    onChange({
      ...activeEdit,
      transform: { ...activeEdit.transform, scale: clamp(scale, 0.2, 3) },
      renderedFrameUrl: undefined,
    });
  }

  function updateRotate(rotateDeg: number) {
    if (!Number.isFinite(rotateDeg)) return;
    onChange({
      ...activeEdit,
      transform: { ...activeEdit.transform, rotateDeg: clamp(rotateDeg, -180, 180) },
      renderedFrameUrl: undefined,
    });
  }

  function resetTransform() {
    onChange({
      ...activeEdit,
      transform: { translateX: 0, translateY: -0.12, scale: 1, rotateDeg: 0 },
      renderedFrameUrl: undefined,
    });
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col rounded-md border border-border bg-card p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Frame Transform</h2>
          <p className="text-xs text-muted-foreground">
            Blue selects the source region. Orange sets where that region should land.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            size="icon-sm"
            variant="outline"
            disabled={disabled}
            onClick={resetTransform}
            title="Reset endpoint transform"
          >
            <RotateCcw className="size-3.5" />
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={disabled}
            onClick={() => onRender(edit)}
          >
            <ImagePlus className="size-3.5" />
            Render Target
          </Button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_220px]">
        <div className="grid min-h-0 grid-cols-1 gap-3 lg:grid-cols-2">
          <FramePanel
            title={`Source ${sourceFrame.timeSeconds.toFixed(2)}s`}
            imageUrl={sourceFrame.imageUrl}
            imageAlt={`${sourceFrame.label} source frame`}
          >
            <svg
              ref={sourceSvgRef}
              viewBox="0 0 1 1"
              preserveAspectRatio="none"
              className="absolute inset-0 touch-none"
              onPointerMove={(event) => {
                if (dragMode === "source") updateSourceFromPointer(event);
              }}
              onPointerUp={() => setDragMode(null)}
              onPointerCancel={() => setDragMode(null)}
            >
              <rect
                x={edit.subjectBox.x}
                y={edit.subjectBox.y}
                width={edit.subjectBox.width}
                height={edit.subjectBox.height}
                fill="rgba(56, 189, 248, 0.18)"
                stroke="#38bdf8"
                strokeWidth={0.004}
                className={disabled ? "cursor-not-allowed" : "cursor-move"}
                onPointerDown={(event) => {
                  if (disabled) return;
                  event.preventDefault();
                  setDragMode("source");
                  event.currentTarget.setPointerCapture(event.pointerId);
                  updateSourceFromPointer(event);
                }}
              />
            </svg>
          </FramePanel>

          <FramePanel
            title={`Target ${targetFrame.timeSeconds.toFixed(2)}s`}
            imageUrl={targetFrame.imageUrl}
            imageAlt={`${targetFrame.label} target frame`}
          >
            <svg
              ref={targetSvgRef}
              viewBox="0 0 1 1"
              preserveAspectRatio="none"
              className="absolute inset-0 touch-none"
              onPointerMove={(event) => {
                if (dragMode === "target") updateTargetFromPointer(event);
              }}
              onPointerUp={() => setDragMode(null)}
              onPointerCancel={() => setDragMode(null)}
            >
              <rect
                x={destination.x}
                y={destination.y}
                width={destination.width}
                height={destination.height}
                fill="rgba(249, 115, 22, 0.2)"
                stroke="#f97316"
                strokeDasharray="0.02 0.012"
                strokeWidth={0.004}
                className={disabled ? "cursor-not-allowed" : "cursor-move"}
                onPointerDown={(event) => {
                  if (disabled) return;
                  event.preventDefault();
                  setDragMode("target");
                  event.currentTarget.setPointerCapture(event.pointerId);
                  updateTargetFromPointer(event);
                }}
              />
            </svg>
          </FramePanel>
        </div>

        <aside className="grid content-start gap-3 rounded-md border border-border bg-background p-3">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Move className="size-3.5" />
            Endpoint
          </div>
          <label className="grid gap-1 text-xs text-muted-foreground">
            Scale
            <Input
              type="number"
              min={0.2}
              max={3}
              step={0.05}
              value={edit.transform.scale}
              disabled={disabled}
              onChange={(event) => updateScale(Number(event.target.value))}
            />
          </label>
          <label className="grid gap-1 text-xs text-muted-foreground">
            Rotate
            <Input
              type="number"
              min={-180}
              max={180}
              step={1}
              value={edit.transform.rotateDeg}
              disabled={disabled}
              onChange={(event) => updateRotate(Number(event.target.value))}
            />
          </label>
          <div className="rounded-md border border-border bg-card p-2 text-xs text-muted-foreground">
            <p>Blue: selected source region.</p>
            <p className="mt-1">Orange: desired target position.</p>
          </div>
          {edit.renderedFrameUrl && (
            <div>
              <p className="mb-1 text-xs text-muted-foreground">Rendered endpoint</p>
              <img
                src={resolveMotionUrl(edit.renderedFrameUrl)}
                alt="Rendered edited target frame"
                className="aspect-video w-full rounded-md border border-border object-cover"
              />
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}

function FramePanel({
  title,
  imageUrl,
  imageAlt,
  children,
}: {
  title: string;
  imageUrl: string;
  imageAlt: string;
  children: ReactNode;
}) {
  return (
    <div className="grid min-h-0 gap-1">
      <p className="text-xs font-medium text-muted-foreground">{title}</p>
      <div className="relative min-h-72 overflow-hidden rounded-md border border-border bg-black">
        <img
          src={resolveMotionUrl(imageUrl)}
          alt={imageAlt}
          className="h-full w-full object-contain"
          draggable={false}
        />
        {children}
      </div>
    </div>
  );
}

function clamp(value: number, min = 0, max = 1): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}
