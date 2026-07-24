// ── Power Supply Renderer ───────────────────────────────────────────
//
// Visual for the HW-131-style breadboard power-supply module (the same
// black-PCB module the 3D GLB renders). Sits across the top of the
// breadboard, dropping pins onto all four power rails. Each side
// (left/right) has its own voltage selector that the user changes via
// the inspector — the on-board jumper visual mirrors that selection so
// the breadboard view stays in sync with the netlist.
//
// Drawn as a realistic top-down PCB matched to the 3D model: black
// solder mask, barrel jack + blue push switch + lit power LED along the
// off-board edge, USB-A with a pale tongue on the right, yellow voltage
// jumpers at the side edges, blue bulk electrolytic between the pin
// rows, and "HW-131" silk running down the right edge.

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

/** A passive SMD part: pale ceramic body with tinned terminals — the small
 *  white rectangles scattered over the black PCB. */
function Smd({ x, y, vertical = false }: { x: number; y: number; vertical?: boolean }) {
  const w = vertical ? 2.6 : 5
  const h = vertical ? 5 : 2.6
  return (
    <g>
      <rect x={x - w / 2} y={y - h / 2} width={w} height={h} rx={0.3} fill="#e3e6e9" />
      {vertical ? (
        <>
          <rect x={x - w / 2} y={y - h / 2} width={w} height={1.2} fill="#9aa0a6" />
          <rect x={x - w / 2} y={y + h / 2 - 1.2} width={w} height={1.2} fill="#9aa0a6" />
        </>
      ) : (
        <>
          <rect x={x - w / 2} y={y - h / 2} width={1.2} height={h} fill="#9aa0a6" />
          <rect x={x + w / 2 - 1.2} y={y - h / 2} width={1.2} height={h} fill="#9aa0a6" />
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

  // Body extents — the real module is 52mm across, extending ~3.4mm past each
  // outer rail pin (≈18px at 14px per 2.54mm), same silhouette as the 3D GLB.
  const bodyLeft = lMinusTop.x - 18
  const bodyRight = rPlusTop.x + 18
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
    jack: `psu-jack-${uid}`,
    blueBtn: `psu-bluebtn-${uid}`,
    capBlue: `psu-capblue-${uid}`,
    led: `psu-led-${uid}`,
    yellow: `psu-yellow-${uid}`,
    shadow: `psu-shadow-${uid}`,
  }

  // Connector strip along the board-end (top) edge, mirroring the model:
  // barrel jack, blue push switch, power LED over a round cap, then USB-A.
  const jackCx = bodyLeft + bodyW * 0.14
  const switchCx = bodyLeft + bodyW * 0.35
  const ledCx = bodyLeft + bodyW * 0.5
  const usbCx = bodyRight - bodyW * 0.17
  // Yellow voltage jumpers hug the side edges; the bulk cap and passives
  // share the strip between the two pin rows.
  const midY = (lPlusTop.y + lPlusBot.y) / 2
  const jumperY = bodyTop + bodyH * 0.52
  const leftJumperCx = bodyLeft + bodyW * 0.15
  const rightJumperCx = bodyRight - bodyW * 0.15

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

  return (
    <g>
      <defs>
        <linearGradient id={ids.pcb} x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0%" stopColor="#232328" />
          <stop offset="50%" stopColor="#141417" />
          <stop offset="100%" stopColor="#0c0c0e" />
        </linearGradient>
        <linearGradient id={ids.metal} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#eceef0" />
          <stop offset="45%" stopColor="#c3c8cd" />
          <stop offset="100%" stopColor="#94999f" />
        </linearGradient>
        <linearGradient id={ids.jack} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#48484f" />
          <stop offset="30%" stopColor="#2a2a2f" />
          <stop offset="100%" stopColor="#111113" />
        </linearGradient>
        <linearGradient id={ids.blueBtn} x1="0" y1="0" x2="0.3" y2="1">
          <stop offset="0%" stopColor="#7d9df2" />
          <stop offset="55%" stopColor="#4a6fd4" />
          <stop offset="100%" stopColor="#2c4aa8" />
        </linearGradient>
        <linearGradient id={ids.capBlue} x1="0" y1="0" x2="0.5" y2="1">
          <stop offset="0%" stopColor="#5561e0" />
          <stop offset="55%" stopColor="#3340bf" />
          <stop offset="100%" stopColor="#1f2a8f" />
        </linearGradient>
        <linearGradient id={ids.yellow} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fbcf3c" />
          <stop offset="55%" stopColor="#e9a812" />
          <stop offset="100%" stopColor="#b97e0a" />
        </linearGradient>
        <radialGradient id={ids.led} cx="0.4" cy="0.35" r="0.8">
          <stop offset="0%" stopColor="#eafbe7" />
          <stop offset="45%" stopColor="#5fd77a" />
          <stop offset="100%" stopColor="#1c7f3d" />
        </radialGradient>
        <filter id={ids.shadow} x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0.7" dy="1.3" stdDeviation="0.9" floodColor="#000000" floodOpacity="0.5" />
        </filter>
      </defs>

      {/* PCB with edge shading */}
      <rect x={bodyLeft + 1.6} y={bodyTop + 2.4} width={bodyW} height={bodyH} rx={4} fill="#000000" opacity={0.35} />
      <rect
        x={bodyLeft}
        y={bodyTop}
        width={bodyW}
        height={bodyH}
        rx={4}
        fill={`url(#${ids.pcb})`}
        stroke={isSelected ? "#3b82f6" : "#000000"}
        strokeWidth={isSelected ? 1.5 : 1}
      />
      {/* Bevel light on the top edge */}
      <rect x={bodyLeft + 2} y={bodyTop + 1} width={bodyW - 4} height={1.4} rx={0.7} fill="#5a5a63" opacity={0.5} />

      {/* Corner mounting holes — bare annular rings */}
      {mountingHoles.map((hole, i) => (
        <g key={`mount-${i}`}>
          <circle cx={hole.x} cy={hole.y} r={3.2} fill="#c8a24a" stroke="#8f6d2a" strokeWidth={0.5} />
          <circle cx={hole.x} cy={hole.y} r={1.8} fill="#efe9dd" />
        </g>
      ))}

      {/* Barrel jack — tall black block, barrel poking past the PCB edge */}
      <g filter={`url(#${ids.shadow})`}>
        <ellipse cx={jackCx} cy={bodyTop - 3.4} rx={6.4} ry={2} fill="#000000" />
        <ellipse cx={jackCx} cy={bodyTop - 3.4} rx={4.2} ry={1.2} fill="#2e2e33" />
        <rect x={jackCx - 15} y={bodyTop + 2} width={30} height={54} rx={4} fill={`url(#${ids.jack})`} stroke="#000000" strokeWidth={0.6} />
        <rect x={jackCx - 11.5} y={bodyTop + 6} width={23} height={46} rx={2.5} fill="none" stroke="#55555e" strokeWidth={0.8} opacity={0.7} />
        <rect x={jackCx - 11.5} y={bodyTop + 6} width={23} height={3} rx={1.5} fill="#5c5c66" opacity={0.6} />
      </g>

      {/* Push switch — black base, blue square cap */}
      <g filter={`url(#${ids.shadow})`}>
        <rect x={switchCx - 13} y={bodyTop + 8} width={26} height={26} rx={2} fill="#131316" stroke="#000000" strokeWidth={0.5} />
        {[[-10, 10], [10, 10], [-10, -10], [10, -10]].map(([dx, dy], i) => (
          <circle key={`swpin-${i}`} cx={switchCx + dx} cy={bodyTop + 21 + dy} r={1.3} fill="#a9aeb4" />
        ))}
        <rect x={switchCx - 8} y={bodyTop + 13} width={16} height={16} rx={1.6} fill={`url(#${ids.blueBtn})`} stroke="#1d3684" strokeWidth={0.6} />
        <rect x={switchCx - 6} y={bodyTop + 15} width={12} height={4} rx={1.2} fill="#a7bdf7" opacity={0.55} />
        {/* Solder strip under the switch */}
        <rect x={switchCx - 9} y={bodyTop + 38} width={18} height={5} rx={0.8} fill="#3a3a41" />
      </g>

      {/* Power LED — lit green dome with a round cap below it */}
      <circle cx={ledCx} cy={bodyTop + 14} r={8} fill="#4ade80" opacity={0.2} />
      <circle cx={ledCx} cy={bodyTop + 14} r={4.4} fill={`url(#${ids.led})`} stroke="#166534" strokeWidth={0.5} />
      <circle cx={ledCx - 1.2} cy={bodyTop + 12.8} r={1.2} fill="#ffffff" opacity={0.85} />
      <g filter={`url(#${ids.shadow})`}>
        <circle cx={ledCx} cy={bodyTop + 34} r={7.2} fill="#0e0e10" />
        <circle cx={ledCx} cy={bodyTop + 34} r={7.1} fill="none" stroke="#84888f" strokeWidth={1} />
        <circle cx={ledCx} cy={bodyTop + 34} r={4.6} fill="#26262b" />
        <path d={`M ${ledCx - 4.6} ${bodyTop + 31.6} A 5 5 0 0 1 ${ledCx + 1} ${bodyTop + 29.6}`} fill="none" stroke="#b9bdc3" strokeWidth={1.1} opacity={0.6} />
      </g>

      {/* USB-A shell — brushed metal with the pale tongue showing */}
      <g filter={`url(#${ids.shadow})`}>
        <rect x={usbCx - 17} y={bodyTop + 5} width={34} height={38} rx={1.4} fill={`url(#${ids.metal})`} stroke="#767c84" strokeWidth={0.5} />
        <rect x={usbCx - 13} y={bodyTop + 9} width={26} height={30} rx={1} fill="#ded9cf" />
        <rect x={usbCx - 13} y={bodyTop + 9} width={26} height={7} fill="#b9b2a4" opacity={0.8} />
        <circle cx={usbCx - 13.8} cy={bodyTop + 24} r={1} fill="#71767d" />
        <circle cx={usbCx + 13.8} cy={bodyTop + 24} r={1} fill="#71767d" />
      </g>

      {/* Model silk running down the right edge */}
      <text
        x={bodyRight - 8}
        y={bodyTop + bodyH * 0.42}
        textAnchor="middle"
        fontSize={9}
        fill={SILK}
        fontFamily={MONO}
        opacity={0.9}
        letterSpacing={1.5}
        transform={`rotate(90 ${bodyRight - 8} ${bodyTop + bodyH * 0.42})`}
      >
        HW-131
      </text>

      {/* SMD passives sprinkled where the real board carries them */}
      <Smd x={bodyCx - 26} y={bodyTop + 62} />
      <Smd x={bodyCx - 4} y={bodyTop + 58} />
      <Smd x={bodyCx + 16} y={bodyTop + 62} vertical />
      <Smd x={bodyCx - 16} y={midY - 16} vertical />
      <Smd x={bodyCx + 22} y={midY - 14} />

      {/* Voltage jumpers at the side edges, bulk electrolytic in the middle */}
      <VoltageJumper cx={leftJumperCx} cy={jumperY} voltage={leftVoltage} ids={{ cap: ids.yellow }} shadow={ids.shadow} />
      <VoltageJumper cx={rightJumperCx} cy={jumperY} voltage={rightVoltage} ids={{ cap: ids.yellow }} shadow={ids.shadow} />
      <g filter={`url(#${ids.shadow})`}>
        <circle cx={bodyCx} cy={midY} r={10.4} fill="#0d0d10" />
        <circle cx={bodyCx} cy={midY} r={9.6} fill={`url(#${ids.capBlue})`} />
        <circle cx={bodyCx} cy={midY} r={5.8} fill="#101223" />
        <path d={`M ${bodyCx - 5.2} ${midY} H ${bodyCx + 5.2} M ${bodyCx} ${midY - 5.2} V ${midY + 5.2}`} stroke="#3c4ac9" strokeWidth={0.9} opacity={0.9} />
        <path d={`M ${bodyCx - 9.6} ${midY - 3.4} A 9.6 9.6 0 0 1 ${bodyCx - 3.4} ${midY - 9.6}`} fill="none" stroke="#8f9af0" strokeWidth={1.6} opacity={0.55} />
      </g>

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
            <text x={p.x} y={silkY} textAnchor="middle" fontSize={5} fill={SILK} fontFamily={MONO} fontWeight={700}>
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
