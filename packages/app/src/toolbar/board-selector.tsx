// ── Board model selector ─────────────────────────────────────────────────
//
// Compact chip in the bottom toolbar that lets the user pick which board
// model the simulator/compiler targets (Uno, Nano, Mega, Pico, …). Dispatches
// SET_BOARD_TARGET on the board machine; the simulation hook rebuilds its
// runner the next time Play is pressed (see simulation-loop.ts `getRunner`).
//
// Distinct from <BoardStatus/>, which owns the USB *port/connection* used for
// flashing — this owns the *chip* being emulated. Changing the board is only
// allowed while the sim is stopped: swapping the emulated chip mid-run would
// leave pin/peripheral state describing the wrong hardware.

import { useState } from "react"
import { Popover } from "@base-ui/react/popover"
import { Cpu, ChevronDown, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { BOARD_TARGETS, DEFAULT_BOARD_TARGET, type BoardTarget } from "@dreamer/schemas"
import { useBoard } from "@/store/board-context"
import { cn } from "@/utils/classnames"

const BOARD_LIST = Object.values(BOARD_TARGETS)

/** Trim the vendor prefix so the toolbar chip stays narrow ("Uno", "Pico"). */
function shortLabel(label: string): string {
  return label.replace(/^Arduino\s+/, "").replace(/^Raspberry Pi\s+/, "")
}

type BoardSelectorProps = {
  /** Disable the picker while the sim is busy (running / paused / compiling). */
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
        render={
          <Button
            variant="ghost"
            disabled={disabled}
            className="flex h-6 items-center gap-1 rounded px-1.5 hover:bg-accent"
            aria-label={`Board: ${current.label} (${current.mcu})`}
          />
        }
      >
        <Cpu className="size-3.5 text-muted-foreground" />
        <span className="text-xs font-medium text-foreground">{shortLabel(current.label)}</span>
        <ChevronDown className="size-3 text-muted-foreground/70" />
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Positioner side="top" align="end" sideOffset={8}>
          <Popover.Popup className="z-50 min-w-[260px] rounded-lg border border-border bg-popover p-1.5 text-xs text-popover-foreground shadow-lg">
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
