// ── Learn Layout ────────────────────────────────────────────────────────
//
// Two-column layout for /learn pages: lesson nav on the left, content
// (prose + interactive embeds) on the right. Reuses the primitive
// components (<Section>, <CodeBlock>, <Note>, <PageTitle>, <Badge>) from
// docs-layout.tsx so lesson authors have one vocabulary.

import type { ReactNode } from "react"
import { useRouter } from "@/router"
import { cn } from "@/utils/classnames"
import { GraduationCap, ChevronLeft, ArrowRight } from "lucide-react"

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

function Sidebar() {
  const { path, navigate } = useRouter()

  return (
    <aside className="w-60 flex-shrink-0 border-r border-[#2a2a2a] bg-[#0d0d0d] flex flex-col">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-[#2a2a2a]">
        <GraduationCap className="size-4 text-emerald-400 flex-shrink-0" />
        <span className="text-sm font-semibold text-gray-200">Learn</span>
        <button
          onClick={() => navigate("/editor")}
          className="ml-auto text-gray-500 hover:text-gray-300 transition-colors"
          title="Back to editor"
        >
          <ChevronLeft className="size-4" />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
        <p className="px-2 mb-2 text-xs font-medium text-gray-500 uppercase tracking-wider">
          Lessons
        </p>
        {LESSONS.map((lesson, i) => {
          const lessonPath = `/learn/${lesson.slug}`
          const isActive = path === lessonPath
          return (
            <button
              key={lesson.slug}
              onClick={() => navigate(lessonPath)}
              className={cn(
                "w-full text-left px-2 py-1.5 rounded text-sm transition-colors flex items-start gap-2",
                isActive
                  ? "bg-emerald-500/10 text-emerald-300"
                  : "text-gray-400 hover:text-gray-200 hover:bg-white/5",
              )}
            >
              <span
                className={cn(
                  "flex h-5 w-5 flex-shrink-0 items-center justify-center rounded text-[10px] font-bold",
                  isActive ? "bg-emerald-500 text-white" : "bg-[#1a1a1a] text-gray-500",
                )}
              >
                {i + 1}
              </span>
              <span className="leading-tight">{lesson.title}</span>
            </button>
          )
        })}
      </nav>
    </aside>
  )
}

// ── Main layout ─────────────────────────────────────────────────────────

export function LearnLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full w-full bg-[#0f0f0f] text-gray-300 overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto px-8 py-8 max-w-4xl">
        {children}
      </main>
    </div>
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
