// ── Schematic Symbols ──────────────────────────────────────────────────
//
// Standard IEEE/IEC schematic symbols rendered as SVG React components.
// Each symbol renders at a given (x, y) position with consistent sizing.

type SymbolProps = {
  x: number
  y: number
  label: string
  value?: string
  voltage?: number
  current?: number
  isActive?: boolean
}

const STROKE = "#333"
const STROKE_ACTIVE = "#ef4444"
const STROKE_WIDTH = 2
const FONT_LABEL = "10px monospace"
const FONT_VALUE = "8px monospace"
const FONT_ANNOTATION = "8px monospace"

function Annotation({ x, y, voltage, current }: {
  x: number
  y: number
  voltage?: number
  current?: number
}) {
  if (voltage == null && current == null) return null
  const parts: string[] = []
  if (voltage != null) parts.push(`${voltage.toFixed(2)}V`)
  if (current != null) parts.push(`${current.toFixed(1)}mA`)
  return (
    <text
      x={x}
      y={y}
      textAnchor="middle"
      fill="#888"
      fontStyle="italic"
      style={{ font: FONT_ANNOTATION }}
    >
      {parts.join(" ")}
    </text>
  )
}

export function ResistorSymbol({ x, y, label, value, voltage, current, isActive }: SymbolProps) {
  const w = 60
  const h = 12
  const stroke = isActive ? STROKE_ACTIVE : STROKE
  // Zigzag with 6 peaks
  const zigzag = `M ${x} ${y} ` +
    `l 5 0 l 4 -${h} l 8 ${h * 2} l 8 -${h * 2} l 8 ${h * 2} l 8 -${h * 2} l 8 ${h * 2} l 4 -${h} l 7 0`

  return (
    <g>
      <path d={zigzag} fill="none" stroke={stroke} strokeWidth={STROKE_WIDTH} />
      {/* Terminal dots */}
      <circle cx={x} cy={y} r={3} fill={stroke} />
      <circle cx={x + w} cy={y} r={3} fill={stroke} />
      {/* Label above */}
      <text x={x + w / 2} y={y - 18} textAnchor="middle" fill="#ddd" style={{ font: FONT_LABEL }}>
        {label}
      </text>
      {/* Value below */}
      {value && (
        <text x={x + w / 2} y={y + 22} textAnchor="middle" fill="#aaa" style={{ font: FONT_VALUE }}>
          {value}
        </text>
      )}
      <Annotation x={x + w / 2} y={y + 34} voltage={voltage} current={current} />
    </g>
  )
}

export function LedSymbol({ x, y, label, value, voltage, current, isActive }: SymbolProps) {
  const w = 60
  const triH = 16
  const stroke = isActive ? "#ef4444" : STROKE
  const fillColor = isActive ? "rgba(239,68,68,0.3)" : "none"

  return (
    <g>
      {/* Triangle (anode left, cathode right) */}
      <polygon
        points={`${x + 15},${y - triH / 2} ${x + 15},${y + triH / 2} ${x + 40},${y}`}
        fill={fillColor}
        stroke={stroke}
        strokeWidth={STROKE_WIDTH}
      />
      {/* Bar at cathode */}
      <line x1={x + 40} y1={y - triH / 2} x2={x + 40} y2={y + triH / 2} stroke={stroke} strokeWidth={STROKE_WIDTH} />
      {/* Lead lines */}
      <line x1={x} y1={y} x2={x + 15} y2={y} stroke={stroke} strokeWidth={STROKE_WIDTH} />
      <line x1={x + 40} y1={y} x2={x + w} y2={y} stroke={stroke} strokeWidth={STROKE_WIDTH} />
      {/* Light emission arrows */}
      <line x1={x + 30} y1={y - 14} x2={x + 36} y2={y - 20} stroke={stroke} strokeWidth={1} />
      <line x1={x + 34} y1={y - 12} x2={x + 40} y2={y - 18} stroke={stroke} strokeWidth={1} />
      {/* Arrowheads */}
      <polygon points={`${x + 36},${y - 20} ${x + 33},${y - 17} ${x + 35},${y - 16}`} fill={stroke} />
      <polygon points={`${x + 40},${y - 18} ${x + 37},${y - 15} ${x + 39},${y - 14}`} fill={stroke} />
      {/* Terminal dots */}
      <circle cx={x} cy={y} r={3} fill={stroke} />
      <circle cx={x + w} cy={y} r={3} fill={stroke} />
      {/* Label */}
      <text x={x + w / 2} y={y - 24} textAnchor="middle" fill="#ddd" style={{ font: FONT_LABEL }}>
        {label}
      </text>
      {value && (
        <text x={x + w / 2} y={y + 22} textAnchor="middle" fill="#aaa" style={{ font: FONT_VALUE }}>
          {value}
        </text>
      )}
      <Annotation x={x + w / 2} y={y + 34} voltage={voltage} current={current} />
    </g>
  )
}

