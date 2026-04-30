import React from "react"
import type { BoardComponent, PinState, LibraryState } from "@dreamer/schemas"
import { gridToPixel } from "@/breadboard/breadboard-grid"
import { REALISTIC_LED_LIGHTING_PILOT } from "@/breadboard/lighting-pilot"
import {
  getLedBrightness,
  getServoAngle,
  getLcdText,
} from "@/simulator/component-behavior"

type SimulationOverlayProps = {
  components: BoardComponent[]
  pinStates: PinState[]
  libraryState: LibraryState
}

function LedOverlay({
  component,
  pinStates,
}: {
  component: BoardComponent
  pinStates: PinState[]
}) {
  if (REALISTIC_LED_LIGHTING_PILOT && component.type === "led") return null

  const brightness = getLedBrightness(component, pinStates)
  if (brightness <= 0) return null

  const color = (component.properties.color as string) ?? "#ef4444"
  const { x, y } = gridToPixel({ row: component.y, col: component.x })
  const filterId = `sim-glow-${component.id}`

  return (
    <g>
      <defs>
        <filter id={filterId} x="-200%" y="-200%" width="500%" height="500%">
          <feGaussianBlur
            stdDeviation={6 * brightness}
            result="blur"
          />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <circle
        cx={x}
        cy={y}
        r={10 * brightness}
        fill={color}
        opacity={0.3 * brightness}
        filter={`url(#${filterId})`}
      />
    </g>
  )
}

function ServoOverlay({
  component,
  libraryState,
}: {
  component: BoardComponent
  libraryState: LibraryState
}) {
  const angle = getServoAngle(component, libraryState)
  const { x, y } = gridToPixel({ row: component.y, col: component.x })

  // Display the live angle next to the servo
  return (
    <text
      x={x + 16}
      y={y - 8}
      fontSize={8}
      fill="#fbbf24"
      fontFamily="monospace"
    >
      {angle.toFixed(0)}&deg;
    </text>
  )
}

function LcdOverlay({
  libraryState,
}: {
  libraryState: LibraryState
}) {
  const text = getLcdText(libraryState)
  if (!text) return null

  const lcd = libraryState.lcd
  if (!lcd) return null

  // Render LCD text at a fixed position (bottom-right area of the board)
  const lcdX = 160
  const lcdY = 20

  return (
    <g>
      <rect
        x={lcdX}
        y={lcdY}
        width={lcd.cols * 7 + 8}
        height={lcd.rows * 12 + 8}
        rx={2}
        fill="#1a3a1a"
        stroke="#22c55e"
        strokeWidth={0.5}
        opacity={0.9}
      />
      {text.map((row, i) => (
        <text
          key={i}
          x={lcdX + 4}
          y={lcdY + 12 + i * 12}
          fontSize={9}
          fill="#22c55e"
          fontFamily="monospace"
        >
          {row}
        </text>
      ))}
    </g>
  )
}

function SimulationOverlayInner({
  components,
  pinStates,
  libraryState,
}: SimulationOverlayProps) {
  const leds = components.filter(
    (c) => c.type === "led" || c.type === "rgb_led"
  )
  const servos = components.filter((c) => c.type === "servo")

  return (
    <g className="simulation-overlay" pointerEvents="none">
      {/* LED glow overlays */}
      {leds.map((led) => (
        <LedOverlay key={led.id} component={led} pinStates={pinStates} />
      ))}

      {/* Servo angle overlays */}
      {servos.map((servo) => (
        <ServoOverlay
          key={servo.id}
          component={servo}
          libraryState={libraryState}
        />
      ))}

      {/* LCD text overlay */}
      <LcdOverlay libraryState={libraryState} />
    </g>
  )
}

export const SimulationOverlay = React.memo(SimulationOverlayInner)
