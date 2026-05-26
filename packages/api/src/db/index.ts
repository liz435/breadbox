// ── Storage adapter selector ────────────────────────────────────────────
//
// One module exporting `storage`, the unified `{ projects, agentRuns }`
// repo bundle. Pinned at process start based on DREAMER_MODE — never
// switches per-request. Both adapters ship in code permanently:
//   • cli mode (default)  → file-based, `dataDir()` on disk
//   • hosted mode         → Supabase Postgres + Supabase Storage
//
// Call sites import `storage` and use `storage.projects.x()` /
// `storage.agentRuns.x()`. Tests can override via setStorageForTests.

import { IS_HOSTED_MODE } from "../supabase/env"
import { projectRepo as fileProjectRepo } from "./adapters/file/project-repo"
import { agentRunRepo as fileAgentRunRepo } from "./adapters/file/agent-run-repo"
import { projectRepo as supabaseProjectRepo } from "./adapters/supabase/project-repo"
import { agentRunRepo as supabaseAgentRunRepo } from "./adapters/supabase/agent-run-repo"

// Lock the structural shape to the file repo's. Any Supabase divergence
// is a compile error at the import seam below.
export type ProjectRepo = typeof fileProjectRepo
export type AgentRunRepo = typeof fileAgentRunRepo

export type StorageAdapter = {
  projects: ProjectRepo
  agentRuns: AgentRunRepo
}

function pickAdapter(): StorageAdapter {
  if (IS_HOSTED_MODE) {
    return {
      projects: supabaseProjectRepo as ProjectRepo,
      agentRuns: supabaseAgentRunRepo as AgentRunRepo,
    }
  }
  return { projects: fileProjectRepo, agentRuns: fileAgentRunRepo }
}

let _storage: StorageAdapter = pickAdapter()

export const storage = new Proxy({} as StorageAdapter, {
  get(_target, prop) {
    return _storage[prop as keyof StorageAdapter]
  },
})

/**
 * Test-only escape hatch. Lets a test inject a synthetic adapter
 * without rewiring callers. Always restored in afterEach via the
 * returned undo callback.
 */
export function setStorageForTests(next: StorageAdapter): () => void {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("setStorageForTests called outside test env")
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
