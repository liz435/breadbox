// ── Power Supply Renderer ───────────────────────────────────────────
//
// Visual for the MB102-style breadboard power-supply module. Sits across
// the top of the breadboard, dropping pins onto all four power rails.
// Each side (left/right) has its own voltage selector that the user
// changes via the inspector — the on-board jumper visual mirrors that
// selection so the breadboard view stays in sync with the netlist.
//
// Drawn as a realistic top-down PCB: shaded connectors with drop
// shadows, gold pads, faint copper traces + vias, SMD passives, and
// minimal white silkscreen — no component is drawn in front view.

import React from "react"
import type { BoardComponent } from "@dreamer/schemas"
import { gridToPixel } from "@/breadboard/breadboard-grid"
import { HOLE_SPACING, LABEL_FONT_SIZE } from "@/breadboard/breadboard-constants"
import {
  powerSupplyPinRows,
  PSU_BODY_OVERHANG_BOTTOM_ROWS,
  PSU_BODY_OVERHANG_TOP_ROWS,
} from "./pin-rows"

const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace"
const SILK = "#e7ece7"

type PowerSupplyRendererProps = {
  component: BoardComponent
  isSelected: boolean
}

/** A passive SMD chip (resistor/cap): dark body with tinned terminals. */
function Smd({ x, y, tone = "#3f3f46", vertical = false }: { x: number; y: number; tone?: string; vertical?: boolean }) {
  const w = vertical ? 2.4 : 4.6
  const h = vertical ? 4.6 : 2.4
  return (
    <g>
      <rect x={x - w / 2} y={y - h / 2} width={w} height={h} rx={0.3} fill={tone} />
      {vertical ? (
        <>
          <rect x={x - w / 2} y={y - h / 2} width={w} height={1.1} fill="#d6d3d1" />
          <rect x={x - w / 2} y={y + h / 2 - 1.1} width={w} height={1.1} fill="#d6d3d1" />
        </>
      ) : (
        <>
          <rect x={x - w / 2} y={y - h / 2} width={1.1} height={h} fill="#d6d3d1" />
          <rect x={x + w / 2 - 1.1} y={y - h / 2} width={1.1} height={h} fill="#d6d3d1" />
        </>
      )}
    </g>
  )
}

/** One 3-pin voltage-select header with its yellow jumper cap. The cap sits
 *  over the 5V pair or the 3V3 pair to mirror the inspector's selection. */
function VoltageJumper({
  cx,
  cy,
  voltage,
  ids,
  shadow,
}: {
  cx: number
  cy: number
  voltage: number
  ids: { cap: string }
  shadow: string
}) {
  const pinSpacing = 11
  const headerW = pinSpacing * 2 + 12
  const headerH = 11
  const capW = pinSpacing + 9
  const capX = voltage === 5 ? cx - pinSpacing - 4.5 : cx - 4.5
  return (
    <g>
      {/* Header housing */}
      <rect x={cx - headerW / 2} y={cy - headerH / 2} width={headerW} height={headerH} rx={0.8} fill="#111113" filter={`url(#${shadow})`} />
      <rect x={cx - headerW / 2} y={cy - headerH / 2} width={headerW} height={2} rx={0.8} fill="#2c2c31" />
      {/* Header pins (the exposed one pokes through the housing) */}
      {[-1, 0, 1].map((i) => (
        <rect key={`pin-${i}`} x={cx + i * pinSpacing - 1.1} y={cy - 2.4} width={2.2} height={4.8} fill="#c8a24a" />
      ))}
      {/* Yellow jumper cap over the selected pair, handle hole on top */}
      <g filter={`url(#${shadow})`}>
        <rect x={capX} y={cy - headerH / 2 - 1.6} width={capW} height={headerH + 3.2} rx={1.2} fill={`url(#${ids.cap})`} stroke="#8f6a10" strokeWidth={0.5} />
        <ellipse cx={capX + capW / 2} cy={cy} rx={2.4} ry={3.2} fill="#946f14" opacity={0.65} />
      </g>
      {/* Selection silkscreen */}
      <text x={cx - pinSpacing} y={cy - headerH / 2 - 3.4} textAnchor="middle" fontSize={4.4} fill={SILK} fontFamily={MONO} opacity={0.9}>
        5V
      </text>
      <text x={cx + pinSpacing} y={cy - headerH / 2 - 3.4} textAnchor="middle" fontSize={4.4} fill={SILK} fontFamily={MONO} opacity={0.9}>
        3V3
      </text>
      <text x={cx} y={cy + headerH / 2 + 6.4} textAnchor="middle" fontSize={3.8} fill={SILK} fontFamily={MONO} opacity={0.7}>
        OFF
      </text>
    </g>
  )
}

