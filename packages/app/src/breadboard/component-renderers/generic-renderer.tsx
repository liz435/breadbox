import React from "react";
import type { BoardComponent, PinState, LibraryState } from "@dreamer/schemas";
import type { ComponentElectricalState } from "@/simulator/circuit-solver";
import { gridToPixel } from "@/breadboard/breadboard-grid";
import { KNOB_RADIUS, GENERIC_BODY_WIDTH, GENERIC_BODY_HEIGHT, LABEL_FONT_SIZE } from "@/breadboard/breadboard-constants";
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
  const radius = KNOB_RADIUS;
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
  // Vertical pin layout: vcc at (y, x), signal at (y+1, x), gnd at (y+2, x)
  const pinVcc = gridToPixel({ row: component.y, col: component.x });
  const pinSignal = gridToPixel({ row: component.y + 1, col: component.x });
  const pinGnd = gridToPixel({ row: component.y + 2, col: component.x });
  const centerX = pinSignal.x;
  const centerY = pinSignal.y;
  const radius = KNOB_RADIUS;
  const knobAngle = ((component.properties.value as number) ?? 50) / 100 * 270 - 135;
  const rad = (knobAngle * Math.PI) / 180;

  return (
    <g>
      {/* 3 vertical pins */}
      <circle cx={pinVcc.x} cy={pinVcc.y} r={2} fill="#ef4444" opacity={0.5} />
      <circle cx={pinSignal.x} cy={pinSignal.y} r={2} fill="#fbbf24" opacity={0.5} />
      <circle cx={pinGnd.x} cy={pinGnd.y} r={2} fill="#42a5f5" opacity={0.5} />

      {/* Body — offset to the left of pins */}
      <circle
        cx={centerX - radius - 6}
        cy={centerY}
        r={radius}
        fill="#78716c"
        stroke={isSelected ? "#3b82f6" : "#57534e"}
        strokeWidth={isSelected ? 1.5 : 0.8}
      />
      {/* Knob indicator */}
      <line
        x1={centerX - radius - 6}
        y1={centerY}
        x2={centerX - radius - 6 + Math.cos(rad) * (radius - 2)}
        y2={centerY + Math.sin(rad) * (radius - 2)}
        stroke="#fbbf24"
        strokeWidth={2}
        strokeLinecap="round"
      />
      {/* Center dot */}
      <circle cx={centerX - radius - 6} cy={centerY} r={2} fill="#fbbf24" />

      {/* Pin labels */}
      <PinLabel x={pinVcc.x} y={pinVcc.y} name="vcc" side="right" />
      <PinLabel x={pinSignal.x} y={pinSignal.y} name="signal" side="right" />
      <PinLabel x={pinGnd.x} y={pinGnd.y} name="gnd" side="right" />
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
  // Vertical pin layout: vcc at (y, x), signal at (y+1, x), gnd at (y+2, x)
  const pinVcc = gridToPixel({ row: component.y, col: component.x });
  const pinSignal = gridToPixel({ row: component.y + 1, col: component.x });
  const pinGnd = gridToPixel({ row: component.y + 2, col: component.x });
  const cx = pinSignal.x;
  const cy = pinSignal.y;
  const bodyRadius = 7;

  return (
    <g>
      {/* 3 vertical pin indicators */}
      <circle cx={pinVcc.x} cy={pinVcc.y} r={2} fill="#ef4444" opacity={0.5} />
      <circle cx={pinSignal.x} cy={pinSignal.y} r={2} fill="#81c784" opacity={0.5} />
      <circle cx={pinGnd.x} cy={pinGnd.y} r={2} fill="#42a5f5" opacity={0.5} />

      {/* TO-92 package: half-circle top + flat bottom — offset to the left */}
      <path
        d={`M ${cx - bodyRadius - 10} ${cy + bodyRadius}
            L ${cx - bodyRadius - 10} ${cy}
            A ${bodyRadius} ${bodyRadius} 0 0 1 ${cx + bodyRadius - 10} ${cy}
            L ${cx + bodyRadius - 10} ${cy + bodyRadius} Z`}
        fill="#1a1a1a"
        stroke={isSelected ? "#3b82f6" : "#444"}
        strokeWidth={isSelected ? 1.5 : 0.8}
      />
      {/* Label */}
      <text x={cx - 10} y={cy + 3} textAnchor="middle" fontSize={4} fill="#aaa" fontFamily="monospace">
        TMP
      </text>

      {/* Pin labels */}
      <PinLabel x={pinVcc.x} y={pinVcc.y} name="vcc" side="right" />
      <PinLabel x={pinSignal.x} y={pinSignal.y} name="out" side="right" />
      <PinLabel x={pinGnd.x} y={pinGnd.y} name="gnd" side="right" />
    </g>
  );
}

