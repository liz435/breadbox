// ── Storage adapter ─────────────────────────────────────────────────────
//
// One module exporting `storage`, the unified `{ projects, agentRuns }`
// repo bundle: file-based storage under `dataDir()` on disk.
//
// Call sites import `storage` and use `storage.projects.x()` /
// `storage.agentRuns.x()`. Tests can override via setStorageForTests.

import { projectRepo as fileProjectRepo } from "./adapters/file/project-repo"
import { agentRunRepo as fileAgentRunRepo } from "./adapters/file/agent-run-repo"

export type ProjectRepo = typeof fileProjectRepo
export type AgentRunRepo = typeof fileAgentRunRepo

export type StorageAdapter = {
  projects: ProjectRepo
  agentRuns: AgentRunRepo
}

let _storage: StorageAdapter = {
  projects: fileProjectRepo,
  agentRuns: fileAgentRunRepo,
}

// Proxy indirection so `setStorageForTests` can swap the active adapter
// without rewiring every call site.
export const storage = new Proxy({} as StorageAdapter, {
  get(_target, prop) {
    return _storage[prop as keyof StorageAdapter]
  },
})

/**
 * Test-only escape hatch. Lets a test inject a synthetic adapter
 * without rewiring callers. Always restored in afterEach via the
 * returned undo callback.
 *
 * Guard: refuse only when NODE_ENV is explicitly "production". Bun's
 * test runner doesn't set NODE_ENV by default, so a strict equality
 * check against "test" would silently break suites that depend on this.
 */
export function setStorageForTests(next: StorageAdapter): () => void {
  if (process.env.NODE_ENV === "production") {
    throw new Error("setStorageForTests called in production")
  }
  const prev = _storage
  _storage = next
  return () => {
    _storage = prev
  }
}

// Re-export error classes both adapters share — keeps callers from
// having to know which adapter they're talking to.
export {
  VersionConflictError,
  OpValidationError,
} from "./adapters/file/project-repo"
