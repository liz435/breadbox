// ── Multimeter Renderer ─────────────────────────────────────────────
//
// A three-mode DMM for poking at points on a circuit. The component
// has two probes that the user drops on any two breadboard holes
// (jumper-wire-style placement) and a mode selector that chooses
// between DC voltage, current, and resistance.
//
// Volts & Amps come straight from the SPICE solver:
//   - Volts mode inserts a 10 MΩ element so the meter doesn't perturb
//     the circuit; the voltage drop across those two nodes is the
//     reading.
//   - Amps mode inserts a 0.01 Ω near-short so the meter sits in
//     series; the current through that element is the reading.
//
// Ohms is computed here, client-side, by walking the board: we find
// every (non-meter) component whose footprint has one pin on probe
// A's net and one pin on probe B's net, then sum those resistances
// in parallel. This gives a sensible reading for the single-component
// case (the main teaching use case) and handles multiple parallel
// paths correctly. It intentionally ignores the rest of the circuit
// graph — modelling a full DMM ohms mode requires disconnecting
// power, which isn't something we can really do mid-simulation.

import React from "react"
import { isBoardComponentType, type BoardComponent } from "@dreamer/schemas"
import type { ComponentElectricalState } from "@/simulator/circuit-solver"
import {
  gridToPixel,
  getComponentFootprint,
  resolveNets,
  type Net,
  type GridPoint,
} from "@/breadboard/breadboard-grid"
import { LABEL_FONT_SIZE } from "@/breadboard/breadboard-constants"
import { useBoardSelector } from "@/store/board-context"

type MultimeterMode = "volts" | "amps" | "ohms"

type MultimeterRendererProps = {
  component: BoardComponent
  isSelected: boolean
  electricalState?: ComponentElectricalState
}

// ── Formatters ──────────────────────────────────────────────────────

function formatVoltage(v: number): string {
  const abs = Math.abs(v)
  if (abs < 0.0005) return "0.000 V"
  if (abs < 1) return `${(v * 1000).toFixed(0)} mV`
  return `${v.toFixed(3)} V`
}

function formatCurrent(mA: number): string {
  const abs = Math.abs(mA)
  if (abs < 0.001) return "0.000 A"
  if (abs < 1) return `${(mA * 1000).toFixed(0)} µA`
  if (abs < 1000) return `${mA.toFixed(2)} mA`
  return `${(mA / 1000).toFixed(3)} A`
}

function formatResistance(ohms: number): string {
  if (!Number.isFinite(ohms)) return "  O.L"
  if (ohms < 0.5) return "0.0 Ω"
  if (ohms < 1000) return `${ohms.toFixed(1)} Ω`
  if (ohms < 1_000_000) return `${(ohms / 1000).toFixed(2)} kΩ`
  return `${(ohms / 1_000_000).toFixed(2)} MΩ`
}

// ── Ohms computation ────────────────────────────────────────────────

function pointKey(p: GridPoint): string {
  return `${p.row},${p.col}`
}

function findNetForPoint(nets: Net[], point: GridPoint): Net | null {
  const key = pointKey(point)
  for (const net of nets) {
    if (net.points.some((p) => pointKey(p) === key)) return net
  }
  return null
}

/**
 * Walks the board and reports the resistance between the two probes.
 * Returns Infinity when nothing bridges them ("OL" on a real DMM) and
 * 0 when the probes are on the same net (short).
 *
 * Method: for every component other than the meter itself, check
 * whether any two of its footprint points land on the two probes'
 * nets (one pin on each). If yes, treat it as a single resistor
 * between the probes and combine with other matches in parallel.
 */
function computeResistance(
  meterId: string,
  probeA: GridPoint,
  probeB: GridPoint,
  components: Record<string, BoardComponent>,
  wires: Record<string, import("@dreamer/schemas").Wire>,
): number {
  const nets = resolveNets(components, wires)
  const netA = findNetForPoint(nets, probeA)
  const netB = findNetForPoint(nets, probeB)

  // Same net (including the trivial case where both probes are on the
  // same hole) → zero ohms.
  if (netA && netB && netA.id === netB.id) return 0
  if (!netA || !netB) return Infinity

  const netAKeys = new Set(netA.points.map(pointKey))
  const netBKeys = new Set(netB.points.map(pointKey))

  let conductance = 0 // 1/R sum for parallel combination

  for (const comp of Object.values(components)) {
    if (comp.id === meterId) continue
    if (isBoardComponentType(comp.type) || comp.type === "wire") continue
    if (comp.type === "multimeter") continue

    const footprint = getComponentFootprint(
      comp.type,
      comp.y,
      comp.x,
      comp.rotation,
      comp.properties,
    )
    let touchesA = false
    let touchesB = false
    for (const pt of footprint.points) {
      const key = pointKey(pt)
      if (netAKeys.has(key)) touchesA = true
      if (netBKeys.has(key)) touchesB = true
    }
    if (!touchesA || !touchesB) continue

    // Component bridges the two probes — add its resistance in parallel.
    const r = componentResistance(comp)
    if (r != null && r > 0) {
      conductance += 1 / r
    }
  }

  if (conductance === 0) return Infinity
  return 1 / conductance
}

