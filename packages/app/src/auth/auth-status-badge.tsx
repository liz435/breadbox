// ── AuthStatusBadge ──────────────────────────────────────────────────────
//
// Persistent sign-in / signed-in indicator pill that lives in the bottom
// toolbar. Only meaningful on the hosted deploy, where there's a GitHub
// account to surface:
//
//   hosted + user     → "@handle ▾" menu → Sign out
//   hosted + no user  → "Sign in" button → GitHub OAuth
//   CLI/desktop       → nothing (no account concept; the API-key button is
//                       the only relevant control there)
//
// The pill mirrors the bottom toolbar's card chrome (h-10, rounded-lg,
// border + bg-card + shadow-sm) so it reads as part of the same surface.

import { Menu } from "@base-ui/react/menu"
import { ChevronDown, Github, LogOut } from "lucide-react"
import { API_ORIGIN } from "@dreamer/config"
import { cn } from "@/utils/classnames"
import { redirectToSignIn } from "@/project/api-client"
import { refreshCurrentUser, useCurrentUser } from "./use-current-user"

async function signOut(): Promise<void> {
  try {
    await fetch(`${API_ORIGIN}/auth/sign-out`, {
      method: "POST",
      credentials: "include",
    })
  } finally {
    await refreshCurrentUser()
  }
}

const pillBase =
  "pointer-events-auto inline-flex h-10 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs shadow-sm"

export function AuthStatusBadge() {
  const { user, isHosted, loading } = useCurrentUser()

  // First-paint: render a placeholder of equal width so the toolbar
  // doesn't jump when /me resolves.
  if (loading) {
    return (
      <div
        className={cn(pillBase, "text-muted-foreground/60")}
        aria-hidden="true"
      >
        …
      </div>
    )
  }

  // CLI/desktop has no GitHub account or session to surface — the API-key
  // button in the toolbar covers everything relevant there.
  if (!isHosted) {
    return null
  }

  // Hosted, signed out → offer GitHub sign-in.
  if (!user) {
    return (
      <button
        type="button"
        onClick={redirectToSignIn}
        className={cn(
          pillBase,
          "font-medium text-foreground transition-colors hover:bg-accent",
        )}
        aria-label="Sign in with GitHub"
      >
        <Github className="size-3.5" />
        Sign in
      </button>
    )
  }

  const handle = user.githubLogin ?? user.userId

  return (
    <Menu.Root>
      <Menu.Trigger
        className={cn(
          pillBase,
          "font-medium text-foreground transition-colors hover:bg-accent",
        )}
        aria-label={`Account menu for ${handle}`}
      >
        <span className="size-1.5 rounded-full bg-emerald-400" />
        <span>@{handle}</span>
        <ChevronDown className="size-3 text-muted-foreground" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner side="top" align="end" sideOffset={8}>
          <Menu.Popup className="z-50 min-w-[200px] rounded-lg border border-border bg-popover p-1 text-xs text-popover-foreground shadow-lg outline-none">
            <div className="px-2.5 py-1.5 text-[11px] text-muted-foreground">
              Signed in as{" "}
              <span className="font-medium text-foreground">@{handle}</span>
            </div>
            <Menu.Separator className="my-1 h-px bg-border" />
            <Menu.Item
              onClick={() => {
                void signOut()
              }}
              className="flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 outline-none data-[highlighted]:bg-accent"
            >
              <LogOut className="size-3.5" />
              Sign out
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  )
}
