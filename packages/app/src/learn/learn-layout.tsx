// ── Learn Layout ────────────────────────────────────────────────────────
//
// Two-column layout for /learn pages: collapsible tree sidebar on the
// left, content (prose + interactive embeds or encyclopedia pages) on
// the right. Reuses the primitive components (<Section>, <CodeBlock>,
// <Note>, <PageTitle>, <Badge>) from docs-layout.tsx so every author
// has one vocabulary.
//
// Sidebar structure — every track and every group is collapsible.
// State is persisted to localStorage; the section containing the
// currently active page is forced-open so navigation never hides the
// reader's page.
//
//   LESSONS                             ← track header (click to collapse)
//       1 · Blink an LED
//       2 · Read a Button
//       …
//
//   ARDUINO UNO REFERENCE               ← track header
//     The board                         ← group subheader (click to collapse)
//         Board anatomy
//         Powering the Arduino
//     Pins & I/O
//         Digital pins
//         …
//
//   ARDUINO PROGRAMMING
//     …

import { useCallback, useEffect, useState, type ReactNode } from "react"
import { useRouter } from "@/router"
import { cn } from "@/utils/classnames"
import {
  GraduationCap,
  ChevronLeft,
  ChevronDown,
  ArrowRight,
  Search,
} from "lucide-react"
import {
  buildSidebarTracks,
  encyclopediaPath,
  type EncyclopediaEntry,
  type SidebarTrack,
  type TrackMeta,
} from "./encyclopedia-catalog"
import { LearnCommandPalette } from "./learn-command-palette"

// Re-export shared primitives from docs-layout so lesson files only need
// to import from "@/learn/learn-layout".
export { Section, CodeBlock, Note, Warn, PageTitle, Table } from "@/docs/docs-layout"

// ── Difficulty badge ─────────────────────────────────────────────────────
//
// A compact pill label rendered in two contexts:
//   1. Sidebar — next to each lesson title, right-aligned.
//   2. Lesson page — directly under <PageTitle>, before the first <Section>.
//
// Usage on a lesson page:
//   import { DifficultyBadge } from "@/learn/learn-layout"
//   <DifficultyBadge difficulty="beginner" />

const DIFFICULTY_STYLES: Record<Difficulty, string> = {
  beginner: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  intermediate: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  advanced: "bg-rose-500/15 text-rose-300 border-rose-500/30",
}

const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
}

export function DifficultyBadge({ difficulty }: { difficulty: Difficulty }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
        DIFFICULTY_STYLES[difficulty],
      )}
    >
      {DIFFICULTY_LABELS[difficulty]}
    </span>
  )
}

// ── Lesson catalog ──────────────────────────────────────────────────────

export type Difficulty = "beginner" | "intermediate" | "advanced"

export type LessonMeta = {
  /** URL path relative to /learn */
  slug: string
  /** Catalog key matching packages/app/src/learn/boards/<key>.json */
  board: string
  /** Human-readable lesson title */
  title: string
  /** One-line summary for the sidebar */
  summary: string
  /** Difficulty tier shown as a badge in the sidebar and on the lesson page */
  difficulty: Difficulty
}

// ── Lesson progression arc ────────────────────────────────────────────────
//
// Beginner (01–07): core digital I/O, passive components, PWM fundamentals.
//   Readers come out able to wire an LED, read a button, dim with PWM, and
//   understand resistors and capacitors.
//
// Intermediate (08–15): sensor-to-actuator patterns, analog I/O, serial
//   output, actuators with libraries. Readers learn the full input → process
//   → output loop and build intuition for datasheets.
//
// Advanced (16–22): multi-device protocols (I2C, 1-Wire, SPI, IR), power
//   electronics (relay, motor), and serial data expansion (shift register,
//   NeoPixel). Requires solid footing from the intermediate tier.

