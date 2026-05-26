/**
 * In-process tests for the MCP handler layer. We bypass stdio and the
 * McpServer wrapper entirely — each test drives handlers.ts directly
 * against a real (but temp) projectRepo.
 */
import { describe, test, expect, beforeAll, afterEach, afterAll } from "bun:test"
import { mkdtemp, rm } from "fs/promises"
import { join } from "path"
import { tmpdir } from "os"

const TEST_DATA_DIR = await mkdtemp(join(tmpdir(), "dreamer-mcp-handlers-"))
const PREVIOUS_DATA_DIR = process.env.DATA_DIR
process.env.DATA_DIR = TEST_DATA_DIR

const { projectRepo } = await import("@dreamer/api/db/adapters/file/project-repo")
const {
  applyDesign,
  analyzePowerBudgetHandler,
  getBoardState,
  getComponentDetails,
  getCurrentProject,
  getSketchCode,
  getWiringGuide,
  listComponents,
  listProjects,
  listWires,
  patchSketch,
  setCurrentProject,
  updateSketch,
  validateDesign,
} = await import("../handlers")
const { LOCAL_OWNER_ID, NoProjectSelectedError, createSession } = await import(
  "../context"
)

const created: string[] = []

async function makeProject(name: string) {
  const p = await projectRepo.createProject({
    ownerId: LOCAL_OWNER_ID,
    name,
  })
  created.push(p.project.id)
  return p
}

afterEach(async () => {
  await Promise.all(
    created.map((id) => projectRepo.deleteProject(id, LOCAL_OWNER_ID)),
  )
  created.length = 0
})

afterAll(async () => {
  await rm(TEST_DATA_DIR, { recursive: true, force: true })
  // Restore DATA_DIR so later tests in the same run don't inherit our tmp path.
  if (PREVIOUS_DATA_DIR === undefined) delete process.env.DATA_DIR
  else process.env.DATA_DIR = PREVIOUS_DATA_DIR
})

// ── Project selection ──────────────────────────────────────────────────

describe("project selection", () => {
  test("getCurrentProject returns null before selection", () => {
    const session = createSession(null)
    expect(getCurrentProject(session)).toEqual({ projectId: null })
  })

  test("setCurrentProject switches the session", async () => {
    const p = await makeProject("Session test")
    const session = createSession(null)
    const result = await setCurrentProject(session, { projectId: p.project.id })
    expect(result.ok).toBe(true)
    expect(result.projectId).toBe(p.project.id)
    expect(session.currentProjectId).toBe(p.project.id)
  })

  test("setCurrentProject throws on unknown id", async () => {
    const session = createSession(null)
    await expect(
      setCurrentProject(session, { projectId: "does-not-exist" }),
    ).rejects.toThrow("Project not found")
  })

  test("listProjects returns every project on disk", async () => {
    const a = await makeProject("Alpha")
    const b = await makeProject("Beta")
    const result = await listProjects()
    const ids = result.projects.map((p) => p.id)
    expect(ids).toContain(a.project.id)
    expect(ids).toContain(b.project.id)
  })

  test("reads fail with NoProjectSelectedError when unset", async () => {
    const session = createSession(null)
    await expect(getBoardState(session)).rejects.toBeInstanceOf(
      NoProjectSelectedError,
    )
  })
})

// ── Reads ──────────────────────────────────────────────────────────────

describe("read handlers", () => {
  test("getBoardState on an empty project returns the empty DSL fallback", async () => {
    const p = await makeProject("Empty")
    const session = createSession(p.project.id)
    const diagram = await getBoardState(session)
    expect(diagram.$schema).toBe("dreamer-diagram-v1")
    expect(diagram.board).toBe("arduino_uno")
    expect(diagram.components).toEqual([])
    expect(diagram.wires).toEqual([])
  })

  test("list_components and list_wires mirror get_board_state", async () => {
    const p = await makeProject("Lists")
    const session = createSession(p.project.id)
    const comps = await listComponents(session)
    const wires = await listWires(session)
    expect(comps.components).toEqual([])
    expect(wires.wires).toEqual([])
  })

  test("getSketchCode returns empty string for a fresh project", async () => {
    const p = await makeProject("Sketch")
    const session = createSession(p.project.id)
    const result = await getSketchCode(session)
    expect(result.sketch).toBe("")
  })

  test("getWiringGuide returns the static reference", () => {
    const result = getWiringGuide()
    expect(result.guide).toContain("## Wire Colors")
    expect(result.guide).toContain("## Pin Names")
  })

  test("analyzePowerBudget on empty board returns a note", async () => {
    const p = await makeProject("Power")
    const session = createSession(p.project.id)
    const result = await analyzePowerBudgetHandler(session)
    expect(result).toMatchObject({ note: expect.any(String) })
  })
})

// ── validate_design ────────────────────────────────────────────────────

describe("validate_design", () => {
  test("clean diagram → ok: true, zero errors", () => {
    const result = validateDesign({
      board: "arduino_uno",
      sketch: "void setup(){}\nvoid loop(){}",
      components: [
        {
          id: "led1",
          type: "led",
          at: [5, 7],
          rotation: 0,
          properties: { color: "#ef4444" },
        },
        {
          id: "r1",
          type: "resistor",
          at: [5, 3],
          rotation: 0,
          properties: { resistance: 220 },
        },
      ],
      wires: [
        { from: "arduino.13", to: "led1.anode", color: "#22c55e" },
        { from: "led1.cathode", to: "r1.b", color: "#1e293b" },
        { from: "r1.a", to: "arduino.GND", color: "#1e293b" },
      ],
    })
    expect(result.ok).toBe(true)
    expect(result.errorCount).toBe(0)
  })

  test("unknown pin name → error issue", () => {
    const result = validateDesign({
      board: "arduino_uno",
      sketch: "void setup(){}\nvoid loop(){}",
      components: [
        {
          id: "led1",
          type: "led",
          at: [5, 7],
          rotation: 0,
          properties: { color: "#ef4444" },
        },
      ],
      wires: [
        { from: "arduino.13", to: "led1.notapin", color: "#22c55e" },
      ],
    })
    expect(result.ok).toBe(false)
    expect(result.errorCount).toBeGreaterThan(0)
  })
})

