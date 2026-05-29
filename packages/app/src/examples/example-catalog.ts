// ── Example Board Catalog ──────────────────────────────────────────────
//
// Auto-globs every JSON file under ./boards/ and enriches it with
// metadata (label, description, primary component type) so the toolbar
// can display a contextual "Examples" popover.
//
// To add an example:
//   1. Drop a valid BoardState JSON into ./boards/ex-<type>.json.
//   2. Add a matching entry in EXAMPLE_META below.
//   3. The new example appears in the toolbar automatically.

import type { BoardState, BoardComponent, ComponentType } from "@dreamer/schemas"
import { EXAMPLE_META as EXAMPLE_META_TABLE } from "./example-meta"
import type { ExampleMeta as ExternalExampleMeta, ExpectedBehavior as ExternalExpectedBehavior } from "./example-meta"

// Re-export so existing imports of these types from example-catalog still work.
export type ExpectedBehavior = ExternalExpectedBehavior
export type ExampleMeta = ExternalExampleMeta

// Eager glob — same pattern as learn/board-catalog.ts
const modules = import.meta.glob("./boards/*.json", {
  eager: true,
  import: "default",
}) as Record<string, BoardState>


// ── Resolved examples ─────────────────────────────────────────────────

export type ExampleSource =
  | { kind: "builtin" }
  | { kind: "library"; libraryName: string }

export type ExampleBoard = ExampleMeta & {
  key: string
  state: BoardState
  componentTypes: ComponentType[]
  source: ExampleSource
}

function buildCatalog(): ExampleBoard[] {
  const result: ExampleBoard[] = []
  for (const [path, state] of Object.entries(modules)) {
    const match = path.match(/([^/]+)\.json$/)
    if (!match) continue
    const key = match[1]
    const meta = EXAMPLE_META_TABLE[key]
    if (!meta) continue

    const componentTypes = [
      ...new Set(
        Object.values(state.components).map(
          (c: BoardComponent) => c.type,
        ),
      ),
    ] as ComponentType[]
    result.push({
      ...meta,
      key,
      state,
      componentTypes,
      source: { kind: "builtin" },
    })
  }
  return result.sort((a, b) => a.label.localeCompare(b.label))
}

export const exampleBoards: readonly ExampleBoard[] = buildCatalog()

/**
 * Combine built-in and library-sourced examples into a single catalog.
 * Library-example keys are namespaced so they can't collide with
 * built-in keys even if a library author picks the same slug.
 */
export function mergeExampleSources(
  builtins: readonly ExampleBoard[],
  libraryExamples: readonly ExampleBoard[],
): ExampleBoard[] {
  const namespacedLib = libraryExamples.map((ex) =>
    ex.source.kind === "library" && !ex.key.startsWith("lib:")
      ? { ...ex, key: `lib:${ex.source.libraryName}:${ex.key}` }
      : ex,
  )
  return [...builtins, ...namespacedLib].sort((a, b) =>
    a.label.localeCompare(b.label),
  )
}

/**
 * Return examples whose primary component type appears among the
 * components currently on the board. If the board is empty, returns
 * all examples from the given catalog.
 */
export function getMatchingExamples(
  components: Record<string, BoardComponent>,
  catalog: readonly ExampleBoard[] = exampleBoards,
): ExampleBoard[] {
  const types = new Set(Object.values(components).map((c) => c.type))
  if (types.size === 0) return [...catalog]
  return catalog.filter((ex) => types.has(ex.primaryType))
}

/** Group examples by category for display. */
export function groupByCategory(
  examples: readonly ExampleBoard[],
): { category: string; items: ExampleBoard[] }[] {
  const order = ["output", "input", "display", "passive", "other"]
  const labels: Record<string, string> = {
    output: "Output",
    input: "Input",
    display: "Display",
    passive: "Passive",
    other: "Other",
  }
  const map = new Map<string, ExampleBoard[]>()
  for (const ex of examples) {
    const list = map.get(ex.category) ?? []
    list.push(ex)
    map.set(ex.category, list)
  }
  return order
    .filter((cat) => map.has(cat))
    .map((cat) => ({ category: labels[cat] ?? cat, items: map.get(cat)! }))
}

/**
 * Group library-sourced examples by library name, alphabetically.
 * Built-in examples are filtered out.
 */
export function groupByLibrary(
  examples: readonly ExampleBoard[],
): { libraryName: string; items: ExampleBoard[] }[] {
  const map = new Map<string, ExampleBoard[]>()
  for (const ex of examples) {
    if (ex.source.kind !== "library") continue
    const list = map.get(ex.source.libraryName) ?? []
    list.push(ex)
    map.set(ex.source.libraryName, list)
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([libraryName, items]) => ({
      libraryName,
      items: items.sort((a, b) => a.label.localeCompare(b.label)),
    }))
}
