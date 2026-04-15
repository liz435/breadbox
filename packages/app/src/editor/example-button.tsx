// ── Example Board Button ───────────────────────────────────────────────
//
// Sits in the sketch editor toolbar. Opens a popover listing all
// example boards, optionally filtered to highlight boards whose
// primary component matches something already on the breadboard.
// Clicking an example fires LOAD_BOARD to replace the entire board.

import { useState, useCallback, useMemo } from "react"
import { Popover } from "@base-ui/react/popover"
import { useBoard } from "@/store/board-context"
import { simulationRef } from "@/simulator/simulation-ref"
import { resetAllCapVoltages } from "@/simulator/capacitor-state"
import {
  exampleBoards,
  getMatchingExamples,
  groupByCategory,
  type ExampleBoard,
} from "@/examples/example-catalog"

export function ExampleButton() {
  const { state: boardState, send } = useBoard()
  const [open, setOpen] = useState(false)

  const matching = useMemo(
    () => getMatchingExamples(boardState.components),
    [boardState.components],
  )

  const hasComponents = Object.keys(boardState.components).length > 0
  const showFiltered = hasComponents && matching.length < exampleBoards.length

  const handleLoad = useCallback(
    (example: ExampleBoard) => {
      // Stop any running simulation, reset pins and cap state before swapping
      simulationRef.current?.stop()
      resetAllCapVoltages()
      send({ type: "RESET_PINS" } as never)
      send({ type: "LOAD_BOARD", state: example.state } as never)
      setOpen(false)
    },
    [send],
  )

  if (exampleBoards.length === 0) return null

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        className="flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium text-neutral-300 hover:bg-neutral-700 transition-colors"
      >
        <svg viewBox="0 0 16 16" className="size-3 fill-current">
          <path d="M2 2a1 1 0 011-1h6l4 4v8a1 1 0 01-1 1H3a1 1 0 01-1-1V2zm7 0v3h3L9 2zM5 8h6v1H5V8zm0 2h4v1H5v-1z" />
        </svg>
        Examples
        {showFiltered && (
          <span className="rounded-full bg-emerald-600/60 px-1.5 text-[10px] leading-tight text-white">
            {matching.length}
          </span>
        )}
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Positioner side="bottom" sideOffset={8} align="end">
          <Popover.Popup className="z-50 w-72 max-h-96 overflow-y-auto rounded-lg border border-neutral-700 bg-[#1a1a1a] p-2 shadow-xl outline-none">
            <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
              {showFiltered ? "Matching your board" : "All examples"}
            </p>

            {showFiltered ? (
              <>
                <ExampleList
                  examples={matching}
                  onLoad={handleLoad}
                />
                <div className="my-2 border-t border-neutral-700" />
                <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
                  All examples
                </p>
                <ExampleList
                  examples={exampleBoards.filter(
                    (ex) => !matching.includes(ex),
                  )}
                  onLoad={handleLoad}
                  dimmed
                />
              </>
            ) : (
              <GroupedList onLoad={handleLoad} />
            )}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}

// ── Subcomponents ────────────────────────────────────────────────────

function GroupedList({
  onLoad,
}: {
  onLoad: (ex: ExampleBoard) => void
}) {
  const groups = useMemo(() => groupByCategory(exampleBoards), [])

  return (
    <div className="space-y-3">
      {groups.map(({ category, items }) => (
        <div key={category}>
          <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-neutral-600">
            {category}
          </p>
          <ExampleList examples={items} onLoad={onLoad} />
        </div>
      ))}
    </div>
  )
}

function ExampleList({
  examples,
  onLoad,
  dimmed = false,
}: {
  examples: readonly ExampleBoard[]
  onLoad: (ex: ExampleBoard) => void
  dimmed?: boolean
}) {
  return (
    <div className="space-y-0.5">
      {examples.map((ex) => (
        <button
          key={ex.key}
          type="button"
          onClick={() => onLoad(ex)}
          className={`w-full rounded px-2 py-1.5 text-left transition-colors hover:bg-neutral-700 ${
            dimmed ? "opacity-50 hover:opacity-80" : ""
          }`}
        >
          <span className="block text-xs font-medium text-neutral-200">
            {ex.label}
          </span>
          <span className="block text-[11px] leading-tight text-neutral-500">
            {ex.description}
          </span>
        </button>
      ))}
    </div>
  )
}
