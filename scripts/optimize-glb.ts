// ── GLB asset optimizer ──────────────────────────────────────────────────────
//
// The part models are raw CAD/Sketchfab exports: ~1.58M triangles and 82 MB
// across 17 files, with zero textures. All of that is silhouette detail nobody
// can see at breadboard scale, and it is spent in a WKWebView with a weaker
// GL stack than Chrome.
//
// This decimates each model to a sane budget and applies EXT_meshopt_compression.
// No app-side change is needed to read the output: drei's useGLTF already wires
// MeshoptDecoder and defaults useMeshopt to true (@react-three/drei
// core/Gltf.js).
//
//   bun run assets:optimize            # rewrite src/assets/*.glb in place
//   bun run assets:optimize --dry-run  # report only, touch nothing
//
// ── The bounding-box guard ───────────────────────────────────────────────────
//
// glbNormalize (breadboard-3d/glb-parts.tsx) derives a model's whole normalized
// frame from its bounding box — scale is heightMm/size.y, position comes from
// the centre and box.min.y. The baked pin calibrations in
// component-pin-calibration.ts are recorded *in that frame*.
//
// So bbox drift is not cosmetic: it silently moves every calibrated pin, which
// shows up as parts sitting off-hole or warped. Simplification is free to move
// interior vertices but must not move the extents, so this measures the bbox
// before and after and refuses to write anything if any model drifts past a
// tight tolerance. A failure here means that model needs re-calibration, not a
// looser threshold.

import { readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import { Document, NodeIO, type Primitive } from "@gltf-transform/core"
import { EXTMeshoptCompression } from "@gltf-transform/extensions"
import { dedup, prune, simplify, weld } from "@gltf-transform/functions"
import { MeshoptEncoder, MeshoptSimplifier } from "meshoptimizer"

const ASSETS_DIR = join(import.meta.dir, "..", "packages", "app", "src", "assets")

/**
 * Simplification error tolerance, as a fraction of mesh extent. Parts are viewed
 * at breadboard scale where a 0.1% silhouette change is invisible, but the
 * simplifier treats this as a ceiling and stops early when it cannot hit the
 * ratio without exceeding it — so heavy models decimate hard and already-lean
 * ones (temperature-sensor at 1.2k tris) are left essentially alone.
 */
// Measured: loosening this buys almost nothing and costs correctness. At 0.005
// the total only moves 692k → 642k triangles, but arduino-uno drifts 0.50% and
// led 0.36% — both past the bbox guard. The heavy remainder (servo, stepper,
// lcd) is fine detail like screw threads and wire strands, which cannot
// decimate without changing shape, not one coarse mesh waiting to be halved.
const SIMPLIFY_ERROR = 0.001
/** Target fraction of original triangles. The error ceiling above wins if the two conflict. */
const SIMPLIFY_RATIO = 0.1

/**
 * Maximum tolerated bounding-box drift, relative to model size. Pin calibration
 * targets breadboard holes 2.54 mm apart on models tens of mm across, so this
 * keeps worst-case pin error far below a hole radius.
 */
const BBOX_TOLERANCE = 0.002

type Bounds = { min: [number, number, number]; max: [number, number, number] }

/** World-space bounds over every primitive position, with node transforms applied. */
function documentBounds(doc: Document): Bounds {
  const min: [number, number, number] = [Infinity, Infinity, Infinity]
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity]
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh()
    if (!mesh) continue
    const m = node.getWorldMatrix()
    for (const prim of mesh.listPrimitives()) {
      const position = prim.getAttribute("POSITION")
      if (!position) continue
      const v = [0, 0, 0]
      for (let i = 0; i < position.getCount(); i++) {
        position.getElement(i, v)
        // Column-major 4x4, w assumed 1 (no projective node transforms in glTF).
        const x = m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12]
        const y = m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13]
        const z = m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14]
        min[0] = Math.min(min[0], x); max[0] = Math.max(max[0], x)
        min[1] = Math.min(min[1], y); max[1] = Math.max(max[1], y)
        min[2] = Math.min(min[2], z); max[2] = Math.max(max[2], z)
      }
    }
  }
  return { min, max }
}

function triangleCount(doc: Document): number {
  let tris = 0
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      tris += primitiveTriangles(prim)
    }
  }
  return tris
}

function primitiveTriangles(prim: Primitive): number {
  const indices = prim.getIndices()
  const count = indices ? indices.getCount() : (prim.getAttribute("POSITION")?.getCount() ?? 0)
  return Math.floor(count / 3)
}

