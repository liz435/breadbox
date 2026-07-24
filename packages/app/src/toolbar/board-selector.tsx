// ── Board model selector ─────────────────────────────────────────────────
//
// The board indicator in the bottom-toolbar status well, rendered as a select.
// When open, the menu is anchored to — and width-matched with — the
// surrounding pill, sits flush on its top edge (no gap, seam border removed),
// and grows upward, so the pill and menu read as ONE continuous bordered
// surface rather than a detached floating card. The toolbar flattens the
// well's top corners while open (it owns `open` state for that reason).
//
// Dispatches SET_BOARD_TARGET; the simulation hook rebuilds its runner on the
// next Play (see simulation-loop.ts `getRunner`). Distinct from <BoardStatus/>,
// which owns the USB *port* used for flashing.

import { useRef, useState, type RefObject } from "react"
import { Popover } from "@base-ui/react/popover"
import { motion, useReducedMotion } from "motion/react"
import { ChevronDown, Check } from "lucide-react"
import { BOARD_TARGETS, DEFAULT_BOARD_TARGET, type BoardTarget, type RealismProfile } from "@dreamer/schemas"
import { useBoard } from "@/store/board-context"
import { cn } from "@/utils/classnames"

const BOARD_LIST = Object.values(BOARD_TARGETS)
const REALISM_PROFILES: Array<{ id: RealismProfile; label: string; detail: string }> = [
  { id: "learn", label: "Learn", detail: "Guided inputs and forgiving behavior" },
  { id: "electrical", label: "Electrical", detail: "Requires resolved power and ground" },
  { id: "hardware", label: "Hardware", detail: "Strict timing and fault diagnostics" },
]

type BoardSelectorProps = {
  /** Disable the picker (e.g. while the sim is busy). */
  disabled?: boolean
  /** Controlled open state — the toolbar uses it to restyle the pill. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /** Element the menu anchors to + matches width of (the surrounding pill).
   *  Falls back to the trigger when omitted. */
  anchor?: RefObject<HTMLElement | null>
  /** Called once the close (collapse) animation has finished — lets the
   *  toolbar un-flatten the pill only after the menu has fully retracted, so
   *  the continuous border survives the whole exit. */
  onExitComplete?: () => void
}

