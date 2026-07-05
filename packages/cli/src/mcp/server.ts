// MCP server entrypoint. `breadbox mcp [--project <id>]` spawns this;
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
import { projectRepo } from "@dreamer/api/db/adapters/file/project-repo"
import { forceLoggerStderr } from "@dreamer/api/logger"
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
  // Everything any module logs at info level must land on stderr here —
  // stdout carries the JSON-RPC frames (see header note).
  forceLoggerStderr()

  const session = createSession(options.projectId)

  const server = new McpServer(
    {
      name: "breadbox",
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
    "breadbox://projects",
    { description: "Index of every Breadbox project on disk." },
    async () => readProjectsIndex(),
  )

  server.resource(
    "wiring-guide",
    "breadbox://wiring-guide",
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
    new ResourceTemplate("breadbox://projects/{projectId}", {
      list: async () => {
        const summaries = await projectRepo.listProjects(LOCAL_OWNER_ID)
        return {
          resources: summaries.map((s) => ({
            uri: `breadbox://projects/${s.id}`,
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
    new ResourceTemplate("breadbox://projects/{projectId}/sketch", {
      list: async () => {
        const summaries = await projectRepo.listProjects(LOCAL_OWNER_ID)
        return {
          resources: summaries.map((s) => ({
            uri: `breadbox://projects/${s.id}/sketch`,
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
  // A client that dies uncleanly (terminal closed, process killed) fires
  // none of these — the orphaned server used to idle forever. The watchdog
  // catches that case: on macOS an orphan is reparented to launchd (ppid 1).
  // (Linux subreapers can mask the ppid change; there this degrades to the
  // old behavior, and the EOF/signal paths still cover clean closes.)
  await new Promise<void>((resolve) => {
    let watchdog: ReturnType<typeof setInterval> | null = null
    const done = () => {
      if (watchdog) clearInterval(watchdog)
      resolve()
    }
    transport.onclose = done
    process.once("SIGINT", done)
    process.once("SIGTERM", done)
    process.once("SIGHUP", done)
    process.stdin.once("end", done)
    process.stdin.once("close", done)
    watchdog = setInterval(() => {
      if (process.ppid === 1) done()
    }, 15_000)
  })
}
