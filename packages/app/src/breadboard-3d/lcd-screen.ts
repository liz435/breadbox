// ── Live 3D LCD panel ────────────────────────────────────────────────────────
//
// Paints the HD44780 character buffer onto a CanvasTexture so the 3D LCD shows
// the same live text the 2D renderer does. glb-parts overlays a flat plane on
// the model's blue display face and maps this texture onto it; the animation
// driver calls `paint()` whenever `libraryState.lcd` changes. Dot-matrix glyphs
// come from the same HD44780 ROM the 2D LCD uses, so both views agree.

import { CanvasTexture, SRGBColorSpace } from "three"
import type { LcdState } from "@dreamer/schemas"
import { lookupGlyph } from "@/breadboard/component-renderers/lcd-font"

// One dot = DOT px. A 5×8 glyph plus a one-dot gap to its neighbours makes each
// character cell 6×9 dots — the HD44780's 5×8 font on a 1-px inter-cell grid.
const DOT = 6
const GLYPH_COLS = 5
const GLYPH_ROWS = 8
const CELL_W = (GLYPH_COLS + 1) * DOT
const CELL_H = (GLYPH_ROWS + 1) * DOT
const MARGIN = DOT * 2

// Blue-backlit panel to match the model's display_azul material: a lit indigo
// field with near-white characters; dim variants for backlight/display off.
const BG_LIT = "#0b2be6"
const BG_DARK = "#071a6e"
const DOT_ON = "#eef3ff"
const DOT_OFF = "rgba(255,255,255,0.06)"

export type LcdScreen = {
  texture: CanvasTexture
  /** Repaint the panel from live sim state (null → idle/backlit-blank). */
  paint: (state: LcdState | null) => void
  dispose: () => void
}

/** Create a self-contained LCD panel: a CanvasTexture plus a `paint` that redraws
 *  it from sim state. `cols`/`rows` size the grid (16×2 default). Returns a no-op
 *  screen if a 2D canvas context isn't available. */
export function createLcdScreen(cols = 16, rows = 2): LcdScreen {
  const canvas =
    typeof document !== "undefined" ? document.createElement("canvas") : null
  const ctx = canvas?.getContext("2d") ?? null
  const width = cols * CELL_W + MARGIN * 2
  const height = rows * CELL_H + MARGIN * 2
  if (canvas) {
    canvas.width = width
    canvas.height = height
  }
  const texture = new CanvasTexture(canvas ?? undefined)
  texture.colorSpace = SRGBColorSpace

  function drawGlyph(col: number, row: number, glyph: readonly number[]): void {
    if (!ctx) return
    const ox = MARGIN + col * CELL_W
    const oy = MARGIN + row * CELL_H
    for (let gy = 0; gy < GLYPH_ROWS; gy++) {
      const bits = glyph[gy] ?? 0
      for (let gx = 0; gx < GLYPH_COLS; gx++) {
        const on = (bits & (0x10 >> gx)) !== 0
        ctx.fillStyle = on ? DOT_ON : DOT_OFF
        ctx.fillRect(ox + gx * DOT, oy + gy * DOT, DOT - 1, DOT - 1)
      }
    }
  }

  function paint(state: LcdState | null): void {
    if (!ctx) return
    const backlight = state?.backlight !== false
    ctx.fillStyle = backlight ? BG_LIT : BG_DARK
    ctx.fillRect(0, 0, width, height)

    // No sketch yet, or display turned off → leave the backlit field blank.
    if (!state || state.displayOn === false) {
      texture.needsUpdate = true
      return
    }

    for (let r = 0; r < rows; r++) {
      const line = state.textBuffer[r] ?? ""
      for (let c = 0; c < cols; c++) {
        const code = line.charCodeAt(c)
        const custom =
          code >= 0 && code <= 7 ? state.cgram?.[code] : undefined
        const glyph = custom ?? lookupGlyph(Number.isNaN(code) ? 0x20 : code)
        if (glyph) drawGlyph(c, r, glyph)
      }
    }

    // Cursor: a solid underline on the active cell (blink is not modelled — a
    // steady bar reads clearly at 3D scale).
    if (
      state.cursorVisible &&
      state.cursorRow >= 0 &&
      state.cursorRow < rows &&
      state.cursorCol >= 0 &&
      state.cursorCol < cols
    ) {
      const ox = MARGIN + state.cursorCol * CELL_W
      const oy = MARGIN + state.cursorRow * CELL_H + (GLYPH_ROWS - 1) * DOT
      ctx.fillStyle = DOT_ON
      ctx.fillRect(ox, oy, GLYPH_COLS * DOT, DOT - 1)
    }

    texture.needsUpdate = true
  }

  paint(null)

  return {
    texture,
    paint,
    dispose: () => texture.dispose(),
  }
}
