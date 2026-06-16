// ── Schematic ──────────────────────────────────────────────────────────
//
// Lightweight inline-SVG DSL for the encyclopedia's circuit diagrams.
// Intentionally tiny — every symbol is hand-drawn in ~10 lines of SVG
// and positioned on a fixed-pitch grid. The DSL exists so page authors
// can write:
//
//   <Schematic cols={16} rows={8}>
//     <Schematic.Vcc at={[1, 1]} label="5V" />
//     <Schematic.Resistor from={[3, 1]} to={[7, 1]} label="220Ω" />
//     <Schematic.Led at={[9, 1]} />
//     <Schematic.Ground at={[11, 6]} />
//     <Schematic.Wire points={[[7,1],[9,1],[9,5],[11,5],[11,6]]} />
//   </Schematic>
//
// instead of hand-drafting <path> elements.
//
// Philosophy:
// - Inline SVG only. Pages stay self-contained and dark-mode correct.
// - Fixed 16-col grid, author picks the row count. Grid cell pixels
//   are deliberately chunky so the symbols read well in the learn
//   track's width.
// - One render call per symbol, each positioned by grid coordinates.
// - ANSI-style symbols so they match what readers see in every other
//   Arduino tutorial.
//
// Budget: ~10 symbols covers every Phase 1 diagram in the encyclopedia.
// If a new symbol is needed, add it here; do NOT reach for images.

import type { ReactNode } from "react"

// ── Layout constants ───────────────────────────────────────────────────

/** Pixel size of one grid cell. Chunky on purpose — schematics are scanned, not read. */
const CELL = 32
const STROKE = "#9ca3af" // neutral-400
const STROKE_ACTIVE = "#d1d5db"
const LABEL = "#9ca3af"
const BG = "#0f0f0f"

type GridPoint = readonly [col: number, row: number]

function p(pt: GridPoint) {
  return { x: pt[0] * CELL, y: pt[1] * CELL }
}

// ── Root ───────────────────────────────────────────────────────────────

type SchematicRootProps = {
  /** Grid width in cells. Max ~20. */
  cols: number
  /** Grid height in cells. */
  rows: number
  /** Optional title shown above the figure. */
  title?: string
  children: ReactNode
}

function Root({ cols, rows, title, children }: SchematicRootProps) {
  // Pad the viewBox by a half-cell on every side so symbols that touch
  // the edge of the authored grid (e.g. ArduinoPin whose box extends
  // LEFT of col 0) still draw fully inside the visible area.
  const pad = CELL / 2
  const w = cols * CELL + pad * 2
  const h = rows * CELL + pad * 2

  return (
    <div className="my-4 flex flex-col items-center">
      {title && (
        <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {title}
        </p>
      )}
      {/* Outer wrapper is full-width so the border looks like a frame.
          Inner flex centers the fixed-size SVG inside that frame. */}
      <div
        className="w-full overflow-auto rounded border border-border bg-[#0f0f0f] px-6 py-4"
      >
        <div className="flex justify-center">
          <svg
            width={w}
            height={h}
            viewBox={`${-pad} ${-pad} ${w} ${h}`}
            xmlns="http://www.w3.org/2000/svg"
            role="img"
            aria-label={title ?? "Circuit schematic diagram"}
          >
            {/* Faint grid dots so authors can verify positioning visually */}
            <GridDots cols={cols} rows={rows} />
            {children}
          </svg>
        </div>
      </div>
    </div>
  )
}

function GridDots({ cols, rows }: { cols: number; rows: number }) {
  const dots: ReactNode[] = []
  for (let r = 0; r <= rows; r++) {
    for (let c = 0; c <= cols; c++) {
      dots.push(
        <circle
          key={`${c},${r}`}
          cx={c * CELL}
          cy={r * CELL}
          r={0.6}
          fill="#27272a"
        />,
      )
    }
  }
  return <g>{dots}</g>
}

// ── Wires ──────────────────────────────────────────────────────────────
//
// A wire is just a polyline through grid points. Authors think in
// cells; we convert to pixels. Corners get tiny chamfers so the lines
// don't look like they were drawn by a machine.