export function ButtonSymbol({ x, y, label, value, voltage, current, isActive }: SymbolProps) {
  const w = 60
  const stroke = isActive ? "#3b82f6" : STROKE
  // Arm: closed (horizontal) when active, open (angled) when not
  const armX2 = x + 42
  const armY2 = isActive ? y : y - 12

  return (
    <g>
      {/* Lead lines */}
      <line x1={x} y1={y} x2={x + 18} y2={y} stroke={stroke} strokeWidth={STROKE_WIDTH} />
      <line x1={x + 42} y1={y} x2={x + w} y2={y} stroke={stroke} strokeWidth={STROKE_WIDTH} />
      {/* Gap terminals */}
      <circle cx={x + 18} cy={y} r={2.5} fill={stroke} />
      <circle cx={x + 42} cy={y} r={2.5} fill={stroke} />
      {/* Switch arm — horizontal (closed) when active, angled (open) when not */}
      <line x1={x + 18} y1={y} x2={armX2} y2={armY2} stroke={stroke} strokeWidth={STROKE_WIDTH} />
      {/* Terminal dots */}
      <circle cx={x} cy={y} r={3} fill={stroke} />
      <circle cx={x + w} cy={y} r={3} fill={stroke} />
      {/* Label */}
      <text x={x + w / 2} y={y - 22} textAnchor="middle" fill="#ddd" style={{ font: FONT_LABEL }}>
        SW {label}
      </text>
      {value && (
        <text x={x + w / 2} y={y + 18} textAnchor="middle" fill="#aaa" style={{ font: FONT_VALUE }}>
          {value}
        </text>
      )}
      <Annotation x={x + w / 2} y={y + 30} voltage={voltage} current={current} />
    </g>
  )
}

export function CapacitorSymbol({ x, y, label, value, voltage, current, isActive }: SymbolProps) {
  const w = 60
  const plateH = 16
  const stroke = isActive ? "#3b82f6" : STROKE

  return (
    <g>
      {/* Lead lines */}
      <line x1={x} y1={y} x2={x + 25} y2={y} stroke={stroke} strokeWidth={STROKE_WIDTH} />
      <line x1={x + 35} y1={y} x2={x + w} y2={y} stroke={stroke} strokeWidth={STROKE_WIDTH} />
      {/* Flat plate (left) */}
      <line x1={x + 25} y1={y - plateH / 2} x2={x + 25} y2={y + plateH / 2} stroke={stroke} strokeWidth={STROKE_WIDTH} />
      {/* Curved plate (right, electrolytic) */}
      <path
        d={`M ${x + 35} ${y - plateH / 2} Q ${x + 32} ${y} ${x + 35} ${y + plateH / 2}`}
        fill="none"
        stroke={stroke}
        strokeWidth={STROKE_WIDTH}
      />
      {/* Terminal dots */}
      <circle cx={x} cy={y} r={3} fill={stroke} />
      <circle cx={x + w} cy={y} r={3} fill={stroke} />
      {/* Label */}
      <text x={x + w / 2} y={y - 16} textAnchor="middle" fill="#ddd" style={{ font: FONT_LABEL }}>
        {label}
      </text>
      {value && (
        <text x={x + w / 2} y={y + 22} textAnchor="middle" fill="#aaa" style={{ font: FONT_VALUE }}>
          {value}
        </text>
      )}
      <Annotation x={x + w / 2} y={y + 34} voltage={voltage} current={current} />
    </g>
  )
}

export function BuzzerSymbol({ x, y, label, value, voltage, current, isActive }: SymbolProps) {
  const w = 60
  const r = 14
  const cx = x + w / 2
  const stroke = isActive ? "#3b82f6" : STROKE

  return (
    <g>
      {/* Lead lines */}
      <line x1={x} y1={y} x2={cx - r} y2={y} stroke={stroke} strokeWidth={STROKE_WIDTH} />
      <line x1={cx + r} y1={y} x2={x + w} y2={y} stroke={stroke} strokeWidth={STROKE_WIDTH} />
      {/* Circle */}
      <circle cx={cx} cy={y} r={r} fill="none" stroke={stroke} strokeWidth={STROKE_WIDTH} />
      {/* BZ text */}
      <text x={cx} y={y + 4} textAnchor="middle" fill="#ddd" style={{ font: FONT_LABEL }}>
        BZ
      </text>
      {/* Terminal dots */}
      <circle cx={x} cy={y} r={3} fill={stroke} />
      <circle cx={x + w} cy={y} r={3} fill={stroke} />
      {/* Label */}
      <text x={cx} y={y - r - 6} textAnchor="middle" fill="#ddd" style={{ font: FONT_LABEL }}>
        {label}
      </text>
      {value && (
        <text x={cx} y={y + r + 14} textAnchor="middle" fill="#aaa" style={{ font: FONT_VALUE }}>
          {value}
        </text>
      )}
      <Annotation x={cx} y={y + r + 26} voltage={voltage} current={current} />
    </g>
  )
}

export function DcMotorSymbol({ x, y, label, value, voltage, current, isActive }: SymbolProps) {
  const w = 60
  const r = 13
  const cx = x + w / 2
  const stroke = isActive ? STROKE_ACTIVE : STROKE

  return (
    <g>
      {/* Lead lines */}
      <line x1={x} y1={y} x2={cx - r} y2={y} stroke={stroke} strokeWidth={STROKE_WIDTH} />
      <line x1={cx + r} y1={y} x2={x + w} y2={y} stroke={stroke} strokeWidth={STROKE_WIDTH} />
      {/* Motor body */}
      <circle cx={cx} cy={y} r={r} fill="none" stroke={stroke} strokeWidth={STROKE_WIDTH} />
      {/* M inside */}
      <text x={cx} y={y + 4} textAnchor="middle" fill="#ddd" style={{ font: FONT_LABEL }}>
        M
      </text>
      {/* Terminal dots */}
      <circle cx={x} cy={y} r={3} fill={stroke} />
      <circle cx={x + w} cy={y} r={3} fill={stroke} />
      {/* Label */}
      <text x={cx} y={y - r - 8} textAnchor="middle" fill="#ddd" style={{ font: FONT_LABEL }}>
        {label}
      </text>
      {value && (
        <text x={cx} y={y + r + 14} textAnchor="middle" fill="#aaa" style={{ font: FONT_VALUE }}>
          {value}
        </text>
      )}
      <Annotation x={cx} y={y + r + 26} voltage={voltage} current={current} />
    </g>
  )
}

