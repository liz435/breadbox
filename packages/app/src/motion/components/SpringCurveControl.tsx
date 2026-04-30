import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type SpringCurveControlProps = {
  tension: number;
  bounce: number;
  disabled?: boolean;
  onChange: (tension: number, bounce: number) => void;
};

const CURVE_SAMPLE_COUNT = 60;
const CURVE_VIEWBOX_WIDTH = 100;
const CURVE_VIEWBOX_HEIGHT = 60;
const CURVE_PADDING_Y = 5;
const CURVE_PLOT_HEIGHT = CURVE_VIEWBOX_HEIGHT - CURVE_PADDING_Y * 2;

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function getCurvePoints(tension: number, bounce: number) {
  const spread = 0.45 * (1 - tension);
  const x1 = spread;
  const y1 = -bounce * 0.25;
  const x2 = 1 - spread;
  const y2 = 1 + bounce * 0.45;
  return { x1, y1, x2, y2 };
}

function sampleBezier(
  t: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): { x: number; y: number } {
  const mt = 1 - t;
  const x = 3 * mt * mt * t * x1 + 3 * mt * t * t * x2 + t * t * t;
  const y = 3 * mt * mt * t * y1 + 3 * mt * t * t * y2 + t * t * t;
  return { x, y };
}

function buildCurvePolyline(tension: number, bounce: number): string {
  const { x1, y1, x2, y2 } = getCurvePoints(tension, bounce);
  const points: string[] = [];
  for (let i = 0; i <= CURVE_SAMPLE_COUNT; i += 1) {
    const t = i / CURVE_SAMPLE_COUNT;
    const sample = sampleBezier(t, x1, y1, x2, y2);
    const svgX = sample.x * CURVE_VIEWBOX_WIDTH;
    const svgY = CURVE_VIEWBOX_HEIGHT - CURVE_PADDING_Y - sample.y * CURVE_PLOT_HEIGHT;
    points.push(`${svgX.toFixed(2)},${svgY.toFixed(2)}`);
  }
  return points.join(" ");
}

export function SpringCurveControl({
  tension,
  bounce,
  disabled,
  onChange,
}: SpringCurveControlProps) {
  const padRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const updateFromClientCoords = useCallback(
    (clientX: number, clientY: number) => {
      const pad = padRef.current;
      if (!pad) return;
      const rect = pad.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const nextTension = clamp01((clientX - rect.left) / rect.width);
      const nextBounce = clamp01(1 - (clientY - rect.top) / rect.height);
      onChange(nextTension, nextBounce);
    },
    [onChange],
  );

  useEffect(() => {
    if (!isDragging) return;

    function handleMouseMove(event: MouseEvent) {
      updateFromClientCoords(event.clientX, event.clientY);
    }
    function handleMouseUp() {
      setIsDragging(false);
    }
    function handleTouchMove(event: TouchEvent) {
      const touch = event.touches[0];
      if (!touch) return;
      updateFromClientCoords(touch.clientX, touch.clientY);
    }
    function handleTouchEnd() {
      setIsDragging(false);
    }

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    window.addEventListener("touchmove", handleTouchMove, { passive: true });
    window.addEventListener("touchend", handleTouchEnd);
    window.addEventListener("touchcancel", handleTouchEnd);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
      window.removeEventListener("touchcancel", handleTouchEnd);
    };
  }, [isDragging, updateFromClientCoords]);

  const handleMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    if (disabled) return;
    event.preventDefault();
    setIsDragging(true);
    updateFromClientCoords(event.clientX, event.clientY);
  };

  const handleTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    if (disabled) return;
    const touch = event.touches[0];
    if (!touch) return;
    setIsDragging(true);
    updateFromClientCoords(touch.clientX, touch.clientY);
  };

  const handleX = `${(tension * 100).toFixed(2)}%`;
  const handleY = `${((1 - bounce) * 100).toFixed(2)}%`;
  const polylinePoints = buildCurvePolyline(tension, bounce);
  const curveStrokeClass = bounce > 0.1 ? "stroke-amber-400" : "stroke-white/70";

  return (
    <div className={cn("flex flex-col gap-2", disabled && "opacity-40")}>
      <div
        ref={padRef}
        role="slider"
        aria-label="Spring tension and bounce"
        aria-valuetext={`Tension ${tension.toFixed(2)}, bounce ${bounce.toFixed(2)}`}
        aria-disabled={disabled}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        className={cn(
          "relative w-full max-w-[180px] aspect-square select-none rounded-lg bg-white/5",
          disabled ? "cursor-not-allowed" : "cursor-crosshair",
        )}
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="pointer-events-none absolute inset-0 h-full w-full"
        >
          <line x1="0" y1="50" x2="100" y2="50" className="stroke-white/10" strokeWidth="0.5" />
          <line x1="50" y1="0" x2="50" y2="100" className="stroke-white/10" strokeWidth="0.5" />
        </svg>

        <span className="pointer-events-none absolute left-1.5 top-1/2 -translate-y-1/2 text-[8px] uppercase tracking-widest text-muted-foreground/60">
          Smooth
        </span>
        <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-[8px] uppercase tracking-widest text-muted-foreground/60">
          Sharp
        </span>
        <span className="pointer-events-none absolute left-1/2 top-1 -translate-x-1/2 text-[8px] uppercase tracking-widest text-muted-foreground/60">
          Spring
        </span>
        <span className="pointer-events-none absolute bottom-1 left-1/2 -translate-x-1/2 text-[8px] uppercase tracking-widest text-muted-foreground/60">
          Ease
        </span>

        <div
          className="pointer-events-none absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.4)]"
          style={{ left: handleX, top: handleY }}
        />
      </div>

      <svg
        aria-hidden="true"
        viewBox={`0 0 ${CURVE_VIEWBOX_WIDTH} ${CURVE_VIEWBOX_HEIGHT}`}
        preserveAspectRatio="none"
        className="h-16 w-full"
      >
        <line
          x1="0"
          y1={CURVE_VIEWBOX_HEIGHT / 2}
          x2={CURVE_VIEWBOX_WIDTH}
          y2={CURVE_VIEWBOX_HEIGHT / 2}
          className="stroke-white/10"
          strokeWidth="0.5"
        />
        <line
          x1="0"
          y1={CURVE_PADDING_Y}
          x2={CURVE_VIEWBOX_WIDTH}
          y2={CURVE_PADDING_Y}
          className="stroke-white/20"
          strokeWidth="0.5"
          strokeDasharray="2 3"
        />
        <polyline
          points={polylinePoints}
          fill="none"
          className={curveStrokeClass}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
