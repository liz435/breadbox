import { describe, expect, test } from "bun:test"
import { boardStateSchema } from "@dreamer/schemas"
import { boardSlice, EPHEMERAL_BOARD_FIELDS } from "../board-slice"
import type { BoardPersistable } from "../board-slice"

// A fully-populated persistable board. Every field carries a distinctive value
// so a dropped field shows up as a missing key rather than a coincidental
// match against a default.
const FULL: BoardPersistable = {
  components: {
    c1: {
      id: "c1",
      type: "led",
      name: "LED 1",
      x: 4,
      y: 3,
      rotation: 0,
      pins: { anode: 13 },
      properties: {},
    },
  },
  wires: {
    w1: { id: "w1", fromRow: 0, fromCol: 0, toRow: 3, toCol: 4, color: "#22c55e" },
  },
  sketchCode: "void setup() {}",
  customLibraries: { lib: { name: "lib", code: "", description: "" } },
  boardTarget: "arduino_uno",
  environment: { obstacles: {}, boundaryEnabled: true, boundaryMargin: 100 },
  assembly: {
    bodies: {
      b1: {
        id: "b1",
        name: "bracket",
        assetId: "asset-1",
        uri: "/assets/model.glb",
        format: "glb",
        parent: { kind: "world" },
        transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: 1 },
        importScale: 1,
        upAxis: "y",
      },
    },
    bindings: [],
  },
}

describe("boardSlice", () => {
  // The bug this guards: `assembly` existed in BoardState, was snapshotted for
  // undo, and was parsed on load — but was missing from the save payload, so
  // 3D assemblies vanished on reload and the server's asset sweep reclaimed
  // every uploaded model. Any BoardState field must be either persisted or
  // explicitly declared ephemeral.
  test("persists every BoardState field that is not explicitly ephemeral", () => {
    const schemaFields = Object.keys(boardStateSchema.shape)
    const expected = schemaFields.filter(
      (field) => !(EPHEMERAL_BOARD_FIELDS as readonly string[]).includes(field),
    )

    const persisted = Object.keys(boardSlice(FULL))

    expect(persisted.sort()).toEqual(expected.sort())
  })

  test("ephemeral fields are real BoardState fields, not stale names", () => {
    const schemaFields = Object.keys(boardStateSchema.shape)
    for (const field of EPHEMERAL_BOARD_FIELDS) {
      expect(schemaFields).toContain(field)
    }
  })

  test("round-trips assembly and environment by value", () => {
    const slice = boardSlice(FULL)
    expect(slice.assembly).toEqual(FULL.assembly)
    expect(slice.environment).toEqual(FULL.environment)
  })

  // The save payload is compared against the last-saved hash via
  // JSON.stringify, so a slice that loses a field would also silently mark the
  // board clean. Assert the serialized payload actually carries the 3D doc.
  test("serialized payload carries the assembly document", () => {
    expect(JSON.stringify(boardSlice(FULL))).toContain("/assets/model.glb")
  })

  test("omits undefined assembly without inventing an empty one", () => {
    const slice = boardSlice({ ...FULL, assembly: undefined })
    expect(slice.assembly).toBeUndefined()
  })
})