type WireProps = {
  points: readonly GridPoint[]
  color?: string
}

function Wire({ points, color = STROKE }: WireProps) {
  if (points.length < 2) return null
  const d = points
    .map((pt, i) => {
      const { x, y } = p(pt)
      return `${i === 0 ? "M" : "L"} ${x} ${y}`
    })
    .join(" ")
  return (
    <path
      d={d}
      fill="none"
      stroke={color}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  )
}

// ── Node junction ──────────────────────────────────────────────────────
//
// Small dot placed at a 3+ wire intersection so the reader knows the
// wires are actually joined, not crossing over.

function Junction({ at }: { at: GridPoint }) {
  const { x, y } = p(at)
  return <circle cx={x} cy={y} r={3} fill={STROKE_ACTIVE} />
}

// ── Label ──────────────────────────────────────────────────────────────
//
// Plain text at a grid position. Useful for net labels, values near
// a symbol, etc. Not for component names — symbols take their own
// label prop.

type LabelProps = {
  at: GridPoint
  text: string
  /** Horizontal text anchor. Default "middle". */
  anchor?: "start" | "middle" | "end"
  /** Vertical baseline nudge in px. Default 0. */
  dy?: number
}

function Label({ at, text, anchor = "middle", dy = 0 }: LabelProps) {
  const { x, y } = p(at)
  return (
    <text
      x={x}
      y={y + dy}
      textAnchor={anchor}
      fontSize={11}
      fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
      fill={LABEL}
    >
      {text}
    </text>
  )
}

// ── Resistor ───────────────────────────────────────────────────────────
//
// Horizontal or vertical. Author gives two grid endpoints (must be
// co-linear). The body is drawn centered between them.

type ResistorProps = {
  from: GridPoint
  to: GridPoint
  label?: string
}

function Resistor({ from, to, label }: ResistorProps) {
  const a = p(from)
  const b = p(to)
  const isHorizontal = from[1] === to[1]
  const cx = (a.x + b.x) / 2
  const cy = (a.y + b.y) / 2
  const bodyLen = 28
  const bodyWidth = 10

  // Leads from endpoints to the body
  const leadStart = isHorizontal
    ? { x: cx - bodyLen / 2, y: cy }
    : { x: cx, y: cy - bodyLen / 2 }
  const leadEnd = isHorizontal
    ? { x: cx + bodyLen / 2, y: cy }
    : { x: cx, y: cy + bodyLen / 2 }

  // Body rect, rotated for vertical placement
  const rect = isHorizontal
    ? {
        x: cx - bodyLen / 2,
        y: cy - bodyWidth / 2,
        width: bodyLen,
        height: bodyWidth,
      }
    : {
        x: cx - bodyWidth / 2,
        y: cy - bodyLen / 2,
        width: bodyWidth,
        height: bodyLen,
      }

  return (
    <g>
      <line
        x1={a.x}
        y1={a.y}
        x2={leadStart.x}
        y2={leadStart.y}
        stroke={STROKE}
        strokeWidth={1.8}
      />
      <line
        x1={leadEnd.x}
        y1={leadEnd.y}
        x2={b.x}
        y2={b.y}
        stroke={STROKE}
        strokeWidth={1.8}
      />
      <rect
        x={rect.x}
        y={rect.y}
        width={rect.width}
        height={rect.height}
        rx={1.5}
        fill={BG}
        stroke={STROKE}
        strokeWidth={1.8}
      />
      {label && (
        <text
          x={cx}
          y={isHorizontal ? cy - bodyWidth / 2 - 6 : cy - bodyLen / 2 - 6}
          textAnchor="middle"
          fontSize={10}
          fill={LABEL}
          fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
        >
          {label}
        </text>
      )}
    </g>
  )
}

// ── LED ────────────────────────────────────────────────────────────────
//
// Triangle + bar diode symbol with two emission arrows, drawn between
// two grid points. Must be horizontal (same row). `from` is the anode
// (long leg in real life, positive terminal); `to` is the cathode
// (short leg, negative). Current flows from → to.
//
// Terminals sit exactly at the grid points, so authors can connect
// wires to `from` and `to` without fractional-cell gaps.

