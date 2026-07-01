// ── Encyclopedia Layout ────────────────────────────────────────────────
//
// Thin wrapper around <LearnLayout> for encyclopedia pages. Adds the
// prev/next footer and a SeeAlso component for cross-linking.
//
// Pages import from "@/learn/encyclopedia-layout" rather than from
// "@/learn/learn-layout" directly so they get a single consistent
// import line for every encyclopedia primitive.

import { useRouter } from "@/router"
import { ArrowLeft, ArrowRight } from "lucide-react"
import { cn } from "@/utils/classnames"
import {
  ENTRIES,
  encyclopediaPath,
  getPrevNext,
  type EncyclopediaEntry,
} from "./encyclopedia-catalog"

// Re-export shared primitives so encyclopedia pages only need one import.
export {
  LearnLayout,
  PageTitle,
  Section,
  Note,
  Warn,
  CodeBlock,
  Table,
} from "./learn-layout"
export { Schematic, Figure } from "./schematic"

// ── PrevNextFooter ─────────────────────────────────────────────────────
//
// Renders "← Previous / Next →" based on the catalog's declaration
// order. Stops at track boundaries so readers don't cross from Board
// into Programming by accident.

export function PrevNextFooter({
  entry,
}: {
  entry: EncyclopediaEntry
}) {
  const { navigate } = useRouter()
  const { prev, next } = getPrevNext(entry)

  if (!prev && !next) return null

  return (
    <div className="mt-12 flex items-stretch justify-between gap-4 border-t border-border pt-6">
      {prev ? (
        <button
          type="button"
          onClick={() => navigate(encyclopediaPath(prev))}
          className="group flex flex-1 items-center gap-3 rounded-md border border-border bg-card px-4 py-3 text-left text-sm text-foreground transition-colors hover:border-blue-500/40 hover:bg-blue-500/5 hover:text-blue-300"
        >
          <ArrowLeft className="size-4 flex-shrink-0 group-hover:-translate-x-0.5 transition-transform" />
          <span className="flex flex-col items-start">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Previous
            </span>
            <span className="font-medium leading-tight">{prev.title}</span>
          </span>
        </button>
      ) : (
        <div className="flex-1" />
      )}
      {next ? (
        <button
          type="button"
          onClick={() => navigate(encyclopediaPath(next))}
          className="group flex flex-1 items-center justify-end gap-3 rounded-md border border-border bg-card px-4 py-3 text-right text-sm text-foreground transition-colors hover:border-blue-500/40 hover:bg-blue-500/5 hover:text-blue-300"
        >
          <span className="flex flex-col items-end">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Next
            </span>
            <span className="font-medium leading-tight">{next.title}</span>
          </span>
          <ArrowRight className="size-4 flex-shrink-0 group-hover:translate-x-0.5 transition-transform" />
        </button>
      ) : (
        <div className="flex-1" />
      )}
    </div>
  )
}

// ── SeeAlso ────────────────────────────────────────────────────────────
//
// Hand-curated list of related encyclopedia entries at the bottom of a
// page. Pass an array of "track/slug" keys:
//
//   <SeeAlso refs={[
//     "electronics/ohms-law",
//     "programming/digital-io",
//   ]} />
//
// Unknown refs are silently dropped (keeps pages from crashing when
// cross-links land before their target pages).

type SeeAlsoRef = `${EncyclopediaEntry["track"]}/${string}`

export function SeeAlso({ refs }: { refs: readonly SeeAlsoRef[] }) {
  const { navigate } = useRouter()

  const resolved = refs
    .map((ref) => {
      const [track, slug] = ref.split("/")
      return ENTRIES.find(
        (e) => e.track === track && e.slug === slug && e.status !== "planned",
      )
    })
    .filter((e): e is EncyclopediaEntry => e != null)

  if (resolved.length === 0) return null

  return (
    <aside className="mt-10 rounded-md border border-border bg-card p-4">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        See also
      </p>
      <ul className="space-y-1">
        {resolved.map((entry) => (
          <li key={entry.track + "/" + entry.slug}>
            <button
              type="button"
              onClick={() => navigate(encyclopediaPath(entry))}
              className={cn(
                "w-full text-left text-sm text-foreground hover:text-blue-300 transition-colors",
              )}
            >
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground mr-2">
                {entry.track}
              </span>
              {entry.title}
            </button>
          </li>
        ))}
      </ul>
    </aside>
  )
}