export function RelaySymbol({ x, y, label, value, voltage, current, isActive }: SymbolProps) {
  const w = 60
  const h = 28
  const stroke = isActive ? STROKE_ACTIVE : STROKE

  return (
    <g>
      {/* Module body */}
      <rect
        x={x + 8}
        y={y - h / 2}
        width={w - 16}
        height={h}
        fill="none"
        stroke={stroke}
        strokeWidth={STROKE_WIDTH}
        rx={2}
      />
      {/* Coil indicator */}
      <path
        d={`M ${x + 16} ${y} q 4 -6 8 0 q 4 6 8 0 q 4 -6 8 0`}
        fill="none"
        stroke={stroke}
        strokeWidth={1.5}
      />
      {/* Contact arm */}
      <line x1={x + 40} y1={y + 6} x2={x + 48} y2={y - 2} stroke={stroke} strokeWidth={1.5} />
      <circle cx={x + 40} cy={y + 6} r={1.8} fill={stroke} />
      <circle cx={x + 50} cy={y - 2} r={1.8} fill={stroke} />
      {/* Leads */}
      <line x1={x} y1={y} x2={x + 8} y2={y} stroke={stroke} strokeWidth={STROKE_WIDTH} />
      <line x1={x + w - 8} y1={y} x2={x + w} y2={y} stroke={stroke} strokeWidth={STROKE_WIDTH} />
      <circle cx={x} cy={y} r={3} fill={stroke} />
      <circle cx={x + w} cy={y} r={3} fill={stroke} />
      {/* Label */}
      <text x={x + w / 2} y={y - h / 2 - 8} textAnchor="middle" fill="#ddd" style={{ font: FONT_LABEL }}>
        {label}
      </text>
      {value && (
        <text x={x + w / 2} y={y + h / 2 + 14} textAnchor="middle" fill="#aaa" style={{ font: FONT_VALUE }}>
          {value}
        </text>
      )}
      <Annotation x={x + w / 2} y={y + h / 2 + 26} voltage={voltage} current={current} />
    </g>
  )
}

export function ServoSymbol({ x, y, label, value, voltage, current, isActive }: SymbolProps) {
  const w = 60
  const h = 30
  const stroke = isActive ? "#3b82f6" : STROKE

  return (
    <g>
      {/* Rectangle (motor) */}
      <rect
        x={x + 10}
        y={y - h / 2}
        width={w - 20}
        height={h}
        fill="none"
        stroke={stroke}
        strokeWidth={STROKE_WIDTH}
        rx={2}
      />
      {/* M inside */}
      <text x={x + w / 2} y={y + 5} textAnchor="middle" fill="#ddd" style={{ font: FONT_LABEL }}>
        M
      </text>
      {/* Three terminals at bottom: signal, VCC, GND */}
      <line x1={x + 18} y1={y + h / 2} x2={x + 18} y2={y + h / 2 + 10} stroke={stroke} strokeWidth={STROKE_WIDTH} />
      <line x1={x + w / 2} y1={y + h / 2} x2={x + w / 2} y2={y + h / 2 + 10} stroke={stroke} strokeWidth={STROKE_WIDTH} />
      <line x1={x + w - 18} y1={y + h / 2} x2={x + w - 18} y2={y + h / 2 + 10} stroke={stroke} strokeWidth={STROKE_WIDTH} />
      {/* Terminal dots */}
      <circle cx={x + 18} cy={y + h / 2 + 10} r={3} fill={stroke} />
      <circle cx={x + w / 2} cy={y + h / 2 + 10} r={3} fill={stroke} />
      <circle cx={x + w - 18} cy={y + h / 2 + 10} r={3} fill={stroke} />
      {/* Pin labels */}
      <text x={x + 18} y={y + h / 2 + 24} textAnchor="middle" fill="#888" style={{ font: FONT_VALUE }}>
        SIG
      </text>
      <text x={x + w / 2} y={y + h / 2 + 24} textAnchor="middle" fill="#888" style={{ font: FONT_VALUE }}>
        VCC
      </text>
      <text x={x + w - 18} y={y + h / 2 + 24} textAnchor="middle" fill="#888" style={{ font: FONT_VALUE }}>
        GND
      </text>
      {/* Label */}
      <text x={x + w / 2} y={y - h / 2 - 6} textAnchor="middle" fill="#ddd" style={{ font: FONT_LABEL }}>
        {label}
      </text>
      {value && (
        <text x={x + w / 2} y={y - h / 2 - 18} textAnchor="middle" fill="#aaa" style={{ font: FONT_VALUE }}>
          {value}
        </text>
      )}
      <Annotation x={x + w / 2} y={y + h / 2 + 36} voltage={voltage} current={current} />
    </g>
  )
}

export function PotentiometerSymbol({ x, y, label, value, voltage, current, isActive }: SymbolProps) {
  const w = 60
  const h = 12
  const stroke = isActive ? "#3b82f6" : STROKE
  // Zigzag like resistor
  const zigzag = `M ${x} ${y} ` +
    `l 5 0 l 4 -${h} l 8 ${h * 2} l 8 -${h * 2} l 8 ${h * 2} l 8 -${h * 2} l 8 ${h * 2} l 4 -${h} l 7 0`

  return (
    <g>
      <path d={zigzag} fill="none" stroke={stroke} strokeWidth={STROKE_WIDTH} />
      {/* Wiper arrow pointing to middle */}
      <line x1={x + w / 2} y1={y - 20} x2={x + w / 2} y2={y - h - 2} stroke={stroke} strokeWidth={STROKE_WIDTH} />
      <polygon
        points={`${x + w / 2},${y - h - 2} ${x + w / 2 - 4},${y - h - 8} ${x + w / 2 + 4},${y - h - 8}`}
        fill={stroke}
      />
      {/* Terminal dots */}
      <circle cx={x} cy={y} r={3} fill={stroke} />
      <circle cx={x + w} cy={y} r={3} fill={stroke} />
      {/* Label */}
      <text x={x + w / 2} y={y - 28} textAnchor="middle" fill="#ddd" style={{ font: FONT_LABEL }}>
        {label}
      </text>
      {value && (
        <text x={x + w / 2} y={y + 22} textAnchor="middle" fill="#aaa" style={{ font: FONT_VALUE }}>
          {value}
        </text>
      )}
      <Annotation x={x + w / 2} y={y + 34} voltage={voltage} current={current} />
    </g>
  )
}