export function BoardSelector({
  disabled = false,
  open,
  onOpenChange,
  anchor,
  onExitComplete,
}: BoardSelectorProps) {
  const { state, send } = useBoard()
  const reduceMotion = useReducedMotion()
  const [internalOpen, setInternalOpen] = useState(false)
  // With actionsRef set, Base UI keeps the popup mounted after close until we
  // call unmount() — letting Motion run the collapse first (see onAnimationComplete).
  const actionsRef = useRef<Popover.Root.Actions | null>(null)
  const isControlled = open !== undefined
  const openState = isControlled ? open : internalOpen
  const setOpen = (next: boolean) => {
    if (!isControlled) setInternalOpen(next)
    onOpenChange?.(next)
  }

  const boardTarget = (state.boardTarget ?? DEFAULT_BOARD_TARGET) as BoardTarget
  const realismProfile = (state.realismProfile ?? "learn") as RealismProfile
  const current = BOARD_TARGETS[boardTarget]

  return (
    <Popover.Root open={openState} onOpenChange={setOpen} actionsRef={actionsRef}>
      <Popover.Trigger
        type="button"
        disabled={disabled}
        aria-label={`Board: ${current.label} (${current.mcu}). Click to change.`}
        className={cn(
          "-mx-1 flex min-w-0 items-center gap-1 rounded px-1 text-foreground transition-colors",
          "hover:bg-accent disabled:pointer-events-none disabled:opacity-60",
        )}
      >
        <span className="truncate">{current.label}</span>
        <ChevronDown
          className={cn(
            "size-3 shrink-0 text-muted-foreground/70 transition-transform",
            openState && "rotate-180",
          )}
        />
      </Popover.Trigger>

      <Popover.Portal>
        {/* Anchored to the surrounding pill, flush on its top edge (no gap). */}
        <Popover.Positioner
          anchor={anchor}
          side="top"
          align="start"
          sideOffset={0}
          className="z-50"
        >
          {/* Bottom border dropped + flat bottom corners so it merges into the
              pill (whose top border/corners the toolbar hides while open).
              Motion drives the grow-up: a spring on scaleY (anchored to the
              bottom via transformOrigin) + opacity, so the menu unfurls out of
              the pill. Width matches the pill via Base UI's --anchor-width. */}
          <Popover.Popup
            className={cn(
              "rounded-t-xl rounded-b-none border border-b-0 border-border/50",
              "bg-popover p-1.5 text-xs text-popover-foreground",
              "shadow-[0_-10px_30px_-14px_rgba(60,40,10,0.4)]",
            )}
            // transformOrigin bottom so the scaleY reads as growing up out of
            // the pill. Fallback width keeps the menu from collapsing to zero
            // if Base UI doesn't expose --anchor-width.
            style={{
              transformOrigin: "bottom",
              ...(anchor ? { width: "var(--anchor-width, 16rem)" } : {}),
            }}
            render={
              <motion.div
                initial={reduceMotion ? false : { opacity: 0, scaleY: 0.6 }}
                // Animate by open state (not a one-shot enter) so the same
                // spring drives the collapse. Base UI keeps this mounted past
                // close (actionsRef); when the collapse settles we unmount and
                // tell the toolbar to un-flatten the pill.
                animate={openState ? { opacity: 1, scaleY: 1 } : { opacity: 0, scaleY: 0.6 }}
                transition={
                  reduceMotion
                    ? { duration: 0 }
                    : { type: "spring", stiffness: 520, damping: 36, mass: 0.7 }
                }
                onAnimationComplete={() => {
                  if (!openState) {
                    actionsRef.current?.unmount()
                    onExitComplete?.()
                  }
                }}
              />
            }
          >
            <p className="px-2 py-1 font-medium text-muted-foreground">Board model</p>
            {BOARD_LIST.map((board) => {
              const selected = board.id === boardTarget
              return (
                <button
                  key={board.id}
                  type="button"
                  onClick={() => {
                    if (board.id !== boardTarget) {
                      send({ type: "SET_BOARD_TARGET", boardTarget: board.id })
                    }
                    setOpen(false)
                  }}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-accent",
                    selected && "bg-accent/60",
                  )}
                >
                  <Check
                    className={cn(
                      "size-3.5 shrink-0",
                      selected ? "text-emerald-400" : "text-transparent",
                    )}
                  />
                  <span className="flex min-w-0 flex-col">
                    <span className="font-medium text-foreground">{board.label}</span>
                    <span className="text-[11px] text-muted-foreground">{board.mcu}</span>
                  </span>
                </button>
              )
            })}
            <div className="my-1 border-t border-border/50" />
            <p className="px-2 py-1 font-medium text-muted-foreground">Simulation realism</p>
            {REALISM_PROFILES.map((profile) => {
              const selected = profile.id === realismProfile
              return (
                <button
                  key={profile.id}
                  type="button"
                  onClick={() => {
                    if (profile.id !== realismProfile) {
                      send({ type: "SET_REALISM_PROFILE", realismProfile: profile.id })
                    }
                    setOpen(false)
                  }}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-accent",
                    selected && "bg-accent/60",
                  )}
                >
                  <Check className={cn("size-3.5 shrink-0", selected ? "text-emerald-400" : "text-transparent")} />
                  <span className="flex min-w-0 flex-col">
                    <span className="font-medium text-foreground">{profile.label}</span>
                    <span className="text-[11px] text-muted-foreground">{profile.detail}</span>
                  </span>
                </button>
              )
            })}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}
