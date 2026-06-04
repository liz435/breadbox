// MCP resource handlers for breadbox://* URIs. Registered on the McpServer
// in server.ts. Resources are read-only — mutations must go through tools.

import { boardStateToDiagram } from "@dreamer/schemas"
import { projectRepo } from "@dreamer/api/db/adapters/file/project-repo"
import { WIRING_GUIDE_TEXT } from "@dreamer/api/agents/core/wiring-guide-text"
import { LOCAL_OWNER_ID } from "./context"

type ReadResult = {
  contents: Array<{
    uri: string
    mimeType: string
    text: string
  }>
}

export async function readProjectsIndex(): Promise<ReadResult> {
  const summaries = await projectRepo.listProjects(LOCAL_OWNER_ID)
  const body = JSON.stringify(
    summaries.map((s) => ({
      id: s.id,
      name: s.name,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      hasContent: s.hasContent,
      uri: `breadbox://projects/${s.id}`,
    })),
    null,
    2,
  )
  return {
    contents: [
      {
        uri: "breadbox://projects",
        mimeType: "application/json",
        text: body,
      },
    ],
  }
}

export async function readProjectDiagram(
  projectId: string,
  uri: string,
): Promise<ReadResult> {
  const project = await projectRepo.readProject(projectId, LOCAL_OWNER_ID)
  if (!project) {
    throw new Error(`Project not found: ${projectId}`)
  }
  const diagram = project.boardState
    ? boardStateToDiagram(project.boardState)
    : {
        $schema: "breadbox-diagram-v1" as const,
        board: "arduino_uno" as const,
        sketch: "",
        components: [],
        wires: [],
        environment: { obstacles: [], boundaryEnabled: false },
      }
  return {
    contents: [
      {
        uri,
        mimeType: "application/json",
        text: JSON.stringify(diagram, null, 2),
      },
    ],
  }
}

export async function readProjectSketch(
  projectId: string,
  uri: string,
): Promise<ReadResult> {
  const project = await projectRepo.readProject(projectId, LOCAL_OWNER_ID)
  if (!project) {
    throw new Error(`Project not found: ${projectId}`)
  }
  const code = project.boardState?.sketchCode ?? ""
  return {
    contents: [
      {
        uri,
        mimeType: "text/x-arduino",
        text: code,
      },
    ],
  }
}

export function readWiringGuide(): ReadResult {
  return {
    contents: [
      {
        uri: "breadbox://wiring-guide",
        mimeType: "text/markdown",
        text: WIRING_GUIDE_TEXT,
      },
    ],
  }
}
