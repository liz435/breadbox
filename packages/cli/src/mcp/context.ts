// Session state for the MCP server. One context lives for the lifetime of
// the stdio process. The current project id is the only mutable bit —
// everything else (paths, ownership, primitives) is derived on each call.

import { CLI_LOCAL_USER_ID } from "@dreamer/api/supabase/env"

// The MCP must read/write projects as the SAME owner the local app + CLI use,
// or it sees a disjoint set of projects (the ownership migration stamps local
// projects with CLI_LOCAL_USER_ID, not the legacy "local" literal). Using the
// literal here made the MCP invisible to app-created projects. See the
// owner-id split documented in the connect-claude work.
export const LOCAL_OWNER_ID = CLI_LOCAL_USER_ID

export type McpSession = {
  /** Currently selected project id, or null if unset. */
  currentProjectId: string | null
}

export function createSession(initialProjectId: string | null): McpSession {
  return { currentProjectId: initialProjectId }
}

export class NoProjectSelectedError extends Error {
  constructor() {
    super(
      "No project selected. Call `set_current_project` or start the server with `--project <id>`.",
    )
    this.name = "NoProjectSelectedError"
  }
}

export class ProjectNotFoundError extends Error {
  constructor(projectId: string) {
    super(`Project not found: ${projectId}`)
    this.name = "ProjectNotFoundError"
  }
}
