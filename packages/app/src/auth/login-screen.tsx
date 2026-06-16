// ── LoginScreen ──────────────────────────────────────────────────────────
//
// Full-page sign-in affordance for hosted mode. Renders a single CTA
// anchor pointing at the GitHub OAuth start endpoint, passing the current
// path so the user lands back where they came from after callback.
//
// The `redirect` param is server-sanitized (relative paths only,
// same-origin, length-capped) so we don't scrub it here.
//
// On click we flip to a "redirecting" state and let the browser perform
// the default navigation. The state swap gives the user feedback during
// the brief window before the OAuth bounce — without it the button looks
// inert if the network stalls. We also disable further clicks so a double
// tap doesn't fire two navigations.
//
// Styled with `buttonVariants` rather than wrapping Base UI's Button —
// the CTA is an anchor, and Base UI's Button forwards a ref to
// HTMLButtonElement which would conflict if we swapped element types.

import { useState } from "react"

import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/utils/classnames"

type LoginScreenProps = {
  /**
   * Optional extra classes for the full-page wrapper. Useful when
   * embedding in a container that already paints chrome; defaults
   * cover standalone mount.
   */
  className?: string
}

function buildSignInHref(): string {
  if (typeof window === "undefined") return "/auth/sign-in"
  const redirect = window.location.pathname + window.location.search
  return `/auth/sign-in?redirect=${encodeURIComponent(redirect)}`
}

function GithubMark({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      fill="currentColor"
      className={className}
    >
      <path d="M8 0C3.58 0 0 3.58 0 8a8 8 0 005.47 7.59c.4.07.55-.17.55-.38v-1.33c-2.23.48-2.69-1.08-2.69-1.08-.36-.92-.89-1.16-.89-1.16-.73-.5.06-.49.06-.49.8.06 1.23.83 1.23.83.72 1.23 1.88.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.58.82-2.14-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.66 7.66 0 014 0c1.53-1.03 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.14 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48v2.19c0 .21.15.46.55.38A8 8 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  )
}

function Spinner({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      className={cn("animate-spin", className)}
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeOpacity="0.25"
        strokeWidth="3"
      />
      <path
        d="M22 12a10 10 0 0 0-10-10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function LoginScreen({ className }: LoginScreenProps = {}) {
  const [isRedirecting, setIsRedirecting] = useState(false)

  const handleClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (isRedirecting) {
      event.preventDefault()
      return
    }
    setIsRedirecting(true)
  }

  return (
    <div
      className={cn(
        "flex h-full min-h-screen w-full items-center justify-center bg-background text-foreground",
        className,
      )}
    >
      <div className="flex w-full max-w-sm flex-col items-center gap-8 px-6 py-12 text-center">
        <div className="flex flex-col items-center gap-3">
          <h1 className="text-3xl font-semibold tracking-tight">Breadbox</h1>
          <p className="text-sm text-muted-foreground">
            Sign in to access your projects.
          </p>
        </div>

        <a
          href={buildSignInHref()}
          onClick={handleClick}
          aria-label="Sign in with GitHub"
          aria-busy={isRedirecting}
          aria-disabled={isRedirecting}
          className={cn(
            buttonVariants({ size: "lg" }),
            "w-full gap-2.5 bg-white text-neutral-900 shadow-sm transition-all",
            "hover:bg-neutral-200 active:scale-[0.99]",
            isRedirecting && "pointer-events-none opacity-80",
          )}
        >
          {isRedirecting ? (
            <>
              <Spinner className="h-4 w-4" />
              <span>Redirecting to GitHub…</span>
            </>
          ) : (
            <>
              <GithubMark className="h-4 w-4" />
              <span>Continue with GitHub</span>
            </>
          )}
        </a>

        <p className="text-xs text-muted-foreground">
          We only read your GitHub username and email to create your
          account.
        </p>
      </div>
    </div>
  )
}
