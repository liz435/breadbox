import React from "react";
import type { BoardComponent, PinState, LibraryState } from "@dreamer/schemas";
import type { ComponentElectricalState } from "@/simulator/circuit-solver";
import { gridToPixel, HOLE_SPACING } from "@/breadboard/breadboard-grid";
import { PinLabel } from "./pin-label";

type GenericRendererProps = {
  component: BoardComponent;
  pinStates: PinState[];
  isSelected: boolean;
  electricalState?: ComponentElectricalState;
  libraryState?: LibraryState;
};

function BuzzerRenderer({ component, isSelected, electricalState }: { component: BoardComponent; isSelected: boolean; electricalState?: ComponentElectricalState }) {
  const { x, y } = gridToPixel({ row: component.y, col: component.x });
  const radius = 10;
  const isActive = electricalState?.isActive ?? false;

  return (
    <g>
      {/* Pins */}
      <line x1={x - 4} y1={y + radius + 2} x2={x - 4} y2={y + radius + 8} stroke="#a0a0a0" strokeWidth={1.2} />
      <line x1={x + 4} y1={y + radius + 2} x2={x + 4} y2={y + radius + 8} stroke="#a0a0a0" strokeWidth={1.2} />

      {/* Vibration rings when active */}
      {isActive && (
        <>
          <circle cx={x} cy={y} r={radius + 4} fill="none" stroke="#a78bfa" strokeWidth={0.8} opacity={0.4}>
            <animate attributeName="r" values={`${radius + 2};${radius + 10};${radius + 2}`} dur="0.4s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.4;0;0.4" dur="0.4s" repeatCount="indefinite" />
          </circle>
          <circle cx={x} cy={y} r={radius + 8} fill="none" stroke="#a78bfa" strokeWidth={0.6} opacity={0.2}>
            <animate attributeName="r" values={`${radius + 6};${radius + 16};${radius + 6}`} dur="0.4s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.2;0;0.2" dur="0.4s" repeatCount="indefinite" />
          </circle>
        </>
      )}

      {/* Body */}
      <circle
        cx={x}
        cy={y}
        r={radius}
        fill="#1a1a1a"
        stroke={isSelected ? "#3b82f6" : "#333"}
        strokeWidth={isSelected ? 1.5 : 0.8}
      />
      {/* Inner ring */}
      <circle cx={x} cy={y} r={radius - 3} fill="none" stroke="#333" strokeWidth={0.5} />
      {/* Sound hole */}
      <circle cx={x} cy={y} r={3} fill="#2a2a2a" stroke="#444" strokeWidth={0.3} />
      {/* + marking */}
      <text x={x - 6} y={y - radius + 8} fontSize={5} fill="#666" fontFamily="monospace">+</text>

      {/* Pin labels */}
      <PinLabel x={x - 4} y={y + radius + 8} name="+" side="left" />
      <PinLabel x={x + 4} y={y + radius + 8} name="-" side="right" />
    </g>
  );
}

function PotentiometerRenderer({ component, isSelected }: { component: BoardComponent; isSelected: boolean }) {
  const { x, y } = gridToPixel({ row: component.y, col: component.x });
  const radius = 10;
  const knobAngle = ((component.properties.value as number) ?? 50) / 100 * 270 - 135;
  const rad = (knobAngle * Math.PI) / 180;

  return (
    <g>
      {/* 3 pins */}
      <line x1={x - 8} y1={y + radius + 2} x2={x - 8} y2={y + radius + 8} stroke="#a0a0a0" strokeWidth={1.2} />
      <line x1={x} y1={y + radius + 2} x2={x} y2={y + radius + 8} stroke="#a0a0a0" strokeWidth={1.2} />
      <line x1={x + 8} y1={y + radius + 2} x2={x + 8} y2={y + radius + 8} stroke="#a0a0a0" strokeWidth={1.2} />

      {/* Body */}
      <circle
        cx={x}
        cy={y}
        r={radius}
        fill="#78716c"
        stroke={isSelected ? "#3b82f6" : "#57534e"}
        strokeWidth={isSelected ? 1.5 : 0.8}
      />
      {/* Knob indicator */}
      <line
        x1={x}
        y1={y}
        x2={x + Math.cos(rad) * (radius - 2)}
        y2={y + Math.sin(rad) * (radius - 2)}
        stroke="#fbbf24"
        strokeWidth={2}
        strokeLinecap="round"
      />
      {/* Center dot */}
      <circle cx={x} cy={y} r={2} fill="#fbbf24" />

      {/* Pin labels */}
      <PinLabel x={x - 8} y={y + radius + 8} name="vcc" side="left" />
      <PinLabel x={x} y={y + radius + 8} name="signal" side="below" />
      <PinLabel x={x + 8} y={y + radius + 8} name="gnd" side="right" />
    </g>
  );
}

