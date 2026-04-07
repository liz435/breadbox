// ── PinLabel ──────────────────────────────────────────────────────────────
//
// Small color-coded label shown at each component pin hole on the breadboard.
// Renders as a pill with a letter or symbol next to the pin wire tip.

import React from "react"

// ── Color map ─────────────────────────────────────────────────────────────

/** Returns a fill color for a given pin name. */
export function pinColor(name: string): string {
  const n = name.toLowerCase()
  if (n === "+" || n === "vcc" || n === "positive" || n === "anode" || n === "v+" || n === "vdd")
    return "#ef4444" // red — power
  if (n === "-" || n === "gnd" || n === "ground" || n === "negative" || n === "cathode" || n === "vss")
    return "#6b7280" // grey — ground
  if (n === "signal" || n === "sig" || n === "s" || n === "out" || n === "output")
    return "#f59e0b" // amber — signal
  if (n === "en" || n === "enable")
    return "#f59e0b"
  if (n === "rs")
    return "#a78bfa" // purple
  if (n === "d4" || n === "d5" || n === "d6" || n === "d7")
    return "#60a5fa" // blue — data
  if (n === "trigger" || n === "trig")
    return "#f59e0b"
  if (n === "echo")
    return "#34d399" // green
  if (n === "red" || n === "r")
    return "#ef4444"
  if (n === "green" || n === "g")
    return "#22c55e"
  if (n === "blue" || n === "b")
    return "#60a5fa"
  if (n === "a" || n === "b")
    return "#94a3b8" // neutral
  return "#94a3b8"
}

/** Short display symbol for a pin name. */
export function pinSymbol(name: string): string {
  const n = name.toLowerCase()
  if (n === "vcc" || n === "v+" || n === "vdd") return "+"
  if (n === "positive") return "+"
  if (n === "anode") return "A"
  if (n === "gnd" || n === "ground" || n === "vss") return "G"
  if (n === "negative") return "−"
  if (n === "cathode") return "K"
  if (n === "signal" || n === "sig") return "S"
  if (n === "trigger" || n === "trig") return "T"
  if (n === "echo") return "E"
  if (n === "enable") return "EN"
  if (n === "rs") return "RS"
  if (n === "red") return "R"
  if (n === "green") return "G"
  if (n === "blue") return "B"
  // Pass through short names as-is, capitalize first letter
  if (name.length <= 2) return name.toUpperCase()
  return name.charAt(0).toUpperCase()
}

// ── Component ─────────────────────────────────────────────────────────────

type PinLabelProps = {
  x: number
  y: number
  /** Pin name from component.pins (e.g. "anode", "gnd", "signal") */
  name: string
  /**
   * Where to place the label relative to the pin hole.
   * Defaults to "right".
   */
  side?: "left" | "right" | "above" | "below"
  /** Override the displayed symbol (uses pinSymbol(name) by default) */
  symbol?: string
  /** Override the fill color (uses pinColor(name) by default) */
  color?: string
}

export function PinLabel({ x, y, name, side = "right", symbol, color }: PinLabelProps) {
  const text = symbol ?? pinSymbol(name)
  const fill = color ?? pinColor(name)

  const gap = 5
  let tx = x
  let ty = y
  let anchor: "start" | "middle" | "end" = "middle"

  if (side === "right") { tx = x + gap; ty = y + 1; anchor = "start" }
  else if (side === "left") { tx = x - gap; ty = y + 1; anchor = "end" }
  else if (side === "above") { tx = x; ty = y - gap; anchor = "middle" }
  else if (side === "below") { tx = x; ty = y + gap + 3; anchor = "middle" }

  // Pill background width based on text length
  const pw = text.length <= 1 ? 7 : text.length * 4 + 3
  const ph = 7
  let rx = tx
  let ry = ty - ph / 2 - 0.5
  if (anchor === "middle") rx = tx - pw / 2
  else if (anchor === "end") rx = tx - pw

  return (
    <g pointerEvents="none">
      <rect
        x={rx}
        y={ry}
        width={pw}
        height={ph}
        rx={2}
        fill={fill}
        opacity={0.85}
      />
      <text
        x={tx}
        y={ty + 1}
        textAnchor={anchor}
        dominantBaseline="middle"
        fontSize={4.5}
        fontFamily="monospace"
        fontWeight="bold"
        fill="#fff"
      >
        {text}
      </text>
    </g>
  )
}
