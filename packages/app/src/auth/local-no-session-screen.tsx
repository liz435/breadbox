// ── LocalNoSessionScreen ─────────────────────────────────────────────────
//
// Shown when the app is running under a CLI-local Breadbox (`dreamer
// headed`) but the browser has no valid `dreamer_local` cookie — either
// because the user opened the URL directly, the session expired, or the
// CLI was restarted. We can't kick off OAuth (there's no GitHub flow in
// local mode), so the screen's only job is to tell the user what to do:
// restart `dreamer headed` and click the freshly-printed URL.

import { cn } from "@/utils/classnames"

type LocalNoSessionScreenProps = {
  className?: string
}

export function LocalNoSessionScreen({
  className,
}: LocalNoSessionScreenProps = {}) {
  return (
    <div
      className={cn(
        "flex h-full min-h-screen w-full items-center justify-center bg-background text-foreground",
        className,
      )}
    >
      <div className="flex w-full max-w-md flex-col items-start gap-6 px-6 py-12">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            No active session
          </h1>
          <p className="text-sm text-muted-foreground">
            This Breadbox instance is running locally from the CLI. To
            authorize your browser, restart the CLI in your terminal
            and open the URL it prints:
          </p>
        </div>

        <pre className="w-full overflow-x-auto rounded-md border border-border bg-card px-4 py-3 font-mono text-xs text-foreground">
          <code>dreamer headed</code>
        </pre>

        <p className="text-xs text-muted-foreground">
          The CLI prints a one-time URL. Clicking it drops a cookie that
          authorizes this browser for 30 days.
        </p>
      </div>
    </div>
  )
}
