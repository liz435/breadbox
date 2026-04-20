// ── LoginScreen ──────────────────────────────────────────────────────────
//
// Full-page sign-in affordance for hosted mode. Renders a single CTA
// that links to the GitHub OAuth start endpoint, passing the current
// path so the user lands back where they came from after callback.
//
// No state, no form — the entire page is a link. The `redirect` param
// is server-sanitized (relative paths only, same-origin, length-capped)
// so we don't need to scrub it here.
//
// Styled with the same token set as `Button` (`buttonVariants`) rather
// than wrapping Base UI's Button — the CTA is an anchor, not a button,
// and Base UI's Button forwards a ref to HTMLButtonElement which would
// conflict if we swapped the rendered element type.

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
  if (typeof window === "undefined") return "/api/auth/github/start"
  const redirect = window.location.pathname + window.location.search
  return `/api/auth/github/start?redirect=${encodeURIComponent(redirect)}`
}

export function LoginScreen({ className }: LoginScreenProps = {}) {
  return (
    <div
      className={cn(
        "flex h-full min-h-screen w-full items-center justify-center bg-neutral-950 text-neutral-100",
        className,
      )}
    >
      <div className="flex w-full max-w-sm flex-col items-center gap-8 px-6 py-12 text-center">
        <div className="flex flex-col items-center gap-3">
          <h1 className="text-3xl font-semibold tracking-tight">Dreamer</h1>
          <p className="text-sm text-neutral-400">
            Sign in to access your projects.
          </p>
        </div>

        <a
          href={buildSignInHref()}
          className={cn(buttonVariants({ size: "lg" }), "w-full")}
          aria-label="Sign in with GitHub"
        >
          Sign in with GitHub
        </a>

        <p className="text-xs text-neutral-600">
          We only read your GitHub username and email to create your
          account.
        </p>
      </div>
    </div>
  )
}
