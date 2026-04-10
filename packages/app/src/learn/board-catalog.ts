// ── Board Catalog ───────────────────────────────────────────────────────
//
// Each lesson has a pre-built board stored as a JSON file under
// ./boards/<key>.json. Files are picked up at build time via
// import.meta.glob so adding a new lesson is literally "drop a JSON file."
//
// JSON shape: matches BoardState from @dreamer/schemas. The quickest way
// to author one is to build the circuit in /editor, open the project file
// under packages/api/data/projects/, copy the "boardState" object, and
// save it as a new file here.

import type { BoardState } from "@dreamer/schemas"

// Eager glob so the catalog is fully populated at module init.
const modules = import.meta.glob("./boards/*.json", {
  eager: true,
  import: "default",
}) as Record<string, BoardState>

/** Map of board key → BoardState. Key is the filename without extension. */
export const boardCatalog: Record<string, BoardState> = Object.fromEntries(
  Object.entries(modules).map(([path, state]) => {
    const match = path.match(/([^/]+)\.json$/)
    if (!match) throw new Error(`Invalid board catalog path: ${path}`)
    return [match[1], state]
  }),
)

/** List of all known board keys, sorted alphabetically (01-, 02-, …). */
export const boardCatalogKeys: string[] = Object.keys(boardCatalog).sort()