/** Returns the component's resistance in ohms, or null if not modelled. */
function componentResistance(comp: BoardComponent): number | null {
  switch (comp.type) {
    case "resistor":
      return (comp.properties.resistance as number | undefined) ?? 220
    case "led":
    case "rgb_led":
      // Matches the linearized 120 Ω model in registry.tsx
      return 120
    case "buzzer":
      return 30
    case "photoresistor":
      return 10000
    case "potentiometer":
      // Treat as its full-scale resistance — good enough for a "what's
      // on my board" read.
      return 10000
    default:
      return null
  }
}

// ── Component ───────────────────────────────────────────────────────

function MultimeterRendererInner({
  component,
  isSelected,
  electricalState,
}: MultimeterRendererProps) {
  const mode: MultimeterMode =
    (component.properties.mode as MultimeterMode | undefined) ?? "volts"

  // Probe A = component (x, y). Probe B lives in properties so the two
  // ends can be dropped on any pair of breadboard holes.
  const probeBRow =
    (component.properties.probeBRow as number | undefined) ?? component.y + 1
  const probeBCol =
    (component.properties.probeBCol as number | undefined) ?? component.x

  const probePos = gridToPixel({ row: component.y, col: component.x })
  const probeNeg = gridToPixel({ row: probeBRow, col: probeBCol })

  // Ohms mode needs the live component and wire maps — pull them from
  // the store. We subscribe unconditionally (hooks can't be conditional)
  // but only use the result when mode === "ohms".
  const allComponents = useBoardSelector((s) => s.components)
  const allWires = useBoardSelector((s) => s.wires)

  // Body floats above the midpoint of the two probes.
  const midX = (probePos.x + probeNeg.x) / 2
  const midY = (probePos.y + probeNeg.y) / 2
  const bodyW = 40
  const bodyH = 30
  const bodyOffsetY = -bodyH / 2 - 16
  const bodyLeft = midX - bodyW / 2
  const bodyTop = midY + bodyOffsetY
  const bodyCx = bodyLeft + bodyW / 2

  // LCD readout dimensions
  const lcdLeft = bodyLeft + 3
  const lcdTop = bodyTop + 3
  const lcdW = bodyW - 6
  const lcdH = 9

  // Compute the reading based on mode
  let reading = "-- --"
  let modeLabel = "DC V"
  let isLive = false

  if (mode === "volts") {
    const v = electricalState?.voltage ?? 0
    isLive = electricalState != null && Number.isFinite(v)
    reading = isLive ? formatVoltage(v) : "-- V"
    modeLabel = "DC V"
  } else if (mode === "amps") {
    const iMa = electricalState?.current ?? 0
    isLive = electricalState != null && Number.isFinite(iMa)
    reading = isLive ? formatCurrent(iMa) : "-- A"
    modeLabel = "DC A"
  } else {
    // Ohms — computed client-side from board state.
    const r = computeResistance(
      component.id,
      { row: component.y, col: component.x },
      { row: probeBRow, col: probeBCol },
      allComponents,
      allWires,
    )
    isLive = true
    reading = formatResistance(r)
    modeLabel = "Ω"
  }

  const gradientId = `mm-grad-${component.id}`

  // Mode dial geometry — a small 3-segment strip on the body that
  // visually shows which mode is selected. Non-interactive; the user
  // changes mode from the inspector (or by clicking the body).
  const dialY = bodyTop + bodyH - 8
  const dialSegW = (bodyW - 6) / 3
  const segments: Array<{ label: string; key: MultimeterMode }> = [
    { label: "V", key: "volts" },
    { label: "A", key: "amps" },
    { label: "Ω", key: "ohms" },
  ]

  return (
    <g>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fbbf24" />
          <stop offset="100%" stopColor="#b45309" />
        </linearGradient>
      </defs>

      {/* Probe leads — red from probe A, black from probe B, drawn as
          smooth Bézier curves so they read as flexible test leads
          regardless of probe distance. */}
      {(() => {
        const jackAY = bodyTop + bodyH
        const jackAX = bodyLeft + bodyW * 0.3
        const jackBX = bodyLeft + bodyW * 0.7
        const ctrlOffset = Math.max(
          12,
          Math.abs(probePos.y - jackAY) * 0.5,
          Math.abs(probeNeg.y - jackAY) * 0.5,
        )
        return (
          <g>
            <path
              d={`M ${jackAX} ${jackAY} C ${jackAX} ${jackAY + ctrlOffset}, ${probePos.x} ${probePos.y - ctrlOffset}, ${probePos.x} ${probePos.y}`}
              fill="none"
              stroke="#ef4444"
              strokeWidth={1.6}
              strokeLinecap="round"
            />
            <path
              d={`M ${jackBX} ${jackAY} C ${jackBX} ${jackAY + ctrlOffset}, ${probeNeg.x} ${probeNeg.y - ctrlOffset}, ${probeNeg.x} ${probeNeg.y}`}
              fill="none"
              stroke="#1f2937"
              strokeWidth={1.6}
              strokeLinecap="round"
            />
            <circle cx={jackAX} cy={jackAY} r={1.2} fill="#ef4444" stroke="#7c2d12" strokeWidth={0.4} />
            <circle cx={jackBX} cy={jackAY} r={1.2} fill="#1f2937" stroke="#0a0a0a" strokeWidth={0.4} />
          </g>
        )
      })()}

      {/* Pin hole indicators */}
      <circle cx={probePos.x} cy={probePos.y} r={2} fill="#ef4444" opacity={0.65} />
      <circle cx={probeNeg.x} cy={probeNeg.y} r={2} fill="#1f2937" opacity={0.65} />

      {/* Soft drop shadow */}
      <rect
        x={bodyLeft + 1}
        y={bodyTop + 1.5}
        width={bodyW}
        height={bodyH}
        rx={2}
        fill="#000000"
        opacity={0.3}
      />

      {/* Body */}
      <rect
        x={bodyLeft}
        y={bodyTop}
        width={bodyW}
        height={bodyH}
        rx={2}
        fill={`url(#${gradientId})`}
        stroke={isSelected ? "#3b82f6" : "#7c2d12"}
        strokeWidth={isSelected ? 1.5 : 0.8}
      />

      {/* LCD bezel */}
      <rect
        x={lcdLeft - 0.6}
        y={lcdTop - 0.6}
        width={lcdW + 1.2}
        height={lcdH + 1.2}
        rx={1}
        fill="#0a0a0a"
      />

      {/* LCD screen */}
      <rect
        x={lcdLeft}
        y={lcdTop}
        width={lcdW}
        height={lcdH}
        rx={0.5}
        fill={isLive ? "#9ade7a" : "#3a4d35"}
      />

      {/* Reading text */}
      <text
        x={lcdLeft + lcdW - 1.5}
        y={lcdTop + lcdH / 2 + 0.5}
        textAnchor="end"
        dominantBaseline="middle"
        fontSize={5}
        fill="#0a1f08"
        fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
        fontWeight={700}
      >
        {reading}
      </text>

      {/* Mode label (top-left corner of LCD) */}
      <text
        x={lcdLeft + 1}
        y={lcdTop + 2.8}
        textAnchor="start"
        dominantBaseline="middle"
        fontSize={2.8}
        fill="#0a1f08"
        fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
        fontWeight={700}
      >
        {modeLabel}
      </text>

      {/* Mode dial — three segments, highlight the selected one */}
      <g>
        {segments.map((seg, i) => {
          const segX = bodyLeft + 3 + i * dialSegW
          const active = seg.key === mode
          return (
            <g key={seg.key}>
              <rect
                x={segX}
                y={dialY}
                width={dialSegW - 0.6}
                height={5}
                rx={0.8}
                fill={active ? "#1c1917" : "#92400e"}
                stroke="#422006"
                strokeWidth={0.3}
              />
              <text
                x={segX + dialSegW / 2 - 0.3}
                y={dialY + 2.6}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={3}
                fill={active ? "#fbbf24" : "#1c1917"}
                fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                fontWeight={700}
              >
                {seg.label}
              </text>
            </g>
          )
        })}
      </g>

      {/* Component name below the body */}
      <text
        x={bodyCx}
        y={bodyTop + bodyH + 6}
        textAnchor="middle"
        fontSize={LABEL_FONT_SIZE}
        fill="#888"
        fontFamily="monospace"
      >
        {component.name}
      </text>
    </g>
  )
}

export const MultimeterRenderer = React.memo(MultimeterRendererInner)
