import { describe, expect, test } from "bun:test"
import { createWatchPoller } from "../watch"
import type { ProjectState } from "../project-manager"
import type { ProjectFile } from "@dreamer/schemas"

function makeProject(sketchCode: string): ProjectFile {
  return { boardState: { sketchCode } } as ProjectFile
}

function makeState(project: ProjectFile): ProjectState {
  return {
    projectId: "proj-1",
    sceneId: "scene-1",
    project,
  } as ProjectState
}

describe("createWatchPoller", () => {
  test("runs one initial compile and does not recompile unchanged sketch", async () => {
    const project = makeProject("void setup() {}")
    const state = makeState(project)
    let compileCalls = 0

    const { poll } = createWatchPoller({
      state,
      projectId: "proj-1",
      flashPort: null,
      readProject: async () => project,
      compileSketch: async () => {
        compileCalls++
        return { success: true }
      },
      flashSketch: async () => ({ success: true }),
      log: () => {},
      error: () => {},
      now: () => "12:00:00",
    })

    await poll()
    await poll()

    expect(compileCalls).toBe(1)
  })

  test("recompiles when sketch hash changes after startup", async () => {
    const firstProject = makeProject("void setup() {}")
    const secondProject = makeProject("void setup() {}\nvoid loop() {}")
    const state = makeState(firstProject)
    let currentProject = firstProject
    let compileCalls = 0

    const { poll } = createWatchPoller({
      state,
      projectId: "proj-1",
      flashPort: null,
      readProject: async () => currentProject,
      compileSketch: async () => {
        compileCalls++
        return { success: true }
      },
      flashSketch: async () => ({ success: true }),
      log: () => {},
      error: () => {},
      now: () => "12:00:00",
    })

    await poll()
    currentProject = secondProject
    await poll()

    expect(compileCalls).toBe(2)
  })
})