export const LESSONS: readonly LessonMeta[] = [
  // ── Beginner ─────────────────────────────────────────────────────────
  {
    slug: "blink-led",
    board: "01-blink-led",
    title: "Blink an LED",
    summary: "Your first circuit — turn an LED on and off.",
    difficulty: "beginner",
  },
  {
    slug: "button-led",
    board: "02-button-led",
    title: "Read a Button",
    summary: "Light an LED when a button is pressed.",
    difficulty: "beginner",
  },
  {
    slug: "fade-led",
    board: "03-fade-led",
    title: "Fade an LED (PWM)",
    summary: "Smoothly dim an LED using analogWrite().",
    difficulty: "beginner",
  },
  {
    slug: "rgb-led",
    board: "04-rgb-led",
    title: "RGB LED Color Cycle",
    summary: "Control red, green, and blue channels with PWM.",
    difficulty: "beginner",
  },
  {
    slug: "potentiometer",
    board: "05-potentiometer",
    title: "Control Brightness with a Pot",
    summary: "Map a potentiometer to LED brightness via analogRead.",
    difficulty: "beginner",
  },
  {
    slug: "resistor",
    board: "06-resistor",
    title: "Current Limiting with a Resistor",
    summary: "Understand why every LED needs a series resistor.",
    difficulty: "beginner",
  },
  {
    slug: "capacitor",
    board: "07-capacitor",
    title: "Capacitor Charge and Discharge",
    summary: "Watch an LED fade as a capacitor drains.",
    difficulty: "beginner",
  },
  // ── Intermediate ─────────────────────────────────────────────────────
  {
    slug: "photoresistor",
    board: "08-photoresistor",
    title: "Read a Light Sensor",
    summary: "Read ambient light with a photoresistor and Serial.",
    difficulty: "intermediate",
  },
  {
    slug: "buzzer",
    board: "09-buzzer",
    title: "Play a Melody with a Buzzer",
    summary: "Generate tones on a piezo buzzer using tone().",
    difficulty: "intermediate",
  },
  {
    slug: "servo",
    board: "10-servo",
    title: "Sweep a Servo Motor",
    summary: "Rotate a servo from 0 to 180 degrees with the Servo library.",
    difficulty: "intermediate",
  },
  {
    slug: "temperature-sensor",
    board: "11-temperature-sensor",
    title: "Read Temperature (TMP36)",
    summary: "Convert an analog voltage into degrees Celsius.",
    difficulty: "intermediate",
  },
  {
    slug: "ultrasonic-sensor",
    board: "12-ultrasonic-sensor",
    title: "Measure Distance (HC-SR04)",
    summary: "Calculate distance in cm from an ultrasonic pulse.",
    difficulty: "intermediate",
  },
  {
    slug: "pir-sensor",
    board: "13-pir-sensor",
    title: "Detect Motion with PIR",
    summary: "Trigger an LED when a passive infrared sensor fires.",
    difficulty: "intermediate",
  },
  {
    slug: "seven-segment",
    board: "14-seven-segment",
    title: "7-Segment Counter",
    summary: "Count 0–9 by driving individual segments from the sketch.",
    difficulty: "intermediate",
  },
  {
    slug: "lcd-16x2",
    board: "15-lcd-16x2",
    title: "LCD Hello World",
    summary: "Print text and a running timer on a 16x2 character LCD.",
    difficulty: "intermediate",
  },
  // ── Advanced ─────────────────────────────────────────────────────────
  {
    slug: "dht-sensor",
    board: "16-dht-sensor",
    title: "Temp and Humidity (DHT11)",
    summary: "Read a 1-Wire DHT sensor for temperature and humidity.",
    difficulty: "advanced",
  },
  {
    slug: "ir-receiver",
    board: "17-ir-receiver",
    title: "Decode IR Remote Signals",
    summary: "Capture and print hex codes from a TV remote.",
    difficulty: "advanced",
  },
  {
    slug: "relay",
    board: "18-relay",
    title: "Toggle a Relay",
    summary: "Use a relay to switch a load that Arduino pins cannot drive.",
    difficulty: "advanced",
  },
  {
    slug: "dc-motor",
    board: "19-dc-motor",
    title: "Control Motor Speed with PWM",
    summary: "Ramp a DC motor up and down using analogWrite.",
    difficulty: "advanced",
  },
  {
    slug: "shift-register",
    board: "20-shift-register",
    title: "LED Chaser with 74HC595",
    summary: "Expand outputs by shifting bits through a serial register.",
    difficulty: "advanced",
  },
  {
    slug: "neopixel",
    board: "21-neopixel",
    title: "NeoPixel Rainbow",
    summary: "Chase rainbow colors across a WS2812 LED strip.",
    difficulty: "advanced",
  },
  {
    slug: "oled-display",
    board: "22-oled-display",
    title: "OLED Hello World",
    summary: "Draw text on a 128x64 OLED display over I2C.",
    difficulty: "advanced",
  },
]