type LedProps = {
  from: GridPoint
  to: GridPoint
  color?: string
  label?: string
}

function Led({ from, to, color = "#ef4444", label }: LedProps) {
  const a = p(from)
  const b = p(to)
  // Only horizontal orientation for now — vertical would need the
  // emission arrows rotated too, which isn't worth the extra geometry
  // until we actually need vertical LEDs.
  const cx = (a.x + b.x) / 2
  const cy = (a.y + b.y) / 2
  const triHalf = 7 // triangle half-side
  const bodyHalfWidth = triHalf // distance from cx to the cathode bar
  const leadLeftEnd = cx - bodyHalfWidth
  const leadRightStart = cx + bodyHalfWidth

  // Triangle points right: anode (left) → cathode (right)
  const tri = `M ${cx - triHalf} ${cy - triHalf} L ${cx + triHalf} ${cy} L ${cx - triHalf} ${cy + triHalf} Z`

  return (
    <g>
      {/* Lead from anode grid point to triangle base */}
      <line
        x1={a.x}
        y1={a.y}
        x2={leadLeftEnd}
        y2={cy}
        stroke={STROKE}
        strokeWidth={1.8}
      />
      {/* Triangle */}
      <path d={tri} fill={BG} stroke={STROKE} strokeWidth={1.8} />
      {/* Cathode bar */}
      <line
        x1={leadRightStart}
        y1={cy - triHalf}
        x2={leadRightStart}
        y2={cy + triHalf}
        stroke={STROKE}
        strokeWidth={2}
      />
      {/* Lead from cathode bar to cathode grid point */}
      <line
        x1={leadRightStart}
        y1={cy}
        x2={b.x}
        y2={b.y}
        stroke={STROKE}
        strokeWidth={1.8}
      />
      {/* Emission arrows — two small slashes pointing up-right */}
      <line
        x1={cx + 2}
        y1={cy - triHalf - 2}
        x2={cx + 8}
        y2={cy - triHalf - 8}
        stroke={color}
        strokeWidth={1.4}
        strokeLinecap="round"
      />
      <polyline
        points={`${cx + 7},${cy - triHalf - 8} ${cx + 8},${cy - triHalf - 8} ${cx + 8},${cy - triHalf - 7}`}
        fill="none"
        stroke={color}
        strokeWidth={1.2}
      />
      <line
        x1={cx + 6}
        y1={cy - triHalf - 2}
        x2={cx + 12}
        y2={cy - triHalf - 8}
        stroke={color}
        strokeWidth={1.4}
        strokeLinecap="round"
      />
      <polyline
        points={`${cx + 11},${cy - triHalf - 8} ${cx + 12},${cy - triHalf - 8} ${cx + 12},${cy - triHalf - 7}`}
        fill="none"
        stroke={color}
        strokeWidth={1.2}
      />
      {label && (
        <text
          x={cx}
          y={cy + triHalf + 12}
          textAnchor="middle"
          fontSize={10}
          fill={LABEL}
          fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
        >
          {label}
        </text>
      )}
    </g>
  )
}

// ── Diode ──────────────────────────────────────────────────────────────
//
// Triangle + bar, just like an LED without the emission arrows. `from`
// is the anode, `to` is the cathode. Must be horizontal (same row).
// Current flows from → to when forward-biased.

type DiodeProps = {
  from: GridPoint
  to: GridPoint
  label?: string
}

