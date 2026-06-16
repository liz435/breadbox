// ── Learn Router ────────────────────────────────────────────────────────
//
// Dispatches /learn/* paths to one of three kinds of page:
//   1. /learn                            → index (redirects to first lesson)
//   2. /learn/<lesson-slug>              → hand-registered lesson page
//   3. /learn/reference/<track>/<slug>   → encyclopedia page from the catalog
//
// Encyclopedia routing is catalog-driven — adding a page means adding an
// entry to encyclopedia-catalog.ts, not editing the router.

import { useEffect } from "react"
import { useRouter } from "@/router"
import { LearnLayout, PageTitle, LESSONS, Section, Note } from "@/learn/learn-layout"
import { BlinkLedLesson } from "@/learn/lessons/blink-led"
import { ButtonLedLesson } from "@/learn/lessons/button-led"
import { FadeLedLesson } from "@/learn/lessons/fade-led"
import { RgbLedLesson } from "@/learn/lessons/rgb-led"
import { PotentiometerLesson } from "@/learn/lessons/potentiometer"
import { ResistorLesson } from "@/learn/lessons/resistor"
import { CapacitorLesson } from "@/learn/lessons/capacitor"
import { PhotoresistorLesson } from "@/learn/lessons/photoresistor"
import { BuzzerLesson } from "@/learn/lessons/buzzer"
import { ServoLesson } from "@/learn/lessons/servo"
import { TemperatureSensorLesson } from "@/learn/lessons/temperature-sensor"
import { UltrasonicSensorLesson } from "@/learn/lessons/ultrasonic-sensor"
import { PirSensorLesson } from "@/learn/lessons/pir-sensor"
import { SevenSegmentLesson } from "@/learn/lessons/seven-segment"
import { Lcd16x2Lesson } from "@/learn/lessons/lcd-16x2"
import { DhtSensorLesson } from "@/learn/lessons/dht-sensor"
import { IrReceiverLesson } from "@/learn/lessons/ir-receiver"
import { RelayLesson } from "@/learn/lessons/relay"
import { DcMotorLesson } from "@/learn/lessons/dc-motor"
import { ShiftRegisterLesson } from "@/learn/lessons/shift-register"
import { NeopixelLesson } from "@/learn/lessons/neopixel"
import { OledDisplayLesson } from "@/learn/lessons/oled-display"
import { findEntry } from "@/learn/encyclopedia-catalog"
import { getEncyclopediaPage } from "@/learn/encyclopedia-page-registry"

const LESSON_ROUTES: Record<string, () => React.JSX.Element> = {
  "/learn/blink-led": BlinkLedLesson,
  "/learn/button-led": ButtonLedLesson,
  "/learn/fade-led": FadeLedLesson,
  "/learn/rgb-led": RgbLedLesson,
  "/learn/potentiometer": PotentiometerLesson,
  "/learn/resistor": ResistorLesson,
  "/learn/capacitor": CapacitorLesson,
  "/learn/photoresistor": PhotoresistorLesson,
  "/learn/buzzer": BuzzerLesson,
  "/learn/servo": ServoLesson,
  "/learn/temperature-sensor": TemperatureSensorLesson,
  "/learn/ultrasonic-sensor": UltrasonicSensorLesson,
  "/learn/pir-sensor": PirSensorLesson,
  "/learn/seven-segment": SevenSegmentLesson,
  "/learn/lcd-16x2": Lcd16x2Lesson,
  "/learn/dht-sensor": DhtSensorLesson,
  "/learn/ir-receiver": IrReceiverLesson,
  "/learn/relay": RelayLesson,
  "/learn/dc-motor": DcMotorLesson,
  "/learn/shift-register": ShiftRegisterLesson,
  "/learn/neopixel": NeopixelLesson,
  "/learn/oled-display": OledDisplayLesson,
}

function LearnIndexPage() {
  const { navigate } = useRouter()
  // Redirect /learn → first lesson.
  useEffect(() => {
    if (LESSONS.length > 0) navigate(`/learn/${LESSONS[0].slug}`)
  }, [navigate])
  return (
    <LearnLayout>
      <PageTitle title="Learn" subtitle="Pick a lesson to get started." />
    </LearnLayout>
  )
}

function LessonNotFound() {
  return (
    <LearnLayout>
      <PageTitle title="Page not found" subtitle="Pick a page from the sidebar." />
    </LearnLayout>
  )
}

function EncyclopediaNotFound({ track, slug }: { track: string; slug: string }) {
  return (
    <LearnLayout>
      <PageTitle
        title="Encyclopedia page not found"
        subtitle={`No page is registered at /learn/reference/${track}/${slug}.`}
      />
      <Section title="Possible causes">
        <ul className="list-disc pl-5 text-sm leading-relaxed space-y-1">
          <li>The page is still planned and not yet published.</li>
          <li>The slug in the URL has a typo.</li>
          <li>
            The track is wrong (must be one of{" "}
            <code className="text-foreground">board</code>,{" "}
            <code className="text-foreground">programming</code>, or{" "}
            <code className="text-foreground">electronics</code>).
          </li>
        </ul>
        <Note>
          To see planned-but-unwritten pages, append{" "}
          <code className="text-foreground">?showPlanned=1</code> to the URL.
        </Note>
      </Section>
    </LearnLayout>
  )
}

// Pre-rebrand encyclopedia slug aliases, keyed by "<track>/<slug>". Keeps old
// `/learn/reference/...` bookmarks/links resolving after a slug rename.
const LEGACY_SLUG_ALIASES: Record<string, string> = {
  "programming/dreamer-limits": "breadbox-limits",
}

/**
 * Try to match an encyclopedia route of the form
 * /learn/reference/<track>/<slug> and return its Page component, or null
 * if it doesn't match.
 */
function matchEncyclopediaRoute(
  path: string,
): { Page: React.ComponentType; track: string; slug: string } | null {
  const match = path.match(/^\/learn\/reference\/([^/]+)\/([^/]+)\/?$/)
  if (!match) return null
  const [, track, rawSlug] = match
  // Resolve a legacy slug to its canonical one so old URLs keep working.
  const slug = LEGACY_SLUG_ALIASES[`${track}/${rawSlug}`] ?? rawSlug

  const includePlanned =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("showPlanned") === "1"

  // Catalog tells us whether the entry exists at all, and what status
  // it has. The page-registry is the only module that knows how to
  // resolve "<track>/<slug>" → a React component.
  const entry = findEntry(track, slug, { includePlanned })
  if (!entry) {
    return {
      Page: () => <EncyclopediaNotFound track={track} slug={slug} />,
      track,
      slug,
    }
  }

  const Page = getEncyclopediaPage(track, slug, {
    isPlanned: entry.status === "planned",
  })
  if (!Page) {
    return {
      Page: () => <EncyclopediaNotFound track={track} slug={slug} />,
      track,
      slug,
    }
  }
  return { Page, track, slug }
}

export function LearnRouter() {
  const { path } = useRouter()

  // Index → redirect
  if (path === "/learn" || path === "/learn/") {
    return <LearnIndexPage />
  }

  // Encyclopedia
  if (path.startsWith("/learn/reference/")) {
    const hit = matchEncyclopediaRoute(path)
    if (hit) {
      const { Page } = hit
      return <Page />
    }
    return <LessonNotFound />
  }

  // Lessons
  const Lesson = LESSON_ROUTES[path] ?? LessonNotFound
  return <Lesson />
}
