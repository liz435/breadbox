// ── Learn Router ────────────────────────────────────────────────────────
//
// Routes /learn/* paths to lesson pages. /learn itself redirects to the
// first lesson. Each lesson is a self-contained TSX file that renders
// <LearnLayout> with prose and <BreadboardEmbed>.

import { useEffect } from "react"
import { useRouter } from "@/router"
import { LearnLayout, PageTitle, LESSONS } from "@/learn/learn-layout"
import { BlinkLedLesson } from "@/learn/lessons/blink-led"
import { ButtonLedLesson } from "@/learn/lessons/button-led"
import { FadeLedLesson } from "@/learn/lessons/fade-led"

const ROUTES: Record<string, () => React.JSX.Element> = {
  "/learn/blink-led": BlinkLedLesson,
  "/learn/button-led": ButtonLedLesson,
  "/learn/fade-led": FadeLedLesson,
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
      <PageTitle title="Lesson not found" subtitle="Pick a lesson from the sidebar." />
    </LearnLayout>
  )
}

export function LearnRouter() {
  const { path } = useRouter()
  if (path === "/learn" || path === "/learn/") {
    return <LearnIndexPage />
  }
  const Page = ROUTES[path] ?? LessonNotFound
  return <Page />
}
