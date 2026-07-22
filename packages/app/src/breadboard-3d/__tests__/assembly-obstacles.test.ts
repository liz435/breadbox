import { describe, expect, test } from "bun:test"
import { BoxGeometry, Group, Mesh, MeshBasicMaterial } from "three"
import type { AssemblyBody } from "@dreamer/schemas"
import { assemblyObstacles } from "../assembly-obstacle-model"

function body(id: string, changes: Partial<AssemblyBody> = {}): AssemblyBody {
  return {
    id,
    name: id,
    assetId: `asset-${id}`,
    uri: `/assets/${id}.glb`,
    format: "glb",
    parent: { kind: "world" },
    transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: 1 },
    importScale: 1,
    upAxis: "y",
    ...changes,
  }
}

function boxRoot(position: [number, number, number], size: [number, number, number]): Group {
  const root = new Group()
  root.position.set(...position)
  root.add(new Mesh(new BoxGeometry(...size), new MeshBasicMaterial()))
  root.updateWorldMatrix(true, true)
  return root
}

describe("assemblyObstacles", () => {
  test("turns a visible uploaded body into a world-space obstacle", () => {
    const root = boxRoot([10, 4, -6], [8, 10, 12])
    const obstacles = assemblyObstacles({ model: body("model") }, (id) =>
      id === "model" ? root : undefined,
    )

    expect(obstacles).toHaveLength(1)
    const [obstacle] = obstacles
    expect(obstacle?.kind).toBe("obb")
    if (obstacle?.kind !== "obb") return
    expect(obstacle.obb.cx).toBeCloseTo(10)
    expect(obstacle.obb.cz).toBeCloseTo(-6)
    expect(obstacle.obb.topY).toBeCloseTo(9)
    expect(Math.hypot(obstacle.obb.ux, obstacle.obb.uz)).toBeCloseTo(4)
    expect(Math.hypot(obstacle.obb.vx, obstacle.obb.vz)).toBeCloseTo(6)
  })

  test("skips hidden bodies and nested children already contained by their parent", () => {
    const parent = body("parent")
    const child = body("child", { parent: { kind: "body", bodyId: "parent" } })
    const hidden = body("hidden", { hidden: true })
    const root = boxRoot([0, 3, 0], [4, 6, 4])

    const obstacles = assemblyObstacles(
      { parent, child, hidden },
      (id) => (id === "parent" || id === "hidden" ? root : undefined),
    )

    expect(obstacles).toHaveLength(1)
  })

  test("waits for a live root instead of crashing while a model mounts", () => {
    expect(assemblyObstacles({ model: body("model") })).toEqual([])
  })
})