function getLessonIndex(slug: string): number {
  return LESSONS.findIndex((l) => l.slug === slug)
}

function getNextLesson(slug: string): LessonMeta | null {
  const i = getLessonIndex(slug)
  if (i === -1 || i >= LESSONS.length - 1) return null
  return LESSONS[i + 1]
}

// ── Sidebar ─────────────────────────────────────────────────────────────
//
// Collapsible tree. Each track (Lessons + the three encyclopedia tracks)
// and each group inside a track can be toggled by clicking its header.
// Collapsed keys are persisted to localStorage. When the URL changes
// we auto-expand the track/group containing the active page as a
// one-shot — the user can then collapse it again if they want, and
// the collapsed state sticks until they navigate elsewhere.

const COLLAPSED_STORAGE_KEY = "dreamer:learn:collapsed-sections"

function readCollapsed(): Set<string> {
  if (typeof window === "undefined") return new Set()
  try {
    const raw = window.localStorage.getItem(COLLAPSED_STORAGE_KEY)
    if (!raw) return new Set()
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return new Set()
    return new Set(parsed.filter((v): v is string => typeof v === "string"))
  } catch {
    return new Set()
  }
}

function writeCollapsed(collapsed: Set<string>): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(
      COLLAPSED_STORAGE_KEY,
      JSON.stringify([...collapsed]),
    )
  } catch {
    // Quota exceeded or storage disabled — collapse state simply
    // won't persist, which is fine.
  }
}

function useCollapsedSections() {
  const [collapsed, setCollapsed] = useState<Set<string>>(readCollapsed)
  const toggle = useCallback((key: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      writeCollapsed(next)
      return next
    })
  }, [])
  // Expand a batch of keys without touching anything else. Used when
  // the URL changes so the active page's containing sections become
  // visible if the user had collapsed them earlier.
  const expand = useCallback((keys: readonly (string | null)[]) => {
    setCollapsed((prev) => {
      let changed = false
      const next = new Set(prev)
      for (const key of keys) {
        if (key && next.delete(key)) changed = true
      }
      if (!changed) return prev
      writeCollapsed(next)
      return next
    })
  }, [])
  return { collapsed, toggle, expand }
}

function trackKeyFor(id: string): string {
  return `track:${id}`
}

function groupKeyFor(trackId: string, group: string): string {
  return `group:${trackId}:${group}`
}

// Map the current URL path back to the track+group it lives under so
// those sections stay expanded even when the user has collapsed them.
function resolveActiveSection(
  path: string,
  sidebarTracks: SidebarTrack[],
): { trackKey: string | null; groupKey: string | null } {
  if (LESSONS.some((l) => path === `/learn/${l.slug}`)) {
    return { trackKey: trackKeyFor("lessons"), groupKey: null }
  }
  for (const { track, groups } of sidebarTracks) {
    for (const { group, items } of groups) {
      if (items.some((entry) => encyclopediaPath(entry) === path)) {
        return {
          trackKey: trackKeyFor(track.id),
          groupKey: groupKeyFor(track.id, group),
        }
      }
    }
  }
  return { trackKey: null, groupKey: null }
}

