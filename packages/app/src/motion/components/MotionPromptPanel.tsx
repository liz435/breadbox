import { AlertTriangle, CheckCircle2, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { GenerationProvider } from "@dreamer/schemas";
import { cn } from "@/lib/utils";
import { SpringCurveControl } from "./SpringCurveControl";

type VeoHealthIndicator = {
  status: "idle" | "checking" | "ok" | "error";
  message: string;
  model?: string;
};

type ComfyHealthIndicator = {
  status: "idle" | "checking" | "ok" | "error";
  message: string;
};

type MotionPromptPanelProps = {
  value: string;
  subjectDescription: string;
  provider: GenerationProvider;
  durationSeconds: 4 | 6 | 8;
  springTension: number;
  springBounce: number;
  disabled?: boolean;
  generateDisabled?: boolean;
  generating?: boolean;
  veoHealth?: VeoHealthIndicator;
  comfyHealth?: ComfyHealthIndicator;
  onCheckVeoHealth?: () => void;
  onCheckComfyHealth?: () => void;
  onChange: (value: string) => void;
  onSubjectChange: (value: string) => void;
  onProviderChange: (provider: GenerationProvider) => void;
  onDurationChange: (duration: 4 | 6 | 8) => void;
  onSpringChange: (tension: number, bounce: number) => void;
  onGenerate: () => void;
};

const DURATION_OPTIONS: ReadonlyArray<4 | 6 | 8> = [4, 6, 8];

export function MotionPromptPanel({
  value,
  subjectDescription,
  provider,
  durationSeconds,
  springTension,
  springBounce,
  disabled,
  generateDisabled,
  generating,
  veoHealth,
  comfyHealth,
  onCheckVeoHealth,
  onCheckComfyHealth,
  onChange,
  onSubjectChange,
  onProviderChange,
  onDurationChange,
  onSpringChange,
  onGenerate,
}: MotionPromptPanelProps) {
  const controlsDisabled = disabled || generating;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground/50">
          Subject
        </span>
        <input
          type="text"
          value={subjectDescription}
          disabled={controlsDisabled}
          onChange={(event) => onSubjectChange(event.target.value)}
          placeholder="e.g. the left climber climbing"
          aria-label="Subject description"
          className="h-8 w-full rounded-lg bg-white/5 px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground/50 focus:ring-1 focus:ring-ring disabled:opacity-40"
        />
      </div>
      <textarea
        value={value}
        disabled={controlsDisabled}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Make the left leg flag behind the right leg, then step up smoothly."
        aria-label="Motion instruction"
        className="min-h-28 w-full resize-none rounded-lg bg-white/5 px-3 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground/50 focus:ring-1 focus:ring-ring disabled:opacity-40"
      />

      <div className="flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground/50">
          Duration
        </span>
        <div className="flex items-center gap-1">
          {DURATION_OPTIONS.map((option) => {
            const isActive = option === durationSeconds;
            return (
              <button
                key={option}
                type="button"
                disabled={controlsDisabled}
                onClick={() => onDurationChange(option)}
                className={cn(
                  "h-7 px-3 text-xs rounded-full border-0 bg-transparent disabled:cursor-not-allowed disabled:opacity-40",
                  isActive
                    ? "bg-white/15 text-foreground"
                    : "text-muted-foreground/50 hover:text-muted-foreground",
                )}
              >
                {option}s
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex w-full min-w-0 flex-col gap-1.5">
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground/50">
          Motion curve
        </span>
        <div className="w-full min-w-0">
          <SpringCurveControl
            tension={springTension}
            bounce={springBounce}
            disabled={controlsDisabled}
            onChange={onSpringChange}
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <select
          value={provider}
          disabled={controlsDisabled}
          onChange={(event) => onProviderChange(event.target.value as GenerationProvider)}
          aria-label="Generation provider"
          className="h-8 flex-1 rounded-md bg-white/5 px-2 text-xs text-muted-foreground outline-none focus:ring-1 focus:ring-ring disabled:opacity-40"
        >
          <option value="veo">Veo</option>
          <option value="comfyui">ComfyUI</option>
          <option value="mock">Mock</option>
        </select>
        <Button
          type="button"
          className="h-8 gap-1.5 rounded-md bg-white text-xs font-medium text-black hover:bg-white/90 disabled:opacity-30"
          disabled={disabled || generateDisabled || generating}
          onClick={() => onGenerate()}
        >
          <Sparkles className="size-3" />
          {generating ? "Generating…" : "Generate"}
        </Button>
      </div>

      {provider === "veo" || provider === "comfyui" ? (
        <div className="flex items-center justify-between rounded-md border border-white/10 bg-white/5 px-2 py-1.5">
          <div className="flex min-w-0 items-center gap-1.5 text-[11px]">
            {(provider === "veo" ? veoHealth?.status : comfyHealth?.status) === "checking" ? (
              <Loader2 className="size-3 animate-spin text-muted-foreground" />
            ) : (provider === "veo" ? veoHealth?.status : comfyHealth?.status) === "ok" ? (
              <CheckCircle2 className="size-3 text-emerald-400" />
            ) : (
              <AlertTriangle className="size-3 text-amber-400" />
            )}
            <span
              className={cn(
                "truncate",
                (provider === "veo" ? veoHealth?.status : comfyHealth?.status) === "ok"
                  ? "text-emerald-300"
                  : "text-muted-foreground",
              )}
              title={
                provider === "veo"
                  ? veoHealth?.message ?? "Veo status unknown"
                  : comfyHealth?.message ?? "ComfyUI status unknown"
              }
            >
              {(provider === "veo" ? veoHealth?.status : comfyHealth?.status) === "checking"
                ? provider === "veo" ? "Checking Veo API…" : "Checking ComfyUI…"
                : (provider === "veo" ? veoHealth?.status : comfyHealth?.status) === "ok"
                  ? provider === "veo" ? "Veo API connected" : "ComfyUI connected"
                  : provider === "veo"
                    ? veoHealth?.message ?? "Veo API status unknown"
                    : comfyHealth?.message ?? "ComfyUI status unknown"}
            </span>
            {provider === "veo" && veoHealth?.model ? (
              <span className="truncate text-muted-foreground/70" title={veoHealth.model}>
                {veoHealth.model}
              </span>
            ) : null}
          </div>
          <button
            type="button"
            disabled={
              controlsDisabled ||
              (provider === "veo" ? !onCheckVeoHealth || veoHealth?.status === "checking" : !onCheckComfyHealth || comfyHealth?.status === "checking")
            }
            onClick={() => provider === "veo" ? onCheckVeoHealth?.() : onCheckComfyHealth?.()}
            className="shrink-0 text-[11px] text-muted-foreground/80 transition hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
          >
            Check
          </button>
        </div>
      ) : null}
    </div>
  );
}