function LcdRenderer({ component, isSelected, libraryState }: { component: BoardComponent; isSelected: boolean; libraryState?: LibraryState }) {
  const { x, y } = gridToPixel({ row: component.y, col: component.x });
  const width = 50;
  const height = 24;

  // Read LCD text from library state if available
  const lcdState = libraryState?.lcd;
  const line1 = lcdState?.textBuffer[0] ?? "";
  const line2 = lcdState?.textBuffer[1] ?? "";
  const hasText = line1.trim().length > 0 || line2.trim().length > 0;

  const displayAreaX = x - width / 2 + 4;
  const displayAreaY = y - height / 2 + 3;
  const displayWidth = width - 8;
  const displayHeight = height - 6;

  return (
    <g>
      {/* PCB board */}
      <rect
        x={x - width / 2}
        y={y - height / 2}
        width={width}
        height={height}
        rx={2}
        fill="#065f46"
        stroke={isSelected ? "#3b82f6" : "#064e3b"}
        strokeWidth={isSelected ? 1.5 : 0.8}
      />
      {/* LCD display area */}
      <rect
        x={displayAreaX}
        y={displayAreaY}
        width={displayWidth}
        height={displayHeight}
        rx={1}
        fill="#a7f3d0"
      />
      {hasText ? (
        <>
          {/* Line 1 text */}
          <text
            x={displayAreaX + 2}
            y={displayAreaY + 6}
            fontSize={4.5}
            fill="#065f46"
            fontFamily="monospace"
            dominantBaseline="middle"
          >
            {line1.slice(0, 16)}
          </text>
          {/* Line 2 text */}
          <text
            x={displayAreaX + 2}
            y={displayAreaY + displayHeight - 3}
            fontSize={4.5}
            fill="#065f46"
            fontFamily="monospace"
            dominantBaseline="middle"
          >
            {line2.slice(0, 16)}
          </text>
        </>
      ) : (
        <>
          {/* Text grid lines (placeholder when no text) */}
          {Array.from({ length: 16 }, (_, i) => (
            <rect
              key={i}
              x={x - width / 2 + 5 + i * 2.5}
              y={y - height / 2 + 5}
              width={2}
              height={4}
              fill="#065f46"
              opacity={0.15}
            />
          ))}
          {Array.from({ length: 16 }, (_, i) => (
            <rect
              key={`b${i}`}
              x={x - width / 2 + 5 + i * 2.5}
              y={y + 2}
              width={2}
              height={4}
              fill="#065f46"
              opacity={0.15}
            />
          ))}
        </>
      )}
    </g>
  );
}

function TemperatureSensorRenderer({ component, isSelected }: { component: BoardComponent; isSelected: boolean }) {
  const { x, y } = gridToPixel({ row: component.y, col: component.x });
  const bodyRadius = 7;

  return (
    <g>
      {/* 3 pins */}
      <line x1={x - 5} y1={y + bodyRadius + 2} x2={x - 5} y2={y + bodyRadius + 10} stroke="#a0a0a0" strokeWidth={1} />
      <line x1={x} y1={y + bodyRadius + 2} x2={x} y2={y + bodyRadius + 10} stroke="#a0a0a0" strokeWidth={1} />
      <line x1={x + 5} y1={y + bodyRadius + 2} x2={x + 5} y2={y + bodyRadius + 10} stroke="#a0a0a0" strokeWidth={1} />

      {/* TO-92 package: half-circle top + flat bottom */}
      <path
        d={`M ${x - bodyRadius} ${y + bodyRadius}
            L ${x - bodyRadius} ${y}
            A ${bodyRadius} ${bodyRadius} 0 0 1 ${x + bodyRadius} ${y}
            L ${x + bodyRadius} ${y + bodyRadius} Z`}
        fill="#1a1a1a"
        stroke={isSelected ? "#3b82f6" : "#444"}
        strokeWidth={isSelected ? 1.5 : 0.8}
      />
      {/* Label */}
      <text x={x} y={y + 3} textAnchor="middle" fontSize={4} fill="#aaa" fontFamily="monospace">
        TMP
      </text>

      {/* Pin labels */}
      <PinLabel x={x - 5} y={y + bodyRadius + 10} name="vcc" side="left" />
      <PinLabel x={x} y={y + bodyRadius + 10} name="out" side="below" />
      <PinLabel x={x + 5} y={y + bodyRadius + 10} name="gnd" side="right" />
    </g>
  );
}

function GenericRendererInner({ component, pinStates, isSelected, electricalState, libraryState }: GenericRendererProps) {
  const isDimmed = electricalState != null && !electricalState.isActive;
  const dimOpacity = isDimmed ? 0.5 : 1;

  // Route to specialized renderers
  switch (component.type) {
    case "buzzer":
      return <g opacity={dimOpacity}><BuzzerRenderer component={component} isSelected={isSelected} electricalState={electricalState} /></g>;
    case "potentiometer":
      return <g opacity={dimOpacity}><PotentiometerRenderer component={component} isSelected={isSelected} /></g>;
    case "lcd_16x2":
      return <g opacity={dimOpacity}><LcdRenderer component={component} isSelected={isSelected} libraryState={libraryState} /></g>;
    case "temperature_sensor":
      return <TemperatureSensorRenderer component={component} isSelected={isSelected} />;
    default:
      break;
  }

  // Default fallback
  const { x, y } = gridToPixel({ row: component.y, col: component.x });
  const width = 28;
  const height = 16;
  const label = component.type
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <g>
      <rect
        x={x - width / 2}
        y={y - height / 2}
        width={width}
        height={height}
        rx={2}
        fill="#3a3a3a"
        stroke={isSelected ? "#3b82f6" : "#555"}
        strokeWidth={isSelected ? 1.5 : 0.8}
      />
      <text
        x={x}
        y={y + 1}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={5}
        fill="#ccc"
        fontFamily="monospace"
      >
        {label}
      </text>
      <text
        x={x}
        y={y + height / 2 + 10}
        textAnchor="middle"
        fontSize={6}
        fill="#888"
        fontFamily="monospace"
      >
        {component.name}
      </text>
    </g>
  );
}

export const GenericRenderer = React.memo(GenericRendererInner);