function Sidebar() {
  const { path } = useRouter()
  const sidebarTracks = buildSidebarTracks()
  const { collapsed, toggle, expand } = useCollapsedSections()
  const active = resolveActiveSection(path, sidebarTracks)

  const isCollapsed = (key: string): boolean => collapsed.has(key)

  // On navigation, open the active track/group so the destination is
  // visible — but only as a one-shot. Once expanded, the user is free
  // to collapse it again; we won't re-open it until they navigate.
  useEffect(() => {
    expand([active.trackKey, active.groupKey])
  }, [path, active.trackKey, active.groupKey, expand])

  // Scroll the active link into view whenever the URL changes so readers
  // don't lose their place when jumping deep into a track.
  useEffect(() => {
    const el = document.querySelector<HTMLElement>(
      "[data-learn-sidebar-active='true']",
    )
    if (el) {
      el.scrollIntoView({ block: "nearest", behavior: "auto" })
    }
  }, [path])

  const lessonsKey = trackKeyFor("lessons")
  const lessonsCollapsed = isCollapsed(lessonsKey)

  return (
    <aside className="w-72 flex-shrink-0 border-r border-border bg-card flex flex-col">
      <SidebarHeader />

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {/* Lessons track */}
        <section className="mb-6">
          <TrackHeader
            icon={<GraduationCap className="size-3.5" />}
            accent="text-emerald-300"
            title="Lessons"
            isCollapsed={lessonsCollapsed}
            onToggle={() => toggle(lessonsKey)}
          />
          {!lessonsCollapsed && (
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
          )}
        </section>

        {/* Three encyclopedia tracks */}
        {sidebarTracks.map(({ track, groups }) => {
          const tKey = trackKeyFor(track.id)
          const tCollapsed = isCollapsed(tKey)
          return (
            <section key={track.id} className="mb-6">
              <TrackHeader
                accent={track.accentText}
                title={track.title}
                isCollapsed={tCollapsed}
                onToggle={() => toggle(tKey)}
              />
              {!tCollapsed &&
                (groups.length === 0 ? (
                  <p className="mt-2 px-2 py-1 text-[11px] italic text-muted-foreground/70">
                    No pages published yet.
                  </p>
                ) : (
                  <div className="mt-2 space-y-3">
                    {groups.map(({ group, items }) => {
                      const gKey = groupKeyFor(track.id, group)
                      const gCollapsed = isCollapsed(gKey)
                      return (
                        <div key={group}>
                          <GroupHeader
                            title={group}
                            isCollapsed={gCollapsed}
                            onToggle={() => toggle(gKey)}
                          />
                          {!gCollapsed && (
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
                          )}
                        </div>
                      )
                    })}
                  </div>
                ))}
            </section>
          )
        })}
      </nav>
    </aside>
  )
}

function SidebarHeader() {
  const { navigate } = useRouter()
  return (
    <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
      <GraduationCap className="size-4 text-emerald-400 flex-shrink-0" />
      <span className="text-sm font-semibold text-foreground">Learn</span>
      <button
        type="button"
        onClick={() => navigate("/editor")}
        aria-label="Back to editor"
        title="Back to editor"
        className="ml-auto rounded text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
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
  isCollapsed,
  onToggle,
}: {
  icon?: ReactNode
  accent: string
  title: string
  isCollapsed: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={!isCollapsed}
      className="flex w-full items-center gap-2 rounded px-2 py-2 text-left transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
    >
      {icon && <span className={accent}>{icon}</span>}
      <h2
        className={cn(
          "text-[11px] font-bold uppercase tracking-[0.12em]",
          accent,
        )}
      >
        {title}
      </h2>
      <ChevronDown
        className={cn(
          "ml-auto size-3 text-muted-foreground transition-transform",
          isCollapsed && "-rotate-90",
        )}
        aria-hidden="true"
      />
    </button>
  )
}