function NeoPixelRenderer({ component, isSelected }: { component: BoardComponent; isSelected: boolean }) {
  const p0 = gridToPixel({ row: component.y, col: component.x });
  const p1 = gridToPixel({ row: component.y, col: component.x + 1 });
  const p2 = gridToPixel({ row: component.y, col: component.x + 2 });
  const numLeds = (component.properties.numLeds as number) ?? 8;
  const displayLeds = Math.min(numLeds, 8);
  const stripW = p2.x - p0.x + 14;
  const stripH = 14;
  const cx = (p0.x + p2.x) / 2;
  const cy = p0.y;
  const stripL = cx - stripW / 2;
  const stripT = cy - stripH / 2;

  const colors = ["#ef4444", "#22c55e", "#3b82f6", "#eab308", "#a855f7", "#f97316", "#06b6d4", "#ec4899"];

  return (
    <g>
      {/* PCB shadow */}
      <rect x={stripL + 1} y={stripT + 1} width={stripW} height={stripH}
        rx={1.5} fill="#00000030" />
      {/* PCB strip — black with solder mask green edge */}
      <rect x={stripL} y={stripT} width={stripW} height={stripH}
        rx={1.5} fill="#1a1a1a" stroke={isSelected ? "#3b82f6" : "#2a2a2a"} strokeWidth={isSelected ? 1.5 : 0.8} />
      {/* Solder mask green accent lines */}
      <line x1={stripL + 2} y1={stripT + 1.5} x2={stripL + stripW - 2} y2={stripT + 1.5}
        stroke="#065f46" strokeWidth={0.5} opacity={0.4} />
      <line x1={stripL + 2} y1={stripT + stripH - 1.5} x2={stripL + stripW - 2} y2={stripT + stripH - 1.5}
        stroke="#065f46" strokeWidth={0.5} opacity={0.4} />

      {/* SMD LED pads + LED squares */}
      {Array.from({ length: displayLeds }, (_, i) => {
        const ledX = stripL + 5 + i * ((stripW - 10) / (displayLeds - 1 || 1));
        const ledSize = 4;
        const c = colors[i % colors.length];
        return (
          <g key={i}>
            {/* Copper pad */}
            <rect x={ledX - ledSize / 2 - 0.8} y={cy - ledSize / 2 - 0.8}
              width={ledSize + 1.6} height={ledSize + 1.6} rx={0.5}
              fill="#b08d57" opacity={0.4} />
            {/* White LED package */}
            <rect x={ledX - ledSize / 2} y={cy - ledSize / 2}
              width={ledSize} height={ledSize} rx={0.5}
              fill="#f5f5f5" stroke="#ddd" strokeWidth={0.3} />
            {/* Colored LED die */}
            <rect x={ledX - ledSize / 2 + 0.8} y={cy - ledSize / 2 + 0.8}
              width={ledSize - 1.6} height={ledSize - 1.6} rx={0.3}
              fill={c} opacity={0.85} />
            {/* Corner mark (pin 1 indicator) */}
            <circle cx={ledX - ledSize / 2 + 1} cy={cy - ledSize / 2 + 1}
              r={0.4} fill={c} opacity={0.5} />
          </g>
        );
      })}

      {/* Data direction arrow (DIN → DOUT) */}
      <polygon
        points={`${stripL + stripW - 5},${cy - 1} ${stripL + stripW - 3},${cy} ${stripL + stripW - 5},${cy + 1}`}
        fill="#555" opacity={0.6}
      />

      {/* Count badge if more than displayed */}
      {numLeds > 8 && (
        <text x={stripL + stripW - 2} y={stripT - 2}
          textAnchor="end" fontSize={3.5} fill="#888" fontFamily="monospace">
          ×{numLeds}
        </text>
      )}

      {/* Pin indicators */}
      <circle cx={p0.x} cy={p0.y} r={2} fill="#a855f7" opacity={0.5} />
      <circle cx={p1.x} cy={p1.y} r={2} fill="#ef4444" opacity={0.5} />
      <circle cx={p2.x} cy={p2.y} r={2} fill="#555" opacity={0.5} />
      <PinLabel x={p0.x} y={p0.y} name="din" side="below" />
      <PinLabel x={p1.x} y={p1.y} name="5v" side="below" />
      <PinLabel x={p2.x} y={p2.y} name="gnd" side="below" />
      <text x={cx} y={cy + stripH / 2 + 10} textAnchor="middle" fontSize={LABEL_FONT_SIZE} fill="#888" fontFamily="monospace">
        {component.name}
      </text>
    </g>
  );
}