function Diode({ from, to, label }: DiodeProps) {
  const a = p(from)
  const b = p(to)
  const cx = (a.x + b.x) / 2
  const cy = (a.y + b.y) / 2
  const triHalf = 7
  const bodyHalfWidth = triHalf
  const leadLeftEnd = cx - bodyHalfWidth
  const leadRightStart = cx + bodyHalfWidth
  const tri = `M ${cx - triHalf} ${cy - triHalf} L ${cx + triHalf} ${cy} L ${cx - triHalf} ${cy + triHalf} Z`

  return (
    <g>
      <line x1={a.x} y1={a.y} x2={leadLeftEnd} y2={cy} stroke={STROKE} strokeWidth={1.8} />
      <path d={tri} fill={BG} stroke={STROKE} strokeWidth={1.8} />
      <line
        x1={leadRightStart}
        y1={cy - triHalf}
        x2={leadRightStart}
        y2={cy + triHalf}
        stroke={STROKE}
        strokeWidth={2}
      />
      <line x1={leadRightStart} y1={cy} x2={b.x} y2={b.y} stroke={STROKE} strokeWidth={1.8} />
      {label && (
        <text
          x={cx}
          y={cy + triHalf + 12}
          textAnchor="middle"
          fontSize={10}
          fill={LABEL}
          fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
        >
          {label}
        </text>
      )}
    </g>
  )
}

// ── N-channel MOSFET (as a switch) ─────────────────────────────────────
//
// Drawn at a single grid point `at`. The three terminals expose grid
// points relative to `at`:
//   gate:   at - [2, 0]  (left side, same row)
//   drain:  at - [0, 2]  (above)
//   source: at + [0, 2]  (below)
// Authors draw their own wires to those points.

type NmosProps = {
  at: GridPoint
  label?: string
}

function Nmos({ at, label }: NmosProps) {
  const { x, y } = p(at)
  // Body vertical line
  const bodyTop = y - 14
  const bodyBot = y + 14
  const bodyX = x - 4
  // Channel terminals
  const drainX = x + 6
  const drainY = y - 12
  const sourceX = x + 6
  const sourceY = y + 12
  const gateLineX = x - 12

  return (
    <g>
      {/* Gate lead */}
      <line x1={x - CELL * 2} y1={y} x2={gateLineX} y2={y} stroke={STROKE} strokeWidth={1.8} />
      {/* Gate plate (vertical bar) */}
      <line x1={gateLineX} y1={y - 10} x2={gateLineX} y2={y + 10} stroke={STROKE} strokeWidth={1.8} />
      {/* Body (three short horizontal segments representing channel) */}
      <line x1={bodyX} y1={bodyTop + 4} x2={bodyX + 6} y2={bodyTop + 4} stroke={STROKE} strokeWidth={1.8} />
      <line x1={bodyX} y1={y} x2={bodyX + 6} y2={y} stroke={STROKE} strokeWidth={1.8} />
      <line x1={bodyX} y1={bodyBot - 4} x2={bodyX + 6} y2={bodyBot - 4} stroke={STROKE} strokeWidth={1.8} />
      {/* Drain connection — bend from top-right of body */}
      <line x1={bodyX + 6} y1={bodyTop + 4} x2={drainX} y2={bodyTop + 4} stroke={STROKE} strokeWidth={1.8} />
      <line x1={drainX} y1={bodyTop + 4} x2={drainX} y2={y - CELL * 2} stroke={STROKE} strokeWidth={1.8} />
      {/* Source connection */}
      <line x1={bodyX + 6} y1={bodyBot - 4} x2={sourceX} y2={bodyBot - 4} stroke={STROKE} strokeWidth={1.8} />
      <line x1={sourceX} y1={bodyBot - 4} x2={sourceX} y2={y + CELL * 2} stroke={STROKE} strokeWidth={1.8} />
      {/* Arrow on source pointing in (N-channel convention) */}
      <polyline
        points={`${sourceX - 3},${y + 3} ${bodyX + 6},${y} ${sourceX - 3},${y - 3}`}
        fill="none"
        stroke={STROKE}
        strokeWidth={1.4}
      />
      {label && (
        <text
          x={x + 14}
          y={y + 3}
          textAnchor="start"
          fontSize={10}
          fill={LABEL}
          fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
        >
          {label}
        </text>
      )}
      {/* Pin labels */}
      <text x={drainX + 4} y={bodyTop + 6} fontSize={9} fill={LABEL} fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace">D</text>
      <text x={sourceX + 4} y={bodyBot - 4} fontSize={9} fill={LABEL} fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace">S</text>
      <text x={gateLineX - 12} y={y + 3} fontSize={9} fill={LABEL} fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace">G</text>
    </g>
  )
}

