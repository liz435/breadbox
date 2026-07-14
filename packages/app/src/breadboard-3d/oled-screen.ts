// ── Live 3D OLED panel ───────────────────────────────────────────────────────
//
// Paints the SSD1306 128×64 framebuffer onto a CanvasTexture so the 3D OLED
// shows the same live pixels the 2D renderer (OledCanvas) and the OLED panel do.
// glb-parts overlays a flat plane on the model's display face and maps this
// texture onto it; the animation driver calls `paint()` whenever the sim's
// `libraryState.oled[id]` buffer changes. The decode mirrors OledCanvas exactly
// (page/bit layout per SSD1306 §8.7) so all three views agree.

import { CanvasTexture, NearestFilter, SRGBColorSpace } from "three"
import type { OledState } from "@dreamer/schemas"

const WIDTH = 128
const HEIGHT = 64
// Lit/unlit pixel colours, matching OledCanvas's blue-on-near-black look.
const ON: readonly [number, number, number] = [0x9b, 0xd3, 0xff]
const OFF: readonly [number, number, number] = [0x02, 0x04, 0x08]

export type OledScreen = {
  texture: CanvasTexture
  /** Repaint from live sim state (null / off → solid black, like a real
   *  powered-down panel). */
  paint: (state: OledState | null) => void
  dispose: () => void
}

/** Create a self-contained OLED panel: a 128×64 CanvasTexture plus a `paint`
 *  that redraws it from the SSD1306 framebuffer. Nearest filtering keeps the
 *  pixels crisp at 3D scale. No-op paint if a 2D context isn't available. */
export function createOledScreen(): OledScreen {
  const canvas =
    typeof document !== "undefined" ? document.createElement("canvas") : null
  const ctx = canvas?.getContext("2d") ?? null
  if (canvas) {
    canvas.width = WIDTH
    canvas.height = HEIGHT
  }
  const texture = new CanvasTexture(canvas ?? undefined)
  texture.colorSpace = SRGBColorSpace
  texture.magFilter = NearestFilter
  texture.minFilter = NearestFilter

  const img = ctx?.createImageData(WIDTH, HEIGHT) ?? null

  function paint(state: OledState | null): void {
    if (!ctx || !img) return
    const data = img.data
    const fb = state?.framebuffer
    const on = state?.on ?? false
    const inverted = state?.inverted ?? false
    const [onR, onG, onB] = inverted ? OFF : ON
    const [offR, offG, offB] = inverted ? ON : OFF

    if (!on || !fb) {
      for (let i = 0; i < data.length; i += 4) {
        data[i] = 0
        data[i + 1] = 0
        data[i + 2] = 0
        data[i + 3] = 0xff
      }
      ctx.putImageData(img, 0, 0)
      texture.needsUpdate = true
      return
    }

    for (let y = 0; y < HEIGHT; y++) {
      const page = y >> 3
      const bit = 1 << (y & 7) // LSB on top per SSD1306 §8.7
      const rowBase = page * WIDTH
      const dstRow = y * WIDTH * 4
      for (let x = 0; x < WIDTH; x++) {
        const lit = (fb[rowBase + x] & bit) !== 0
        const px = dstRow + x * 4
        if (lit) {
          data[px] = onR
          data[px + 1] = onG
          data[px + 2] = onB
          data[px + 3] = 0xff
        } else {
          data[px] = offR
          data[px + 1] = offG
          data[px + 2] = offB
          data[px + 3] = 0xff
        }
      }
    }
    ctx.putImageData(img, 0, 0)
    texture.needsUpdate = true
  }

  paint(null)

  return {
    texture,
    paint,
    dispose: () => texture.dispose(),
  }
}
