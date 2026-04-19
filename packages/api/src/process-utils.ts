// ── Process spawning helpers ─────────────────────────────────────────────
//
// Every `Bun.spawn` call we make is against a long-running external binary
// (arduino-cli, avrdude). Without a wall-clock timeout, a wedged child can
// accumulate indefinitely and exhaust the process budget on small hosts.
// All route-side spawns go through the helpers below so bounds + abort
// plumbing are enforced uniformly.

import type { Subprocess } from "bun"

export type SpawnWithTimeoutOpts = {
  /** Wall-clock cap after which the child is SIGTERM'd. */
  timeoutMs: number
  /** Optional abort trigger — e.g. the inbound `request.signal`. */
  signal?: AbortSignal
}

export type SpawnWithTimeoutHandle = {
  proc: Subprocess<"ignore", "pipe", "pipe">
  /** Resolves after `proc.exited`, regardless of why the process ended. */
  exitPromise: Promise<number>
  /** True if the timeout or caller signal killed the child. */
  wasAborted: () => boolean
  /** Reason the child was killed, if any — "timeout" or "signal". */
  abortReason: () => "timeout" | "signal" | null
}

/**
 * Spawn a child with a wall-clock timeout and optional external abort.
 * Both paths SIGTERM the child (no SIGKILL escalation — arduino-cli and
 * avrdude clean up cleanly on SIGTERM, and the OS will reap regardless).
 */
export function spawnWithTimeout(
  cmd: string[],
  opts: SpawnWithTimeoutOpts,
): SpawnWithTimeoutHandle {
  const proc = Bun.spawn(cmd, {
    stdout: "pipe",
    stderr: "pipe",
  })

  let reason: "timeout" | "signal" | null = null
  const timer = setTimeout(() => {
    reason = "timeout"
    try { proc.kill() } catch { /* already dead */ }
  }, opts.timeoutMs)

  const onAbort = (): void => {
    if (reason === null) reason = "signal"
    try { proc.kill() } catch { /* already dead */ }
  }
  opts.signal?.addEventListener("abort", onAbort, { once: true })

  const exitPromise = proc.exited.finally(() => {
    clearTimeout(timer)
    opts.signal?.removeEventListener("abort", onAbort)
  })

  return {
    proc,
    exitPromise,
    wasAborted: () => reason !== null,
    abortReason: () => reason,
  }
}

/**
 * Capture-oriented convenience wrapper for short-lived spawns that just
 * need stdout/stderr as strings plus an exit code. Applies the timeout
 * policy above.
 */
export async function spawnCapture(
  cmd: string[],
  opts: SpawnWithTimeoutOpts,
): Promise<{ stdout: string; stderr: string; code: number; aborted: "timeout" | "signal" | null }> {
  const handle = spawnWithTimeout(cmd, opts)
  const [stdout, stderr, code] = await Promise.all([
    new Response(handle.proc.stdout).text(),
    new Response(handle.proc.stderr).text(),
    handle.exitPromise,
  ])
  return { stdout, stderr, code, aborted: handle.abortReason() }
}