// ── Potentiometer (3-terminal) ─────────────────────────────────────────
//
// Drawn between two grid points `from` and `to` (the fixed ends),
// with a wiper tap perpendicular to the body. Must be horizontal.
// The wiper grid point is exposed at midpoint, one row below the body.

type PotentiometerProps = {
  from: GridPoint
  to: GridPoint
  label?: string
}

function Potentiometer({ from, to, label }: PotentiometerProps) {
  const a = p(from)
  const b = p(to)
  const cx = (a.x + b.x) / 2
  const cy = (a.y + b.y) / 2
  const bodyLen = 36
  const bodyWidth = 10
  const leadStart = { x: cx - bodyLen / 2, y: cy }
  const leadEnd = { x: cx + bodyLen / 2, y: cy }

  return (
    <g>
      <line x1={a.x} y1={a.y} x2={leadStart.x} y2={leadStart.y} stroke={STROKE} strokeWidth={1.8} />
      <line x1={leadEnd.x} y1={leadEnd.y} x2={b.x} y2={b.y} stroke={STROKE} strokeWidth={1.8} />
      <rect
        x={cx - bodyLen / 2}
        y={cy - bodyWidth / 2}
        width={bodyLen}
        height={bodyWidth}
        rx={1.5}
        fill={BG}
        stroke={STROKE}
        strokeWidth={1.8}
      />
      {/* Wiper arrow (from below, pointing at body) */}
      <line x1={cx} y1={cy + CELL} x2={cx} y2={cy + bodyWidth / 2 + 2} stroke={STROKE} strokeWidth={1.8} />
      <polyline
        points={`${cx - 4},${cy + bodyWidth / 2 + 6} ${cx},${cy + bodyWidth / 2 + 2} ${cx + 4},${cy + bodyWidth / 2 + 6}`}
        fill="none"
        stroke={STROKE}
        strokeWidth={1.4}
      />
      {label && (
        <text
          x={cx}
          y={cy - bodyWidth / 2 - 6}
          textAnchor="middle"
          fontSize={10}
          fill={LABEL}
          fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
        >
          {label}
        </text>
      )}
    </g>
  )
}

// ── Button (momentary, SPST) ───────────────────────────────────────────
//
// Two contacts with a hover-bar between them. `from` and `to` are the
// two contact grid points; they must be co-linear.

type ButtonSymbolProps = {
  from: GridPoint
  to: GridPoint
  label?: string
}

function ButtonSymbol({ from, to, label }: ButtonSymbolProps) {
  const a = p(from)
  const b = p(to)
  const cx = (a.x + b.x) / 2
  const cy = (a.y + b.y) / 2

  return (
    <g>
      {/* Left contact lead */}
      <line
        x1={a.x}
        y1={a.y}
        x2={cx - 10}
        y2={cy}
        stroke={STROKE}
        strokeWidth={1.8}
      />
      {/* Right contact lead */}
      <line
        x1={cx + 10}
        y1={cy}
        x2={b.x}
        y2={b.y}
        stroke={STROKE}
        strokeWidth={1.8}
      />
      {/* Contact dots */}
      <circle cx={cx - 10} cy={cy} r={2} fill={STROKE} />
      <circle cx={cx + 10} cy={cy} r={2} fill={STROKE} />
      {/* Hover bar */}
      <line
        x1={cx - 12}
        y1={cy - 8}
        x2={cx + 12}
        y2={cy - 8}
        stroke={STROKE}
        strokeWidth={1.8}
        strokeLinecap="round"
      />
      {/* Actuator stub */}
      <line
        x1={cx}
        y1={cy - 8}
        x2={cx}
        y2={cy - 12}
        stroke={STROKE}
        strokeWidth={1.2}
      />
      {label && (
        <text
          x={cx}
          y={cy - 16}
          textAnchor="middle"
          fontSize={10}
          fill={LABEL}
          fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
        >
          {label}
        </text>
      )}
    </g>
  )
}

