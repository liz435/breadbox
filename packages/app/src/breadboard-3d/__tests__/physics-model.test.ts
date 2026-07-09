import { describe, expect, test } from "bun:test"
import {
  assemblyBodySchema,
  boardComponentSchema,
  type AssemblyBody,
  type BoardComponent,
} from "@dreamer/schemas"
import { gridPointToWorld, pxToMm } from "../layout"
import {
  assemblyBodyPhysicsKind,
  partColliderBox,
  resolvePartDrop,
} from "../physics-model"
import { partHeightMm } from "../part-obstacles"

function body(over: Record<string, unknown>): AssemblyBody {
  return assemblyBodySchema.parse({
    id: "b",
    name: "b",
    assetId: "asset",
    uri: "/uploads/b.glb",
    format: "glb",
    ...over,
  })
}

function board(id: string, worldX: number, worldY: number): BoardComponent {
  return boardComponentSchema.parse({
    id,
    type: "breadboard_full",
    name: id,
    x: 0,
    y: 0,
    pins: {},
    properties: {},
    parentId: null,
    worldX,
    worldY,
  })
}

function part(type: string, x: number, y: number): BoardComponent {
  return boardComponentSchema.parse({
    id: "p",
    type,
    name: type,
    x,
    y,
    pins: {},
    properties: {},
    parentId: null,
  })
}

describe("assemblyBodyPhysicsKind", () => {
  test("world-parented, no joint → dynamic", () => {
    expect(assemblyBodyPhysicsKind(body({ parent: { kind: "world" } }))).toBe("dynamic")
  })

  test("body-parented → attached", () => {
    expect(
      assemblyBodyPhysicsKind(body({ parent: { kind: "body", bodyId: "b0" } })),
    ).toBe("attached")
  })

  test("component-parented → kinematic", () => {
    expect(
      assemblyBodyPhysicsKind(body({ parent: { kind: "component", componentId: "c1" } })),
    ).toBe("kinematic")
  })

  test("a signal-bound joint forces kinematic, even world-parented", () => {
    expect(
      assemblyBodyPhysicsKind(
        body({ parent: { kind: "world" }, joint: { pivot: [0, 0, 0], axis: [0, 1, 0] } }),
      ),
    ).toBe("kinematic")
  })

  test("joint wins over body parenting too", () => {
    expect(
      assemblyBodyPhysicsKind(
        body({
          parent: { kind: "body", bodyId: "b0" },
          joint: { pivot: [0, 0, 0], axis: [0, 1, 0] },
        }),
      ),
    ).toBe("kinematic")
  })
})

describe("partColliderBox", () => {
  test("box sits on the surface with datasheet height", () => {
    const height = partHeightMm("led")
    const box = partColliderBox(part("led", 3, 4))
    expect(box.halfExtents[0]).toBeGreaterThan(0)
    expect(box.halfExtents[2]).toBeGreaterThan(0)
    // Vertical half-extent and offset both derive from the part height.
    expect(box.halfExtents[1]).toBeCloseTo(height / 2, 6)
    expect(box.offsetY).toBeCloseTo(height / 2, 6)
  })
})

describe("resolvePartDrop", () => {
  test("round-trips a hole on the default board back to its grid + parent", () => {
    const bb = board("breadboard-1", 0, 0)
    const world = gridPointToWorld({ row: 3, col: 4 })
    expect(resolvePartDrop(world.x, world.z, [bb])).toEqual({
      x: 4,
      y: 3,
      parentId: "breadboard-1",
    })
  })

  test("resolves onto whichever board the release lands on (multi-board)", () => {
    const bb1 = board("breadboard-1", 0, 0)
    const bb2 = board("breadboard-2", 200, -50)
    // A part sitting at local (row 3, col 4) of the offset board lives at that
    // hole's world position plus the board's world offset.
    const local = gridPointToWorld({ row: 3, col: 4 })
    const drop = resolvePartDrop(local.x + pxToMm(200), local.z + pxToMm(-50), [bb1, bb2])
    expect(drop).toEqual({ x: 4, y: 3, parentId: "breadboard-2" })
  })

  test("released off every board → global grid, no parent", () => {
    const bb = board("breadboard-1", 0, 0)
    const drop = resolvePartDrop(-100_000, -100_000, [bb])
    expect(drop.parentId).toBeNull()
  })
})
