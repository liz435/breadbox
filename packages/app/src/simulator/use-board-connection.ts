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

// ── Shared module-level state ───────────────────────────────────────────

let _ports: PortInfo[] = []
let _cliAvailable = true
let _loading = false
let _selectedPort: string | null = null
const _listeners = new Set<() => void>()

// Refcount-driven polling. `startPolling` / `stopPolling` are idempotent.
let _refCount = 0
let _intervalId: ReturnType<typeof setInterval> | null = null
let _visibilityAttached = false

function notifyListeners() {
  for (const fn of _listeners) fn()
}

export function setGlobalSelectedPort(path: string | null) {
  _selectedPort = path
  notifyListeners()
}

export function getGlobalSelectedPort(): string | null {
  return _selectedPort
}

async function fetchPortsOnce(): Promise<void> {
  _loading = true
  notifyListeners()
  try {
    const res = await fetch(`${API_ORIGIN}/api/boards`)
    if (!res.ok) return
    const data = (await res.json()) as { ports: PortInfo[]; cliAvailable: boolean }
    _ports = data.ports ?? []
    _cliAvailable = data.cliAvailable ?? true

    // Auto-clear selected port if it's no longer available.
    if (_selectedPort && !_ports.some((p) => p.path === _selectedPort)) {
      _selectedPort = null
    }
  } catch {
    // API not running yet — silently ignore
  } finally {
    _loading = false
    notifyListeners()
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
