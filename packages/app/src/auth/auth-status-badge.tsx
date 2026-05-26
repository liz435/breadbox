// ── AuthStatusBadge ──────────────────────────────────────────────────────
//
// Persistent sign-in / signed-in indicator pill that lives in the bottom
// toolbar. Renders in all three auth modes so the user always knows what
// account (if any) they're acting as:
//
//   hosted + user     → "@handle ▾" menu → Sign out
//   hosted + no user  → "Sign in" button → GitHub OAuth
//   local  + user     → "@handle ▾" menu → Sign out
//   local  + no user  → "No session" chip (CLI restart required)
//   dev               → "Dev mode" chip (auth gate is bypassed)
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
  const { user, mode, loading } = useCurrentUser()

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

  if (mode === "dev") {
    return (
      <div className={cn(pillBase, "text-muted-foreground")}>Dev mode</div>
    )
  }

  if (!user) {
    if (mode === "hosted") {
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
    return (
      <div className={cn(pillBase, "text-muted-foreground")}>No session</div>
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
