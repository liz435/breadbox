// ── Onboarding Tour ──────────────────────────────────────────────────────
//
// A lightweight, non-blocking coach-mark tour. Each step spotlights a real UI
// element (matched by its `data-onboarding` attribute) with a dimmed cutout and
// parks a callout card beside it. The overlay is `pointer-events-none` except
// for the card itself, so the user can still click through to the app — e.g.
// actually press Run during the tour. Dismiss with Skip, Done, or Escape.
//
// Steps are declared in onboarding-steps.ts; first-run gating + persistence
// live in use-onboarding.ts.

import { useCallback, useEffect, useLayoutEffect, useState } from "react"
import { ArrowLeft, ArrowRight, X } from "lucide-react"
import { cn } from "@/utils/classnames"
import { ONBOARDING_STEPS } from "./onboarding-steps"
import { markOnboardingSeen } from "./use-onboarding"

const CARD_WIDTH = 320
const MARGIN = 16
const GAP = 12
// Approximate card height used to decide above/below placement before the card
// has rendered. The card clamps to the viewport regardless, so a rough value is
// fine.
const ESTIMATED_CARD_HEIGHT = 210

type AnchorRect = { top: number; left: number; width: number; height: number }

function measureAnchor(anchor: string | undefined): AnchorRect | null {
  if (!anchor) return null
  const el = document.querySelector(`[data-onboarding="${anchor}"]`)
  if (!el) return null
  const r = el.getBoundingClientRect()
  // A panel that isn't on screen (hidden in a non-active tab/mode) reports a
  // zero-size box — fall back to a centered card rather than a broken cutout.
  if (r.width === 0 || r.height === 0) return null
  return { top: r.top, left: r.left, width: r.width, height: r.height }
}

type CardPosition =
  | { mode: "anchored"; left: number; top: number }
  | { mode: "centered" }

function cardPositionFor(rect: AnchorRect | null): CardPosition {
  if (!rect) return { mode: "centered" }

  const vw = window.innerWidth
  const vh = window.innerHeight

  // Horizontally center the card on the anchor, clamped into the viewport.
  const rawLeft = rect.left + rect.width / 2 - CARD_WIDTH / 2
  const left = Math.max(MARGIN, Math.min(rawLeft, vw - CARD_WIDTH - MARGIN))

  // Prefer below the anchor, else above. A tall anchor (e.g. the full-height
  // canvas, whose first step sits near the top) leaves room for neither — so
  // we always express the result as a `top` clamped into the viewport. The
  // earlier version set an unclamped `bottom` for the "above" case, which
  // pushed the card off the top edge for any anchor near the top.
  const roomBelow = vh - (rect.top + rect.height)
  const roomAbove = rect.top

  let top: number
  if (roomBelow >= ESTIMATED_CARD_HEIGHT + GAP) {
    top = rect.top + rect.height + GAP
  } else if (roomAbove >= ESTIMATED_CARD_HEIGHT + GAP) {
    top = rect.top - GAP - ESTIMATED_CARD_HEIGHT
  } else {
    // Neither side fits — overlap the anchor, pinned just inside the top.
    top = MARGIN
  }

  // Final guard: keep the whole card on screen vertically regardless.
  top = Math.max(MARGIN, Math.min(top, vh - ESTIMATED_CARD_HEIGHT - MARGIN))

  return { mode: "anchored", left, top }
}

type OnboardingTourProps = {
  open: boolean
  onClose: () => void
}

export function OnboardingTour({ open, onClose }: OnboardingTourProps) {
  const [step, setStep] = useState(0)
  const [rect, setRect] = useState<AnchorRect | null>(null)

  const total = ONBOARDING_STEPS.length
  const current = ONBOARDING_STEPS[step]
  const isLast = step === total - 1

  // Mark seen + reset to the first step whenever the tour opens (auto-start or
  // a manual re-open from the command palette). Marking on open guarantees the
  // tour is once-only even if the user reloads mid-tour.
  useEffect(() => {
    if (!open) return
    setStep(0)
    markOnboardingSeen()
  }, [open])

  // Measure the current step's anchor. A double rAF lets any layout settle
  // (e.g. the dockview default layout finishing) before we read its box.
  useLayoutEffect(() => {
    if (!open) return
    let raf2 = 0
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setRect(measureAnchor(current?.anchor)))
    })
    return () => {
      cancelAnimationFrame(raf1)
      cancelAnimationFrame(raf2)
    }
  }, [open, current?.anchor])

  // Keep the spotlight aligned as the window resizes.
  useEffect(() => {
    if (!open) return
    const onResize = () => setRect(measureAnchor(current?.anchor))
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [open, current?.anchor])

  const close = useCallback(() => {
    markOnboardingSeen()
    onClose()
  }, [onClose])

  const next = useCallback(() => {
    setStep((s) => {
      if (s >= total - 1) {
        close()
        return s
      }
      return s + 1
    })
  }, [total, close])

  const back = useCallback(() => setStep((s) => Math.max(0, s - 1)), [])

  // Keyboard: Esc closes, ←/→ navigate.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        close()
      } else if (e.key === "ArrowRight") {
        e.preventDefault()
        next()
      } else if (e.key === "ArrowLeft") {
        e.preventDefault()
        back()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, close, next, back])

  if (!open || !current) return null

  const pos = cardPositionFor(rect)

  return (
    // pointer-events-none: the dim is purely visual so the app stays clickable
    // (the user can press Run mid-tour). The card re-enables pointer events.
    <div className="pointer-events-none fixed inset-0 z-[60]">
      {rect ? (
        // Spotlight: a transparent box over the anchor whose huge box-shadow
        // dims everything around it, leaving the anchor lit.
        <div
          className="absolute rounded-xl ring-2 ring-primary transition-all duration-200"
          style={{
            top: rect.top - 6,
            left: rect.left - 6,
            width: rect.width + 12,
            height: rect.height + 12,
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.55)",
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-black/55" />
      )}

      <div
        className={cn(
          "pointer-events-auto absolute w-80 rounded-xl border border-border bg-card p-4 shadow-2xl",
          pos.mode === "centered" &&
            "left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2",
        )}
        style={
          pos.mode === "anchored"
            ? { left: pos.left, top: pos.top }
            : undefined
        }
        role="dialog"
        aria-label="Onboarding tour"
      >
        <div className="mb-2 flex items-start justify-between gap-2">
          <h2 className="text-sm font-semibold text-foreground">{current.title}</h2>
          <button
            type="button"
            onClick={close}
            aria-label="Skip tour"
            className="-mr-1 -mt-1 shrink-0 rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        </div>

        <p className="text-xs leading-relaxed text-muted-foreground">{current.body}</p>

        <div className="mt-4 flex items-center justify-between">
          {/* Step dots */}
          <div className="flex items-center gap-1.5">
            {ONBOARDING_STEPS.map((s, i) => (
              <span
                key={s.id}
                className={cn(
                  "size-1.5 rounded-full transition-colors",
                  i === step ? "bg-primary" : "bg-border",
                )}
              />
            ))}
          </div>

          <div className="flex items-center gap-2">
            {step > 0 && (
              <button
                type="button"
                onClick={back}
                className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                <ArrowLeft className="size-3" />
                Back
              </button>
            )}
            <button
              type="button"
              onClick={next}
              className="flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
            >
              {isLast ? "Done" : "Next"}
              {!isLast && <ArrowRight className="size-3" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
