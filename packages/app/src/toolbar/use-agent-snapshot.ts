import { useCallback, useEffect, useState } from "react"

const STORAGE_KEY = "dreamer:agentSnapshotVersion"

// Toggle wires the user's "DSL vs AUTO" choice to a frozen agent snapshot:
// - DSL → 1.3.5: STRICT DSL + GND/5V rail distribution. apply_design
//   is the only build path mentioned in the prompt. No propose_circuit
//   fallback even for 7-seg / LCD with per-segment resistors. When ≥2
//   components share a supply, the model wires arduino.GND/5V to the
//   breadboard rail ONCE (via grid.<row>,-1 / -2 / 10 / 11) and
//   branches from the rail to each consumer.
// - AUTO → 1.2.5: propose_circuit-first prompt (auto-positioning). DSL tools
//   stay available for explicit diagram imports.
// When bumping either side, also update the tooltip in bottom-toolbar.tsx
// so users see the right description.
export const AGENT_SNAPSHOT_DEFAULT = "1.3.5"
export const AGENT_SNAPSHOT_FALLBACK = "1.2.5"

export type AgentSnapshotChoice =
  | typeof AGENT_SNAPSHOT_DEFAULT
  | typeof AGENT_SNAPSHOT_FALLBACK

const KNOWN_CHOICES: ReadonlySet<string> = new Set([
  AGENT_SNAPSHOT_DEFAULT,
  AGENT_SNAPSHOT_FALLBACK,
])

function readInitial(): AgentSnapshotChoice {
  if (typeof window === "undefined") return AGENT_SNAPSHOT_DEFAULT
  const stored = window.localStorage.getItem(STORAGE_KEY)
  if (stored && KNOWN_CHOICES.has(stored)) {
    return stored as AgentSnapshotChoice
  }
  return AGENT_SNAPSHOT_DEFAULT
}

export function useAgentSnapshot() {
  const [snapshotVersion, setSnapshotVersionState] =
    useState<AgentSnapshotChoice>(readInitial)

  useEffect(() => {
    function onStorage(event: StorageEvent) {
      if (event.key !== STORAGE_KEY) return
      const next = event.newValue
      if (next && KNOWN_CHOICES.has(next)) {
        setSnapshotVersionState(next as AgentSnapshotChoice)
      } else {
        setSnapshotVersionState(AGENT_SNAPSHOT_DEFAULT)
      }
    }
    window.addEventListener("storage", onStorage)
    return () => window.removeEventListener("storage", onStorage)
  }, [])

  const setSnapshotVersion = useCallback((next: AgentSnapshotChoice) => {
    setSnapshotVersionState(next)
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, next)
    }
  }, [])

  return { snapshotVersion, setSnapshotVersion }
}