/** Largest per-axis drift in size and centre, relative to the original size. */
function boundsDrift(before: Bounds, after: Bounds): number {
  let worst = 0
  for (let axis = 0; axis < 3; axis++) {
    const sizeBefore = before.max[axis] - before.min[axis]
    if (sizeBefore <= 1e-9) continue
    const sizeAfter = after.max[axis] - after.min[axis]
    const centreBefore = (before.max[axis] + before.min[axis]) / 2
    const centreAfter = (after.max[axis] + after.min[axis]) / 2
    worst = Math.max(
      worst,
      Math.abs(sizeAfter - sizeBefore) / sizeBefore,
      Math.abs(centreAfter - centreBefore) / sizeBefore,
    )
  }
  return worst
}

type Result = {
  file: string
  trisBefore: number
  trisAfter: number
  bytesBefore: number
  bytesAfter: number
  drift: number
}

async function optimize(io: NodeIO, file: string, dryRun: boolean): Promise<Result> {
  const path = join(ASSETS_DIR, file)
  const bytesBefore = statSync(path).size
  const doc = await io.read(path)

  const trisBefore = triangleCount(doc)
  const before = documentBounds(doc)

  // weld before simplify: the simplifier collapses edges, and unwelded exports
  // (every triangle its own vertices) present no shared edges to collapse.
  await doc.transform(
    dedup(),
    weld(),
    simplify({ simplifier: MeshoptSimplifier, ratio: SIMPLIFY_RATIO, error: SIMPLIFY_ERROR }),
    prune({ keepAttributes: false }),
  )

  const trisAfter = triangleCount(doc)
  const drift = boundsDrift(before, documentBounds(doc))

  doc.createExtension(EXTMeshoptCompression)
    .setRequired(true)
    .setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE })

  const bytesAfter = (await io.writeBinary(doc)).byteLength
  if (!dryRun && drift <= BBOX_TOLERANCE) {
    await io.write(path, doc)
  }
  return { file, trisBefore, trisAfter, bytesBefore, bytesAfter, drift }
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run")
  await MeshoptEncoder.ready
  await MeshoptSimplifier.ready
  const io = new NodeIO()
    .registerExtensions([EXTMeshoptCompression])
    .registerDependencies({ "meshopt.encoder": MeshoptEncoder, "meshopt.decoder": MeshoptEncoder })

  const files = readdirSync(ASSETS_DIR).filter((f) => f.endsWith(".glb")).sort()
  if (files.length === 0) throw new Error(`no .glb files in ${ASSETS_DIR}`)

  const results: Result[] = []
  for (const file of files) {
    results.push(await optimize(io, file, dryRun))
  }

  const failed = results.filter((r) => r.drift > BBOX_TOLERANCE)
  const mb = (b: number) => (b / 1048576).toFixed(1).padStart(6)

  console.log(`\n${"model".padEnd(26)}${"tris".padStart(20)}${"size".padStart(18)}   bbox drift`)
  for (const r of results.sort((a, b) => b.trisBefore - a.trisBefore)) {
    const kept = ((r.trisAfter / r.trisBefore) * 100).toFixed(0)
    console.log(
      `${r.file.padEnd(26)}${r.trisBefore.toLocaleString().padStart(9)} →${r.trisAfter.toLocaleString().padStart(8)} (${kept.padStart(2)}%)` +
        `${mb(r.bytesBefore)} →${mb(r.bytesAfter)} MB   ${(r.drift * 100).toFixed(4)}%` +
        `${r.drift > BBOX_TOLERANCE ? "  ← DRIFT" : ""}`,
    )
  }
  const sum = (pick: (r: Result) => number) => results.reduce((a, r) => a + pick(r), 0)
  console.log(
    `\n${"TOTAL".padEnd(26)}${sum((r) => r.trisBefore).toLocaleString().padStart(9)} →` +
      `${sum((r) => r.trisAfter).toLocaleString().padStart(8)}      ` +
      `${mb(sum((r) => r.bytesBefore))} →${mb(sum((r) => r.bytesAfter))} MB`,
  )

  if (failed.length > 0) {
    console.error(
      `\n✗ ${failed.length} model(s) drifted past ${(BBOX_TOLERANCE * 100).toFixed(2)}% — NOTHING was written.\n` +
        `  Baked pin calibrations live in the bbox-derived normalized frame, so writing these\n` +
        `  would move calibrated pins off their holes. Re-calibrate those types (or exclude\n` +
        `  them) rather than raising the tolerance:\n` +
        failed.map((r) => `    ${r.file} — ${(r.drift * 100).toFixed(4)}%`).join("\n"),
    )
    process.exit(1)
  }
  console.log(dryRun ? "\n(dry run — nothing written)" : "\n✓ bbox guard clean; assets rewritten")
}

await main()
