// ── Live 3D seven-segment panel ──────────────────────────────────────────────
//
// Paints a real 7-segment digit onto a CanvasTexture so the GLB display module
// shows lit numbers instead of the model's static printed "8.". glb-parts
// overlays a flat plane on the module's front face and maps this texture onto
// it; the animation driver calls `paint()` each frame with the 8 segment levels
// (0..1, in SEVEN_SEGMENT_ORDER — a,b,c,d,e,f,g,dp), the same per-pin levels the
// procedural SevenSegmentModel lights its emissive bars with. `paint` dedups and
// returns whether the texture actually changed (so the on-demand render loop
// only invalidates on a real change).

import { CanvasTexture, SRGBColorSpace } from "three"

// Canvas aspect (taller than wide, ~0.67) matches the module's digit face so the
// beveled segment bars aren't stretched when mapped onto the overlay plane.
const WIDTH = 256
const HEIGHT = 384

// Face + segment colours: a dark red-black glass with segments that go from
// nearly-off (a faint ghost, like an unlit real segment) to bright red.
const BG: readonly [number, number, number] = [0x14, 0x06, 0x06]
const SEG_OFF: readonly [number, number, number] = [0x3a, 0x0d, 0x0d]
const SEG_ON: readonly [number, number, number] = [0xff, 0x40, 0x38]

type Pt = [number, number]

/** Beveled (hexagonal) horizontal bar centred at (cx,cy), length L along x. */
function hBar(cx: number, cy: number, L: number, t: number): Pt[] {
  const h = t / 2
  const l = L / 2
  return [
    [cx - l, cy],
    [cx - l + h, cy - h],
    [cx + l - h, cy - h],
    [cx + l, cy],
    [cx + l - h, cy + h],
    [cx - l + h, cy + h],
  ]
}

/** Beveled (hexagonal) vertical bar centred at (cx,cy), length L along y. */
function vBar(cx: number, cy: number, L: number, t: number): Pt[] {
  const h = t / 2
  const l = L / 2
  return [
    [cx, cy - l],
    [cx + h, cy - l + h],
    [cx + h, cy + l - h],
    [cx, cy + l],
    [cx - h, cy + l - h],
    [cx - h, cy - l + h],
  ]
}

/** Segment polygons in SEVEN_SEGMENT_ORDER (a,b,c,d,e,f,g,dp) for a digit box. */
function segmentPolys(): { a: Pt[]; b: Pt[]; c: Pt[]; d: Pt[]; e: Pt[]; f: Pt[]; g: Pt[] } {
  const dh = HEIGHT * 0.82
  const t = dh * 0.13
  const dw = dh * 0.48
  const y0 = (HEIGHT - dh) / 2
  // Shift the digit left of centre so the decimal dot has room on the right.
  const x0 = (WIDTH - dw) / 2 - t
  const midX = x0 + dw / 2
  const gap = t * 0.28
  const Lh = dw - t - gap
  const Lv = dh / 2 - t - gap
  const yUpper = y0 + dh / 4
  const yLower = y0 + (dh * 3) / 4
  return {
    a: hBar(midX, y0 + t / 2, Lh, t),
    b: vBar(x0 + dw - t / 2, yUpper, Lv, t),
    c: vBar(x0 + dw - t / 2, yLower, Lv, t),
    d: hBar(midX, y0 + dh - t / 2, Lh, t),
    e: vBar(x0 + t / 2, yLower, Lv, t),
    f: vBar(x0 + t / 2, yUpper, Lv, t),
    g: hBar(midX, y0 + dh / 2, Lh, t),
  }
}

function dpCircle(): { x: number; y: number; r: number } {
  const dh = HEIGHT * 0.82
  const t = dh * 0.13
  const dw = dh * 0.48
  const y0 = (HEIGHT - dh) / 2
  const x0 = (WIDTH - dw) / 2 - t
  return { x: x0 + dw + t * 0.9, y: y0 + dh - t / 2, r: t * 0.55 }
}

function mix(off: readonly number[], on: readonly number[], k: number): string {
  const r = Math.round(off[0] + (on[0] - off[0]) * k)
  const g = Math.round(off[1] + (on[1] - off[1]) * k)
  const b = Math.round(off[2] + (on[2] - off[2]) * k)
  return `rgb(${r},${g},${b})`
}

export type SevenSegmentScreen = {
  texture: CanvasTexture
  /** Repaint from per-segment levels (0..1) in SEVEN_SEGMENT_ORDER. Returns true
   *  when the drawing changed (so the render loop can invalidate on demand). */
  paint: (levels: number[]) => boolean
  dispose: () => void
}

/** A self-contained 7-segment panel: a CanvasTexture plus a `paint` that redraws
 *  the beveled a–g + dp segments from their lit levels. No-op (returns false) if
 *  a 2D context isn't available (SSR/headless). */
export function createSevenSegmentScreen(): SevenSegmentScreen {
  const canvas = typeof document !== "undefined" ? document.createElement("canvas") : null
  const ctx = canvas?.getContext("2d") ?? null
  if (canvas) {
    canvas.width = WIDTH
    canvas.height = HEIGHT
  }
  const texture = new CanvasTexture(canvas ?? undefined)
  texture.colorSpace = SRGBColorSpace

  const polys = segmentPolys()
  const order: (keyof typeof polys)[] = ["a", "b", "c", "d", "e", "f", "g"]
  const dp = dpCircle()
  let last: number[] | null = null

  function fillPoly(points: Pt[]): void {
    if (!ctx) return
    ctx.beginPath()
    ctx.moveTo(points[0][0], points[0][1])
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1])
    ctx.closePath()
    ctx.fill()
  }

  function paint(levels: number[]): boolean {
    if (!ctx) return false
    if (last && last.length === levels.length && last.every((v, i) => Math.abs(v - levels[i]) < 0.02)) {
      return false
    }
    last = levels.slice()

    ctx.fillStyle = `rgb(${BG[0]},${BG[1]},${BG[2]})`
    ctx.fillRect(0, 0, WIDTH, HEIGHT)

    // a–g (indices 0..6), then dp (index 7). A lit segment glows.
    for (let i = 0; i < order.length; i++) {
      const level = Math.max(0, Math.min(1, levels[i] ?? 0))
      ctx.shadowColor = `rgba(${SEG_ON[0]},${SEG_ON[1]},${SEG_ON[2]},${0.9 * level})`
      ctx.shadowBlur = 18 * level
      ctx.fillStyle = mix(SEG_OFF, SEG_ON, level)
      fillPoly(polys[order[i]])
    }
    const dpLevel = Math.max(0, Math.min(1, levels[7] ?? 0))
    ctx.shadowColor = `rgba(${SEG_ON[0]},${SEG_ON[1]},${SEG_ON[2]},${0.9 * dpLevel})`
    ctx.shadowBlur = 18 * dpLevel
    ctx.fillStyle = mix(SEG_OFF, SEG_ON, dpLevel)
    ctx.beginPath()
    ctx.arc(dp.x, dp.y, dp.r, 0, Math.PI * 2)
    ctx.fill()
    ctx.shadowBlur = 0

    texture.needsUpdate = true
    return true
  }

  paint([0, 0, 0, 0, 0, 0, 0, 0])

  return { texture, paint, dispose: () => texture.dispose() }
}
