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
  onSpringChange: (tension: number, bounce: number) => void;
  onGenerate: () => void;
};

export function MotionPromptPanel({
  value,
  subjectDescription,
  provider,
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
  onSpringChange,
  onGenerate,
}: MotionPromptPanelProps) {
  const controlsDisabled = disabled || generating;
  const providerHealth = provider === "veo" ? veoHealth : comfyHealth;
  const providerChecking = providerHealth?.status === "checking";
  const providerOk = providerHealth?.status === "ok";
  const providerMessage =
    provider === "veo"
      ? veoHealth?.message ?? "Veo status unknown"
      : comfyHealth?.message ?? "ComfyUI status unknown";

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-col gap-1">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground/50">
          Subject
        </span>
        <input
          type="text"
          value={subjectDescription}
          disabled={controlsDisabled}
          onChange={(event) => onSubjectChange(event.target.value)}
          placeholder="e.g. the left climber climbing"
          aria-label="Subject description"
          className="h-8 w-full rounded-md border border-white/10 bg-white/[0.04] px-2.5 text-xs text-foreground outline-none placeholder:text-muted-foreground/45 focus:border-white/20 focus:ring-1 focus:ring-ring disabled:opacity-40"
        />
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground/50">
          Motion instruction
        </span>
        <textarea
          value={value}
          disabled={controlsDisabled}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Make the left leg flag behind the right leg, then step up smoothly."
          aria-label="Motion instruction"
          className="min-h-24 w-full resize-none rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-2 text-xs leading-5 text-foreground outline-none placeholder:text-muted-foreground/45 focus:border-white/20 focus:ring-1 focus:ring-ring disabled:opacity-40"
        />
      </div>

      <div className="flex w-full min-w-0 flex-col gap-1">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground/50">
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

      <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2">
        <div className="flex items-center gap-2">
          <select
            value={provider}
            disabled={controlsDisabled}
            onChange={(event) => onProviderChange(event.target.value as GenerationProvider)}
            aria-label="Generation provider"
            className="h-8 min-w-0 flex-1 rounded-md border border-white/10 bg-black/20 px-2 text-xs text-muted-foreground outline-none focus:border-white/20 focus:ring-1 focus:ring-ring disabled:opacity-40"
          >
            <option value="veo">Veo</option>
            <option value="comfyui">ComfyUI</option>
            <option value="mock">Mock</option>
          </select>
          {(provider === "veo" || provider === "comfyui") && (
            <button
              type="button"
              disabled={
                controlsDisabled ||
                (provider === "veo"
                  ? !onCheckVeoHealth || veoHealth?.status === "checking"
                  : !onCheckComfyHealth || comfyHealth?.status === "checking")
              }
              onClick={() => provider === "veo" ? onCheckVeoHealth?.() : onCheckComfyHealth?.()}
              className="h-8 shrink-0 rounded-md border border-white/10 px-2 text-[11px] text-muted-foreground/80 transition hover:bg-white/10 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
            >
              Check
            </button>
          )}
        </div>

        {(provider === "veo" || provider === "comfyui") && (
          <div className="mt-2 flex min-w-0 items-center gap-1.5 border-t border-white/10 pt-2 text-[11px]">
            {providerChecking ? (
              <Loader2 className="size-3 shrink-0 animate-spin text-muted-foreground" />
            ) : providerOk ? (
              <CheckCircle2 className="size-3 shrink-0 text-emerald-400" />
            ) : (
              <AlertTriangle className="size-3 shrink-0 text-amber-400" />
            )}
            <span
              className={cn(
                "min-w-0 flex-1 truncate",
                providerOk ? "text-emerald-300" : "text-muted-foreground",
              )}
              title={providerMessage}
            >
              {providerChecking
                ? provider === "veo" ? "Checking Veo API…" : "Checking ComfyUI…"
                : providerOk
                  ? provider === "veo" ? "Veo API connected" : "ComfyUI connected"
                  : providerMessage}
            </span>
            {provider === "veo" && veoHealth?.model ? (
              <span className="max-w-[88px] truncate text-muted-foreground/60" title={veoHealth.model}>
                {veoHealth.model}
              </span>
            ) : null}
          </div>
        )}

        <Button
          type="button"
          className="mt-2 h-8 w-full gap-1.5 rounded-md bg-primary text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-30"
          disabled={disabled || generateDisabled || generating}
          onClick={() => onGenerate()}
        >
          <Sparkles className="size-3" />
          {generating ? "Generating…" : "Generate"}
        </Button>
      </div>
    </div>
  );
}
