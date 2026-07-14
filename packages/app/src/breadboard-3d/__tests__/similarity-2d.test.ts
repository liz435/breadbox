import { describe, expect, test } from "bun:test"
import { applySimilarity2D, fitSimilarity2D, type P2 } from "../similarity-2d"

/** Round-trip: fitting src→dst then applying should reproduce dst. */
function expectMapsOnto(src: P2[], dst: P2[]) {
  const t = fitSimilarity2D(src, dst)
  src.forEach((p, i) => {
    const got = applySimilarity2D(t, p)
    expect(got.x).toBeCloseTo(dst[i].x, 6)
    expect(got.z).toBeCloseTo(dst[i].z, 6)
  })
  return t
}

describe("fitSimilarity2D", () => {
  test("pure uniform scale from two points", () => {
    const t = expectMapsOnto(
      [{ x: 0, z: 0 }, { x: 1, z: 0 }],
      [{ x: 0, z: 0 }, { x: 2, z: 0 }],
    )
    expect(t.scale).toBeCloseTo(2, 6)
    expect(t.rotation).toBeCloseTo(0, 6)
  })

  test("90° rotation recovered", () => {
    const t = expectMapsOnto(
      [{ x: 1, z: 0 }, { x: 0, z: 1 }],
      [{ x: 0, z: 1 }, { x: -1, z: 0 }],
    )
    expect(t.scale).toBeCloseTo(1, 6)
    expect(t.rotation).toBeCloseTo(Math.PI / 2, 6)
  })

  test("scale + rotation + translation together", () => {
    // src pins, then transform by a known similarity to build dst.
    const src: P2[] = [
      { x: -2, z: -1 },
      { x: 3, z: 0 },
      { x: 1, z: 4 },
    ]
    const truth = { scale: 1.7, rotation: 0.9, tx: 12, tz: -5 }
    const dst = src.map((p) => applySimilarity2D(truth, p))
    const t = expectMapsOnto(src, dst)
    expect(t.scale).toBeCloseTo(1.7, 5)
    expect(t.rotation).toBeCloseTo(0.9, 5)
    expect(t.tx).toBeCloseTo(12, 5)
    expect(t.tz).toBeCloseTo(-5, 5)
  })

  test("least-squares averages a noisy correspondence (>2 points)", () => {
    // Perfect scale-2 mapping plus one perturbed point; fit stays near 2.
    const src: P2[] = [
      { x: 0, z: 0 },
      { x: 1, z: 0 },
      { x: 0, z: 1 },
      { x: 1, z: 1 },
    ]
    const dst: P2[] = [
      { x: 0, z: 0 },
      { x: 2, z: 0 },
      { x: 0, z: 2 },
      { x: 2.2, z: 1.8 }, // noisy
    ]
    const t = fitSimilarity2D(src, dst)
    expect(t.scale).toBeGreaterThan(1.9)
    expect(t.scale).toBeLessThan(2.1)
  })

  test("single point yields translation only", () => {
    const t = fitSimilarity2D([{ x: 5, z: 7 }], [{ x: 8, z: 3 }])
    expect(t.scale).toBe(1)
    expect(t.rotation).toBe(0)
    expect(t.tx).toBeCloseTo(3, 6)
    expect(t.tz).toBeCloseTo(-4, 6)
  })
})