function PirRenderer({ component, isSelected }: { component: BoardComponent; isSelected: boolean }) {
  const { x, y } = gridToPixel({ row: component.y, col: component.x });
  const radius = KNOB_RADIUS;

  return (
    <g>
      <line x1={x} y1={y + radius + 2} x2={x} y2={y + radius + 8} stroke="#a0a0a0" strokeWidth={1.2} />
      <line x1={x + 14} y1={y + radius + 2} x2={x + 14} y2={y + radius + 8} stroke="#a0a0a0" strokeWidth={1.2} />
      <line x1={x + 28} y1={y + radius + 2} x2={x + 28} y2={y + radius + 8} stroke="#a0a0a0" strokeWidth={1.2} />
      {/* PCB */}
      <rect x={x - 6} y={y - 2} width={40} height={radius * 2 + 4} rx={3}
        fill="#065f46" stroke={isSelected ? "#3b82f6" : "#064e3b"} strokeWidth={isSelected ? 1.5 : 0.8} />
      {/* Fresnel dome */}
      <circle cx={x + 14} cy={y + radius - 2} r={radius} fill="#e5e7eb" stroke="#d1d5db" strokeWidth={0.8} />
      <circle cx={x + 14} cy={y + radius - 2} r={radius - 3} fill="#f3f4f6" opacity={0.5} />
      <PinLabel x={x} y={y + radius + 8} name="signal" side="below" />
      <text x={x + 14} y={y + radius * 2 + 14} textAnchor="middle" fontSize={LABEL_FONT_SIZE} fill="#888" fontFamily="monospace">
        {component.name}
      </text>
    </g>
  );
}

function RelayRenderer({ component, isSelected }: { component: BoardComponent; isSelected: boolean }) {
  const { x, y } = gridToPixel({ row: component.y, col: component.x });
  const w = 22;
  const h = 30;

  return (
    <g>
      <rect x={x - w / 2} y={y - 4} width={w} height={h} rx={2}
        fill="#1e40af" stroke={isSelected ? "#3b82f6" : "#1e3a5f"} strokeWidth={isSelected ? 1.5 : 0.8} />
      <rect x={x - w / 2 + 3} y={y} width={w - 6} height={10} rx={1} fill="#3b82f6" opacity={0.3} />
      <text x={x} y={y + 7} textAnchor="middle" fontSize={4} fill="#93c5fd" fontFamily="monospace">RELAY</text>
      <PinLabel x={x} y={y - 4} name="signal" side="above" />
      <text x={x} y={y + h + 4} textAnchor="middle" fontSize={LABEL_FONT_SIZE} fill="#888" fontFamily="monospace">
        {component.name}
      </text>
    </g>
  );
}

