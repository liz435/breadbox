// ── Capabilities hook ─────────────────────────────────────────────────────
//
// Reads `/api/capabilities` once on mount and caches in module scope so
// every component that needs to know whether this is a hosted deployment
// (or whether arduino-cli is available) reads the same snapshot without
// refetching. The backend is the single source of truth; no local env
// inspection — the same React bundle ships to hosted + CLI surfaces.

import { useEffect, useState } from "react"
import { API_ORIGIN } from "@dreamer/config"

export type Capabilities = {
  hosted: boolean
  arduinoCliAvailable: boolean
  version: number
}

const DEFAULT: Capabilities = {
  // Default to the fully-featured CLI-local state. Safer to over-show a
  // button (and have the backend 403 it) than to hide features from a
  // user running the CLI binary if the fetch hasn't returned yet.
  hosted: false,
  arduinoCliAvailable: true,
  version: 1,
}

let cached: Capabilities | null = null
let inflight: Promise<Capabilities> | null = null

async function fetchCapabilities(): Promise<Capabilities> {
  try {
    // `/api/capabilities` is public but we still set credentials so
    // a logged-in session is visible when another request piggybacks
    // on this fetch's connection pool (no downside — the server
    // ignores the cookie on public routes).
    const res = await fetch(`${API_ORIGIN}/api/capabilities`, {
      credentials: "include",
    })
    if (!res.ok) return DEFAULT
    const data = (await res.json()) as Partial<Capabilities>
    return {
      hosted: data.hosted === true,
      arduinoCliAvailable: data.arduinoCliAvailable !== false,
      version: data.version ?? 1,
    }
  } catch {
    return DEFAULT
  }
}

/** Get the cached capabilities, fetching once if not yet loaded. */
export async function getCapabilities(): Promise<Capabilities> {
  if (cached) return cached
  if (!inflight) {
    inflight = fetchCapabilities().then((caps) => {
      cached = caps
      inflight = null
      return caps
    })
  }
  return inflight
}

/**
 * React hook. Returns the default (fully-featured) capabilities
 * synchronously on first render, then swaps to the real fetched value
 * when ready. Use the `loaded` flag if a component must wait.
 */
export function useCapabilities(): { capabilities: Capabilities; loaded: boolean } {
  const [capabilities, setCapabilities] = useState<Capabilities>(cached ?? DEFAULT)
  const [loaded, setLoaded] = useState(cached !== null)

  useEffect(() => {
    if (cached) return
    void getCapabilities().then((caps) => {
      setCapabilities(caps)
      setLoaded(true)
    })
  }, [])

  return { capabilities, loaded }
}
