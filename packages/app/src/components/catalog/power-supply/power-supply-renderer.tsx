// ── Power Supply Renderer ───────────────────────────────────────────
//
// Visual for the MB102-style breadboard power-supply module. Sits across
// the top of the breadboard, dropping pins onto all four power rails.
// Each side (left/right) has its own voltage selector that the user
// changes via the inspector — the on-board jumper visual mirrors that
// selection so the breadboard view stays in sync with the netlist.

import React from "react"
import type { BoardComponent } from "@dreamer/schemas"
import { gridToPixel } from "@/breadboard/breadboard-grid"
import { HOLE_SPACING, LABEL_FONT_SIZE } from "@/breadboard/breadboard-constants"
import { powerSupplyPinRows } from "./pin-rows"

/** How far the PCB extends past the pin rows, in hole rows. The real MB102's
 *  body hangs ~7 rows up-board past its top pin row (toward the board end) and
 *  ~1 row past the bottom one — same extents the 3D GLB shows, so the two views
 *  read the same. */
const BODY_OVERHANG_TOP_ROWS = 7
const BODY_OVERHANG_BOTTOM_ROWS = 1

type PowerSupplyRendererProps = {
  component: BoardComponent
  isSelected: boolean
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
  const lPlusTop = gridToPixel({ row: topRow, col: -2 })
  const lMinusTop = gridToPixel({ row: topRow, col: -1 })
  const rMinusTop = gridToPixel({ row: topRow, col: 10 })
  const rPlusTop = gridToPixel({ row: topRow, col: 11 })
  const lPlusBot = gridToPixel({ row: bottomRow, col: -2 })
  const lMinusBot = gridToPixel({ row: bottomRow, col: -1 })
  const rMinusBot = gridToPixel({ row: bottomRow, col: 10 })
  const rPlusBot = gridToPixel({ row: bottomRow, col: 11 })

  // Body extents — span from outer left rail to outer right rail, with the
  // real module's up-board overhang so the 2D silhouette matches the 3D model.
  const bodyLeft = lPlusTop.x - 6
  const bodyRight = rPlusTop.x + 6
  const bodyTop = lPlusTop.y - BODY_OVERHANG_TOP_ROWS * HOLE_SPACING
  const bodyBottom = lPlusBot.y + BODY_OVERHANG_BOTTOM_ROWS * HOLE_SPACING
  const bodyW = bodyRight - bodyLeft
  const bodyH = bodyBottom - bodyTop
  const bodyCx = (bodyLeft + bodyRight) / 2
  const bodyCy = (bodyTop + bodyBottom) / 2

  const leftVoltage = (component.properties.leftVoltage as number | undefined) ?? 5
  const rightVoltage = (component.properties.rightVoltage as number | undefined) ?? 3.3

  const gradientId = `psu-grad-${component.id}`

  // Geometry for the per-side jumper block — a small 3-pin header where
  // the jumper cap visually sits over the chosen voltage. Centered between
  // the rail pin column and the body's mid-line on each side.
  const renderJumper = (
    cx: number,
    cy: number,
    voltage: number,
    keyPrefix: string,
  ) => {
    const headerW = 14
    const headerH = 6
    const pinSpacing = 4
    // Three positions: 5V (left), OFF (middle), 3.3V (right).
    // Cap covers either the left two or the right two depending on voltage.
    const capX =
      voltage === 5
        ? cx - headerW / 2 + 1
        : cx - headerW / 2 + 1 + pinSpacing
    return (
      <g key={keyPrefix}>
        {/* Header housing */}
        <rect
          x={cx - headerW / 2}
          y={cy - headerH / 2}
          width={headerW}
          height={headerH}
          rx={0.6}
          fill="#1a1a1a"
          stroke="#0a0a0a"
          strokeWidth={0.4}
        />
        {/* Three header pins */}
        {[0, 1, 2].map((i) => (
          <rect
            key={`pin-${i}`}
            x={cx - headerW / 2 + 1.6 + i * pinSpacing}
            y={cy - 1.4}
            width={1.2}
            height={2.8}
            fill="#d4af37"
          />
        ))}
        {/* Jumper cap — covers two adjacent pins */}
        <rect
          x={capX}
          y={cy - headerH / 2 - 1.2}
          width={pinSpacing + 3}
          height={headerH + 2.4}
          rx={0.8}
          fill="#1e3a8a"
          stroke="#0c1f4d"
          strokeWidth={0.5}
        />
        {/* Voltage labels above and below the header */}
        <text
          x={cx - pinSpacing - 0.5}
          y={cy - headerH / 2 - 2}
          textAnchor="middle"
          fontSize={3.2}
          fill="#9ca3af"
          fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
        >
          5V
        </text>
        <text
          x={cx + pinSpacing + 0.5}
          y={cy - headerH / 2 - 2}
          textAnchor="middle"
          fontSize={3.2}
          fill="#9ca3af"
          fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
        >
          3V3
        </text>
      </g>
    )
  }

  return (
    <g>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0c4a3a" />
          <stop offset="100%" stopColor="#072e24" />
        </linearGradient>
      </defs>

      {/* Soft drop shadow */}
      <rect
        x={bodyLeft + 1.5}
        y={bodyTop + 2}
        width={bodyW}
        height={bodyH}
        rx={2}
        fill="#000000"
        opacity={0.3}
      />

      {/* PCB body */}
      <rect
        x={bodyLeft}
        y={bodyTop}
        width={bodyW}
        height={bodyH}
        rx={2}
        fill={`url(#${gradientId})`}
        stroke={isSelected ? "#3b82f6" : "#022c1f"}
        strokeWidth={isSelected ? 1.5 : 0.8}
      />

      {/* Inner silkscreen border */}
      <rect
        x={bodyLeft + 2}
        y={bodyTop + 2}
        width={bodyW - 4}
        height={bodyH - 4}
        rx={1.5}
        fill="none"
        stroke="#0e6b51"
        strokeWidth={0.4}
        opacity={0.8}
      />

      {/* Barrel jack icon — centered, dark cylinder */}
      <g>
        <rect
          x={bodyCx - 9}
          y={bodyCy - 4}
          width={14}
          height={8}
          rx={1}
          fill="#1a1a1a"
          stroke="#0a0a0a"
          strokeWidth={0.5}
        />
        <circle cx={bodyCx - 2} cy={bodyCy} r={2.2} fill="#0a0a0a" />
        <circle cx={bodyCx - 2} cy={bodyCy} r={0.8} fill="#404040" />
      </g>

      {/* USB port icon — small grey rect right of the barrel */}
      <g>
        <rect
          x={bodyCx + 7}
          y={bodyCy - 3}
          width={9}
          height={6}
          rx={0.6}
          fill="#9ca3af"
          stroke="#4b5563"
          strokeWidth={0.4}
        />
        <rect
          x={bodyCx + 8.4}
          y={bodyCy - 1.8}
          width={6.2}
          height={3.6}
          fill="#1f2937"
        />
      </g>

      {/* MB102 silkscreen label */}
      <text
        x={bodyCx}
        y={bodyTop + 4.5}
        textAnchor="middle"
        fontSize={3.5}
        fill="#9ca3af"
        fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
        fontWeight={700}
      >
        MB102 PSU
      </text>

      {/* Per-side jumpers */}
      {renderJumper(
        bodyLeft + (bodyCx - 9 - bodyLeft) / 2,
        bodyCy + 2,
        leftVoltage,
        "left-jumper",
      )}
      {renderJumper(
        bodyCx + 16 + (bodyRight - (bodyCx + 16)) / 2,
        bodyCy + 2,
        rightVoltage,
        "right-jumper",
      )}

      {/* Voltage readouts at each side, near the rails */}
      <text
        x={bodyLeft + 4}
        y={bodyBottom - 2}
        textAnchor="start"
        fontSize={3.6}
        fill={leftVoltage === 5 ? "#fbbf24" : "#22d3ee"}
        fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
        fontWeight={700}
      >
        L: {leftVoltage}V
      </text>
      <text
        x={bodyRight - 4}
        y={bodyBottom - 2}
        textAnchor="end"
        fontSize={3.6}
        fill={rightVoltage === 5 ? "#fbbf24" : "#22d3ee"}
        fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
        fontWeight={700}
      >
        R: {rightVoltage}V
      </text>

      {/* Pin hole rings — colored by polarity. The pins plug straight down
          under the PCB (both rows sit inside the body), so rings on top of the
          body are the only leg visual. */}
      {[
        { p: lPlusTop, color: "#ef4444" },
        { p: lMinusTop, color: "#3b82f6" },
        { p: rMinusTop, color: "#3b82f6" },
        { p: rPlusTop, color: "#ef4444" },
        { p: lPlusBot, color: "#ef4444" },
        { p: lMinusBot, color: "#3b82f6" },
        { p: rMinusBot, color: "#3b82f6" },
        { p: rPlusBot, color: "#ef4444" },
      ].map(({ p, color }, i) => (
        <circle
          key={`ring-${i}`}
          cx={p.x}
          cy={p.y}
          r={2}
          fill={color}
          opacity={0.55}
        />
      ))}

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
