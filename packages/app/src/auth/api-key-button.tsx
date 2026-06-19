// ── ApiKeyButton ─────────────────────────────────────────────────────────
//
// Discoverable entry point for the Anthropic API key in CLI/desktop mode.
// The agent runs on the user's own key, so this button opens the
// ApiKeyDialog at any time — to set a key, or change one that's already
// saved — rather than relying solely on the boot/no-key auto-prompt. An
// amber dot flags the "no key yet" state. Hidden on the hosted deploy,
// where the server holds the key and users never enter one.

import { Key } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@/components/ui/tooltip"
import { useCurrentUser } from "./use-current-user"
import { OPEN_API_KEY_EVENT } from "./api-key-dialog"

export function ApiKeyButton() {
  const { isHosted, hasApiKey, loading } = useCurrentUser()

  // Only meaningful in CLI/desktop mode, and not until /me resolves.
  if (loading || isHosted) return null

  const label = hasApiKey ? "Change API key" : "Set API key"

  return (
    <TooltipProvider delay={400}>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="icon-lg"
              aria-label={label}
              onClick={() =>
                window.dispatchEvent(new Event(OPEN_API_KEY_EVENT))
              }
              className="pointer-events-auto relative rounded-lg border border-border bg-card text-muted-foreground shadow-sm hover:bg-accent hover:text-foreground"
            />
          }
        >
          <Key className="size-4" />
          {hasApiKey ? null : (
            <span className="absolute right-1 top-1 size-1.5 rounded-full bg-amber-400" />
          )}
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