function GroupHeader({
  title,
  isCollapsed,
  onToggle,
}: {
  title: string
  isCollapsed: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={!isCollapsed}
      className="flex w-full items-center gap-1 rounded px-2 py-2 text-left transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
    >
      <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h3>
      <ChevronDown
        className={cn(
          "ml-auto size-3 text-muted-foreground/70 transition-transform",
          isCollapsed && "-rotate-90",
        )}
        aria-hidden="true"
      />
    </button>
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
        "w-full text-left pl-2 pr-2 py-1.5 rounded text-sm transition-colors flex items-start gap-2 border-l-2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        isActive
          ? "border-emerald-400 bg-emerald-500/10 text-emerald-200"
          : "border-transparent text-muted-foreground hover:text-foreground hover:bg-accent",
      )}
      title={lesson.summary}
    >
      <span
        className={cn(
          "flex h-5 w-5 flex-shrink-0 items-center justify-center rounded text-[10px] font-bold",
          isActive ? "bg-emerald-500 text-white" : "bg-muted text-muted-foreground",
        )}
      >
        {index + 1}
      </span>
      <span className="flex-1 leading-tight">{lesson.title}</span>
      <span
        className={cn(
          "flex-shrink-0 rounded border px-1 py-px text-[9px] font-semibold uppercase tracking-wider",
          lesson.difficulty === "beginner" && "border-emerald-500/30 text-emerald-400/70",
          lesson.difficulty === "intermediate" && "border-amber-500/30 text-amber-400/70",
          lesson.difficulty === "advanced" && "border-rose-500/30 text-rose-400/70",
          isActive && "opacity-80",
        )}
      >
        {lesson.difficulty === "beginner"
          ? "B"
          : lesson.difficulty === "intermediate"
            ? "I"
            : "A"}
      </span>
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
        "w-full text-left pl-3 pr-2 py-1 rounded text-[13px] leading-tight transition-colors border-l-2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        isActive
          ? cn(track.accentBorder, track.accentBg, track.accentText)
          : "border-transparent text-muted-foreground hover:text-foreground hover:bg-accent",
      )}
      title={entry.summary}
    >
      {entry.title}
    </button>
  )
}

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
    <div className="flex h-full w-full bg-background text-foreground overflow-hidden">
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
    <header className="flex items-center justify-between gap-4 border-b border-border bg-card px-6 py-2.5">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        Learn
      </span>
      <button
        type="button"
        onClick={onOpenPalette}
        className="group flex w-full max-w-md items-center gap-2 rounded-md border border-border bg-popover px-3 py-1.5 text-left text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        aria-label="Search the learn section"
      >
        <Search className="size-3.5 flex-shrink-0" />
        <span className="flex-1 truncate">Search lessons, topics, terms…</span>
        <span className="flex items-center gap-1">
          <kbd className="inline-flex min-w-[18px] items-center justify-center rounded border border-border bg-muted px-1 py-0.5 text-[10px] font-medium text-muted-foreground">
            {modKey}
          </kbd>
          <kbd className="inline-flex min-w-[18px] items-center justify-center rounded border border-border bg-muted px-1 py-0.5 text-[10px] font-medium text-muted-foreground">
            K
          </kbd>
        </span>
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
      <div className="mt-12 pt-6 border-t border-border">
        <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 px-4 py-3">
          <div className="flex items-center gap-2">
            <GraduationCap className="size-4 flex-shrink-0 text-emerald-400" />
            <p className="text-sm font-medium text-emerald-200">
              You've finished all the lessons.
            </p>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Head to the{" "}
            <button
              type="button"
              onClick={() => navigate("/editor")}
              className="rounded text-emerald-400 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              editor
            </button>{" "}
            to build your own circuits.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="mt-12 pt-6 border-t border-border">
      <button
        type="button"
        onClick={() => navigate(`/learn/${next.slug}`)}
        className="group inline-flex items-center gap-2 rounded-md border border-border bg-popover px-4 py-2 text-sm text-foreground transition-colors hover:border-emerald-500/40 hover:bg-emerald-500/5 hover:text-emerald-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <span className="flex flex-col items-start">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Next</span>
          <span className="font-medium">{next.title}</span>
        </span>
        <ArrowRight className="size-4 group-hover:translate-x-0.5 transition-transform" />
      </button>
    </div>
  )
}
