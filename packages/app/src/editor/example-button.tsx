// ── Example Board Button ───────────────────────────────────────────────
//
// Sits in the sketch editor toolbar. Opens a popover with a two-tab
// selector (Built-in / Custom Libraries) matching the library-manager
// pattern. Clicking an example fires LOAD_BOARD to replace the entire
// board.

import { useState, useCallback, useMemo } from "react"
import { Popover } from "@base-ui/react/popover"
import { Package } from "lucide-react"
import { useBoard } from "@/store/board-context"
import { simulationRef } from "@/simulator/simulation-ref"
import { resetAllCapVoltages } from "@/simulator/capacitor-state"
import {
  exampleBoards,
  getMatchingExamples,
  groupByCategory,
  groupByLibrary,
  mergeExampleSources,
  type ExampleBoard,
} from "@/examples/example-catalog"

type TabKey = "builtin" | "library"

export function ExampleButton() {
  const { state: boardState, send } = useBoard()
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<TabKey>("builtin")

  // TODO: once library examples are wired through the schema
  // (`CustomLibrary.examples` or sibling catalog), replace the empty
  // array with the resolved list — the rest of this component stays
  // source-agnostic via the merged catalog.
  const libraryExamples = useMemo<readonly ExampleBoard[]>(() => [], [])

  const mergedCatalog = useMemo(
    () => mergeExampleSources(exampleBoards, libraryExamples),
    [libraryExamples],
  )

  const matching = useMemo(
    () => getMatchingExamples(boardState.components, mergedCatalog),
    [boardState.components, mergedCatalog],
  )

  const builtins = useMemo(
    () => mergedCatalog.filter((ex) => ex.source.kind === "builtin"),
    [mergedCatalog],
  )

  const libraryGroups = useMemo(
    () => groupByLibrary(mergedCatalog),
    [mergedCatalog],
  )

  const hasComponents = Object.keys(boardState.components).length > 0
  const showMatching =
    hasComponents &&
    matching.length > 0 &&
    matching.length < mergedCatalog.length

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

  if (mergedCatalog.length === 0) return null

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        data-testid="example-button"
        className="flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted transition-colors"
      >
        <svg viewBox="0 0 16 16" className="size-3 fill-current">
          <path d="M2 2a1 1 0 011-1h6l4 4v8a1 1 0 01-1 1H3a1 1 0 01-1-1V2zm7 0v3h3L9 2zM5 8h6v1H5V8zm0 2h4v1H5v-1z" />
        </svg>
        Examples
        {showMatching && (
          <span className="rounded-full bg-emerald-600/60 px-1.5 text-[10px] leading-tight text-white">
            {matching.length}
          </span>
        )}
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Positioner side="bottom" sideOffset={8} align="end">
          <Popover.Popup className="z-50 flex w-72 max-h-96 flex-col overflow-hidden rounded-lg border border-border bg-card shadow-xl outline-none">
            {/* Tab header */}
            <div className="flex shrink-0 border-b border-border">
              <button
                type="button"
                onClick={() => setTab("builtin")}
                className={`flex-1 px-3 py-1.5 text-xs font-medium ${
                  tab === "builtin"
                    ? "border-b-2 border-blue-500 text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Built-in
              </button>
              <button
                type="button"
                onClick={() => setTab("library")}
                className={`flex flex-1 items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium ${
                  tab === "library"
                    ? "border-b-2 border-blue-500 text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Custom Libraries
                {libraryGroups.length > 0 && (
                  <span className="rounded-full bg-muted px-1.5 text-[10px] leading-tight text-foreground">
                    {libraryGroups.reduce((n, g) => n + g.items.length, 0)}
                  </span>
                )}
              </button>
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-y-auto p-2">
              {tab === "builtin" ? (
                <>
                  {showMatching && (
                    <section className="mb-3">
                      <SectionHeader>Matching your board</SectionHeader>
                      <ExampleList examples={matching} onLoad={handleLoad} />
                    </section>
                  )}
                  <section>
                    <SectionHeader>All scripts</SectionHeader>
                    <GroupedList examples={builtins} onLoad={handleLoad} />
                  </section>
                </>
              ) : libraryGroups.length === 0 ? (
                <EmptyLibraryState />
              ) : (
                libraryGroups.map(({ libraryName, items }) => (
                  <section key={libraryName} className="mb-3 last:mb-0">
                    <SectionHeader
                      leading={<Package className="size-3 shrink-0 text-sky-400" />}
                    >
                      {libraryName}
                    </SectionHeader>
                    <ExampleList examples={items} onLoad={handleLoad} />
                  </section>
                ))
              )}
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}

// ── Subcomponents ────────────────────────────────────────────────────

function SectionHeader({
  children,
  leading,
}: {
  children: React.ReactNode
  leading?: React.ReactNode
}) {
  return (
    <p className="mb-1 flex items-center gap-1.5 px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
      {leading}
      <span>{children}</span>
    </p>
  )
}

function EmptyLibraryState() {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
      <Package className="size-6 text-muted-foreground" />
      <p className="text-xs font-medium text-foreground">
        No library examples
      </p>
      <p className="text-[11px] leading-tight text-muted-foreground">
        Custom libraries with example sketches will appear here.
      </p>
    </div>
  )
}

function GroupedList({
  examples,
  onLoad,
}: {
  examples: readonly ExampleBoard[]
  onLoad: (ex: ExampleBoard) => void
}) {
  const groups = useMemo(() => groupByCategory(examples), [examples])

  return (
    <div className="space-y-2">
      {groups.map(({ category, items }) => (
        <div key={category}>
          <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
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
}: {
  examples: readonly ExampleBoard[]
  onLoad: (ex: ExampleBoard) => void
}) {
  return (
    <div className="space-y-0.5">
      {examples.map((ex) => (
        <ExampleRow key={ex.key} example={ex} onLoad={onLoad} />
      ))}
    </div>
  )
}

function ExampleRow({
  example,
  onLoad,
}: {
  example: ExampleBoard
  onLoad: (ex: ExampleBoard) => void
}) {
  const libraryBadge =
    example.source.kind === "library" ? example.source.libraryName : null
  return (
    <button
      type="button"
      onClick={() => onLoad(example)}
      data-testid={`example-row-${example.key}`}
      className="flex w-full items-start gap-2 rounded px-2 py-1.5 text-left transition-colors hover:bg-muted"
    >
      <div className="min-w-0 flex-1">
        <span className="block truncate text-xs font-medium text-foreground">
          {example.label}
        </span>
        <span className="block text-[11px] leading-tight text-muted-foreground">
          {example.description}
        </span>
      </div>
      {libraryBadge && (
        <span className="shrink-0 rounded border border-border/60 bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
          {libraryBadge}
        </span>
      )}
    </button>
  )
}
