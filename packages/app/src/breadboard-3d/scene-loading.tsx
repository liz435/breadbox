// ── 3D loading indicator ─────────────────────────────────────────────────────
//
// A small animated placeholder shown while the 3D view loads. It covers two
// otherwise-blank windows: the React.lazy chunk fetch (used as the Suspense
// fallback in the panel) and the gap after the chunk mounts while WebGL
// initializes and the procedural environment bakes (used as an overlay inside
// the scene, faded out on the first rendered frame).
//
// Deliberately free of any three.js import so the main-bundle panel can render
// it without pulling the 3D chunk in early.

import { cn } from "@/utils/classnames"

type Scene3dLoadingProps = {
  /** Caption under the spinner. */
  label?: string
  /** Absolutely fill the scene container and sit above the toolbars. */
  overlay?: boolean
  /** Fade out and stop intercepting pointer events (overlay mode). */
  hidden?: boolean
}

export function Scene3dLoading({
  label = "Loading 3D scene…",
  overlay = false,
  hidden = false,
}: Scene3dLoadingProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-hidden={hidden}
      // Same backdrop as the scene (#232228) so there's no flash when the
      // overlay hands off to the first rendered frame.
      className={cn(
        "flex flex-col items-center justify-center gap-3 bg-[#232228] text-neutral-300",
        overlay
          ? "absolute inset-0 z-40 transition-opacity duration-500"
          : "h-full w-full",
        hidden && "pointer-events-none opacity-0",
      )}
    >
      <div className="size-7 animate-spin rounded-full border-2 border-white/15 border-t-white/70" />
      <p className="text-xs tracking-wide text-neutral-400">{label}</p>
    </div>
  )
}
