import React from "react"
import type { BoardComponent, LibraryState } from "@dreamer/schemas"
import { gridToPixel } from "@/breadboard/breadboard-grid"
import { LABEL_FONT_SIZE, PX_PER_MM } from "@/breadboard/breadboard-constants"
import { PinLabel } from "@/breadboard/component-renderers/pin-label"

type StepperRendererProps = {
  component: BoardComponent
  isSelected: boolean
  libraryState?: LibraryState
}

/**
 * 28BYJ-48 motor with its ULN2003 driver board.
 *
 * The six driver pins are the component footprint, so the board is drawn to
 * their left and each lead terminates at the exact breadboard hole. The motor
 * face is a separate moving group; the stepper peripheral publishes an
 * accumulated output angle keyed by component id.
 */
function StepperRendererInner({ component, isSelected, libraryState }: StepperRendererProps) {
  const pins = Array.from({ length: 6 }, (_, index) =>
    gridToPixel({ row: component.y + index, col: component.x }),
  )
  const pinX = pins[0].x
  const firstPinY = pins[0].y
  const lastPinY = pins[5].y

  const boardWidth = 22 * PX_PER_MM
  const boardTop = firstPinY - 3 * PX_PER_MM
  const boardBottom = lastPinY + 3 * PX_PER_MM
  const boardRight = pinX - 3 * PX_PER_MM
  const boardLeft = boardRight - boardWidth
  const boardCenterX = (boardLeft + boardRight) / 2
  const boardCenterY = (boardTop + boardBottom) / 2
  const cableHeadX = pinX - 8
  const cableHeadWidth = 7

  const motorRadius = 13 * PX_PER_MM
  const motorCenterX = boardLeft - motorRadius - 6
  const motorCenterY = boardCenterY
  const angle = libraryState?.steppers?.[component.id]?.angle ?? 0
  const safeAngle = Number.isFinite(angle) ? angle : 0

  const boardGradId = `stepper-board-${component.id}`
  const motorGradId = `stepper-motor-${component.id}`
  const faceGradId = `stepper-face-${component.id}`

  const pinNames = ["in1", "in2", "in3", "in4", "vplus", "gnd"]
  const pinSymbols = ["IN1", "IN2", "IN3", "IN4", "+5V", "G"]
  const pinColors = ["#f59e0b", "#f59e0b", "#f59e0b", "#f59e0b", "#ef4444", "#6b7280"]

  return (
    <g>
      <defs>
        <linearGradient id={boardGradId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#2563eb" />
          <stop offset="55%" stopColor="#1d4ed8" />
          <stop offset="100%" stopColor="#172554" />
        </linearGradient>
        <radialGradient id={motorGradId} cx="32%" cy="28%" r="78%">
          <stop offset="0%" stopColor="#60a5fa" />
          <stop offset="48%" stopColor="#2563eb" />
          <stop offset="100%" stopColor="#172554" />
        </radialGradient>
        <radialGradient id={faceGradId} cx="35%" cy="30%" r="78%">
          <stop offset="0%" stopColor="#93c5fd" />
          <stop offset="55%" stopColor="#1e40af" />
          <stop offset="100%" stopColor="#0f172a" />
        </radialGradient>
      </defs>

      {/* Leads and the black rubber cable head sit above the breadboard holes. */}
      <rect
        x={cableHeadX}
        y={firstPinY - 4.5}
        width={cableHeadWidth}
        height={lastPinY - firstPinY + 9}
        rx={1.8}
        fill="#00000055"
        transform="translate(1 1.5)"
      />
      <rect
        x={cableHeadX}
        y={firstPinY - 4.5}
        width={cableHeadWidth}
        height={lastPinY - firstPinY + 9}
        rx={1.8}
        fill="#111318"
        stroke="#050608"
        strokeWidth={0.7}
      />
      <rect
        x={cableHeadX + 1.2}
        y={firstPinY - 3.2}
        width={1.1}
        height={lastPinY - firstPinY + 6.4}
        rx={0.5}
        fill="#3d4148"
        opacity={0.9}
      />
      {pins.map((pin, index) => (
        <g key={pinNames[index]}>
          <line
            x1={boardRight - 4}
            y1={pin.y}
            x2={cableHeadX}
            y2={pin.y}
            stroke={pinColors[index]}
            strokeWidth={1.4}
            strokeLinecap="round"
          />
          {/* Short exposed metal leg between the rubber housing and the hole. */}
          <line
            x1={cableHeadX + cableHeadWidth}
            y1={pin.y}
            x2={pin.x}
            y2={pin.y}
            stroke="#cbd5e1"
            strokeWidth={1.15}
            strokeLinecap="round"
          />
          <rect
            x={cableHeadX + 2.4}
            y={pin.y - 1.35}
            width={3.4}
            height={2.7}
            rx={0.7}
            fill={pinColors[index]}
            stroke="#050608"
            strokeWidth={0.35}
          />
          <circle cx={pin.x} cy={pin.y} r={2.5} fill={pinColors[index]} opacity={0.72} />
          <PinLabel
            x={pin.x}
            y={pin.y}
            name={pinNames[index]}
            symbol={pinSymbols[index]}
            color={pinColors[index]}
            side="right"
          />
        </g>
      ))}

      {/* ULN2003 driver board */}
      <rect
        x={boardLeft + 1.5}
        y={boardTop + 2}
        width={boardWidth}
        height={boardBottom - boardTop}
        rx={3}
        fill="#00000045"
      />
      <rect
        x={boardLeft}
        y={boardTop}
        width={boardWidth}
        height={boardBottom - boardTop}
        rx={3}
        fill={`url(#${boardGradId})`}
        stroke={isSelected ? "#3b82f6" : "#172554"}
        strokeWidth={isSelected ? 1.7 : 0.9}
      />
      <rect
        x={boardLeft + 2}
        y={boardTop + 2}
        width={boardWidth - 4}
        height={boardBottom - boardTop - 4}
        rx={2}
        fill="none"
        stroke="#93c5fd"
        strokeWidth={0.45}
        opacity={0.45}
      />

      {/* Four phase LEDs */}
      {[0, 1, 2, 3].map((index) => {
        const y = pins[index].y
        return (
          <g key={`led-${index}`}>
            <circle cx={boardLeft + 5} cy={y} r={1.9} fill="#0f172a" stroke="#bfdbfe" strokeWidth={0.35} />
            <circle cx={boardLeft + 5} cy={y} r={1.05} fill="#fbbf24" opacity={0.9} />
          </g>
        )
      })}

      {/* Driver IC and silkscreen */}
      <rect
        x={boardCenterX - 4.5}
        y={boardCenterY - 14}
        width={9}
        height={28}
        rx={1}
        fill="#111827"
        stroke="#0f172a"
        strokeWidth={0.6}
      />
      {[...Array(4)].map((_, index) => (
        <g key={`chip-pin-${index}`}>
          <line x1={boardCenterX - 7} y1={boardCenterY - 10 + index * 6} x2={boardCenterX - 4.5} y2={boardCenterY - 10 + index * 6} stroke="#cbd5e1" strokeWidth={0.7} />
          <line x1={boardCenterX + 4.5} y1={boardCenterY - 10 + index * 6} x2={boardCenterX + 7} y2={boardCenterY - 10 + index * 6} stroke="#cbd5e1" strokeWidth={0.7} />
        </g>
      ))}
      <text x={boardCenterX} y={boardCenterY + 2} textAnchor="middle" fontSize={3.4} fill="#dbeafe" fontFamily="monospace" fontWeight="bold">
        ULN
      </text>
      <text x={boardCenterX} y={boardCenterY + 7} textAnchor="middle" fontSize={3.1} fill="#bfdbfe" fontFamily="monospace">
        2003
      </text>
      <text x={boardCenterX} y={boardTop + 8} textAnchor="middle" fontSize={3.7} fill="#bfdbfe" fontFamily="monospace" fontWeight="bold">
        28BYJ-48
      </text>
      <text x={boardCenterX} y={boardBottom - 5} textAnchor="middle" fontSize={3.2} fill="#93c5fd" fontFamily="monospace">
        DRIVER
      </text>

      {/* 28BYJ-48 motor can and its animated output shaft */}
      <rect
        x={motorCenterX - motorRadius * 0.78}
        y={motorCenterY - motorRadius}
        width={motorRadius * 1.56}
        height={motorRadius * 2}
        rx={motorRadius * 0.18}
        fill="#00000040"
        transform={`translate(1.5 2)`}
      />
      <rect
        x={motorCenterX - motorRadius * 0.78}
        y={motorCenterY - motorRadius}
        width={motorRadius * 1.56}
        height={motorRadius * 2}
        rx={motorRadius * 0.18}
        fill={`url(#${motorGradId})`}
        stroke="#172554"
        strokeWidth={0.9}
      />
      <rect
        x={motorCenterX - motorRadius * 0.65}
        y={motorCenterY - motorRadius * 0.87}
        width={motorRadius * 1.3}
        height={motorRadius * 0.22}
        rx={2}
        fill="#93c5fd"
        opacity={0.42}
      />
      <circle cx={motorCenterX} cy={motorCenterY} r={motorRadius * 0.78} fill="#00000045" />
      <circle cx={motorCenterX} cy={motorCenterY} r={motorRadius * 0.72} fill={`url(#${faceGradId})`} stroke="#172554" strokeWidth={0.8} />
      <circle cx={motorCenterX} cy={motorCenterY} r={motorRadius * 0.56} fill="none" stroke="#bfdbfe" strokeWidth={0.65} opacity={0.5} />

      <g transform={`rotate(${safeAngle} ${motorCenterX} ${motorCenterY})`}>
        <rect
          x={motorCenterX - 2.1}
          y={motorCenterY - motorRadius * 0.53}
          width={4.2}
          height={motorRadius * 1.06}
          rx={1.3}
          fill="#f59e0b"
          stroke="#fde68a"
          strokeWidth={0.45}
        />
        <line
          x1={motorCenterX}
          y1={motorCenterY - motorRadius * 0.48}
          x2={motorCenterX}
          y2={motorCenterY + motorRadius * 0.48}
          stroke="#78350f"
          strokeWidth={0.7}
          opacity={0.8}
        />
      </g>
      <circle cx={motorCenterX} cy={motorCenterY} r={4.2} fill="#e5e7eb" stroke="#64748b" strokeWidth={0.8} />
      <circle cx={motorCenterX} cy={motorCenterY} r={1.3} fill="#475569" />

      {/* Harness from motor to the driver board. */}
      <path
        d={`M ${motorCenterX + motorRadius * 0.76} ${motorCenterY - 5}
            C ${motorCenterX + motorRadius} ${motorCenterY - 5}, ${boardLeft - 10} ${motorCenterY - 11}, ${boardLeft} ${motorCenterY - 11}`}
        fill="none"
        stroke="#f59e0b"
        strokeWidth={2.2}
        strokeLinecap="round"
      />
      <path
        d={`M ${motorCenterX + motorRadius * 0.76} ${motorCenterY + 1}
            C ${motorCenterX + motorRadius} ${motorCenterY + 1}, ${boardLeft - 10} ${motorCenterY - 5}, ${boardLeft} ${motorCenterY - 5}`}
        fill="none"
        stroke="#fbbf24"
        strokeWidth={2.2}
        strokeLinecap="round"
      />
      <path
        d={`M ${motorCenterX + motorRadius * 0.76} ${motorCenterY + 7}
            C ${motorCenterX + motorRadius} ${motorCenterY + 7}, ${boardLeft - 10} ${motorCenterY + 1}, ${boardLeft} ${motorCenterY + 1}`}
        fill="none"
        stroke="#f97316"
        strokeWidth={2.2}
        strokeLinecap="round"
      />

      <text x={motorCenterX} y={motorCenterY + motorRadius + 8} textAnchor="middle" fontSize={LABEL_FONT_SIZE} fill="#888" fontFamily="monospace">
        {component.name} ({Math.round(safeAngle)}°)
      </text>
    </g>
  )
}

export const StepperRenderer = React.memo(StepperRendererInner)
