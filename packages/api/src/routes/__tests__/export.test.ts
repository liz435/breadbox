/**
 * API route tests for POST /api/export/model.
 *
 * Uses Elysia's .handle() for in-process HTTP testing (no real server) and
 * points saves at a temp dir via BREADBOX_DOWNLOAD_DIR so nothing lands in the
 * developer's real Downloads folder.
 */
import { describe, test, expect, afterAll, beforeAll } from "bun:test"
import { mkdtemp, rm, readdir, readFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"

const TEST_DOWNLOAD_DIR = await mkdtemp(join(tmpdir(), "dreamer-export-"))
process.env.BREADBOX_DOWNLOAD_DIR = TEST_DOWNLOAD_DIR

const { exportRoutes } = await import("../export")
const { Elysia } = await import("elysia")
const app = new Elysia().use(exportRoutes)

afterAll(async () => {
  await rm(TEST_DOWNLOAD_DIR, { recursive: true, force: true })
})

function post(file: Blob | null, name = "part.glb") {
  const body = new FormData()
  if (file) body.append("file", file, name)
  return app.handle(
    new Request("http://localhost/api/export/model", { method: "POST", body }),
  )
}

// A minimal valid GLB header (magic "glTF", version 2) plus some payload.
function fakeGlb(bytes = 64): Blob {
  const buf = new Uint8Array(bytes)
  buf.set([0x67, 0x6c, 0x54, 0x46, 0x02, 0x00, 0x00, 0x00], 0)
  return new Blob([buf], { type: "model/gltf-binary" })
}

describe("POST /api/export/model", () => {
  test("saves the file and returns its path", async () => {
    const res = await post(fakeGlb(), "assembly.glb")
    expect(res.status).toBe(200)
    const json = (await res.json()) as { path: string }
    expect(json.path).toBe(join(TEST_DOWNLOAD_DIR, "assembly.glb"))
    const contents = await readFile(json.path)
    expect(contents.byteLength).toBe(64)
    expect(contents.subarray(0, 4).toString("ascii")).toBe("glTF")
  })

  test("avoids clobbering an existing file by suffixing", async () => {
    await post(fakeGlb(), "dupe.glb")
    const res = await post(fakeGlb(), "dupe.glb")
    const json = (await res.json()) as { path: string }
    expect(json.path).toBe(join(TEST_DOWNLOAD_DIR, "dupe (1).glb"))
  })

  test("sanitizes path-traversal names into a single segment", async () => {
    const res = await post(fakeGlb(), "../../etc/evil.glb")
    const json = (await res.json()) as { path: string }
    // basename strips the dirs; the result stays inside the download dir.
    expect(json.path).toBe(join(TEST_DOWNLOAD_DIR, "evil.glb"))
    const entries = await readdir(TEST_DOWNLOAD_DIR)
    expect(entries).toContain("evil.glb")
  })

  test("rejects a missing file field", async () => {
    const res = await post(null)
    expect(res.status).toBe(400)
  })

  test("rejects an empty file", async () => {
    const res = await post(new Blob([], { type: "model/gltf-binary" }), "empty.glb")
    expect(res.status).toBe(400)
  })
})