export function VoltageSourceSymbol({ x, y, label }: SymbolProps) {
  const r = 14
  const cx = x + 30
  const stroke = "#ef4444"

  return (
    <g>
      {/* Circle */}
      <circle cx={cx} cy={y} r={r} fill="none" stroke={stroke} strokeWidth={STROKE_WIDTH} />
      {/* + and - */}
      <text x={cx - 4} y={y + 1} fill="#ef4444" style={{ font: "bold 12px monospace" }}>+</text>
      <text x={cx + 2} y={y + 1} fill="#3b82f6" style={{ font: "bold 12px monospace" }}>-</text>
      {/* Lead right */}
      <line x1={cx + r} y1={y} x2={x + 60} y2={y} stroke={stroke} strokeWidth={STROKE_WIDTH} />
      {/* Terminal dot */}
      <circle cx={x + 60} cy={y} r={3} fill={stroke} />
      {/* Label */}
      <text x={cx} y={y - r - 6} textAnchor="middle" fill="#ef4444" style={{ font: FONT_LABEL }}>
        {label}
      </text>
    </g>
  )
}

export function GroundSymbol({ x, y, label }: SymbolProps) {
  const stroke = "#3b82f6"

  return (
    <g>
      {/* Lead left */}
      <line x1={x} y1={y} x2={x + 20} y2={y} stroke={stroke} strokeWidth={STROKE_WIDTH} />
      {/* Terminal dot */}
      <circle cx={x} cy={y} r={3} fill={stroke} />
      {/* Three horizontal lines getting shorter */}
      <line x1={x + 20} y1={y - 8} x2={x + 20} y2={y + 8} stroke={stroke} strokeWidth={STROKE_WIDTH} />
      <line x1={x + 25} y1={y - 5} x2={x + 25} y2={y + 5} stroke={stroke} strokeWidth={STROKE_WIDTH} />
      <line x1={x + 30} y1={y - 2} x2={x + 30} y2={y + 2} stroke={stroke} strokeWidth={STROKE_WIDTH} />
      {/* Label */}
      <text x={x + 25} y={y + 20} textAnchor="middle" fill="#3b82f6" style={{ font: FONT_LABEL }}>
        {label}
      </text>
    </g>
  )
}

// Dimensions used by both ArduinoPinSymbol and the IC body drawn in the renderer
export const ARDUINO_IC_LABEL_WIDTH = 68  // label area inside the IC body
const ARDUINO_IC_STUB_LENGTH = 20  // stub from body right edge to terminal
export const ARDUINO_IC_TERMINAL_OFFSET = ARDUINO_IC_LABEL_WIDTH + ARDUINO_IC_STUB_LENGTH  // 88

export function ArduinoPinSymbol({ x, y, label }: SymbolProps) {
  const stroke = "#22c55e"

  return (
    <g>
      {/* Pin label, right-aligned inside IC body */}
      <text
        x={x + ARDUINO_IC_LABEL_WIDTH - 6}
        y={y + 4}
        textAnchor="end"
        fill="#22c55e"
        style={{ font: FONT_LABEL }}
      >
        {label}
      </text>
      {/* Stub extending right from IC body edge */}
      <line
        x1={x + ARDUINO_IC_LABEL_WIDTH}
        y1={y}
        x2={x + ARDUINO_IC_TERMINAL_OFFSET}
        y2={y}
        stroke={stroke}
        strokeWidth={STROKE_WIDTH}
      />
      {/* Terminal dot */}
      <circle cx={x + ARDUINO_IC_TERMINAL_OFFSET} cy={y} r={3} fill={stroke} />
    </g>
  )
}

export function WireJunction({ x, y }: { x: number; y: number }) {
  return <circle cx={x} cy={y} r={4} fill="#1a1a1a" />
}

