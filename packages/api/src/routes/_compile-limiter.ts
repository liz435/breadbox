// ── Compile / flash concurrency limiter ───────────────────────────────────
//
// `arduino-cli compile` does a full LoadHardware on every invocation (~30–40
// OS threads while AVR + rp2040 cores load, plus gcc/ld children). On small
// hosted replicas, N concurrent browser tabs or an agent retry loop will
// stack N of these and blow the process budget. The limiter caps how many
// compile/flash jobs run concurrently; overflow callers get a fast 429 so
// the frontend can show "busy" rather than silently hang.

import { IS_HOSTED } from "../env"

const HOSTED_MAX_CONCURRENT = 1
const LOCAL_MAX_CONCURRENT = 4
const MAX_QUEUED = 8

const maxConcurrent = IS_HOSTED ? HOSTED_MAX_CONCURRENT : LOCAL_MAX_CONCURRENT

let active = 0
type Waiter = { resolve: () => void; reject: (err: Error) => void }
const queue: Waiter[] = []

export class CompileBusyError extends Error {
  constructor() {
    super("compile queue full — try again in a moment")
    this.name = "CompileBusyError"
  }
}

export class CompileCancelledError extends Error {
  constructor() {
    super("compile cancelled by client")
    this.name = "CompileCancelledError"
  }
}

/**
 * Acquire a compile slot. Resolves once the caller may run, rejects with
 * CompileBusyError if the queue is saturated or CompileCancelledError if
 * the abort signal fires while queued. The returned `release` function
 * MUST be called in a `finally` block to avoid leaking slots.
 */
export async function acquireCompileSlot(signal?: AbortSignal): Promise<() => void> {
  if (active < maxConcurrent) {
    active++
    return makeRelease()
  }
  if (queue.length >= MAX_QUEUED) {
    throw new CompileBusyError()
  }
  if (signal?.aborted) throw new CompileCancelledError()

  const waiter: Waiter = { resolve: () => {}, reject: () => {} }
  const abortHandler = (): void => {
    const idx = queue.indexOf(waiter)
    if (idx >= 0) queue.splice(idx, 1)
    waiter.reject(new CompileCancelledError())
  }

  try {
    await new Promise<void>((resolve, reject) => {
      waiter.resolve = resolve
      waiter.reject = reject
      queue.push(waiter)
      signal?.addEventListener("abort", abortHandler, { once: true })
    })
  } finally {
    signal?.removeEventListener("abort", abortHandler)
  }
  active++
  return makeRelease()
}

function makeRelease(): () => void {
  let released = false
  return () => {
    if (released) return
    released = true
    active--
    const next = queue.shift()
    if (next) next.resolve()
  }
}

/** Current limiter state — for logging / health endpoints only. */
export function compileSlotStats(): { active: number; queued: number; max: number } {
  return { active, queued: queue.length, max: maxConcurrent }
}
