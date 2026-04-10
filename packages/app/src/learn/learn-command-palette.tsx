// ── Learn Command Palette (Cmd+K) ──────────────────────────────────────
//
// Scoped Cmd+K palette for the /learn section. Mirrors the editor's
// command palette in look and keyboard semantics, but the command list
// is scoped to things a reader actually wants to jump to:
//
//   - Lessons (3)
//   - Encyclopedia pages (all published entries across every track)
//   - Glossary terms (each jumps to its canonical encyclopedia page)
//   - A handful of global actions: Back to editor, toggle planned entries
//
// Why a separate palette instead of sharing the editor's:
//   The editor's palette imports breadboardInteractionActor, dockviewApi,
//   and simulationRef — all things that only exist inside AppInner. The
//   learn section doesn't mount AppInner, so reusing would require
//   optional-ifying a dozen editor-only stores. Easier to have two
//   small, focused palettes.
//
// Mounted from <LearnLayout>, so every learn page gets Cmd+K for free
// and the keyboard handler dies cleanly when the reader navigates back
// to the editor.

import React, {
  useState,
  useMemo,
  useRef,
  useEffect,
  useCallback,
  type ReactNode,
} from "react"
import { useRouter } from "@/router"
import { BookOpen, FileText, Lightbulb, Compass } from "lucide-react"
import { LESSONS } from "./learn-layout"
import {
  ENTRIES,
  TRACKS,
  encyclopediaPath,
  type EncyclopediaEntry,
} from "./encyclopedia-catalog"
import { GLOSSARY, type GlossaryEntry, type GlossaryKey } from "./glossary"

// ── Command types ──────────────────────────────────────────────────────

type Command = {
  id: string
  label: string
  description?: string
  category: string
  icon: ReactNode
  action: () => void
  /** Extra text matched by fuzzy search but not shown in the row. */
  keywords?: string
}

// ── Icons ──────────────────────────────────────────────────────────────

const ICONS = {
  lesson: <Lightbulb className="size-3.5 text-emerald-400" />,
  board: <Compass className="size-3.5 text-blue-400" />,
  programming: <BookOpen className="size-3.5 text-purple-400" />,
  electronics: <BookOpen className="size-3.5 text-amber-400" />,
  glossary: <FileText className="size-3.5 text-gray-400" />,
  action: (
    <svg
      viewBox="0 0 16 16"
      width={14}
      height={14}
      className="text-neutral-400"
    >
      <polygon
        points="8,1 15,6 12,15 4,15 1,6"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
      />
    </svg>
  ),
}

function trackIcon(track: EncyclopediaEntry["track"]) {
  switch (track) {
    case "board":
      return ICONS.board
    case "programming":
      return ICONS.programming
    case "electronics":
      return ICONS.electronics
  }
}

function trackLabel(track: EncyclopediaEntry["track"]) {
  return TRACKS.find((t) => t.id === track)?.title ?? track
}

// ── Build command list ─────────────────────────────────────────────────

function buildCommands(navigate: (to: string) => void): Command[] {
  const commands: Command[] = []

  // Lessons
  for (const lesson of LESSONS) {
    commands.push({
      id: `lesson:${lesson.slug}`,
      label: lesson.title,
      description: lesson.summary,
      category: "Lessons",
      icon: ICONS.lesson,
      keywords: `lesson tutorial ${lesson.slug}`,
      action: () => navigate(`/learn/${lesson.slug}`),
    })
  }

  // Encyclopedia entries — every published page, grouped by track for
  // display. We deliberately skip planned entries: the reader shouldn't
  // be able to "navigate" to a placeholder via search, since the point
  // of the palette is a fast jump to real content.
  for (const entry of ENTRIES) {
    if (entry.status !== "published") continue
    commands.push({
      id: `ref:${entry.track}/${entry.slug}`,
      label: entry.title,
      description: entry.summary,
      category: trackLabel(entry.track),
      icon: trackIcon(entry.track),
      keywords: `${entry.track} reference ${entry.group} ${entry.slug}`,
      action: () => navigate(encyclopediaPath(entry)),
    })
  }

  // Glossary terms — jump to the canonical encyclopedia page if the
  // term has an `href`. Skip terms without a destination: they're
  // popover-only and a Cmd+K jump wouldn't do anything useful.
  //
  // The cast to the wider GlossaryEntry type is deliberate. The
  // `as const satisfies` in glossary.ts keeps per-entry types narrow
  // (which is great for <Term k="…">), but inside a generic loop we
  // need the base type so the optional `href` field is actually
  // optional, not missing-on-some-variants.
  for (const key of Object.keys(GLOSSARY) as GlossaryKey[]) {
    const entry: GlossaryEntry = GLOSSARY[key]
    if (!entry.href) continue
    const href = entry.href
    commands.push({
      id: `term:${key}`,
      label: entry.label,
      description: entry.blurb,
      category: "Glossary",
      icon: ICONS.glossary,
      keywords: `glossary term ${key}`,
      action: () => navigate(href),
    })
  }

  // Actions
  commands.push({
    id: "action:editor",
    label: "Back to editor",
    description: "Leave the learn section and open the main editor.",
    category: "Actions",
    icon: ICONS.action,
    keywords: "back editor exit close",
    action: () => navigate("/editor"),
  })

  return commands
}

// ── Fuzzy match ────────────────────────────────────────────────────────
//
// Same scoring as the editor's command palette so the two feel
// identical to muscle memory. Kept inline (not shared) because the
// editor palette isn't exported as a library and extracting a
// single scoring function into a shared util would create a
// third file for ~20 lines of code.

