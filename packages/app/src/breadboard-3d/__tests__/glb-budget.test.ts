// ── Shipped GLB budget ───────────────────────────────────────────────────────
//
// The part models started as raw CAD exports: 1.58M triangles and 82 MB across
// 17 files, every byte of it downloaded and uploaded to the GPU in a WKWebView
// with a weaker GL stack than Chrome. `bun run assets:optimize` decimates them
// and applies EXT_meshopt_compression.
//
// Dropping a fresh unoptimized export into src/assets is easy and the symptom
// (a slower, hitchier 3D tab) is diffuse enough that nobody would trace it back.
// These ceilings make that a test failure instead.

import { describe, expect, test } from "bun:test"
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"

const ASSETS_DIR = join(import.meta.dir, "..", "..", "assets")

/** Generous headroom over current values — this catches a 12 MB raw export,
 *  not a model that grew by a few percent from a legitimate re-authoring. */
const MAX_TRIANGLES_PER_MODEL = 200_000
const MAX_BYTES_PER_MODEL = 7 * 1024 * 1024
const MAX_TOTAL_TRIANGLES = 900_000
const MAX_TOTAL_BYTES = 28 * 1024 * 1024

type GlbStats = { triangles: number; bytes: number; extensions: string[] }

/** Read the JSON chunk of a .glb (12-byte header, then a chunk header at 12). */
function readGlb(path: string): GlbStats {
  const buffer = readFileSync(path)
  const jsonLength = buffer.readUInt32LE(12)
  const json = JSON.parse(buffer.subarray(20, 20 + jsonLength).toString("utf8")) as {
    meshes?: Array<{ primitives: Array<{ indices?: number; attributes: Record<string, number> }> }>
    accessors?: Array<{ count: number }>
    extensionsUsed?: string[]
  }
  let triangles = 0
  for (const mesh of json.meshes ?? []) {
    for (const primitive of mesh.primitives) {
      const accessor = primitive.indices ?? primitive.attributes.POSITION
      triangles += Math.floor((json.accessors?.[accessor]?.count ?? 0) / 3)
    }
  }
  return { triangles, bytes: statSync(path).size, extensions: json.extensionsUsed ?? [] }
}

const files = readdirSync(ASSETS_DIR).filter((f) => f.endsWith(".glb")).sort()
const stats = new Map(files.map((f) => [f, readGlb(join(ASSETS_DIR, f))]))

describe("shipped GLB assets stay within budget", () => {
  test("the asset directory is not empty (guards a broken path)", () => {
    expect(files.length).toBeGreaterThan(10)
  })

  for (const file of files) {
    test(`${file} is decimated and compressed`, () => {
      const { triangles, bytes, extensions } = stats.get(file)!
      expect({ file, overTriangles: triangles > MAX_TRIANGLES_PER_MODEL })
        .toEqual({ file, overTriangles: false })
      expect({ file, overBytes: bytes > MAX_BYTES_PER_MODEL })
        .toEqual({ file, overBytes: false })
      // Without the extension the file is uncompressed, which means it bypassed
      // the optimizer entirely — the single most likely way this regresses.
      expect({ file, compressed: extensions.includes("EXT_meshopt_compression") })
        .toEqual({ file, compressed: true })
    })
  }

  test("the whole set fits the scene budget", () => {
    const totals = [...stats.values()].reduce(
      (acc, s) => ({ triangles: acc.triangles + s.triangles, bytes: acc.bytes + s.bytes }),
      { triangles: 0, bytes: 0 },
    )
    expect(totals.triangles).toBeLessThan(MAX_TOTAL_TRIANGLES)
    expect(totals.bytes).toBeLessThan(MAX_TOTAL_BYTES)
  })
})
