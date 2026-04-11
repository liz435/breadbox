// ── Learn Layout ────────────────────────────────────────────────────────
//
// Two-column layout for /learn pages: fully-expanded tree sidebar on the
// left, content (prose + interactive embeds or encyclopedia pages) on
// the right. Reuses the primitive components (<Section>, <CodeBlock>,
// <Note>, <PageTitle>, <Badge>) from docs-layout.tsx so every author
// has one vocabulary.
//
// Sidebar structure (everything always visible — no accordions):
//
//   LESSONS                             ← track header
//       1 · Blink an LED
//       2 · Read a Button
//       …
//
//   ARDUINO UNO REFERENCE               ← track header
//     The board                         ← group subheader
//         Board anatomy
//         Powering the Arduino
//     Pins & I/O                        ← group subheader
//         Digital pins
//         …
//
//   ARDUINO PROGRAMMING
//     …
//
// Readers can scan the whole topic tree at a glance; the active page
// highlights in its track color so "where am I" is obvious.

import { useEffect, useState, type ReactNode } from "react"
import { useRouter } from "@/router"
import { cn } from "@/utils/classnames"
import { GraduationCap, ChevronLeft, ArrowRight, Search } from "lucide-react"
import {
  buildSidebarTracks,
  encyclopediaPath,
  TRACKS,
  type EncyclopediaEntry,
  type TrackMeta,
} from "./encyclopedia-catalog"
import { LearnCommandPalette } from "./learn-command-palette"

// Re-export shared primitives from docs-layout so lesson files only need
// to import from "@/learn/learn-layout".
export { Section, CodeBlock, Note, Warn, Badge, PageTitle, Table } from "@/docs/docs-layout"

// ── Lesson catalog ──────────────────────────────────────────────────────

export type LessonMeta = {
  /** URL path relative to /learn */
  slug: string
  /** Catalog key matching packages/app/src/learn/boards/<key>.json */
  board: string
  /** Human-readable lesson title */
  title: string
  /** One-line summary for the sidebar */
  summary: string
}

export const LESSONS: readonly LessonMeta[] = [
  {
    slug: "blink-led",
    board: "01-blink-led",
    title: "Blink an LED",
    summary: "Your first circuit — turn an LED on and off.",
  },
  {
    slug: "button-led",
    board: "02-button-led",
    title: "Read a Button",
    summary: "Light an LED when a button is pressed.",
  },
  {
    slug: "fade-led",
    board: "03-fade-led",
    title: "Fade an LED (PWM)",
    summary: "Smoothly dim an LED using analogWrite().",
  },
]

export function getLessonIndex(slug: string): number {
  return LESSONS.findIndex((l) => l.slug === slug)
}

export function getNextLesson(slug: string): LessonMeta | null {
  const i = getLessonIndex(slug)
  if (i === -1 || i >= LESSONS.length - 1) return null
  return LESSONS[i + 1]
}

// ── Sidebar ─────────────────────────────────────────────────────────────
//
// Fully-expanded tree. No accordions, no localStorage, no hidden state.
// Readers see the whole topic map at once, and the active page scrolls
// itself into view on navigation.

