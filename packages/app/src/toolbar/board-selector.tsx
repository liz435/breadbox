// ── Board model selector ─────────────────────────────────────────────────
//
// The board indicator in the bottom-toolbar status well, rendered as a select:
// shows the current board (Uno / Nano / Mega / Pico) and opens a popover to
// pick another. Dispatches SET_BOARD_TARGET; the simulation hook rebuilds its
// runner on the next Play (see simulation-loop.ts `getRunner`).
//
// Designed to sit inline after StatusDisplay's status dot, so it reads as
// "● Arduino Uno ⌄" — the dot/tone is owned by StatusDisplay. Distinct from
// <BoardStatus/>, which owns the USB *port* used for flashing.

import { useState } from "react"
import { Popover } from "@base-ui/react/popover"
import { ChevronDown, Check } from "lucide-react"
import { BOARD_TARGETS, DEFAULT_BOARD_TARGET, type BoardTarget } from "@dreamer/schemas"
import { useBoard } from "@/store/board-context"
import { cn } from "@/utils/classnames"

const BOARD_LIST = Object.values(BOARD_TARGETS)

type BoardSelectorProps = {
  /** Disable the picker (e.g. while the sim is busy). */
  disabled?: boolean
}

export function BoardSelector({ disabled = false }: BoardSelectorProps) {
  const { state, send } = useBoard()
  const [open, setOpen] = useState(false)
  const boardTarget = (state.boardTarget ?? DEFAULT_BOARD_TARGET) as BoardTarget
  const current = BOARD_TARGETS[boardTarget]

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
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
        <ChevronDown className="size-3 shrink-0 text-muted-foreground/70" />
      </Popover.Trigger>

      <Popover.Portal>
        {/* align="end" mirrors the sibling USB popover (board-status.tsx) so the
            menu opens up-and-left and stays on-screen instead of overflowing the
            right edge. */}
        <Popover.Positioner side="top" align="end" sideOffset={8}>
          <Popover.Popup className="z-50 w-64 rounded-lg border border-border bg-popover p-1.5 text-xs text-popover-foreground shadow-lg">
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
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}