function DcMotorRenderer({ component, isSelected }: { component: BoardComponent; isSelected: boolean }) {
  const { x, y } = gridToPixel({ row: component.y, col: component.x });
  const radius = KNOB_RADIUS + 2;

  return (
    <g>
      {/* Motor body */}
      <circle cx={x} cy={y} r={radius} fill="#374151" stroke={isSelected ? "#3b82f6" : "#6b7280"} strokeWidth={isSelected ? 1.5 : 0.8} />
      <circle cx={x} cy={y} r={radius - 3} fill="#1f2937" stroke="#4b5563" strokeWidth={0.5} />
      {/* Shaft */}
      <line x1={x} y1={y - radius} x2={x} y2={y - radius - 6} stroke="#a0a0a0" strokeWidth={2} strokeLinecap="round" />
      {/* M label */}
      <text x={x} y={y + 2} textAnchor="middle" fontSize={6} fill="#9ca3af" fontFamily="monospace" fontWeight="bold">M</text>
      <PinLabel x={x} y={y + radius + 2} name="signal" side="below" />
      <text x={x} y={y + radius + 12} textAnchor="middle" fontSize={LABEL_FONT_SIZE} fill="#888" fontFamily="monospace">
        {component.name}
      </text>
    </g>
  );
}

function OledRenderer({ component, isSelected, libraryState: _libraryState }: { component: BoardComponent; isSelected: boolean; libraryState?: LibraryState }) {
  const { x, y } = gridToPixel({ row: component.y, col: component.x });
  const w = 50;
  const h = 28;
  const screenW = w - 8;
  const screenH = h - 8;

  return (
    <g>
      {/* PCB */}
      <rect x={x - 4} y={y - 4} width={w} height={h} rx={2}
        fill="#1a1a1a" stroke={isSelected ? "#3b82f6" : "#333"} strokeWidth={isSelected ? 1.5 : 0.8} />
      {/* Screen */}
      <rect x={x} y={y} width={screenW} height={screenH} rx={1} fill="#000" />
      {/* Default display text */}
      <text x={x + screenW / 2} y={y + screenH / 2 + 1} textAnchor="middle" fontSize={4} fill="#06b6d4" fontFamily="monospace">
        128x64 OLED
      </text>
      <PinLabel x={x} y={y + h} name="sda" side="below" />
      <PinLabel x={x + 14} y={y + h} name="scl" side="below" />
      <text x={x + screenW / 2} y={y + h + 8} textAnchor="middle" fontSize={LABEL_FONT_SIZE} fill="#888" fontFamily="monospace">
        {component.name}
      </text>
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
    case "neopixel":
      return <g opacity={dimOpacity}><NeoPixelRenderer component={component} isSelected={isSelected} /></g>;
    case "pir_sensor":
      return <g opacity={dimOpacity}><PirRenderer component={component} isSelected={isSelected} /></g>;
    case "relay":
      return <g opacity={dimOpacity}><RelayRenderer component={component} isSelected={isSelected} /></g>;
    case "dc_motor":
      return <g opacity={dimOpacity}><DcMotorRenderer component={component} isSelected={isSelected} /></g>;
    case "oled_display":
      return <g opacity={dimOpacity}><OledRenderer component={component} isSelected={isSelected} libraryState={libraryState} /></g>;
    default:
      break;
  }

  // Default fallback
  const { x, y } = gridToPixel({ row: component.y, col: component.x });
  const width = GENERIC_BODY_WIDTH;
  const height = GENERIC_BODY_HEIGHT;
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
        fontSize={LABEL_FONT_SIZE}
        fill="#888"
        fontFamily="monospace"
      >
        {component.name}
      </text>
    </g>
  );
}

export const GenericRenderer = React.memo(GenericRendererInner);
