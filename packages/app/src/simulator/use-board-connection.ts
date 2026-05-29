// ── useBoardConnection ────────────────────────────────────────────────────
//
// Polls GET /api/boards for available ports and maintains the currently-
// selected port path. Shared across the serial monitor, the upload button,
// and the board status pill.
//
// Single poller, many consumers. Each mounted hook increments a module-
// level refcount; the interval starts on the first mount and stops when
// the last consumer unmounts. Three components used to each drive their
// own 3s interval per tab — that multiplied arduino-cli load and was a
// load-bearing factor in the Railway OOM-of-threads crash (see
// crashrailwaydreamer.json).
//
// Polling is additionally suppressed when:
//   - `capabilities.hosted` is true (Railway has no USB; the server
//     short-circuits `/api/boards` anyway, but skipping the request saves
//     round trips and surfaces the "hosted" reality to the UI),
//   - the document is hidden (background tabs shouldn't poll).

import { useState, useEffect } from "react"
import { API_ORIGIN } from "@dreamer/config"
import { useCapabilities } from "@/project/use-capabilities"
import { resolveFetchOptions } from "@/project/api-client"

export type PortInfo = {
  path: string
  manufacturer?: string
}

export type BoardConnectionState = {
  ports: PortInfo[]
  cliAvailable: boolean
  selectedPort: string | null
  setSelectedPort: (path: string | null) => void
  loading: boolean
  refresh: () => void
}

const POLL_INTERVAL_MS = 3_000

/**
 * Number of consecutive polls during which `_selectedPort` must be absent
 * from the server's port list before we treat it as "really gone" and
 * clear the user's selection. Guards against a single racy
 * `arduino-cli board list` (re-enumeration during a flash, USB hub flake,
 * slow first response) yanking the port out from under the user. At
 * `POLL_INTERVAL_MS = 3s`, three misses = ~9s of confirmed absence.
 */
const SELECTED_PORT_MISS_THRESHOLD = 3

// ── Shared module-level state ───────────────────────────────────────────

let _ports: PortInfo[] = []
let _cliAvailable = true
let _loading = false
let _selectedPort: string | null = null
let _selectedPortMissCount = 0
let _hasCompletedFirstPoll = false
const _listeners = new Set<() => void>()

// Refcount-driven polling. `startPolling` / `stopPolling` are idempotent.
let _refCount = 0
let _intervalId: ReturnType<typeof setInterval> | null = null
let _visibilityAttached = false

function notifyListeners() {
  for (const fn of _listeners) fn()
}

/**
 * Shallow-compare a snapshot of the externally-visible state. Used by
 * `fetchPortsOnce` to skip the post-poll notify when nothing actually
 * changed — every poll otherwise re-rendered every consumer twice per
 * 3s tick, which (a) burned cycles for nothing and (b) cascaded into
 * any downstream effect whose deps weren't perfectly stable.
 */
type StateSnapshot = {
  ports: PortInfo[]
  cliAvailable: boolean
  selectedPort: string | null
  loading: boolean
}
function snapshotState(): StateSnapshot {
  return { ports: _ports, cliAvailable: _cliAvailable, selectedPort: _selectedPort, loading: _loading }
}
function portsEqual(a: PortInfo[], b: PortInfo[]): boolean {
  if (a === b) return true
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i].path !== b[i].path || a[i].manufacturer !== b[i].manufacturer) return false
  }
  return true
}
function stateChanged(prev: StateSnapshot): boolean {
  return (
    prev.cliAvailable !== _cliAvailable ||
    prev.selectedPort !== _selectedPort ||
    prev.loading !== _loading ||
    !portsEqual(prev.ports, _ports)
  )
}

export function setGlobalSelectedPort(path: string | null) {
  if (_selectedPort === path) return
  _selectedPort = path
  // User just (re)affirmed their choice; cancel any in-flight miss-count
  // toward auto-clearing.
  _selectedPortMissCount = 0
  notifyListeners()
}

export function getGlobalSelectedPort(): string | null {
  return _selectedPort
}

