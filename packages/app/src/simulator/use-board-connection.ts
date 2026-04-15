// ── useBoardConnection ────────────────────────────────────────────────────
//
// Polls GET /api/boards every 3s for available ports and maintains the
// currently-selected port path. Shared across the serial monitor, the upload
// button, and the board status pill.

import { useState, useEffect, useCallback, useRef } from "react"
import { API_ORIGIN } from "@dreamer/config"

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

// Module-level selected port so all hook consumers share the same value
// without needing a React context. This mirrors the boardTracker pattern.
let _selectedPort: string | null = null
const _listeners = new Set<() => void>()

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

export function useBoardConnection(): BoardConnectionState {
  const [ports, setPorts] = useState<PortInfo[]>([])
  const [cliAvailable, setCliAvailable] = useState(true)
  const [loading, setLoading] = useState(false)
  const [, forceUpdate] = useState(0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Subscribe to global port selection changes
  useEffect(() => {
    const notify = () => forceUpdate((n) => n + 1)
    _listeners.add(notify)
    return () => { _listeners.delete(notify) }
  }, [])

  const fetchPorts = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`${API_ORIGIN}/api/boards`)
      if (!res.ok) return
      const data = (await res.json()) as { ports: PortInfo[]; cliAvailable: boolean }
      setPorts(data.ports ?? [])
      setCliAvailable(data.cliAvailable ?? true)

      // Auto-clear selected port if it's no longer available
      if (_selectedPort && !data.ports.some((p) => p.path === _selectedPort)) {
        setGlobalSelectedPort(null)
      }
    } catch {
      // API not running yet — silently ignore
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchPorts()
    intervalRef.current = setInterval(fetchPorts, 3_000)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [fetchPorts])

  return {
    ports,
    cliAvailable,
    selectedPort: _selectedPort,
    setSelectedPort: setGlobalSelectedPort,
    loading,
    refresh: fetchPorts,
  }
}
