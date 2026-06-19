// ── AiHubButton ──────────────────────────────────────────────────────────
//
// Bottom-toolbar entry point (CLI/desktop) for every AI feature. Replaces the
// old single-purpose API-key button: clicking it opens the AI Hub modal (see
// ai-hub-modal.tsx) via the `breadbox:open-ai-hub` event. The amber dot carries
// over the old "no key yet" hint so BYOK discoverability isn't lost.

import { Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@/components/ui/tooltip"
import { useCurrentUser } from "@/auth/use-current-user"
import { OPEN_AI_HUB_EVENT } from "./ai-hub-modal"

export function AiHubButton() {
  const { isHosted, hasApiKey, loading } = useCurrentUser()

  // Only meaningful in CLI/desktop mode, and not until /me resolves.
  if (loading || isHosted) return null

  return (
    <TooltipProvider delay={400}>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="icon-lg"
              aria-label="AI features"
              onClick={() => window.dispatchEvent(new Event(OPEN_AI_HUB_EVENT))}
              className="pointer-events-auto relative rounded-lg border border-border bg-card text-muted-foreground shadow-sm hover:bg-accent hover:text-foreground"
            />
          }
        >
          <Sparkles className="size-4" />
          {hasApiKey ? null : (
            <span className="absolute right-1 top-1 size-1.5 rounded-full bg-amber-400" />
          )}
        </TooltipTrigger>
        <TooltipContent>AI features</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
