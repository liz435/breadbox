// Anonymous-preview project factory. When a visitor lands on the hosted
// site without a session, we don't hit the API — instead we synthesize
// an in-memory ProjectFile wrapping a bundled example board so the
// editor boots with something interactive. Every mutating call path is
// gated separately (api-client.ts short-circuits mutations in preview
// mode, surfacing a "Sign in to save" toast).

import type { ProjectFile } from "./schemas"
import type { BoardState } from "@dreamer/schemas"

// Eager import so the example is in the initial bundle — no waterfall on
// first paint. Matches the same glob pattern the example catalog uses.
const exampleModules = import.meta.glob("../examples/boards/*.json", {
  eager: true,
  import: "default",
}) as Record<string, BoardState>

const PREVIEW_DEFAULT_KEY = "ex-led"

function pickPreviewBoard(): BoardState | null {
  for (const [path, board] of Object.entries(exampleModules)) {
    if (path.includes(PREVIEW_DEFAULT_KEY)) return board
  }
  const first = Object.values(exampleModules)[0]
  return first ?? null
}

const PREVIEW_PROJECT_ID = "preview"
const PREVIEW_SCENE_ID = "preview-scene"
const PREVIEW_THREAD_ID = "preview-thread"
const PREVIEW_OWNER_ID = "preview"

/**
 * Build an in-memory ProjectFile for anonymous visitors. Uses a bundled
 * example as the initial board so the UI has something meaningful to
 * render; everything else is the minimum shape the project-file schema
 * and the app's reducers expect.
 */
export function createPreviewProjectFile(): ProjectFile {
  const now = new Date().toISOString()
  const board = pickPreviewBoard()
  const file: ProjectFile = {
    project: {
      id: PREVIEW_PROJECT_ID,
      name: "Preview",
      ownerId: PREVIEW_OWNER_ID,
      version: 0,
      createdAt: now,
      updatedAt: now,
      threadId: PREVIEW_THREAD_ID,
      activeSceneId: PREVIEW_SCENE_ID,
    },
    scenes: {
      [PREVIEW_SCENE_ID]: {
        id: PREVIEW_SCENE_ID,
        name: "Preview Scene",
        version: 0,
        settings: {
          background: "#0b0f19",
          gravity: { x: 0, y: 0 },
        },
      },
    },
    entities: {},
    sceneEntityIds: { [PREVIEW_SCENE_ID]: [] },
    components: {
      transform: {},
      sprite: {},
      tilemap: {},
      physicsBody: {},
      script: {},
      camera: {},
    },
    assets: {},
    graph: { nodes: {}, edges: {} },
  }
  if (board) {
    file.boardState = board
  }
  return file
}