export function SevenSegmentSymbol({ x, y, label, value, voltage, current, isActive }: SymbolProps) {
  const w = 60
  const h = 50
  const stroke = isActive ? STROKE_ACTIVE : STROKE
  const segColor = isActive ? "#ef4444" : "#666"

  // Segment geometry inside the box (scaled to fit)
  const bx = x + 18  // inner display area left
  const by = y - 16   // inner display area top
  const sw = 24       // inner display width
  const sh = 34       // inner display height
  const segW = 2      // segment thickness

  return (
    <g>
      {/* Rectangular IC body */}
      <rect
        x={x + 5}
        y={y - h / 2}
        width={w - 10}
        height={h}
        fill="none"
        stroke={stroke}
        strokeWidth={STROKE_WIDTH}
        rx={2}
      />
      {/* Stylized 7-segment digit "8" inside */}
      {/* Segment a (top horizontal) */}
      <line x1={bx + 3} y1={by} x2={bx + sw - 3} y2={by} stroke={segColor} strokeWidth={segW} strokeLinecap="round" />
      {/* Segment b (top-right vertical) */}
      <line x1={bx + sw} y1={by + 2} x2={bx + sw} y2={by + sh / 2 - 2} stroke={segColor} strokeWidth={segW} strokeLinecap="round" />
      {/* Segment c (bottom-right vertical) */}
      <line x1={bx + sw} y1={by + sh / 2 + 2} x2={bx + sw} y2={by + sh - 2} stroke={segColor} strokeWidth={segW} strokeLinecap="round" />
      {/* Segment d (bottom horizontal) */}
      <line x1={bx + 3} y1={by + sh} x2={bx + sw - 3} y2={by + sh} stroke={segColor} strokeWidth={segW} strokeLinecap="round" />
      {/* Segment e (bottom-left vertical) */}
      <line x1={bx} y1={by + sh / 2 + 2} x2={bx} y2={by + sh - 2} stroke={segColor} strokeWidth={segW} strokeLinecap="round" />
      {/* Segment f (top-left vertical) */}
      <line x1={bx} y1={by + 2} x2={bx} y2={by + sh / 2 - 2} stroke={segColor} strokeWidth={segW} strokeLinecap="round" />
      {/* Segment g (middle horizontal) */}
      <line x1={bx + 3} y1={by + sh / 2} x2={bx + sw - 3} y2={by + sh / 2} stroke={segColor} strokeWidth={segW} strokeLinecap="round" />
      {/* DP dot */}
      <circle cx={bx + sw + 5} cy={by + sh} r={1.5} fill={segColor} />
      {/* Lead left (input) */}
      <line x1={x} y1={y} x2={x + 5} y2={y} stroke={stroke} strokeWidth={STROKE_WIDTH} />
      {/* Lead right (GND) */}
      <line x1={x + w - 5} y1={y} x2={x + w} y2={y} stroke={stroke} strokeWidth={STROKE_WIDTH} />
      {/* Terminal dots */}
      <circle cx={x} cy={y} r={3} fill={stroke} />
      <circle cx={x + w} cy={y} r={3} fill={stroke} />
      {/* Label */}
      <text x={x + w / 2} y={y - h / 2 - 6} textAnchor="middle" fill="#ddd" style={{ font: FONT_LABEL }}>
        {label}
      </text>
      {value && (
        <text x={x + w / 2} y={y + h / 2 + 14} textAnchor="middle" fill="#aaa" style={{ font: FONT_VALUE }}>
          {value}
        </text>
      )}
      <Annotation x={x + w / 2} y={y + h / 2 + 26} voltage={voltage} current={current} />
    </g>
  )
}

export function UltrasonicSensorSymbol({ x, y, label, value, voltage, current, isActive }: SymbolProps) {
  const w = 60
  const h = 36
  const stroke = isActive ? STROKE_ACTIVE : STROKE

  return (
    <g>
      {/* Rectangular module body */}
      <rect
        x={x + 5}
        y={y - h / 2}
        width={w - 10}
        height={h}
        fill="none"
        stroke={stroke}
        strokeWidth={STROKE_WIDTH}
        rx={2}
      />
      {/* Two transducer circles */}
      <circle cx={x + 20} cy={y} r={6} fill="none" stroke={stroke} strokeWidth={1.5} />
      <circle cx={x + 40} cy={y} r={6} fill="none" stroke={stroke} strokeWidth={1.5} />
      {/* T and R labels */}
      <text x={x + 20} y={y + 3} textAnchor="middle" fill="#ddd" style={{ font: "7px monospace" }}>T</text>
      <text x={x + 40} y={y + 3} textAnchor="middle" fill="#ddd" style={{ font: "7px monospace" }}>R</text>
      {/* Wave arcs from transmitter */}
      <path d={`M ${x + 10} ${y - 4} Q ${x + 6} ${y} ${x + 10} ${y + 4}`} fill="none" stroke={stroke} strokeWidth={1} />
      <path d={`M ${x + 7} ${y - 6} Q ${x + 2} ${y} ${x + 7} ${y + 6}`} fill="none" stroke={stroke} strokeWidth={1} />
      {/* Lead left (input) */}
      <line x1={x} y1={y} x2={x + 5} y2={y} stroke={stroke} strokeWidth={STROKE_WIDTH} />
      {/* Lead right (GND) */}
      <line x1={x + w - 5} y1={y} x2={x + w} y2={y} stroke={stroke} strokeWidth={STROKE_WIDTH} />
      {/* Terminal dots */}
      <circle cx={x} cy={y} r={3} fill={stroke} />
      <circle cx={x + w} cy={y} r={3} fill={stroke} />
      {/* Label */}
      <text x={x + w / 2} y={y - h / 2 - 6} textAnchor="middle" fill="#ddd" style={{ font: FONT_LABEL }}>
        {label}
      </text>
      {value && (
        <text x={x + w / 2} y={y + h / 2 + 14} textAnchor="middle" fill="#aaa" style={{ font: FONT_VALUE }}>
          {value}
        </text>
      )}
      <Annotation x={x + w / 2} y={y + h / 2 + 26} voltage={voltage} current={current} />
    </g>
  )
}

