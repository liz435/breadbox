// PreviewBanner — shown at the top of the editor when a visitor is
// browsing the hosted deploy without a session. Keeps the live-preview
// experience intact while making the sign-in path one click away.

import { cn } from "@/utils/classnames"
import { useCurrentUser } from "./use-current-user"
import { redirectToSignIn } from "@/project/api-client"

type PreviewBannerProps = {
  className?: string
}

export function PreviewBanner({ className }: PreviewBannerProps = {}) {
  const { user, isHosted } = useCurrentUser()
  if (!isHosted || user) return null

  return (
    <div
      className={cn(
        "pointer-events-auto fixed right-3 top-3 z-50 flex items-center gap-3 rounded-full border border-white/10 bg-card/85 py-1.5 pl-4 pr-1.5 text-xs text-foreground shadow-lg backdrop-blur",
        className,
      )}
    >
      <span className="hidden sm:inline text-muted-foreground">
        Preview — changes aren't saved
      </span>
      <span className="sm:hidden text-muted-foreground">Preview</span>
      <button
        type="button"
        onClick={redirectToSignIn}
        className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-medium text-neutral-900 transition-colors hover:bg-neutral-200"
      >
        <svg
          aria-hidden="true"
          width={12}
          height={12}
          viewBox="0 0 16 16"
          fill="currentColor"
        >
          <path d="M8 0C3.58 0 0 3.58 0 8a8 8 0 005.47 7.59c.4.07.55-.17.55-.38v-1.33c-2.23.48-2.69-1.08-2.69-1.08-.36-.92-.89-1.16-.89-1.16-.73-.5.06-.49.06-.49.8.06 1.23.83 1.23.83.72 1.23 1.88.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.58.82-2.14-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.66 7.66 0 014 0c1.53-1.03 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.14 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48v2.19c0 .21.15.46.55.38A8 8 0 0016 8c0-4.42-3.58-8-8-8z" />
        </svg>
        Sign in with GitHub
      </button>
    </div>
  )
}