// ── apply_design ───────────────────────────────────────────────────────

describe("apply_design", () => {
  test("applies a minimal circuit and bumps project version", async () => {
    const p = await makeProject("Apply test")
    const session = createSession(p.project.id)
    const startVersion = p.project.version

    const result = await applyDesign(session, {
      board: "arduino_uno",
      sketch: "void setup(){pinMode(13,OUTPUT);}\nvoid loop(){digitalWrite(13,HIGH);delay(1000);digitalWrite(13,LOW);delay(1000);}",
      components: [
        {
          id: "led1",
          type: "led",
          at: [5, 7],
          rotation: 0,
          properties: { color: "#ef4444" },
        },
        {
          id: "r1",
          type: "resistor",
          at: [5, 3],
          rotation: 0,
          properties: { resistance: 220 },
        },
      ],
      wires: [
        { from: "arduino.13", to: "led1.anode", color: "#22c55e" },
        { from: "led1.cathode", to: "r1.b", color: "#1e293b" },
        { from: "r1.a", to: "arduino.GND", color: "#1e293b" },
      ],
    })

    expect(result).toMatchObject({
      ok: true,
      componentCount: 2,
      wireCount: 3,
    })
    if (result.ok) {
      expect(result.newVersion).toBe(startVersion + 1)
    }

    // Verify persistence: re-read board state.
    const diagram = await getBoardState(session)
    expect(diagram.components).toHaveLength(2)
    expect(diagram.wires).toHaveLength(3)
  })

  test("invalid diagram returns ok:false with issues, no mutation", async () => {
    const p = await makeProject("Invalid")
    const session = createSession(p.project.id)

    const result = await applyDesign(session, {
      board: "arduino_uno",
      sketch: "void setup(){}\nvoid loop(){}",
      components: [
        {
          id: "led1",
          type: "led",
          at: [5, 7],
          rotation: 0,
          properties: {},
        },
      ],
      wires: [
        { from: "arduino.99", to: "led1.notapin", color: "#22c55e" },
      ],
    })
    expect(result.ok).toBe(false)

    const diagram = await getBoardState(session)
    expect(diagram.components).toHaveLength(0)
  })

  test("malformed sketch is rejected before apply", async () => {
    const p = await makeProject("Bad sketch")
    const session = createSession(p.project.id)

    const result = await applyDesign(session, {
      board: "arduino_uno",
      sketch: "void setup(){ /* unbalanced",
      components: [],
      wires: [],
    })
    expect(result.ok).toBe(false)
    if (!result.ok && "error" in result) {
      expect(result.error).toContain("Sketch validation failed")
    }
  })
})

// ── sketch editing ─────────────────────────────────────────────────────

describe("sketch handlers", () => {
  test("updateSketch replaces the sketch", async () => {
    const p = await makeProject("Sketch update")
    const session = createSession(p.project.id)

    const code = "void setup(){pinMode(13,OUTPUT);}\nvoid loop(){}"
    const result = await updateSketch(session, { code })
    expect(result.ok).toBe(true)

    const after = await getSketchCode(session)
    expect(after.sketch).toBe(code)
  })

  test("updateSketch rejects malformed code", async () => {
    const p = await makeProject("Sketch reject")
    const session = createSession(p.project.id)
    const result = await updateSketch(session, {
      code: "void setup(){ // no loop",
    })
    expect(result.ok).toBe(false)
  })

  test("patchSketch replaces a line range", async () => {
    const p = await makeProject("Patch")
    const session = createSession(p.project.id)

    await updateSketch(session, {
      code: "void setup(){}\nvoid loop(){\n// old\n}",
    })
    const result = await patchSketch(session, {
      startLine: 3,
      endLine: 3,
      newCode: "// new",
    })
    expect(result.ok).toBe(true)

    const after = await getSketchCode(session)
    expect(after.sketch).toContain("// new")
    expect(after.sketch).not.toContain("// old")
  })

  test("patchSketch rejects out-of-range line numbers", async () => {
    const p = await makeProject("Patch range")
    const session = createSession(p.project.id)
    await updateSketch(session, {
      code: "void setup(){}\nvoid loop(){}",
    })
    const result = await patchSketch(session, {
      startLine: 10,
      endLine: 20,
      newCode: "// oob",
    })
    expect(result.ok).toBe(false)
  })
})

// ── component details ─────────────────────────────────────────────────

describe("getComponentDetails", () => {
  test("returns the component by id after apply_design", async () => {
    const p = await makeProject("Details")
    const session = createSession(p.project.id)
    await applyDesign(session, {
      board: "arduino_uno",
      sketch: "void setup(){}\nvoid loop(){}",
      components: [
        {
          id: "led1",
          type: "led",
          at: [5, 7],
          rotation: 0,
          properties: { color: "#ef4444" },
        },
      ],
      wires: [],
    })

    const details = await getComponentDetails(session, { componentId: "led1" })
    expect(details).toMatchObject({ id: "led1", type: "led" })
  })

  test("returns an error with available ids when the id is unknown", async () => {
    const p = await makeProject("Details missing")
    const session = createSession(p.project.id)
    const result = await getComponentDetails(session, {
      componentId: "nope",
    })
    expect(result).toMatchObject({
      error: expect.stringContaining("Component not found"),
    })
  })
})