export function TemperatureSensorSymbol({ x, y, label, value, voltage, current, isActive }: SymbolProps) {
  const w = 60
  const h = 36
  const stroke = isActive ? STROKE_ACTIVE : STROKE
  const cx = x + w / 2

  return (
    <g>
      {/* TO-92 package: semicircle body */}
      <path
        d={`M ${x + 14} ${y - h / 2 + 2} A 16 16 0 0 1 ${x + 14} ${y + h / 2 - 2}`}
        fill="none"
        stroke={stroke}
        strokeWidth={STROKE_WIDTH}
      />
      <line x1={x + 14} y1={y - h / 2 + 2} x2={x + 14} y2={y + h / 2 - 2} stroke={stroke} strokeWidth={STROKE_WIDTH} />
      {/* Thermometer icon inside */}
      <line x1={x + 22} y1={y - 6} x2={x + 22} y2={y + 4} stroke="#ef4444" strokeWidth={2} strokeLinecap="round" />
      <circle cx={x + 22} cy={y + 6} r={3} fill="#ef4444" opacity={0.7} />
      {/* Three pin leads at bottom: VCC, Signal, GND */}
      <line x1={x + 18} y1={y + h / 2 - 2} x2={x + 18} y2={y + h / 2 + 10} stroke={stroke} strokeWidth={STROKE_WIDTH} />
      <line x1={x + 26} y1={y + h / 2 - 2} x2={x + 26} y2={y + h / 2 + 10} stroke={stroke} strokeWidth={STROKE_WIDTH} />
      <line x1={x + 34} y1={y + h / 2 - 2} x2={x + 34} y2={y + h / 2 + 10} stroke={stroke} strokeWidth={STROKE_WIDTH} />
      {/* Terminal dots */}
      <circle cx={x + 18} cy={y + h / 2 + 10} r={3} fill={stroke} />
      <circle cx={x + 26} cy={y + h / 2 + 10} r={3} fill={stroke} />
      <circle cx={x + 34} cy={y + h / 2 + 10} r={3} fill={stroke} />
      {/* Pin labels */}
      <text x={x + 18} y={y + h / 2 + 24} textAnchor="middle" fill="#888" style={{ font: FONT_VALUE }}>V+</text>
      <text x={x + 26} y={y + h / 2 + 24} textAnchor="middle" fill="#888" style={{ font: FONT_VALUE }}>OUT</text>
      <text x={x + 34} y={y + h / 2 + 24} textAnchor="middle" fill="#888" style={{ font: FONT_VALUE }}>GND</text>
      {/* Lead lines for series connection */}
      <line x1={x} y1={y} x2={x + 14} y2={y} stroke={stroke} strokeWidth={STROKE_WIDTH} />
      <line x1={x + 30} y1={y} x2={x + w} y2={y} stroke={stroke} strokeWidth={STROKE_WIDTH} />
      <circle cx={x} cy={y} r={3} fill={stroke} />
      <circle cx={x + w} cy={y} r={3} fill={stroke} />
      {/* Label */}
      <text x={cx} y={y - h / 2 - 6} textAnchor="middle" fill="#ddd" style={{ font: FONT_LABEL }}>
        {label}
      </text>
      {value && (
        <text x={cx} y={y + h / 2 + 36} textAnchor="middle" fill="#aaa" style={{ font: FONT_VALUE }}>
          {value}
        </text>
      )}
      <Annotation x={cx} y={y + h / 2 + 48} voltage={voltage} current={current} />
    </g>
  )
}

export function PhotoresistorSymbol({ x, y, label, value, voltage, current, isActive }: SymbolProps) {
  const w = 60
  const h = 12
  const stroke = isActive ? STROKE_ACTIVE : STROKE
  // Zigzag like resistor
  const zigzag = `M ${x} ${y} ` +
    `l 5 0 l 4 -${h} l 8 ${h * 2} l 8 -${h * 2} l 8 ${h * 2} l 8 -${h * 2} l 8 ${h * 2} l 4 -${h} l 7 0`

  return (
    <g>
      <path d={zigzag} fill="none" stroke={stroke} strokeWidth={STROKE_WIDTH} />
      {/* Circle around the resistor body (IEC LDR symbol) */}
      <circle cx={x + w / 2} cy={y} r={16} fill="none" stroke={stroke} strokeWidth={1.2} />
      {/* Light arrows pointing at the resistor */}
      <line x1={x + w / 2 - 10} y1={y - 22} x2={x + w / 2 - 4} y2={y - 16} stroke={stroke} strokeWidth={1} />
      <line x1={x + w / 2 - 6} y1={y - 22} x2={x + w / 2} y2={y - 16} stroke={stroke} strokeWidth={1} />
      {/* Arrowheads */}
      <polygon points={`${x + w / 2 - 4},${y - 16} ${x + w / 2 - 8},${y - 17} ${x + w / 2 - 5},${y - 20}`} fill={stroke} />
      <polygon points={`${x + w / 2},${y - 16} ${x + w / 2 - 4},${y - 17} ${x + w / 2 - 1},${y - 20}`} fill={stroke} />
      {/* Terminal dots */}
      <circle cx={x} cy={y} r={3} fill={stroke} />
      <circle cx={x + w} cy={y} r={3} fill={stroke} />
      {/* Label */}
      <text x={x + w / 2} y={y - 30} textAnchor="middle" fill="#ddd" style={{ font: FONT_LABEL }}>
        {label}
      </text>
      {value && (
        <text x={x + w / 2} y={y + 22} textAnchor="middle" fill="#aaa" style={{ font: FONT_VALUE }}>
          {value}
        </text>
      )}
      <Annotation x={x + w / 2} y={y + 34} voltage={voltage} current={current} />
    </g>
  )
}