async function fetchPortsOnce(): Promise<void> {
  const prev = snapshotState()
  _loading = true
  // Only emit a loading-true notify for the very first poll, since that's
  // the only path that surfaces a "Scanning ports…" hint (board-status.tsx
  // gates that copy on `loading && ports.length === 0`). Steady-state
  // polls would otherwise flip every subscriber twice per 3s tick with
  // no UI consequence.
  if (!_hasCompletedFirstPoll) notifyListeners()

  try {
    const res = await fetch(`${API_ORIGIN}/api/boards`, resolveFetchOptions())
    if (!res.ok) return
    const data = (await res.json()) as { ports: PortInfo[]; cliAvailable: boolean }
    _ports = data.ports ?? []
    _cliAvailable = data.cliAvailable ?? true

    // Auto-clear selected port only after N consecutive misses — a single
    // dropout (USB hub flake, arduino-cli enumeration race during a
    // flash, slow first response) shouldn't yank the user's choice.
    if (_selectedPort) {
      if (_ports.some((p) => p.path === _selectedPort)) {
        _selectedPortMissCount = 0
      } else {
        _selectedPortMissCount++
        if (_selectedPortMissCount >= SELECTED_PORT_MISS_THRESHOLD) {
          _selectedPort = null
          _selectedPortMissCount = 0
        }
      }
    }
  } catch {
    // API not running yet — silently ignore. Don't bump miss count: a
    // network failure isn't evidence the port disappeared, just that we
    // can't see it right now.
  } finally {
    _loading = false
    _hasCompletedFirstPoll = true
    // Only fire if anything subscribers care about actually changed.
    // Eliminates the per-poll re-render storm on idle steady state.
    if (stateChanged(prev)) notifyListeners()
  }
}

function startPolling() {
  if (_intervalId !== null) return
  if (typeof document !== "undefined" && document.visibilityState === "hidden") return
  void fetchPortsOnce()
  _intervalId = setInterval(fetchPortsOnce, POLL_INTERVAL_MS)
}

function stopPolling() {
  if (_intervalId === null) return
  clearInterval(_intervalId)
  _intervalId = null
}

function handleVisibilityChange() {
  if (_refCount === 0) return
  if (document.visibilityState === "hidden") {
    stopPolling()
  } else {
    startPolling()
  }
}

function attachVisibilityListener() {
  if (_visibilityAttached) return
  if (typeof document === "undefined") return
  document.addEventListener("visibilitychange", handleVisibilityChange)
  _visibilityAttached = true
}

function detachVisibilityListener() {
  if (!_visibilityAttached) return
  if (typeof document === "undefined") return
  document.removeEventListener("visibilitychange", handleVisibilityChange)
  _visibilityAttached = false
}

// ── Hook ────────────────────────────────────────────────────────────────

export function useBoardConnection(): BoardConnectionState {
  const { capabilities } = useCapabilities()
  const [, forceUpdate] = useState(0)

  useEffect(() => {
    const notify = () => forceUpdate((n) => n + 1)
    _listeners.add(notify)
    return () => { _listeners.delete(notify) }
  }, [])

  // Poll gating: skip in hosted mode (no USB on the server). When
  // `capabilities.hosted` flips after the initial capabilities fetch
  // resolves, the effect re-runs and cleanly tears down any interval
  // that was started under the default (non-hosted) assumption.
  useEffect(() => {
    if (capabilities.hosted) return

    _refCount++
    if (_refCount === 1) {
      attachVisibilityListener()
      startPolling()
    }
    return () => {
      _refCount--
      if (_refCount === 0) {
        stopPolling()
        detachVisibilityListener()
      }
    }
  }, [capabilities.hosted])

  return {
    ports: _ports,
    // In hosted mode the server reports cliAvailable: false; mirror that
    // at the hook level so consumers see "no CLI" even before the first
    // fetch would have completed (and so hosted mode is self-consistent
    // when polling is skipped entirely).
    cliAvailable: capabilities.hosted ? false : _cliAvailable,
    selectedPort: _selectedPort,
    setSelectedPort: setGlobalSelectedPort,
    loading: _loading,
    refresh: fetchPortsOnce,
  }
}