// ── Capacitor ──────────────────────────────────────────────────────────
//
// Two parallel plates. `from` and `to` must be co-linear. Draws the
// symbol halfway between them.

type CapacitorProps = {
  from: GridPoint
  to: GridPoint
  label?: string
}

function Capacitor({ from, to, label }: CapacitorProps) {
  const a = p(from)
  const b = p(to)
  const isHorizontal = from[1] === to[1]
  const cx = (a.x + b.x) / 2
  const cy = (a.y + b.y) / 2
  const plateLen = 14
  const gap = 6

  if (isHorizontal) {
    return (
      <g>
        <line
          x1={a.x}
          y1={a.y}
          x2={cx - gap / 2}
          y2={cy}
          stroke={STROKE}
          strokeWidth={1.8}
        />
        <line
          x1={cx + gap / 2}
          y1={cy}
          x2={b.x}
          y2={b.y}
          stroke={STROKE}
          strokeWidth={1.8}
        />
        <line
          x1={cx - gap / 2}
          y1={cy - plateLen / 2}
          x2={cx - gap / 2}
          y2={cy + plateLen / 2}
          stroke={STROKE}
          strokeWidth={2}
        />
        <line
          x1={cx + gap / 2}
          y1={cy - plateLen / 2}
          x2={cx + gap / 2}
          y2={cy + plateLen / 2}
          stroke={STROKE}
          strokeWidth={2}
        />
        {label && (
          <text
            x={cx}
            y={cy - plateLen / 2 - 6}
            textAnchor="middle"
            fontSize={10}
            fill={LABEL}
            fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
          >
            {label}
          </text>
        )}
      </g>
    )
  }

  return (
    <g>
      <line
        x1={a.x}
        y1={a.y}
        x2={cx}
        y2={cy - gap / 2}
        stroke={STROKE}
        strokeWidth={1.8}
      />
      <line
        x1={cx}
        y1={cy + gap / 2}
        x2={b.x}
        y2={b.y}
        stroke={STROKE}
        strokeWidth={1.8}
      />
      <line
        x1={cx - plateLen / 2}
        y1={cy - gap / 2}
        x2={cx + plateLen / 2}
        y2={cy - gap / 2}
        stroke={STROKE}
        strokeWidth={2}
      />
      <line
        x1={cx - plateLen / 2}
        y1={cy + gap / 2}
        x2={cx + plateLen / 2}
        y2={cy + gap / 2}
        stroke={STROKE}
        strokeWidth={2}
      />
      {label && (
        <text
          x={cx + plateLen / 2 + 4}
          y={cy + 3}
          textAnchor="start"
          fontSize={10}
          fill={LABEL}
          fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
        >
          {label}
        </text>
      )}
    </g>
  )
}

// ── Battery (DC source) ────────────────────────────────────────────────
//
// Two plate pairs, long = +, short = −. Draws at a single grid point
// with a fixed orientation. If you need a battery inline in a wire,
// use <Battery at={...} /> and route your wires to its terminals at
// `at - [0, 0.5]` (positive) and `at + [0, 0.5]` (negative).

type BatteryProps = {
  at: GridPoint
  label?: string
}

function Battery({ at, label }: BatteryProps) {
  const { x, y } = p(at)
  const plateLen = 14
  const gap = 5
  return (
    <g>
      {/* Positive plate (long) */}
      <line
        x1={x - plateLen / 2}
        y1={y - gap / 2}
        x2={x + plateLen / 2}
        y2={y - gap / 2}
        stroke={STROKE}
        strokeWidth={2.4}
      />
      {/* Negative plate (short) */}
      <line
        x1={x - plateLen / 4}
        y1={y + gap / 2}
        x2={x + plateLen / 4}
        y2={y + gap / 2}
        stroke={STROKE}
        strokeWidth={2.4}
      />
      {/* + mark */}
      <text
        x={x + plateLen / 2 + 4}
        y={y - gap / 2 + 4}
        fontSize={10}
        fill={LABEL}
        fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
      >
        +
      </text>
      {label && (
        <text
          x={x}
          y={y + gap / 2 + 14}
          textAnchor="middle"
          fontSize={10}
          fill={LABEL}
          fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
        >
          {label}
        </text>
      )}
    </g>
  )
}

