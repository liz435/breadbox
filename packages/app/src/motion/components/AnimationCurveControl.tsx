import { cn } from "@/lib/utils";
import type { AnimationCurve } from "@dreamer/schemas";

type AnimationCurveControlProps = {
  value: AnimationCurve;
  disabled?: boolean;
  onChange: (curve: AnimationCurve) => void;
};

const CURVES: ReadonlyArray<{
  value: AnimationCurve;
  label: string;
  path: string;
}> = [
  { value: "linear",    label: "Linear",   path: "M 2,22 L 38,2" },
  { value: "easeIn",    label: "Ease In",  path: "M 2,22 C 32,22 38,8 38,2" },
  { value: "easeOut",   label: "Ease Out", path: "M 2,22 C 2,8 8,2 38,2" },
  { value: "easeInOut", label: "Smooth",   path: "M 2,22 C 14,22 26,2 38,2" },
  { value: "sharp",     label: "Sharp",    path: "M 2,22 C 19,22 21,2 38,2" },
];

export function AnimationCurveControl({ value, disabled, onChange }: AnimationCurveControlProps) {
  return (
    <div className="grid w-full grid-cols-3 gap-1.5">
      {CURVES.map((curve) => {
        const isActive = curve.value === value;
        return (
          <button
            key={curve.value}
            type="button"
            disabled={disabled}
            onClick={() => onChange(curve.value)}
            aria-label={curve.label}
            aria-pressed={isActive}
            className={cn(
              "flex w-full min-w-0 flex-col items-center gap-1 rounded-md border-0 bg-transparent px-0.5 py-1.5 disabled:cursor-not-allowed disabled:opacity-40",
              isActive ? "bg-white/15" : "hover:bg-white/8",
            )}
          >
            <svg
              viewBox="0 0 40 24"
              fill="none"
              className={cn(
                "h-6 w-full max-w-[40px]",
                isActive ? "stroke-foreground" : "stroke-muted-foreground/50",
              )}
            >
              <path d={curve.path} strokeWidth={2} strokeLinecap="round" />
            </svg>
            <span
              title={curve.label}
              className={cn(
                "block w-full truncate text-center text-[9px] uppercase tracking-widest",
                isActive ? "text-foreground" : "text-muted-foreground/50",
              )}
            >
              {curve.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