export function LcdSymbol({ x, y, label, value, voltage, current, isActive }: SymbolProps) {
  const w = 60
  const h = 40
  const stroke = isActive ? STROKE_ACTIVE : STROKE

  return (
    <g>
      {/* Rectangular module body */}
      <rect
        x={x + 5}
        y={y - h / 2}
        width={w - 10}
        height={h}
        fill="none"
        stroke={stroke}
        strokeWidth={STROKE_WIDTH}
        rx={2}
      />
      {/* Display area inside */}
      <rect
        x={x + 10}
        y={y - h / 2 + 5}
        width={w - 20}
        height={h - 10}
        fill="none"
        stroke={stroke}
        strokeWidth={1}
        rx={1}
      />
      {/* LCD text placeholder lines */}
      <line x1={x + 14} y1={y - 5} x2={x + w - 14} y2={y - 5} stroke={stroke} strokeWidth={1.5} opacity={0.5} />
      <line x1={x + 14} y1={y + 5} x2={x + w - 14} y2={y + 5} stroke={stroke} strokeWidth={1.5} opacity={0.5} />
      {/* Lead left */}
      <line x1={x} y1={y} x2={x + 5} y2={y} stroke={stroke} strokeWidth={STROKE_WIDTH} />
      {/* Lead right */}
      <line x1={x + w - 5} y1={y} x2={x + w} y2={y} stroke={stroke} strokeWidth={STROKE_WIDTH} />
      {/* Terminal dots */}
      <circle cx={x} cy={y} r={3} fill={stroke} />
      <circle cx={x + w} cy={y} r={3} fill={stroke} />
      {/* Label */}
      <text x={x + w / 2} y={y - h / 2 - 6} textAnchor="middle" fill="#ddd" style={{ font: FONT_LABEL }}>
        {label}
      </text>
      {value && (
        <text x={x + w / 2} y={y + h / 2 + 14} textAnchor="middle" fill="#aaa" style={{ font: FONT_VALUE }}>
          {value}
        </text>
      )}
      <Annotation x={x + w / 2} y={y + h / 2 + 26} voltage={voltage} current={current} />
    </g>
  )
}

export function NeopixelSymbol({ x, y, label, value, voltage, current, isActive }: SymbolProps) {
  const w = 60
  const h = 24
  const stroke = isActive ? STROKE_ACTIVE : STROKE
  const colors = ["#ef4444", "#22c55e", "#3b82f6", "#eab308"]

  return (
    <g>
      {/* Rectangular strip body */}
      <rect
        x={x + 5}
        y={y - h / 2}
        width={w - 10}
        height={h}
        fill="none"
        stroke={stroke}
        strokeWidth={STROKE_WIDTH}
        rx={2}
      />
      {/* LED dots inside */}
      {colors.map((c, i) => (
        <circle
          key={i}
          cx={x + 14 + i * 10}
          cy={y}
          r={3.5}
          fill={isActive ? c : "none"}
          stroke={c}
          strokeWidth={1}
          opacity={isActive ? 0.9 : 0.4}
        />
      ))}
      {/* Data arrow (DIN → DOUT) */}
      <line x1={x + 8} y1={y + h / 2 - 3} x2={x + w - 12} y2={y + h / 2 - 3} stroke={stroke} strokeWidth={0.8} strokeDasharray="2 1" />
      <polygon points={`${x + w - 12},${y + h / 2 - 3} ${x + w - 16},${y + h / 2 - 5} ${x + w - 16},${y + h / 2 - 1}`} fill={stroke} />
      {/* Lead left (DIN) */}
      <line x1={x} y1={y} x2={x + 5} y2={y} stroke={stroke} strokeWidth={STROKE_WIDTH} />
      {/* Lead right */}
      <line x1={x + w - 5} y1={y} x2={x + w} y2={y} stroke={stroke} strokeWidth={STROKE_WIDTH} />
      {/* Terminal dots */}
      <circle cx={x} cy={y} r={3} fill={stroke} />
      <circle cx={x + w} cy={y} r={3} fill={stroke} />
      {/* Label */}
      <text x={x + w / 2} y={y - h / 2 - 6} textAnchor="middle" fill="#ddd" style={{ font: FONT_LABEL }}>
        {label}
      </text>
      {value && (
        <text x={x + w / 2} y={y + h / 2 + 14} textAnchor="middle" fill="#aaa" style={{ font: FONT_VALUE }}>
          {value}
        </text>
      )}
      <Annotation x={x + w / 2} y={y + h / 2 + 26} voltage={voltage} current={current} />
    </g>
  )
}

export function PirSensorSymbol({ x, y, label, value, voltage, current, isActive }: SymbolProps) {
  const w = 60
  const h = 36
  const stroke = isActive ? STROKE_ACTIVE : STROKE

  return (
    <g>
      {/* Rectangular module body */}
      <rect
        x={x + 5}
        y={y - h / 2 + 6}
        width={w - 10}
        height={h - 6}
        fill="none"
        stroke={stroke}
        strokeWidth={STROKE_WIDTH}
        rx={2}
      />
      {/* Fresnel lens dome */}
      <path
        d={`M ${x + 18} ${y - h / 2 + 6} A 12 10 0 0 1 ${x + 42} ${y - h / 2 + 6}`}
        fill="none"
        stroke={stroke}
        strokeWidth={STROKE_WIDTH}
      />
      {/* IR detection waves */}
      <path d={`M ${x + 24} ${y - h / 2 - 2} Q ${x + 30} ${y - h / 2 - 8} ${x + 36} ${y - h / 2 - 2}`} fill="none" stroke={stroke} strokeWidth={1} />
      <path d={`M ${x + 22} ${y - h / 2 - 6} Q ${x + 30} ${y - h / 2 - 14} ${x + 38} ${y - h / 2 - 6}`} fill="none" stroke={stroke} strokeWidth={1} />
      {/* PIR label */}
      <text x={x + w / 2} y={y + 6} textAnchor="middle" fill="#ddd" style={{ font: "7px monospace" }}>PIR</text>
      {/* Lead left */}
      <line x1={x} y1={y} x2={x + 5} y2={y} stroke={stroke} strokeWidth={STROKE_WIDTH} />
      {/* Lead right */}
      <line x1={x + w - 5} y1={y} x2={x + w} y2={y} stroke={stroke} strokeWidth={STROKE_WIDTH} />
      {/* Terminal dots */}
      <circle cx={x} cy={y} r={3} fill={stroke} />
      <circle cx={x + w} cy={y} r={3} fill={stroke} />
      {/* Label */}
      <text x={x + w / 2} y={y - h / 2 - 10} textAnchor="middle" fill="#ddd" style={{ font: FONT_LABEL }}>
        {label}
      </text>
      {value && (
        <text x={x + w / 2} y={y + h / 2 + 14} textAnchor="middle" fill="#aaa" style={{ font: FONT_VALUE }}>
          {value}
        </text>
      )}
      <Annotation x={x + w / 2} y={y + h / 2 + 26} voltage={voltage} current={current} />
    </g>
  )
}