// ── Vcc marker ─────────────────────────────────────────────────────────
//
// "Voltage here, don't draw a wire back to the battery." The symbol is
// a short vertical stub with a label above it.

type VccProps = {
  at: GridPoint
  label?: string
}

function Vcc({ at, label = "+V" }: VccProps) {
  const { x, y } = p(at)
  return (
    <g>
      <line
        x1={x}
        y1={y}
        x2={x}
        y2={y - 10}
        stroke={STROKE}
        strokeWidth={1.8}
      />
      <line
        x1={x - 6}
        y1={y - 10}
        x2={x + 6}
        y2={y - 10}
        stroke={STROKE}
        strokeWidth={2}
      />
      <text
        x={x}
        y={y - 14}
        textAnchor="middle"
        fontSize={10}
        fill={LABEL}
        fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
      >
        {label}
      </text>
    </g>
  )
}

// ── Ground ─────────────────────────────────────────────────────────────
//
// Three descending horizontal lines. Standard "earth" symbol.

function Ground({ at }: { at: GridPoint }) {
  const { x, y } = p(at)
  return (
    <g>
      <line
        x1={x}
        y1={y}
        x2={x}
        y2={y + 6}
        stroke={STROKE}
        strokeWidth={1.8}
      />
      <line
        x1={x - 9}
        y1={y + 6}
        x2={x + 9}
        y2={y + 6}
        stroke={STROKE}
        strokeWidth={2}
      />
      <line
        x1={x - 6}
        y1={y + 10}
        x2={x + 6}
        y2={y + 10}
        stroke={STROKE}
        strokeWidth={1.6}
      />
      <line
        x1={x - 3}
        y1={y + 14}
        x2={x + 3}
        y2={y + 14}
        stroke={STROKE}
        strokeWidth={1.2}
      />
    </g>
  )
}

// ── Arduino pin stub ───────────────────────────────────────────────────
//
// Small box with a pin label, used to show "this wire goes to D13"
// without drawing the whole Uno. The `at` grid point IS the
// connection point (the box's right edge touches it), so authors
// draw their own wire from `at` rightward into the rest of the
// circuit.

type ArduinoPinProps = {
  at: GridPoint
  pin: string
}

function ArduinoPin({ at, pin }: ArduinoPinProps) {
  const { x, y } = p(at)
  const boxW = 26
  return (
    <g>
      <rect
        x={x - boxW}
        y={y - 8}
        width={boxW}
        height={16}
        rx={2}
        fill={BG}
        stroke={STROKE}
        strokeWidth={1.5}
      />
      <text
        x={x - boxW / 2}
        y={y + 3.5}
        textAnchor="middle"
        fontSize={10}
        fill={LABEL}
        fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
      >
        {pin}
      </text>
    </g>
  )
}

// ── Figure wrapper ─────────────────────────────────────────────────────
//
// Captioned container used around a <Schematic> (or any other diagram)
// to get consistent spacing and a caption. Prefer this over raw
// <Schematic> inside prose.

export function Figure({
  caption,
  children,
}: {
  caption?: string
  children: ReactNode
}) {
  return (
    <figure className="my-6">
      {children}
      {caption && (
        <figcaption className="mt-1 text-center text-xs text-muted-foreground">
          {caption}
        </figcaption>
      )}
    </figure>
  )
}

// ── Public API ─────────────────────────────────────────────────────────

export const Schematic = Object.assign(Root, {
  Wire,
  Junction,
  Label,
  Resistor,
  Led,
  Diode,
  Button: ButtonSymbol,
  Capacitor,
  Nmos,
  Potentiometer,
  Battery,
  Vcc,
  Ground,
  ArduinoPin,
})

export type { GridPoint }
