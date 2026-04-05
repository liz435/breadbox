import React from "react";
import type { BoardComponent, PinState } from "@dreamer/schemas";
import { gridToPixel, HOLE_SPACING } from "@/breadboard/breadboard-grid";

type GenericRendererProps = {
  component: BoardComponent;
  pinStates: PinState[];
  isSelected: boolean;
};

function BuzzerRenderer({ component, isSelected }: { component: BoardComponent; isSelected: boolean }) {
  const { x, y } = gridToPixel({ row: component.y, col: component.x });
  const radius = 10;

  return (
    <g>
      {/* Pins */}
      <line x1={x - 4} y1={y + radius + 2} x2={x - 4} y2={y + radius + 8} stroke="#a0a0a0" strokeWidth={1.2} />
      <line x1={x + 4} y1={y + radius + 2} x2={x + 4} y2={y + radius + 8} stroke="#a0a0a0" strokeWidth={1.2} />

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
    </g>
  );
}

function LcdRenderer({ component, isSelected }: { component: BoardComponent; isSelected: boolean }) {
  const { x, y } = gridToPixel({ row: component.y, col: component.x });
  const width = 50;
  const height = 24;

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
        x={x - width / 2 + 4}
        y={y - height / 2 + 3}
        width={width - 8}
        height={height - 6}
        rx={1}
        fill="#a7f3d0"
      />
      {/* Text grid lines */}
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
    </g>
  );
}

function GenericRendererInner({ component, pinStates, isSelected }: GenericRendererProps) {
  // Route to specialized renderers
  switch (component.type) {
    case "buzzer":
      return <BuzzerRenderer component={component} isSelected={isSelected} />;
    case "potentiometer":
      return <PotentiometerRenderer component={component} isSelected={isSelected} />;
    case "lcd_16x2":
      return <LcdRenderer component={component} isSelected={isSelected} />;
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
