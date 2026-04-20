// MCP server entrypoint. `dreamer mcp [--project <id>]` spawns this;
// it speaks JSON-RPC 2.0 over stdio as required by Claude Desktop and
// other MCP clients.
//
// IMPORTANT: stdout is RESERVED for MCP protocol frames. All logging / errors
// must go to stderr so we don't corrupt the JSON-RPC stream.

import {
  McpServer,
  ResourceTemplate,
} from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { projectRepo } from "@dreamer/api/db/project-repo"
import { CLI_VERSION } from "../version"
import { LOCAL_OWNER_ID, createSession } from "./context"
import { registerTools } from "./tools"
import {
  readProjectDiagram,
  readProjectSketch,
  readProjectsIndex,
  readWiringGuide,
} from "./resources"

export type RunMcpOptions = {
  /** Optional project id to pin for the server's lifetime. */
  projectId: string | null
}

export async function runMcpServer(options: RunMcpOptions): Promise<void> {
  const session = createSession(options.projectId)

  const server = new McpServer(
    {
      name: "dreamer",
      version: CLI_VERSION,
    },
    {
      capabilities: {
        tools: {},
        resources: {},
      },
    },
  )

  registerTools(server, session)

  // Fixed resources.
  server.resource(
    "projects-index",
    "dreamer://projects",
    { description: "Index of every Dreamer project on disk." },
    async () => readProjectsIndex(),
  )

  server.resource(
    "wiring-guide",
    "dreamer://wiring-guide",
    {
      description:
        "Static wiring reference: wire colours, rules, component footprints, pin names.",
      mimeType: "text/markdown",
    },
    () => readWiringGuide(),
  )

  // Dynamic per-project URIs via a URI template. The `list` callback walks
  // the on-disk projects dir and emits a diagram + sketch URI for each.
  server.resource(
    "project-diagram",
    new ResourceTemplate("dreamer://projects/{projectId}", {
      list: async () => {
        const summaries = await projectRepo.listProjects(LOCAL_OWNER_ID)
        return {
          resources: summaries.map((s) => ({
            uri: `dreamer://projects/${s.id}`,
            name: `diagram: ${s.name}`,
            mimeType: "application/json",
          })),
        }
      },
    }),
    { description: "One project's full DreamerDiagram (DSL v1)." },
    async (uri, variables) => {
      const projectId = String(variables.projectId)
      return readProjectDiagram(projectId, uri.href)
    },
  )

  server.resource(
    "project-sketch",
    new ResourceTemplate("dreamer://projects/{projectId}/sketch", {
      list: async () => {
        const summaries = await projectRepo.listProjects(LOCAL_OWNER_ID)
        return {
          resources: summaries.map((s) => ({
            uri: `dreamer://projects/${s.id}/sketch`,
            name: `sketch: ${s.name}`,
            mimeType: "text/x-arduino",
          })),
        }
      },
    }),
    { description: "One project's Arduino sketch as plain text." },
    async (uri, variables) => {
      const projectId = String(variables.projectId)
      return readProjectSketch(projectId, uri.href)
    },
  )

  const transport = new StdioServerTransport()
  await server.connect(transport)

  // Block until the client disconnects or we get a termination signal.
  await new Promise<void>((resolve) => {
    const done = () => resolve()
    transport.onclose = done
    process.once("SIGINT", done)
    process.once("SIGTERM", done)
  })
}
