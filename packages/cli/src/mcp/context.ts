// Session state for the MCP server. One context lives for the lifetime of
// the stdio process. The current project id is the only mutable bit —
// everything else (paths, ownership, primitives) is derived on each call.

export const LOCAL_OWNER_ID = "local"

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