function IcPinSymbol({ x, y, label }: SymbolProps) {
  const stroke = STROKE
  const stubLength = 16
  const labelOffset = 20

  return (
    <g>
      {/* Terminal dot at (x, y) — left side, where wires connect */}
      <circle cx={x} cy={y} r={3} fill={stroke} />
      {/* Short stub going right from (x, y) to (x+stubLength, y) */}
      <line
        x1={x}
        y1={y}
        x2={x + stubLength}
        y2={y}
        stroke={stroke}
        strokeWidth={STROKE_WIDTH}
      />
      {/* Pin name label, vertically centered, starting just past the stub */}
      <text
        x={x + labelOffset}
        y={y}
        dominantBaseline="middle"
        fill="#ccc"
        style={{ font: FONT_LABEL }}
      >
        {label}
      </text>
    </g>
  )
}

export function GenericModuleSymbol({ x, y, label, value, voltage, current, isActive }: SymbolProps) {
  const w = 60
  const h = 30
  const stroke = isActive ? STROKE_ACTIVE : STROKE

  return (
    <g>
      <rect
        x={x + 6}
        y={y - h / 2}
        width={w - 12}
        height={h}
        fill="none"
        stroke={stroke}
        strokeWidth={STROKE_WIDTH}
        rx={2}
      />
      <line x1={x} y1={y} x2={x + 6} y2={y} stroke={stroke} strokeWidth={STROKE_WIDTH} />
      <line x1={x + w - 6} y1={y} x2={x + w} y2={y} stroke={stroke} strokeWidth={STROKE_WIDTH} />
      <circle cx={x} cy={y} r={3} fill={stroke} />
      <circle cx={x + w} cy={y} r={3} fill={stroke} />
      <text x={x + w / 2} y={y - h / 2 - 8} textAnchor="middle" fill="#ddd" style={{ font: FONT_LABEL }}>
        {label}
      </text>
      {value && (
        <text x={x + w / 2} y={y + h / 2 + 14} textAnchor="middle" fill="#aaa" style={{ font: FONT_VALUE }}>
          {value}
        </text>
      )}
      <Annotation x={x + w / 2} y={y + h / 2 + 26} voltage={voltage} current={current} />
    </g>
  )
}

// ── Symbol Lookup ──────────────────────────────────────────────────────

/**
 * Runtime list of every symbol type — the `SchematicSymbolType` union is
 * derived from it, so tests can iterate ALL symbols without maintaining a
 * parallel list that drifts (the old hand-written copy missed `ic_pin`).
 */
export const SCHEMATIC_SYMBOL_TYPES = [
  "resistor",
  "led",
  "button",
  "capacitor",
  "buzzer",
  "dc_motor",
  "relay",
  "servo",
  "potentiometer",
  "seven_segment",
  "ultrasonic_sensor",
  "temperature_sensor",
  "photoresistor",
  "lcd",
  "neopixel",
  "pir_sensor",
  "voltage_source",
  "ground",
  "arduino_pin",
  "ic_pin",
  "junction",
  "generic_module",
] as const

export type SchematicSymbolType = (typeof SCHEMATIC_SYMBOL_TYPES)[number]

export function renderSymbol(
  type: SchematicSymbolType,
  props: SymbolProps,
): React.ReactNode {
  switch (type) {
    case "resistor":
      return <ResistorSymbol {...props} />
    case "led":
      return <LedSymbol {...props} />
    case "button":
      return <ButtonSymbol {...props} />
    case "capacitor":
      return <CapacitorSymbol {...props} />
    case "buzzer":
      return <BuzzerSymbol {...props} />
    case "dc_motor":
      return <DcMotorSymbol {...props} />
    case "relay":
      return <RelaySymbol {...props} />
    case "servo":
      return <ServoSymbol {...props} />
    case "potentiometer":
      return <PotentiometerSymbol {...props} />
    case "seven_segment":
      return <SevenSegmentSymbol {...props} />
    case "ultrasonic_sensor":
      return <UltrasonicSensorSymbol {...props} />
    case "temperature_sensor":
      return <TemperatureSensorSymbol {...props} />
    case "photoresistor":
      return <PhotoresistorSymbol {...props} />
    case "lcd":
      return <LcdSymbol {...props} />
    case "neopixel":
      return <NeopixelSymbol {...props} />
    case "pir_sensor":
      return <PirSensorSymbol {...props} />
    case "voltage_source":
      return <VoltageSourceSymbol {...props} />
    case "ground":
      return <GroundSymbol {...props} />
    case "arduino_pin":
      return <ArduinoPinSymbol {...props} />
    case "ic_pin":
      return <IcPinSymbol {...props} />
    case "junction":
      return <WireJunction x={props.x} y={props.y} />
    case "generic_module":
      return <GenericModuleSymbol {...props} />
  }
}

export type { SymbolProps }