function matchScore(query: string, command: Command): number {
  const q = query.toLowerCase()
  const label = command.label.toLowerCase()
  const desc = (command.description ?? "").toLowerCase()
  const keys = (command.keywords ?? "").toLowerCase()

  if (label === q) return 100
  if (label.startsWith(q)) return 80
  if (label.includes(q)) return 60
  if (desc.includes(q)) return 40
  if (keys.includes(q)) return 30
  const all = `${label} ${desc} ${keys}`
  const words = q.split(/\s+/)
  if (words.every((w) => all.includes(w))) return 20
  return 0
}

// ── Component ──────────────────────────────────────────────────────────

type LearnCommandPaletteProps = {
  open: boolean
  onClose: () => void
}

function LearnCommandPaletteInner({ open, onClose }: LearnCommandPaletteProps) {
  const { navigate } = useRouter()
  const [query, setQuery] = useState("")
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const commands = useMemo(() => buildCommands(navigate), [navigate])

  const results = useMemo(() => {
    if (!query.trim()) return commands
    return commands
      .map((cmd) => ({ cmd, score: matchScore(query, cmd) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((r) => r.cmd)
  }, [query, commands])

  // Reset on open
  useEffect(() => {
    if (open) {
      setQuery("")
      setSelectedIndex(0)
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  // Scroll selected item into view
  useEffect(() => {
    const list = listRef.current
    if (!list) return
    const item = list.querySelector<HTMLElement>(
      `[data-cmd-index="${selectedIndex}"]`,
    )
    item?.scrollIntoView({ block: "nearest" })
  }, [selectedIndex])

  const executeCommand = useCallback(
    (cmd: Command) => {
      onClose()
      // Delay action so the dialog closes first — prevents a flash where
      // the palette re-renders against the new route.
      requestAnimationFrame(() => cmd.action())
    },
    [onClose],
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault()
          setSelectedIndex((i) => Math.min(i + 1, results.length - 1))
          break
        case "ArrowUp":
          e.preventDefault()
          setSelectedIndex((i) => Math.max(i - 1, 0))
          break
        case "Enter":
          e.preventDefault()
          if (results[selectedIndex]) executeCommand(results[selectedIndex])
          break
        case "Escape":
          e.preventDefault()
          onClose()
          break
      }
    },
    [results, selectedIndex, executeCommand, onClose],
  )

  // Clamp index when results change
  useEffect(() => {
    setSelectedIndex((i) => Math.min(i, Math.max(0, results.length - 1)))
  }, [results])

  if (!open) return null

  // Group results by category for display, preserving the flat-order
  // index so arrow keys still walk top-to-bottom across groups.
  const grouped: Array<{
    category: string
    items: Array<{ cmd: Command; index: number }>
  }> = []
  const catMap = new Map<string, Array<{ cmd: Command; index: number }>>()
  results.forEach((cmd, index) => {
    if (!catMap.has(cmd.category)) catMap.set(cmd.category, [])
    catMap.get(cmd.category)!.push({ cmd, index })
  })
  for (const [category, items] of catMap) {
    grouped.push({ category, items })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" />

      {/* Palette */}
      <div
        className="relative w-full max-w-lg overflow-hidden rounded-xl border border-neutral-700 bg-neutral-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Input */}
        <div className="flex items-center gap-2 border-b border-neutral-700 px-4 py-3">
          <svg
            viewBox="0 0 16 16"
            width={16}
            height={16}
            className="flex-shrink-0 text-neutral-500"
          >
            <circle
              cx={7}
              cy={7}
              r={5}
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
            />
            <line
              x1={11}
              y1={11}
              x2={14}
              y2={14}
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinecap="round"
            />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search lessons, reference pages, and terms..."
            className="flex-1 bg-transparent text-sm text-neutral-200 placeholder:text-neutral-500 outline-none"
          />
          <kbd className="rounded border border-neutral-600 bg-neutral-800 px-1.5 py-0.5 text-[10px] text-neutral-400">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[50vh] overflow-y-auto py-1">
          {results.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-neutral-500">
              No results for &quot;{query}&quot;
            </p>
          )}
          {grouped.map(({ category, items }) => (
            <div key={category}>
              <div className="px-4 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
                {category}
              </div>
              {items.map(({ cmd, index }) => (
                <button
                  key={cmd.id}
                  type="button"
                  data-cmd-index={index}
                  className={`flex w-full items-center gap-3 px-4 py-2 text-left text-sm ${
                    index === selectedIndex
                      ? "bg-emerald-600/20 text-emerald-200"
                      : "text-neutral-300 hover:bg-neutral-800"
                  }`}
                  onMouseEnter={() => setSelectedIndex(index)}
                  onClick={() => executeCommand(cmd)}
                >
                  <span className="flex-shrink-0">{cmd.icon}</span>
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate">{cmd.label}</span>
                    {cmd.description && (
                      <span className="truncate text-xs text-neutral-500">
                        {cmd.description}
                      </span>
                    )}
                  </span>
                </button>
              ))}
            </div>
          ))}
        </div>

        {/* Footer hint */}
        <div className="flex items-center gap-3 border-t border-neutral-700 px-4 py-2 text-[10px] text-neutral-500">
          <span>
            <kbd className="rounded border border-neutral-600 bg-neutral-800 px-1 py-0.5">
              ↑↓
            </kbd>{" "}
            navigate
          </span>
          <span>
            <kbd className="rounded border border-neutral-600 bg-neutral-800 px-1 py-0.5">
              ↵
            </kbd>{" "}
            select
          </span>
          <span>
            <kbd className="rounded border border-neutral-600 bg-neutral-800 px-1 py-0.5">
              esc
            </kbd>{" "}
            close
          </span>
        </div>
      </div>
    </div>
  )
}

export const LearnCommandPalette = React.memo(LearnCommandPaletteInner)
