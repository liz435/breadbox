// ── OledCanvas ────────────────────────────────────────────────────────────
//
// Renders a 128×64 SSD1306 framebuffer to a canvas. Used in two places:
//   - Inline on the breadboard tile (small, scaled to the OLED chip area).
//   - Dedicated OLED panel (large, 4× upscale).
//
// The framebuffer reference is stable across frames in the peripheral —
// this component repaints only when the reference changes (dirty flag from
// the SSD1306 peripheral), or when on/inverted toggles.

import { useEffect, useMemo, useRef } from "react"
import type { OledState } from "@dreamer/schemas"

const WIDTH = 128
const HEIGHT = 64
const ON_RGBA: readonly [number, number, number, number] = [0x9b, 0xd3, 0xff, 0xff]
const OFF_RGBA: readonly [number, number, number, number] = [0x02, 0x04, 0x08, 0xff]

export type OledCanvasProps = {
  state: OledState | null | undefined
  cssWidth: number | string
  cssHeight: number | string
  className?: string
}

export function OledCanvas({ state, cssWidth, cssHeight, className }: OledCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const style = useMemo(() => ({
    width: typeof cssWidth === "number" ? `${cssWidth}px` : cssWidth,
    height: typeof cssHeight === "number" ? `${cssHeight}px` : cssHeight,
    imageRendering: "pixelated" as const,
    display: "block" as const,
  }), [cssWidth, cssHeight])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const img = ctx.createImageData(WIDTH, HEIGHT)
    const data = img.data
    const fb = state?.framebuffer
    const isOn = state?.on ?? false
    const inverted = state?.inverted ?? false
    const [onR, onG, onB, onA] = inverted ? OFF_RGBA : ON_RGBA
    const [offR, offG, offB, offA] = inverted ? ON_RGBA : OFF_RGBA

    if (!isOn || !fb) {
      // Panel off → solid black (matches a real powered-down OLED).
      for (let i = 0; i < data.length; i += 4) {
        data[i] = 0; data[i + 1] = 0; data[i + 2] = 0; data[i + 3] = 0xff
      }
      ctx.putImageData(img, 0, 0)
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
          data[px] = onR; data[px + 1] = onG; data[px + 2] = onB; data[px + 3] = onA
        } else {
          data[px] = offR; data[px + 1] = offG; data[px + 2] = offB; data[px + 3] = offA
        }
      }
    }
    ctx.putImageData(img, 0, 0)
  }, [state?.framebuffer, state?.on, state?.inverted])

  return (
    <canvas
      ref={canvasRef}
      width={WIDTH}
      height={HEIGHT}
      style={style}
      className={className}
    />
  )
}