function Sidebar() {
  const { path } = useRouter()
  const sidebarTracks = buildSidebarTracks()

  // Scroll the active link into view whenever the URL changes so readers
  // don't lose their place when jumping deep into a track.
  useEffect(() => {
    const active = document.querySelector<HTMLElement>(
      "[data-learn-sidebar-active='true']",
    )
    if (active) {
      active.scrollIntoView({ block: "nearest", behavior: "auto" })
    }
  }, [path])

  return (
    <aside className="w-72 flex-shrink-0 border-r border-[#2a2a2a] bg-[#0d0d0d] flex flex-col">
      <SidebarHeader />

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {/* Lessons track */}
        <section className="mb-6">
          <TrackHeader
            icon={<GraduationCap className="size-3.5" />}
            accent="text-emerald-300"
            title="Lessons"
          />
          <div className="mt-2 space-y-0.5">
            {LESSONS.map((lesson, i) => (
              <LessonLink
                key={lesson.slug}
                lesson={lesson}
                index={i}
                currentPath={path}
              />
            ))}
          </div>
        </section>

        {/* Three encyclopedia tracks */}
        {sidebarTracks.map(({ track, groups }) => (
          <section key={track.id} className="mb-6">
            <TrackHeader accent={track.accentText} title={track.title} />
            {groups.length === 0 ? (
              <p className="mt-2 px-2 py-1 text-[11px] italic text-gray-600">
                No pages published yet.
              </p>
            ) : (
              <div className="mt-2 space-y-3">
                {groups.map(({ group, items }) => (
                  <div key={group}>
                    <GroupHeader title={group} />
                    <div className="mt-1 space-y-0.5">
                      {items.map((entry) => (
                        <EntryLink
                          key={entry.slug}
                          entry={entry}
                          track={track}
                          currentPath={path}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        ))}
      </nav>
    </aside>
  )
}

function SidebarHeader() {
  const { navigate } = useRouter()
  return (
    <div className="flex items-center gap-2 px-4 py-3 border-b border-[#2a2a2a]">
      <GraduationCap className="size-4 text-emerald-400 flex-shrink-0" />
      <span className="text-sm font-semibold text-gray-200">Learn</span>
      <button
        type="button"
        onClick={() => navigate("/editor")}
        className="ml-auto text-gray-500 hover:text-gray-300 transition-colors"
        title="Back to editor"
      >
        <ChevronLeft className="size-4" />
      </button>
    </div>
  )
}

// ── Sidebar row components ──────────────────────────────────────────────

function TrackHeader({
  icon,
  accent,
  title,
}: {
  icon?: ReactNode
  accent: string
  title: string
}) {
  return (
    <div className="flex items-center gap-2 px-2 pb-1 border-b border-[#1f1f1f]">
      {icon && <span className={accent}>{icon}</span>}
      <h2
        className={cn(
          "text-[11px] font-bold uppercase tracking-[0.12em]",
          accent,
        )}
      >
        {title}
      </h2>
    </div>
  )
}

function GroupHeader({ title }: { title: string }) {
  return (
    <h3 className="px-2 pt-1 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
      {title}
    </h3>
  )
}

function LessonLink({
  lesson,
  index,
  currentPath,
}: {
  lesson: LessonMeta
  index: number
  currentPath: string
}) {
  const { navigate } = useRouter()
  const lessonPath = `/learn/${lesson.slug}`
  const isActive = currentPath === lessonPath
  return (
    <button
      type="button"
      onClick={() => navigate(lessonPath)}
      data-learn-sidebar-active={isActive || undefined}
      className={cn(
        "w-full text-left pl-2 pr-2 py-1.5 rounded text-sm transition-colors flex items-start gap-2 border-l-2",
        isActive
          ? "border-emerald-400 bg-emerald-500/10 text-emerald-200"
          : "border-transparent text-gray-400 hover:text-gray-200 hover:bg-white/5",
      )}
      title={lesson.summary}
    >
      <span
        className={cn(
          "flex h-5 w-5 flex-shrink-0 items-center justify-center rounded text-[10px] font-bold",
          isActive ? "bg-emerald-500 text-white" : "bg-[#1a1a1a] text-gray-500",
        )}
      >
        {index + 1}
      </span>
      <span className="leading-tight">{lesson.title}</span>
    </button>
  )
}

function EntryLink({
  entry,
  track,
  currentPath,
}: {
  entry: EncyclopediaEntry
  track: TrackMeta
  currentPath: string
}) {
  const { navigate } = useRouter()
  const href = encyclopediaPath(entry)
  const isActive = currentPath === href
  return (
    <button
      type="button"
      onClick={() => navigate(href)}
      data-learn-sidebar-active={isActive || undefined}
      className={cn(
        "w-full text-left pl-3 pr-2 py-1 rounded text-[13px] leading-tight transition-colors border-l-2",
        isActive
          ? cn(track.accentBorder, track.accentBg, track.accentText)
          : "border-transparent text-gray-400 hover:text-gray-200 hover:bg-white/5",
      )}
      title={entry.summary}
    >
      {entry.title}
    </button>
  )
}

// Exported for other files that care about the TRACKS list (future use).
export { TRACKS }

// ── Main layout ─────────────────────────────────────────────────────────

export function LearnLayout({ children }: { children: ReactNode }) {
  const [paletteOpen, setPaletteOpen] = useState(false)

  // Cmd+K / Ctrl+K toggles the learn-scoped command palette. This
  // handler only fires while a /learn page is mounted; navigating back
  // to the editor unmounts LearnLayout and the listener cleans up.
  //
  // Meta+K is NOT suppressed inside form inputs the way `?` is,
  // because Cmd+K is a modifier combo and doesn't conflict with
  // typing — the reader expects it to open the palette even mid-input.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault()
        setPaletteOpen((prev) => !prev)
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [])

  return (
    <div className="flex h-full w-full bg-[#0f0f0f] text-gray-300 overflow-hidden">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <LearnTopBar onOpenPalette={() => setPaletteOpen(true)} />
        <main className="flex-1 overflow-y-auto px-8 py-8">{children}</main>
      </div>
      <LearnCommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
      />
    </div>
  )
}

// ── Top bar ────────────────────────────────────────────────────────────
//
// Sits above the main content area (not above the sidebar) and hosts
// the click-to-search trigger. The trigger is styled like a search
// input but is really a button that opens the command palette — the
// palette owns the actual input, so there's only one input to reason
// about and Cmd+K behavior stays consistent.

function LearnTopBar({ onOpenPalette }: { onOpenPalette: () => void }) {
  const isMac =
    typeof navigator !== "undefined" &&
    /Mac|iPhone|iPad|iPod/.test(navigator.platform)
  const modKey = isMac ? "⌘" : "Ctrl"

  return (
    <header className="flex items-center justify-end border-b border-[#2a2a2a] bg-[#0d0d0d] px-6 py-2.5">
      <button
        type="button"
        onClick={onOpenPalette}
        className="group flex w-full max-w-md items-center gap-2 rounded-md border border-[#2a2a2a] bg-[#141414] px-3 py-1.5 text-left text-sm text-gray-500 transition-colors hover:border-[#3a3a3a] hover:bg-[#1a1a1a] hover:text-gray-300"
        aria-label="Search the learn section"
      >
        <Search className="size-3.5 flex-shrink-0" />
        <span className="flex-1 truncate">Search lessons, topics, terms…</span>
        <kbd className="flex items-center gap-0.5 rounded border border-[#2a2a2a] bg-[#0d0d0d] px-1.5 py-0.5 text-[10px] font-medium text-gray-400 group-hover:border-[#3a3a3a]">
          <span>{modKey}</span>
          <span>K</span>
        </kbd>
      </button>
    </header>
  )
}

// ── Lesson footer (next link) ──────────────────────────────────────────

export function LessonFooter({ currentSlug }: { currentSlug: string }) {
  const { navigate } = useRouter()
  const next = getNextLesson(currentSlug)

  if (!next) {
    return (
      <div className="mt-12 pt-6 border-t border-[#2a2a2a]">
        <p className="text-sm text-gray-500">
          You've finished all the lessons. Head to the{" "}
          <button
            type="button"
            onClick={() => navigate("/editor")}
            className="text-emerald-400 hover:underline"
          >
            editor
          </button>{" "}
          to build your own circuits.
        </p>
      </div>
    )
  }

  return (
    <div className="mt-12 pt-6 border-t border-[#2a2a2a]">
      <button
        type="button"
        onClick={() => navigate(`/learn/${next.slug}`)}
        className="group inline-flex items-center gap-2 rounded-md border border-[#2a2a2a] bg-[#141414] px-4 py-2 text-sm text-gray-300 hover:border-emerald-500/40 hover:bg-emerald-500/5 hover:text-emerald-300 transition-colors"
      >
        <span className="flex flex-col items-start">
          <span className="text-[10px] uppercase tracking-wider text-gray-500">Next</span>
          <span className="font-medium">{next.title}</span>
        </span>
        <ArrowRight className="size-4 group-hover:translate-x-0.5 transition-transform" />
      </button>
    </div>
  )
}