/** AMS1117 regulator: SOT-223 black body, wide metal tab, three gull leads. */
function Regulator({ cx, cy, ids, shadow }: { cx: number; cy: number; ids: { metal: string; plastic: string }; shadow: string }) {
  return (
    <g filter={`url(#${shadow})`}>
      <rect x={cx - 8} y={cy - 9.5} width={16} height={5} rx={0.6} fill={`url(#${ids.metal})`} stroke="#7d838c" strokeWidth={0.3} />
      <rect x={cx - 9} y={cy - 5.5} width={18} height={11.5} rx={0.8} fill={`url(#${ids.plastic})`} stroke="#0a0a0a" strokeWidth={0.4} />
      {[-5.5, 0, 5.5].map((dx) => (
        <rect key={dx} x={cx + dx - 1} y={cy + 6} width={2} height={2.8} rx={0.3} fill={`url(#${ids.metal})`} />
      ))}
      <text x={cx} y={cy + 2.6} textAnchor="middle" fontSize={3.4} fill="#a1a1aa" fontFamily={MONO}>
        1117
      </text>
    </g>
  )
}

function PowerSupplyRendererInner({
  component,
  isSelected,
}: PowerSupplyRendererProps) {
  // Anchor row snaps to a rail block — the pins span the block's 1st and 5th
  // holes, same rows the footprint occupies.
  const [topRow, bottomRow] = powerSupplyPinRows(component.y)

  // Pin positions on each rail. The module always pins to all four rails
  // regardless of where the user clicked horizontally.
  // Polarity per isPositiveRailCol: every rail pair reads − then + left to
  // right, so −2/10 are − and −1/11 are + — matching the board stripes.
  const lMinusTop = gridToPixel({ row: topRow, col: -2 })
  const lPlusTop = gridToPixel({ row: topRow, col: -1 })
  const rMinusTop = gridToPixel({ row: topRow, col: 10 })
  const rPlusTop = gridToPixel({ row: topRow, col: 11 })
  const lMinusBot = gridToPixel({ row: bottomRow, col: -2 })
  const lPlusBot = gridToPixel({ row: bottomRow, col: -1 })
  const rMinusBot = gridToPixel({ row: bottomRow, col: 10 })
  const rPlusBot = gridToPixel({ row: bottomRow, col: 11 })

  // Body extents — span from outer left rail to outer right rail, with the
  // real module's up-board overhang so the 2D silhouette matches the 3D model.
  const bodyLeft = lMinusTop.x - 6
  const bodyRight = rPlusTop.x + 6
  const bodyTop = lMinusTop.y - PSU_BODY_OVERHANG_TOP_ROWS * HOLE_SPACING
  const bodyBottom = lMinusBot.y + PSU_BODY_OVERHANG_BOTTOM_ROWS * HOLE_SPACING
  const bodyW = bodyRight - bodyLeft
  const bodyH = bodyBottom - bodyTop
  const bodyCx = (bodyLeft + bodyRight) / 2

  const leftVoltage = (component.properties.leftVoltage as number | undefined) ?? 5
  const rightVoltage = (component.properties.rightVoltage as number | undefined) ?? 3.3

  const uid = component.id
  const ids = {
    pcb: `psu-pcb-${uid}`,
    metal: `psu-metal-${uid}`,
    plastic: `psu-plastic-${uid}`,
    jack: `psu-jack-${uid}`,
    capTop: `psu-captop-${uid}`,
    led: `psu-led-${uid}`,
    yellow: `psu-yellow-${uid}`,
    shadow: `psu-shadow-${uid}`,
  }

  // Connector strip along the board-end (top) edge.
  const jackCx = bodyLeft + bodyW * 0.22
  const usbCx = bodyLeft + bodyW * 0.78
  const connectorY = bodyTop + 16
  // Everything else — jumpers, regulators, bulk cap — shares the strip between
  // the two pin rows, so the body needs no dead space of its own.
  const midY = (lPlusTop.y + lPlusBot.y) / 2
  const leftJumperCx = bodyLeft + bodyW * 0.17
  const rightJumperCx = bodyRight - bodyW * 0.17
  const regLeftCx = bodyLeft + bodyW * 0.36
  const regRightCx = bodyRight - bodyW * 0.36

  const pads = [
    { p: lPlusTop, plus: true },
    { p: lMinusTop, plus: false },
    { p: rMinusTop, plus: false },
    { p: rPlusTop, plus: true },
    { p: lPlusBot, plus: true },
    { p: lMinusBot, plus: false },
    { p: rMinusBot, plus: false },
    { p: rPlusBot, plus: true },
  ]

  const mountingHoles = [
    { x: bodyLeft + 7, y: bodyTop + 7 },
    { x: bodyRight - 7, y: bodyTop + 7 },
    { x: bodyLeft + 7, y: bodyBottom - 7 },
    { x: bodyRight - 7, y: bodyBottom - 7 },
  ]

  const vias = [
    { x: bodyCx - 22, y: bodyTop + 34 },
    { x: bodyCx + 18, y: bodyTop + 30 },
    { x: regLeftCx + 14, y: midY - 14 },
    { x: regRightCx - 14, y: midY + 13 },
    { x: bodyCx - 8, y: midY + 16 },
    { x: bodyCx + 30, y: midY - 17 },
  ]

  return (
    <g>
      <defs>
        <linearGradient id={ids.pcb} x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0%" stopColor="#1d6b3c" />
          <stop offset="50%" stopColor="#175c33" />
          <stop offset="100%" stopColor="#124b29" />
        </linearGradient>
        <linearGradient id={ids.metal} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#eceef0" />
          <stop offset="45%" stopColor="#c3c8cd" />
          <stop offset="100%" stopColor="#94999f" />
        </linearGradient>
        <linearGradient id={ids.plastic} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2e2e33" />
          <stop offset="100%" stopColor="#101013" />
        </linearGradient>
        <linearGradient id={ids.jack} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3a3a40" />
          <stop offset="30%" stopColor="#232327" />
          <stop offset="100%" stopColor="#0c0c0e" />
        </linearGradient>
        <linearGradient id={ids.yellow} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fbcf3c" />
          <stop offset="55%" stopColor="#e9a812" />
          <stop offset="100%" stopColor="#b97e0a" />
        </linearGradient>
        <radialGradient id={ids.capTop} cx="0.38" cy="0.34" r="0.75">
          <stop offset="0%" stopColor="#f4f5f6" />
          <stop offset="60%" stopColor="#c6cbd0" />
          <stop offset="100%" stopColor="#8f959c" />
        </radialGradient>
        <radialGradient id={ids.led} cx="0.4" cy="0.35" r="0.8">
          <stop offset="0%" stopColor="#eafbe7" />
          <stop offset="45%" stopColor="#5fd77a" />
          <stop offset="100%" stopColor="#1c7f3d" />
        </radialGradient>
        <filter id={ids.shadow} x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0.7" dy="1.3" stdDeviation="0.9" floodColor="#000000" floodOpacity="0.4" />
        </filter>
      </defs>

      {/* PCB with edge shading */}
      <rect x={bodyLeft + 1.6} y={bodyTop + 2.4} width={bodyW} height={bodyH} rx={3.5} fill="#000000" opacity={0.35} />
      <rect
        x={bodyLeft}
        y={bodyTop}
        width={bodyW}
        height={bodyH}
        rx={3.5}
        fill={`url(#${ids.pcb})`}
        stroke={isSelected ? "#3b82f6" : "#0c391f"}
        strokeWidth={isSelected ? 1.5 : 1}
      />
      {/* Bevel light on the top edge */}
      <rect x={bodyLeft + 1.5} y={bodyTop + 1} width={bodyW - 3} height={1.4} rx={0.7} fill="#3d9b63" opacity={0.5} />

      {/* Copper traces under the solder mask (faint) */}
      <g stroke="#0e4f2a" strokeWidth={2.2} fill="none" opacity={0.85} strokeLinecap="round">
        <path d={`M ${jackCx} ${connectorY + 14} V ${midY - 16} H ${bodyCx} V ${midY - 10}`} />
        <path d={`M ${usbCx} ${connectorY + 13} V ${midY} H ${regRightCx + 9}`} />
        <path d={`M ${regLeftCx - 9} ${midY} H ${leftJumperCx + 17}`} />
        <path d={`M ${regRightCx - 9} ${midY} H ${bodyCx + 10}`} />
        <path d={`M ${leftJumperCx} ${midY + 8} V ${lPlusBot.y - 6}`} />
        <path d={`M ${rightJumperCx} ${midY + 8} V ${rMinusBot.y - 6}`} />
      </g>
      {/* Vias */}
      {vias.map((via, i) => (
        <g key={`via-${i}`}>
          <circle cx={via.x} cy={via.y} r={1.2} fill="#2c8a52" />
          <circle cx={via.x} cy={via.y} r={0.5} fill="#0b3a1f" />
        </g>
      ))}

      {/* Corner mounting holes — bare annular rings */}
      {mountingHoles.map((hole, i) => (
        <g key={`mount-${i}`}>
          <circle cx={hole.x} cy={hole.y} r={3.2} fill="#c8a24a" stroke="#8f6d2a" strokeWidth={0.5} />
          <circle cx={hole.x} cy={hole.y} r={1.8} fill="#efe9dd" />
        </g>
      ))}

      {/* Barrel jack — black block with the barrel poking past the PCB edge */}
      <g filter={`url(#${ids.shadow})`}>
        <rect x={jackCx - 8} y={bodyTop - 5} width={16} height={9} rx={2.5} fill="#0e0e10" />
        <ellipse cx={jackCx} cy={bodyTop - 4.4} rx={6.2} ry={1.6} fill="#000000" />
        <ellipse cx={jackCx} cy={bodyTop - 4.4} rx={4.2} ry={1} fill="#26262a" />
        <rect x={jackCx - 19} y={bodyTop + 3} width={38} height={25} rx={1.8} fill={`url(#${ids.jack})`} stroke="#000000" strokeWidth={0.5} />
        <rect x={jackCx - 16.5} y={bodyTop + 6} width={33} height={2} rx={1} fill="#4b4b52" opacity={0.8} />
        <rect x={jackCx - 16.5} y={bodyTop + 23.5} width={33} height={1.6} rx={0.8} fill="#000000" opacity={0.6} />
      </g>

      {/* USB-A shell — brushed metal with crimp dimples */}
      <g filter={`url(#${ids.shadow})`}>
        <rect x={usbCx - 16} y={bodyTop + 4} width={32} height={23} rx={1.2} fill={`url(#${ids.metal})`} stroke="#767c84" strokeWidth={0.5} />
        <rect x={usbCx - 13} y={bodyTop + 4} width={26} height={2.4} fill="#5c6167" opacity={0.7} />
        {[-9, 9].map((dx) => (
          <rect key={dx} x={usbCx + dx - 2.6} y={bodyTop + 12} width={5.2} height={6.5} rx={1.6} fill="#a9aeb4" stroke="#7d838c" strokeWidth={0.4} />
        ))}
        <circle cx={usbCx - 12.5} cy={bodyTop + 23} r={0.9} fill="#71767d" />
        <circle cx={usbCx + 12.5} cy={bodyTop + 23} r={0.9} fill="#71767d" />
      </g>

      {/* Slide switch — cream body, ridged actuator */}
      <g filter={`url(#${ids.shadow})`}>
        <rect x={bodyCx - 13} y={connectorY - 8} width={26} height={16} rx={1.6} fill="#ddd9d2" stroke="#a39e94" strokeWidth={0.6} />
        <rect x={bodyCx - 10} y={connectorY - 5} width={20} height={10} rx={1} fill="#b9b4aa" />
        <rect x={bodyCx + 0.5} y={connectorY - 5} width={9.5} height={10} rx={1} fill="#f4f1ec" stroke="#a39e94" strokeWidth={0.4} />
        {[2.8, 5.3, 7.8].map((dx) => (
          <line key={dx} x1={bodyCx + dx} y1={connectorY - 3.4} x2={bodyCx + dx} y2={connectorY + 3.4} stroke="#c9c4ba" strokeWidth={0.7} />
        ))}
      </g>

      {/* Power LED — lit green dome */}
      <circle cx={bodyCx + 22} cy={connectorY - 1} r={5.5} fill="#4ade80" opacity={0.18} />
      <circle cx={bodyCx + 22} cy={connectorY - 1} r={2.6} fill={`url(#${ids.led})`} stroke="#166534" strokeWidth={0.4} />
      <circle cx={bodyCx + 21.2} cy={connectorY - 1.8} r={0.8} fill="#ffffff" opacity={0.85} />

      {/* SMD passives sprinkled where the real board carries them */}
      <Smd x={bodyCx - 24} y={connectorY + 3} />
      <Smd x={bodyCx - 24} y={connectorY - 4} tone="#57534e" />
      <Smd x={bodyCx + 30} y={connectorY + 4} vertical />
      <Smd x={regLeftCx + 15} y={midY - 8} vertical tone="#57534e" />
      <Smd x={regRightCx - 15} y={midY + 8} vertical />
      <Smd x={bodyCx + 14} y={midY + 14} />
      <Smd x={bodyCx - 14} y={midY - 15} tone="#78350f" />

      {/* Silkscreen title + section line */}
      <text x={bodyCx} y={bodyTop + 45} textAnchor="middle" fontSize={5} fill={SILK} fontFamily={MONO} opacity={0.85} letterSpacing={1}>
        MB102
      </text>
      <line x1={bodyLeft + 14} y1={bodyTop + 49} x2={bodyCx - 22} y2={bodyTop + 49} stroke={SILK} strokeWidth={0.4} opacity={0.35} />
      <line x1={bodyCx + 22} y1={bodyTop + 49} x2={bodyRight - 14} y2={bodyTop + 49} stroke={SILK} strokeWidth={0.4} opacity={0.35} />

      {/* Between the pin rows: jumpers at the edges over their output rails,
          regulators inboard of them, bulk electrolytic in the middle. */}
      <Regulator cx={regLeftCx} cy={midY} ids={ids} shadow={ids.shadow} />
      <Regulator cx={regRightCx} cy={midY} ids={ids} shadow={ids.shadow} />
      <g filter={`url(#${ids.shadow})`}>
        <circle cx={bodyCx} cy={midY} r={9} fill="#131417" />
        <circle cx={bodyCx} cy={midY} r={8.9} fill="none" stroke="#33363b" strokeWidth={0.8} />
        <circle cx={bodyCx} cy={midY} r={7} fill={`url(#${ids.capTop})`} />
        <path d={`M ${bodyCx - 5} ${midY} H ${bodyCx + 5} M ${bodyCx} ${midY - 5} V ${midY + 5}`} stroke="#9aa0a6" strokeWidth={0.8} opacity={0.8} />
        <path d={`M ${bodyCx - 9} ${midY - 3} A 9 9 0 0 0 ${bodyCx - 9} ${midY + 3}`} fill="none" stroke="#d8dadd" strokeWidth={1.6} opacity={0.5} />
      </g>
      <VoltageJumper cx={leftJumperCx} cy={midY} voltage={leftVoltage} ids={{ cap: ids.yellow }} shadow={ids.shadow} />
      <VoltageJumper cx={rightJumperCx} cy={midY} voltage={rightVoltage} ids={{ cap: ids.yellow }} shadow={ids.shadow} />

      {/* Output voltage silk, one per side */}
      <text x={bodyLeft + bodyW * 0.32} y={bodyBottom - 4} textAnchor="middle" fontSize={5} fill={leftVoltage === 5 ? "#fcd34d" : "#7dd3fc"} fontFamily={MONO} opacity={0.95}>
        {leftVoltage}V
      </text>
      <text x={bodyRight - bodyW * 0.32} y={bodyBottom - 4} textAnchor="middle" fontSize={5} fill={rightVoltage === 5 ? "#fcd34d" : "#7dd3fc"} fontFamily={MONO} opacity={0.95}>
        {rightVoltage}V
      </text>

      {/* Rail pads — gold annular rings with polarity silk beside them. The
          pins plug straight down under the PCB, so these are the leg visual. */}
      {pads.map(({ p, plus }, i) => {
        const isTop = i < 4
        const silkY = isTop ? p.y - 6 : p.y + 9
        return (
          <g key={`pad-${i}`}>
            <circle cx={p.x} cy={p.y} r={3.3} fill="#c8a24a" stroke="#8f6d2a" strokeWidth={0.6} />
            <circle cx={p.x} cy={p.y} r={1.5} fill="#191512" />
            <text x={p.x} y={silkY} textAnchor="middle" fontSize={5} fill={plus ? "#f2a09b" : "#9fc3ef"} fontFamily={MONO} fontWeight={700}>
              {plus ? "+" : "−"}
            </text>
          </g>
        )
      })}

      {/* Component name below the body */}
      <text
        x={bodyCx}
        y={bodyBottom + 8}
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

export const PowerSupplyRenderer = React.memo(PowerSupplyRendererInner)
