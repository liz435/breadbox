import React from "react";
import { MAX_ARDUINO_PIN, type BoardComponent, type PinState, type LibraryState, type Wire } from "@dreamer/schemas";
import type { ComponentElectricalState } from "@/simulator/circuit-solver";
import { areConnected, getComponentFootprint, gridToPixel } from "@/breadboard/breadboard-grid";
import { KNOB_RADIUS, GENERIC_BODY_WIDTH, GENERIC_BODY_HEIGHT, LABEL_FONT_SIZE, HOLE_SPACING } from "@/breadboard/breadboard-constants";
import { PinLabel } from "./pin-label";
import { OledCanvas } from "@/components/oled-canvas";

type GenericRendererProps = {
  component: BoardComponent;
  components?: BoardComponent[];
  pinStates: PinState[];
  wires?: Record<string, Wire>;
  isSelected: boolean;
  electricalState?: ComponentElectricalState;
  libraryState?: LibraryState;
};

function BuzzerRenderer({ component, isSelected, electricalState }: { component: BoardComponent; isSelected: boolean; electricalState?: ComponentElectricalState }) {
  // Vertical 2-pin layout: + on top row, − on next row.
  const pinPos = gridToPixel({ row: component.y, col: component.x });
  const pinNeg = gridToPixel({ row: component.y + 1, col: component.x });
  const radius = KNOB_RADIUS;
  const isActive = electricalState?.isActive ?? false;

  // Body sits to the LEFT of the pin column so the pins stay visible.
  const bodyCx = pinPos.x - radius - 4;
  const bodyCy = (pinPos.y + pinNeg.y) / 2;

  return (
    <g>
      {/* Pin hole indicators */}
      <circle cx={pinPos.x} cy={pinPos.y} r={2} fill="#ef4444" opacity={0.55} />
      <circle cx={pinNeg.x} cy={pinNeg.y} r={2} fill="#6b7280" opacity={0.55} />

      {/* Bent leads from body into the pin holes */}
      <path
        d={`M ${bodyCx + radius - 2} ${bodyCy - 3} Q ${bodyCx + radius + 4} ${bodyCy - 3}, ${bodyCx + radius + 4} ${pinPos.y} L ${pinPos.x} ${pinPos.y}`}
        fill="none" stroke="#c0c0c0" strokeWidth={1.3} strokeLinecap="round"
      />
      <path
        d={`M ${bodyCx + radius - 2} ${bodyCy + 3} Q ${bodyCx + radius + 4} ${bodyCy + 3}, ${bodyCx + radius + 4} ${pinNeg.y} L ${pinNeg.x} ${pinNeg.y}`}
        fill="none" stroke="#c0c0c0" strokeWidth={1.3} strokeLinecap="round"
      />

      {/* Vibration rings when active */}
      {isActive && (
        <>
          <circle cx={bodyCx} cy={bodyCy} r={radius + 4} fill="none" stroke="#a78bfa" strokeWidth={0.8} opacity={0.4}>
            <animate attributeName="r" values={`${radius + 2};${radius + 10};${radius + 2}`} dur="0.4s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.4;0;0.4" dur="0.4s" repeatCount="indefinite" />
          </circle>
          <circle cx={bodyCx} cy={bodyCy} r={radius + 8} fill="none" stroke="#a78bfa" strokeWidth={0.6} opacity={0.2}>
            <animate attributeName="r" values={`${radius + 6};${radius + 16};${radius + 6}`} dur="0.4s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.2;0;0.2" dur="0.4s" repeatCount="indefinite" />
          </circle>
        </>
      )}

      {/* Body */}
      <circle
        cx={bodyCx}
        cy={bodyCy}
        r={radius}
        fill="#1a1a1a"
        stroke={isSelected ? "#3b82f6" : "#333"}
        strokeWidth={isSelected ? 1.5 : 0.8}
      />
      {/* Inner ring */}
      <circle cx={bodyCx} cy={bodyCy} r={radius - 3} fill="none" stroke="#333" strokeWidth={0.5} />
      {/* Sound hole */}
      <circle cx={bodyCx} cy={bodyCy} r={3} fill="#2a2a2a" stroke="#444" strokeWidth={0.3} />
      {/* + marking on the body */}
      <text x={bodyCx - 5} y={bodyCy - radius + 6} fontSize={4} fill="#666" fontFamily="monospace">+</text>

      {/* Pin labels */}
      <PinLabel x={pinPos.x} y={pinPos.y} name="+" side="right" />
      <PinLabel x={pinNeg.x} y={pinNeg.y} name="-" side="right" />
    </g>
  );
}

function PotentiometerRenderer({ component, isSelected }: { component: BoardComponent; isSelected: boolean }) {
  // Resolve pin positions from the footprint so rotation is honored
  // (footprint is rotated by rotateFootprint when component.rotation != 0).
  const footprint = getComponentFootprint(
    component.type,
    component.y,
    component.x,
    component.rotation,
    component.properties,
  );
  const pts = footprint.points;
  const pinVcc = gridToPixel(pts[0] ?? { row: component.y, col: component.x });
  const pinSignal = gridToPixel(pts[1] ?? { row: component.y + 1, col: component.x });
  const pinGnd = gridToPixel(pts[2] ?? { row: component.y + 2, col: component.x });
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

/** Render a single 5×8 CGRAM custom character as tiny SVG rects. */
function CgramChar({ charData, x, y, cellW, cellH }: {
  charData: number[]; x: number; y: number; cellW: number; cellH: number
}) {
  const pixW = cellW / 5;
  const pixH = cellH / 8;
  const rects: React.ReactNode[] = [];
  for (let row = 0; row < 8; row++) {
    const bits = charData[row] ?? 0;
    for (let col = 0; col < 5; col++) {
      if ((bits >> (4 - col)) & 1) {
        rects.push(
          <rect
            key={`${row}-${col}`}
            x={x + col * pixW}
            y={y + row * pixH}
            width={pixW - 0.1}
            height={pixH - 0.1}
            fill="#065f46"
          />,
        );
      }
    }
  }
  return <>{rects}</>;
}

function LcdRenderer({ component, isSelected, libraryState }: { component: BoardComponent; isSelected: boolean; libraryState?: LibraryState }) {
  // Vertical 6-pin header: rs/en/d4/d5/d6/d7 each on its own row.
  const pins = [0, 1, 2, 3, 4, 5].map(i =>
    gridToPixel({ row: component.y + i, col: component.x }),
  );
  const pinTop = pins[0];
  const pinBot = pins[5];

  // Display body sits to the LEFT of the pin column.
  const bodyW = 60;
  const bodyH = 34;
  const bodyCx = pinTop.x - bodyW / 2 - 10;
  const bodyCy = (pinTop.y + pinBot.y) / 2;

  // Read LCD state from library state
  const lcdState = libraryState?.lcd;
  const line1 = lcdState?.textBuffer[0] ?? "";
  const line2 = lcdState?.textBuffer[1] ?? "";
  const hasText = line1.trim().length > 0 || line2.trim().length > 0;

  const backlightOn = lcdState?.backlight ?? true;
  const displayOn = lcdState?.displayOn ?? true;
  const cursorVisible = lcdState?.cursorVisible ?? false;
  const cursorBlink = lcdState?.cursorBlink ?? false;
  const cursorCol = lcdState?.cursorCol ?? 0;
  const cursorRow = lcdState?.cursorRow ?? 0;
  const cgram = lcdState?.cgram;
  const cols = lcdState?.cols ?? 16;

  const displayAreaX = bodyCx - bodyW / 2 + 4;
  const displayAreaY = bodyCy - bodyH / 2 + 4;
  const displayWidth = bodyW - 8;
  const displayHeight = bodyH - 8;

  const bodyGradId = `lcd-body-${component.id}`;
  const blinkAnimId = `lcd-blink-${component.id}`;

  // Display background color depends on backlight state
  const displayBg = backlightOn ? "#a7f3d0" : "#3d6b5a";
  const textColor = backlightOn ? "#065f46" : "#2a4a3d";

  const cellW = (displayWidth - 2) / cols;
  const cellH = (displayHeight - 4) / 2;

  const pinNames = ["rs", "en", "d4", "d5", "d6", "d7"];

  // Determine visible cursor position relative to scroll offset
  const scrollOffset = lcdState?.scrollOffset ?? 0;
  const visibleCursorCol = cursorCol - scrollOffset;
  const cursorInView = visibleCursorCol >= 0 && visibleCursorCol < cols
    && cursorRow >= 0 && cursorRow < (lcdState?.rows ?? 2);

  /** Render a single row of characters, handling CGRAM chars (code 0–7). */
  function renderRow(text: string, rowIndex: number) {
    const nodes: React.ReactNode[] = [];
    const rowY = displayAreaY + 2 + rowIndex * (cellH + 1);
    for (let i = 0; i < cols; i++) {
      const code = text.charCodeAt(i);
      const cellX = displayAreaX + 1 + i * cellW;
      if (code >= 0 && code <= 7 && cgram && cgram[code]) {
        // Custom CGRAM character — render as pixel grid
        nodes.push(
          <CgramChar
            key={i}
            charData={cgram[code]}
            x={cellX}
            y={rowY}
            cellW={cellW - 0.4}
            cellH={cellH}
          />,
        );
      }
      // Normal printable characters are handled by the <text> element below
    }
    return nodes;
  }

  /** Get printable text for a row (replace CGRAM codes 0–7 with spaces so they don't render as glyphs). */
  function printableText(text: string): string {
    let result = "";
    for (let i = 0; i < Math.min(text.length, cols); i++) {
      const code = text.charCodeAt(i);
      result += (code >= 0 && code <= 7) ? " " : text[i];
    }
    return result;
  }

  return (
    <g>
      <defs>
        <linearGradient id={bodyGradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0d7a5f" />
          <stop offset="100%" stopColor="#042f22" />
        </linearGradient>
      </defs>

      {/* Pin hole indicators + header strip */}
      {pins.map((pin, i) => (
        <g key={i}>
          <circle cx={pin.x} cy={pin.y} r={2} fill="#9ca3af" opacity={0.55} />
          <line
            x1={bodyCx + bodyW / 2}
            y1={pin.y}
            x2={pin.x}
            y2={pin.y}
            stroke="#c0c0c0"
            strokeWidth={1.2}
            strokeLinecap="round"
          />
          <PinLabel x={pin.x} y={pin.y} name={pinNames[i]} side="right" />
        </g>
      ))}

      {/* PCB body shadow */}
      <rect x={bodyCx - bodyW / 2 + 1} y={bodyCy - bodyH / 2 + 1.5}
        width={bodyW} height={bodyH} rx={2} fill="#00000055" />

      {/* PCB body */}
      <rect
        x={bodyCx - bodyW / 2}
        y={bodyCy - bodyH / 2}
        width={bodyW}
        height={bodyH}
        rx={2}
        fill={`url(#${bodyGradId})`}
        stroke={isSelected ? "#3b82f6" : "#022f22"}
        strokeWidth={isSelected ? 1.5 : 0.8}
      />

      {/* LCD display window */}
      <rect
        x={displayAreaX}
        y={displayAreaY}
        width={displayWidth}
        height={displayHeight}
        rx={1}
        fill={displayBg}
        stroke="#065f46"
        strokeWidth={0.4}
      />

      {displayOn && hasText ? (
        <>
          {/* Line 1 — printable text */}
          <text
            x={displayAreaX + 2}
            y={displayAreaY + 6}
            fontSize={4.5}
            fill={textColor}
            fontFamily="monospace"
            dominantBaseline="middle"
          >
            {printableText(line1)}
          </text>
          {/* Line 1 — CGRAM custom chars */}
          {renderRow(line1, 0)}

          {/* Line 2 — printable text */}
          <text
            x={displayAreaX + 2}
            y={displayAreaY + displayHeight - 3}
            fontSize={4.5}
            fill={textColor}
            fontFamily="monospace"
            dominantBaseline="middle"
          >
            {printableText(line2)}
          </text>
          {/* Line 2 — CGRAM custom chars */}
          {renderRow(line2, 1)}
        </>
      ) : displayOn ? (
        <>
          {/* Text grid placeholder */}
          {Array.from({ length: cols }, (_, i) => (
            <rect
              key={i}
              x={displayAreaX + 1 + i * cellW}
              y={displayAreaY + 2}
              width={cellW - 0.4}
              height={cellH}
              fill={textColor}
              opacity={0.12}
            />
          ))}
          {Array.from({ length: cols }, (_, i) => (
            <rect
              key={`b${i}`}
              x={displayAreaX + 1 + i * cellW}
              y={displayAreaY + 2 + cellH + 1}
              width={cellW - 0.4}
              height={cellH}
              fill={textColor}
              opacity={0.12}
            />
          ))}
        </>
      ) : null}

      {/* Cursor underline */}
      {displayOn && cursorVisible && cursorInView && (
        <line
          x1={displayAreaX + 1 + visibleCursorCol * cellW}
          y1={displayAreaY + 2 + cursorRow * (cellH + 1) + cellH - 0.5}
          x2={displayAreaX + 1 + visibleCursorCol * cellW + cellW - 0.4}
          y2={displayAreaY + 2 + cursorRow * (cellH + 1) + cellH - 0.5}
          stroke={textColor}
          strokeWidth={0.6}
        />
      )}

      {/* Blinking block cursor */}
      {displayOn && cursorBlink && cursorInView && (
        <rect
          x={displayAreaX + 1 + visibleCursorCol * cellW}
          y={displayAreaY + 2 + cursorRow * (cellH + 1)}
          width={cellW - 0.4}
          height={cellH}
          fill={textColor}
        >
          <animate
            id={blinkAnimId}
            attributeName="opacity"
            values="1;1;0;0"
            keyTimes="0;0.5;0.5;1"
            dur="1.06s"
            repeatCount="indefinite"
          />
        </rect>
      )}

      {/* Component name */}
      <text x={bodyCx} y={bodyCy + bodyH / 2 + 6} textAnchor="middle"
        fontSize={LABEL_FONT_SIZE} fill="#888" fontFamily="monospace">
        {component.name}
      </text>
    </g>
  );
}

function TemperatureSensorRenderer({ component, isSelected }: { component: BoardComponent; isSelected: boolean }) {
  // Vertical pin layout: vcc at (y, x), signal at (y+1, x), gnd at (y+2, x)
  const pinVcc = gridToPixel({ row: component.y, col: component.x });
  const pinSignal = gridToPixel({ row: component.y + 1, col: component.x });
  const pinGnd = gridToPixel({ row: component.y + 2, col: component.x });

  const temperature = (component.properties.temperature as number) ?? 25;
  // Temperature tint: cold (blue) → neutral → hot (red)
  const tempFraction = Math.max(0, Math.min(1, (temperature + 40) / 165)); // -40..125 → 0..1
  const hot = tempFraction > 0.5;
  const heatAmount = hot ? (tempFraction - 0.5) * 2 : 0;
  const coldAmount = !hot ? (0.5 - tempFraction) * 2 : 0;

  // TO-92 package: rounded top + flat face — offset to the LEFT of the pin column
  const bodyRadius = 8;
  const bodyCx = pinSignal.x - bodyRadius - 6;
  const bodyCy = pinSignal.y;
  const bodyTop = bodyCy - bodyRadius - 1;
  const bodyBot = bodyCy + bodyRadius + 4;

  const bodyGradId = `tmp-body-${component.id}`;
  const hotGlowId = `tmp-hot-${component.id}`;

  return (
    <g>
      <defs>
        {/* TO-92 plastic — dark with rounded shading */}
        <radialGradient id={bodyGradId} cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#404040" />
          <stop offset="50%" stopColor="#1a1a1a" />
          <stop offset="100%" stopColor="#000000" />
        </radialGradient>
        {heatAmount > 0.2 && (
          <filter id={hotGlowId} x="-200%" y="-200%" width="500%" height="500%">
            <feGaussianBlur stdDeviation={1.5 + heatAmount * 2} result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        )}
      </defs>

      {/* Pin hole indicators */}
      <circle cx={pinVcc.x} cy={pinVcc.y} r={2} fill="#ef4444" opacity={0.6} />
      <circle cx={pinSignal.x} cy={pinSignal.y} r={2} fill="#fbbf24" opacity={0.6} />
      <circle cx={pinGnd.x} cy={pinGnd.y} r={2} fill="#42a5f5" opacity={0.6} />

      {/* Bent legs from the body's flat bottom curving right to their pin holes */}
      {[pinVcc, pinSignal, pinGnd].map((pin, i) => {
        const offset = (i - 1) * 2.5;
        const legBase = bodyCx + offset;
        return (
          <path
            key={i}
            d={`M ${legBase} ${bodyBot - 2} Q ${legBase} ${pin.y}, ${pin.x} ${pin.y}`}
            fill="none"
            stroke="#c0c0c0"
            strokeWidth={1.3}
            strokeLinecap="round"
          />
        );
      })}

      {/* Drop shadow */}
      <path
        d={`M ${bodyCx - bodyRadius + 1} ${bodyBot - 1}
            L ${bodyCx - bodyRadius + 1} ${bodyCy + 1}
            A ${bodyRadius} ${bodyRadius} 0 0 1 ${bodyCx + bodyRadius + 1} ${bodyCy + 1}
            L ${bodyCx + bodyRadius + 1} ${bodyBot - 1} Z`}
        fill="#00000055"
      />

      {/* TO-92 body: half-circle top + flat bottom */}
      <path
        d={`M ${bodyCx - bodyRadius} ${bodyBot - 2}
            L ${bodyCx - bodyRadius} ${bodyCy}
            A ${bodyRadius} ${bodyRadius} 0 0 1 ${bodyCx + bodyRadius} ${bodyCy}
            L ${bodyCx + bodyRadius} ${bodyBot - 2} Z`}
        fill={`url(#${bodyGradId})`}
        stroke={isSelected ? "#3b82f6" : "#333"}
        strokeWidth={isSelected ? 1.5 : 0.8}
        filter={heatAmount > 0.2 ? `url(#${hotGlowId})` : undefined}
      />

      {/* Flat-face orientation marker */}
      <line
        x1={bodyCx - bodyRadius * 0.55}
        y1={bodyCy - bodyRadius * 0.5}
        x2={bodyCx + bodyRadius * 0.55}
        y2={bodyCy - bodyRadius * 0.5}
        stroke="#3f3f46"
        strokeWidth={0.6}
      />

      {/* "TMP36" silkscreen label stacked on the flat face */}
      <text x={bodyCx} y={bodyCy - 2} textAnchor="middle" fontSize={3.2} fill="#a3a3a3" fontFamily="monospace" fontWeight="bold">
        TMP
      </text>
      <text x={bodyCx} y={bodyCy + 1.5} textAnchor="middle" fontSize={3.2} fill="#a3a3a3" fontFamily="monospace">
        36
      </text>

      {/* Live temperature readout dot — colour fades blue ↔ red */}
      <circle
        cx={bodyCx}
        cy={bodyCy + 5}
        r={1.6}
        fill={
          hot
            ? `rgb(${Math.round(180 + heatAmount * 75)},${Math.round(50 - heatAmount * 40)},${Math.round(50 - heatAmount * 40)})`
            : `rgb(${Math.round(50 + coldAmount * 30)},${Math.round(150 - coldAmount * 30)},${Math.round(180 + coldAmount * 75)})`
        }
      />

      {/* Heat shimmer lines above the body when hot */}
      {heatAmount > 0.3 && (
        <g opacity={heatAmount * 0.7}>
          {[-3, 0, 3].map((dx, i) => (
            <path
              key={i}
              d={`M ${bodyCx + dx} ${bodyTop - 1} Q ${bodyCx + dx + 2} ${bodyTop - 4}, ${bodyCx + dx} ${bodyTop - 7} T ${bodyCx + dx} ${bodyTop - 12}`}
              fill="none"
              stroke="#fb923c"
              strokeWidth={0.6}
              strokeLinecap="round"
            >
              <animate attributeName="opacity" values="0.2;0.7;0.2" dur={`${1.5 + i * 0.3}s`} repeatCount="indefinite" />
            </path>
          ))}
        </g>
      )}

      {/* Frost crystal hint when cold */}
      {coldAmount > 0.5 && (
        <g opacity={coldAmount * 0.7}>
          {[-4, 0, 4].map((dx, i) => (
            <g key={i}>
              <line x1={bodyCx + dx - 1} y1={bodyTop - 2} x2={bodyCx + dx + 1} y2={bodyTop - 2} stroke="#93c5fd" strokeWidth={0.5} />
              <line x1={bodyCx + dx} y1={bodyTop - 3} x2={bodyCx + dx} y2={bodyTop - 1} stroke="#93c5fd" strokeWidth={0.5} />
            </g>
          ))}
        </g>
      )}

      {/* Live temperature text above the body */}
      <text
        x={bodyCx}
        y={bodyTop - 14}
        textAnchor="middle"
        fontSize={4}
        fill={hot ? "#fb923c" : coldAmount > 0.5 ? "#93c5fd" : "#9ca3af"}
        fontFamily="monospace"
        fontWeight="bold"
      >
        {temperature}°C
      </text>

      {/* Pin labels */}
      <PinLabel x={pinVcc.x} y={pinVcc.y} name="vcc" side="right" />
      <PinLabel x={pinSignal.x} y={pinSignal.y} name="out" side="right" />
      <PinLabel x={pinGnd.x} y={pinGnd.y} name="gnd" side="right" />

      {/* Component name */}
      <text x={pinSignal.x + 8} y={pinGnd.y + 8} textAnchor="start" fontSize={LABEL_FONT_SIZE} fill="#888" fontFamily="monospace">
        {component.name}
      </text>
    </g>
  );
}

function PhotoresistorRenderer({ component, isSelected }: { component: BoardComponent; isSelected: boolean }) {
  // Two vertical pins — body sits to the left
  const pinA = gridToPixel({ row: component.y, col: component.x });
  const pinB = gridToPixel({ row: component.y + 1, col: component.x });

  const light = Math.max(0, Math.min(100, (component.properties.light as number) ?? 50));

  const bodyR = 8;
  const bodyCx = pinA.x - bodyR - 6;
  const bodyCy = (pinA.y + pinB.y) / 2;

  // CdS pad background colour brightens with light level
  const cdsShade = Math.round(110 + light * 1.1); // 110..220
  const cdsColor = `rgb(${cdsShade},${Math.round(cdsShade * 0.85)},${Math.round(cdsShade * 0.55)})`;
  const cdsDarkEdge = `rgb(${Math.round(cdsShade * 0.5)},${Math.round(cdsShade * 0.4)},${Math.round(cdsShade * 0.25)})`;

  const bodyGradId = `ldr-body-${component.id}`;
  const cdsGradId = `ldr-cds-${component.id}`;
  const glowId = `ldr-glow-${component.id}`;

  // Zigzag serpentine path for the CdS element — classic LDR pattern.
  // Draw a horizontal serpentine that fills the top of the body.
  const padW = bodyR * 1.4;
  const padH = bodyR * 1.1;
  const padL = bodyCx - padW / 2;
  const padT = bodyCy - padH / 2;
  const zigStep = padW / 6;
  const zigTop = padT + 1.5;
  const zigBot = padT + padH - 1.5;
  let zigPath = `M ${padL + zigStep * 0.5} ${zigTop}`;
  for (let i = 0; i < 6; i++) {
    const xp = padL + zigStep * (0.5 + i);
    const y1 = i % 2 === 0 ? zigBot : zigTop;
    const y2 = i % 2 === 0 ? zigTop : zigBot;
    zigPath += ` L ${xp} ${y1} L ${xp + zigStep * 0.5} ${y2}`;
  }

  return (
    <g>
      <defs>
        {/* Ceramic disk body */}
        <radialGradient id={bodyGradId} cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#fef3c7" />
          <stop offset="60%" stopColor="#fbbf24" />
          <stop offset="100%" stopColor="#92400e" />
        </radialGradient>
        {/* CdS pad gradient — brightens with light */}
        <radialGradient id={cdsGradId} cx="45%" cy="40%" r="65%">
          <stop offset="0%" stopColor={cdsColor} />
          <stop offset="100%" stopColor={cdsDarkEdge} />
        </radialGradient>
        {light > 60 && (
          <filter id={glowId} x="-200%" y="-200%" width="500%" height="500%">
            <feGaussianBlur stdDeviation={0.8 + (light - 60) / 40 * 2} result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        )}
      </defs>

      {/* Pin hole indicators */}
      <circle cx={pinA.x} cy={pinA.y} r={2} fill="#fbbf24" opacity={0.6} />
      <circle cx={pinB.x} cy={pinB.y} r={2} fill="#fbbf24" opacity={0.6} />

      {/* Light rays when bright */}
      {light > 40 && (
        <g opacity={(light - 40) / 60}>
          {[-55, -30, 0, 30, 55].map((angle, i) => {
            const rad = ((angle - 90) * Math.PI) / 180;
            const inner = bodyR + 2;
            const outer = bodyR + 7 + (light - 40) / 60 * 5;
            return (
              <line
                key={i}
                x1={bodyCx + Math.cos(rad) * inner}
                y1={bodyCy + Math.sin(rad) * inner}
                x2={bodyCx + Math.cos(rad) * outer}
                y2={bodyCy + Math.sin(rad) * outer}
                stroke="#fde047"
                strokeWidth={0.9}
                strokeLinecap="round"
              >
                <animate attributeName="opacity" values="0.3;0.9;0.3" dur={`${1.8 + i * 0.15}s`} repeatCount="indefinite" />
              </line>
            );
          })}
        </g>
      )}

      {/* Leads from bottom of body to pins */}
      <path d={`M ${bodyCx - 3} ${bodyCy + bodyR - 1} Q ${bodyCx - 3} ${pinA.y}, ${pinA.x} ${pinA.y}`}
        fill="none" stroke="#c0c0c0" strokeWidth={1.3} strokeLinecap="round" />
      <path d={`M ${bodyCx + 3} ${bodyCy + bodyR - 1} Q ${bodyCx + 3} ${pinB.y}, ${pinB.x} ${pinB.y}`}
        fill="none" stroke="#c0c0c0" strokeWidth={1.3} strokeLinecap="round" />

      {/* Drop shadow under body */}
      <circle cx={bodyCx + 0.8} cy={bodyCy + 1} r={bodyR} fill="#00000050" />

      {/* Ceramic body disk */}
      <circle cx={bodyCx} cy={bodyCy} r={bodyR}
        fill={`url(#${bodyGradId})`}
        stroke={isSelected ? "#3b82f6" : "#78350f"}
        strokeWidth={isSelected ? 1.5 : 0.8} />

      {/* Inner ring — the rim of the CdS well */}
      <circle cx={bodyCx} cy={bodyCy} r={bodyR - 1.2} fill="none" stroke="#78350f" strokeWidth={0.4} opacity={0.6} />

      {/* CdS pad (the light-sensitive square in the middle) */}
      <rect x={padL} y={padT} width={padW} height={padH} rx={1}
        fill={`url(#${cdsGradId})`}
        stroke={cdsDarkEdge}
        strokeWidth={0.4}
        filter={light > 60 ? `url(#${glowId})` : undefined} />

      {/* Serpentine gold trace on top of the CdS pad */}
      <path d={zigPath}
        fill="none"
        stroke="#fde047"
        strokeWidth={0.55}
        strokeLinecap="round"
        opacity={0.85} />

      {/* Specular highlight on ceramic body */}
      <ellipse cx={bodyCx - bodyR * 0.35} cy={bodyCy - bodyR * 0.55}
        rx={bodyR * 0.3} ry={bodyR * 0.18}
        fill="#ffffff" opacity={0.5} />

      {/* Light level readout */}
      <text x={bodyCx} y={bodyCy - bodyR - 4} textAnchor="middle" fontSize={4}
        fill={light > 50 ? "#fde047" : "#9ca3af"} fontFamily="monospace" fontWeight="bold">
        {light}%
      </text>

      {/* Pin labels */}
      <PinLabel x={pinA.x} y={pinA.y} name="a" side="right" />
      <PinLabel x={pinB.x} y={pinB.y} name="b" side="right" />

      {/* Component name */}
      <text x={pinB.x + 8} y={pinB.y + 8} textAnchor="start" fontSize={LABEL_FONT_SIZE} fill="#888" fontFamily="monospace">
        {component.name}
      </text>
    </g>
  );
}

function UltrasonicSensorRenderer({ component, isSelected }: { component: BoardComponent; isSelected: boolean }) {
  // Vertical 4-pin layout: vcc / trig / echo / gnd
  const pins = [0, 1, 2, 3].map(i =>
    gridToPixel({ row: component.y + i, col: component.x }),
  );
  const pinTop = pins[0];
  const pinBot = pins[3];

  const distance = Math.max(2, Math.min(400, (component.properties.distance as number) ?? 50));
  const ringColor = distance < 15 ? "#ef4444" : distance < 60 ? "#fbbf24" : "#22d3ee";

  // PCB body sits to the LEFT of the pin column.
  const pcbW = 48;
  const pcbH = (pinBot.y - pinTop.y) + 20;
  const pcbCx = pinTop.x - pcbW / 2 - 10;
  const pcbCy = (pinTop.y + pinBot.y) / 2;
  const pcbL = pcbCx - pcbW / 2;
  const pcbT = pcbCy - pcbH / 2;

  // Two stacked transducer "eyes" — T on top, R below (vertical layout)
  const eyeR = 8;
  const eyeX = pcbCx - 2;
  const eyeTy = pcbCy - eyeR - 3;
  const eyeBy = pcbCy + eyeR + 3;

  const pcbGradId = `us-pcb-${component.id}`;
  const eyeTGradId = `us-eyeT-${component.id}`;
  const eyeBGradId = `us-eyeB-${component.id}`;

  const pinNames = ["vcc", "trg", "ech", "gnd"];

  return (
    <g>
      <defs>
        <linearGradient id={pcbGradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1e40af" />
          <stop offset="50%" stopColor="#1e3a8a" />
          <stop offset="100%" stopColor="#172554" />
        </linearGradient>
        <radialGradient id={eyeTGradId} cx="35%" cy="35%" r="75%">
          <stop offset="0%" stopColor="#e5e7eb" />
          <stop offset="30%" stopColor="#9ca3af" />
          <stop offset="70%" stopColor="#4b5563" />
          <stop offset="100%" stopColor="#1f2937" />
        </radialGradient>
        <radialGradient id={eyeBGradId} cx="35%" cy="35%" r="75%">
          <stop offset="0%" stopColor="#e5e7eb" />
          <stop offset="30%" stopColor="#9ca3af" />
          <stop offset="70%" stopColor="#4b5563" />
          <stop offset="100%" stopColor="#1f2937" />
        </radialGradient>
      </defs>

      {/* Pin hole indicators + leads into body */}
      {pins.map((pin, i) => (
        <g key={i}>
          <circle cx={pin.x} cy={pin.y} r={2} fill="#c0c0c0" opacity={0.55} />
          <line
            x1={pcbL + pcbW}
            y1={pin.y}
            x2={pin.x}
            y2={pin.y}
            stroke="#c0c0c0"
            strokeWidth={1.2}
            strokeLinecap="round"
          />
          <PinLabel x={pin.x} y={pin.y} name={pinNames[i]} side="right" />
        </g>
      ))}

      {/* Drop shadow */}
      <rect x={pcbL + 1} y={pcbT + 1.5} width={pcbW} height={pcbH} rx={2} fill="#00000060" />

      {/* PCB body */}
      <rect x={pcbL} y={pcbT} width={pcbW} height={pcbH} rx={2}
        fill={`url(#${pcbGradId})`}
        stroke={isSelected ? "#3b82f6" : "#0c1e4f"}
        strokeWidth={isSelected ? 1.5 : 0.8} />

      {/* Corner solder pads */}
      {[[pcbL + 2.5, pcbT + 2.5], [pcbL + pcbW - 2.5, pcbT + 2.5], [pcbL + 2.5, pcbT + pcbH - 2.5], [pcbL + pcbW - 2.5, pcbT + pcbH - 2.5]].map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r={0.8} fill="#b08d57" opacity={0.7} />
      ))}

      {/* Silkscreen label — sideways on the right edge of the PCB */}
      <text x={pcbL + pcbW - 4} y={pcbT + 5} textAnchor="end" fontSize={2.5}
        fill="#93c5fd" fontFamily="monospace">HC-SR04</text>
      <text x={pcbL + pcbW - 4} y={pcbT + 8.5} textAnchor="end" fontSize={2.2}
        fill="#60a5fa" fontFamily="monospace">40kHz</text>

      {/* Small crystal oscillator between the two eyes */}
      <rect x={eyeX - 2} y={pcbCy - 1.5} width={4} height={3} rx={0.4}
        fill="#9ca3af" stroke="#4b5563" strokeWidth={0.3} />

      {/* === Top eye: TRIGGER (T) === */}
      {/* Ping wave rings radiating out of the trigger eye to the LEFT */}
      {[0, 1, 2].map(i => (
        <circle
          key={i}
          cx={eyeX}
          cy={eyeTy}
          r={eyeR + 2}
          fill="none"
          stroke={ringColor}
          strokeWidth={0.8}
          opacity={0.5}
        >
          <animate attributeName="r" values={`${eyeR + 2};${eyeR + 14};${eyeR + 2}`} dur="2.5s" begin={`${i * 0.8}s`} repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.6;0;0.6" dur="2.5s" begin={`${i * 0.8}s`} repeatCount="indefinite" />
        </circle>
      ))}

      <circle cx={eyeX} cy={eyeTy} r={eyeR}
        fill={`url(#${eyeTGradId})`}
        stroke="#0f172a" strokeWidth={0.6} />
      <circle cx={eyeX} cy={eyeTy} r={eyeR - 1.5} fill="none" stroke="#1f2937" strokeWidth={0.4} />
      <circle cx={eyeX} cy={eyeTy} r={eyeR - 3} fill="none" stroke="#1f2937" strokeWidth={0.3} opacity={0.7} />
      <line x1={eyeX - eyeR + 1} y1={eyeTy} x2={eyeX + eyeR - 1} y2={eyeTy} stroke="#1f2937" strokeWidth={0.3} opacity={0.6} />
      <line x1={eyeX} y1={eyeTy - eyeR + 1} x2={eyeX} y2={eyeTy + eyeR - 1} stroke="#1f2937" strokeWidth={0.3} opacity={0.6} />
      <text x={eyeX + eyeR + 2} y={eyeTy + 1} fontSize={3} fill="#dbeafe" fontFamily="monospace" fontWeight="bold">T</text>

      {/* === Bottom eye: ECHO (R) === */}
      {/* Incoming echo dashed lines from the LEFT */}
      {[0, 1].map(i => (
        <g key={i} opacity={0.5}>
          <line
            x1={eyeX - eyeR - 12}
            y1={eyeBy}
            x2={eyeX - eyeR - 2}
            y2={eyeBy}
            stroke={ringColor}
            strokeWidth={0.8}
            strokeDasharray="1.5 1"
          >
            <animate attributeName="opacity" values="0;0.8;0" dur="2.5s" begin={`${0.8 + i * 0.8}s`} repeatCount="indefinite" />
          </line>
        </g>
      ))}

      <circle cx={eyeX} cy={eyeBy} r={eyeR}
        fill={`url(#${eyeBGradId})`}
        stroke="#0f172a" strokeWidth={0.6} />
      <circle cx={eyeX} cy={eyeBy} r={eyeR - 1.5} fill="none" stroke="#1f2937" strokeWidth={0.4} />
      <circle cx={eyeX} cy={eyeBy} r={eyeR - 3} fill="none" stroke="#1f2937" strokeWidth={0.3} opacity={0.7} />
      <line x1={eyeX - eyeR + 1} y1={eyeBy} x2={eyeX + eyeR - 1} y2={eyeBy} stroke="#1f2937" strokeWidth={0.3} opacity={0.6} />
      <line x1={eyeX} y1={eyeBy - eyeR + 1} x2={eyeX} y2={eyeBy + eyeR - 1} stroke="#1f2937" strokeWidth={0.3} opacity={0.6} />
      <text x={eyeX + eyeR + 2} y={eyeBy + 1} fontSize={3} fill="#dbeafe" fontFamily="monospace" fontWeight="bold">R</text>

      {/* Distance readout — above the PCB */}
      <text x={pcbCx} y={pcbT - 3} textAnchor="middle" fontSize={4.2}
        fill={ringColor} fontFamily="monospace" fontWeight="bold">
        {distance} cm
      </text>

      {/* Component name — below the PCB */}
      <text x={pcbCx} y={pcbT + pcbH + 6} textAnchor="middle"
        fontSize={LABEL_FONT_SIZE} fill="#888" fontFamily="monospace">
        {component.name}
      </text>
    </g>
  );
}

function IrReceiverRenderer({ component, isSelected }: { component: BoardComponent; isSelected: boolean }) {
  // Vertical 3-pin layout (row..row+2, col): out / gnd / vcc
  const pins = [0, 1, 2].map(i =>
    gridToPixel({ row: component.y + i, col: component.x }),
  );
  const pinTop = pins[0];
  const pinBot = pins[2];

  // "Just received" flash — based on the pendingCodeAt timestamp set by the inspector
  const pendingCodeAt = (component.properties.pendingCodeAt as number) ?? 0;
  const pendingCode = (component.properties.pendingCode as string) ?? "";
  const sinceReceive = Date.now() - pendingCodeAt;
  const justReceived = sinceReceive >= 0 && sinceReceive < 400;

  // TSOP38238 body sits to the LEFT of the pin column.
  const bodyW = 14;
  const bodyH = (pinBot.y - pinTop.y) + 10;
  const lensR = 5;
  const bodyCx = pinTop.x - bodyW / 2 - 8;
  const bodyCy = (pinTop.y + pinBot.y) / 2;

  const bodyGradId = `ir-body-${component.id}`;
  const lensGradId = `ir-lens-${component.id}`;
  const glowId = `ir-glow-${component.id}`;

  const pinNames = ["out", "gnd", "vcc"];
  const pinColors = ["#dc2626", "#6b7280", "#3b82f6"];

  return (
    <g>
      <defs>
        {/* Epoxy package — glossy black */}
        <linearGradient id={bodyGradId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#2a2a2a" />
          <stop offset="40%" stopColor="#0a0a0a" />
          <stop offset="100%" stopColor="#1a1a1a" />
        </linearGradient>
        {/* Lens: smoky dark red translucent dome */}
        <radialGradient id={lensGradId} cx="35%" cy="30%" r="80%">
          <stop offset="0%" stopColor="#7f1d1d" stopOpacity={0.95} />
          <stop offset="60%" stopColor="#450a0a" stopOpacity={0.95} />
          <stop offset="100%" stopColor="#1c0303" stopOpacity={1} />
        </radialGradient>
        {justReceived && (
          <filter id={glowId} x="-300%" y="-300%" width="700%" height="700%">
            <feGaussianBlur stdDeviation={2.5} result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        )}
      </defs>

      {/* Pin hole indicators + horizontal leads into body */}
      {pins.map((pin, i) => (
        <g key={i}>
          <circle cx={pin.x} cy={pin.y} r={2} fill={pinColors[i]} opacity={0.55} />
          <line
            x1={bodyCx + bodyW / 2}
            y1={pin.y}
            x2={pin.x}
            y2={pin.y}
            stroke="#c0c0c0"
            strokeWidth={1.3}
            strokeLinecap="round"
          />
          <PinLabel x={pin.x} y={pin.y} name={pinNames[i]} side="right" />
        </g>
      ))}

      {/* Incoming IR burst — ripple lines from the LEFT when code received */}
      {justReceived && (
        <g opacity={1 - sinceReceive / 400}>
          {[0, 1, 2, 3].map(i => (
            <path
              key={i}
              d={`M ${bodyCx - bodyW / 2 - lensR - 8 - i * 3} ${bodyCy - 8} Q ${bodyCx - bodyW / 2 - lensR - 11 - i * 3} ${bodyCy}, ${bodyCx - bodyW / 2 - lensR - 8 - i * 3} ${bodyCy + 8}`}
              fill="none"
              stroke="#dc2626"
              strokeWidth={1}
              strokeLinecap="round"
              opacity={0.8 - i * 0.2}
            />
          ))}
          {/* Small IR source icon (the "remote") */}
          <rect x={bodyCx - bodyW / 2 - lensR - 22} y={bodyCy - 3} width={4} height={6} rx={0.6}
            fill="#374151" stroke="#6b7280" strokeWidth={0.4} />
          <circle cx={bodyCx - bodyW / 2 - lensR - 20} cy={bodyCy} r={0.8} fill="#dc2626" />
        </g>
      )}

      {/* Drop shadow */}
      <rect x={bodyCx - bodyW / 2 + 0.8} y={bodyCy - bodyH / 2 + 1.2}
        width={bodyW} height={bodyH} rx={1.2} fill="#00000055" />

      {/* TSOP body */}
      <rect x={bodyCx - bodyW / 2} y={bodyCy - bodyH / 2}
        width={bodyW} height={bodyH} rx={1.2}
        fill={`url(#${bodyGradId})`}
        stroke={isSelected ? "#3b82f6" : "#000"}
        strokeWidth={isSelected ? 1.5 : 0.8} />

      {/* Left bevel highlight */}
      <rect x={bodyCx - bodyW / 2 + 0.8} y={bodyCy - bodyH / 2 + 1}
        width={0.8} height={bodyH - 2} fill="#ffffff" opacity={0.12} />

      {/* Red dome lens — sticks out to the LEFT (facing outward) */}
      <circle cx={bodyCx - bodyW / 2 + lensR * 0.2}
        cy={bodyCy}
        r={lensR}
        fill={`url(#${lensGradId})`}
        stroke={justReceived ? "#ef4444" : "#450a0a"}
        strokeWidth={justReceived ? 1 : 0.5}
        filter={justReceived ? `url(#${glowId})` : undefined} />
      {/* Lens specular highlight */}
      <ellipse
        cx={bodyCx - bodyW / 2 + lensR * 0.2 - lensR * 0.35}
        cy={bodyCy - lensR * 0.3}
        rx={lensR * 0.18}
        ry={lensR * 0.3}
        fill="#ffffff"
        opacity={0.45}
      />

      {/* TSOP silkscreen — vertical text */}
      <text x={bodyCx + bodyW / 2 - 2} y={bodyCy + 2} textAnchor="end"
        fontSize={2.3} fill="#6b7280" fontFamily="monospace"
        transform={`rotate(-90 ${bodyCx + bodyW / 2 - 2} ${bodyCy + 2})`}>
        TSOP
      </text>

      {/* Received code flash — to the left of the lens */}
      {justReceived && pendingCode && (
        <text
          x={bodyCx - bodyW / 2 - lensR - 2}
          y={bodyCy - bodyH / 2 - 2}
          textAnchor="end"
          fontSize={3.5}
          fill="#f87171"
          fontFamily="monospace"
          fontWeight="bold"
        >
          0x{pendingCode.toUpperCase()}
        </text>
      )}

      {/* Component name — below the body */}
      <text x={bodyCx} y={bodyCy + bodyH / 2 + 6} textAnchor="middle"
        fontSize={LABEL_FONT_SIZE}
        fill={justReceived ? "#f87171" : "#888"} fontFamily="monospace">
        {component.name}{justReceived ? " • RX" : ""}
      </text>
    </g>
  );
}

function NeoPixelRenderer({ component, isSelected }: { component: BoardComponent; isSelected: boolean }) {
  // Vertical 3-pin layout: din / 5v / gnd (row..row+2, col)
  const pins = [0, 1, 2].map(i =>
    gridToPixel({ row: component.y + i, col: component.x }),
  );
  const pinTop = pins[0];
  const pinBot = pins[2];

  const numLeds = (component.properties.numLeds as number) ?? 8;
  const displayLeds = Math.min(numLeds, 8);

  // Strip body sits to the LEFT of the pin column.
  const stripW = 48;
  const stripH = 14;
  const stripCx = pinTop.x - stripW / 2 - 8;
  const stripCy = (pinTop.y + pinBot.y) / 2;
  const stripL = stripCx - stripW / 2;
  const stripT = stripCy - stripH / 2;

  const colors = ["#ef4444", "#22c55e", "#3b82f6", "#eab308", "#a855f7", "#f97316", "#06b6d4", "#ec4899"];

  const pinNames = ["din", "5v", "gnd"];
  const pinColors = ["#a855f7", "#ef4444", "#6b7280"];

  return (
    <g>
      {/* Pin hole indicators + leads from body to the pins */}
      {pins.map((pin, i) => (
        <g key={i}>
          <circle cx={pin.x} cy={pin.y} r={2} fill={pinColors[i]} opacity={0.55} />
          <line
            x1={stripL + stripW}
            y1={pin.y}
            x2={pin.x}
            y2={pin.y}
            stroke="#c0c0c0"
            strokeWidth={1.2}
            strokeLinecap="round"
          />
          <PinLabel x={pin.x} y={pin.y} name={pinNames[i]} side="right" />
        </g>
      ))}

      {/* PCB shadow */}
      <rect x={stripL + 1} y={stripT + 1} width={stripW} height={stripH}
        rx={1.5} fill="#00000030" />
      {/* PCB strip — black with solder mask green edge */}
      <rect x={stripL} y={stripT} width={stripW} height={stripH}
        rx={1.5} fill="#1a1a1a"
        stroke={isSelected ? "#3b82f6" : "#2a2a2a"}
        strokeWidth={isSelected ? 1.5 : 0.8} />
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
            <rect x={ledX - ledSize / 2 - 0.8} y={stripCy - ledSize / 2 - 0.8}
              width={ledSize + 1.6} height={ledSize + 1.6} rx={0.5}
              fill="#b08d57" opacity={0.4} />
            {/* White LED package */}
            <rect x={ledX - ledSize / 2} y={stripCy - ledSize / 2}
              width={ledSize} height={ledSize} rx={0.5}
              fill="#f5f5f5" stroke="#ddd" strokeWidth={0.3} />
            {/* Colored LED die */}
            <rect x={ledX - ledSize / 2 + 0.8} y={stripCy - ledSize / 2 + 0.8}
              width={ledSize - 1.6} height={ledSize - 1.6} rx={0.3}
              fill={c} opacity={0.85} />
            {/* Corner mark (pin 1 indicator) */}
            <circle cx={ledX - ledSize / 2 + 1} cy={stripCy - ledSize / 2 + 1}
              r={0.4} fill={c} opacity={0.5} />
          </g>
        );
      })}

      {/* Data direction arrow (DIN → DOUT) */}
      <polygon
        points={`${stripL + stripW - 5},${stripCy - 1} ${stripL + stripW - 3},${stripCy} ${stripL + stripW - 5},${stripCy + 1}`}
        fill="#555" opacity={0.6}
      />

      {/* Count badge if more than displayed */}
      {numLeds > 8 && (
        <text x={stripL + stripW - 2} y={stripT - 2}
          textAnchor="end" fontSize={3.5} fill="#888" fontFamily="monospace">
          ×{numLeds}
        </text>
      )}

      <text x={stripCx} y={stripT + stripH + 7} textAnchor="middle"
        fontSize={LABEL_FONT_SIZE} fill="#888" fontFamily="monospace">
        {component.name}
      </text>
    </g>
  );
}

function PirRenderer({ component, isSelected }: { component: BoardComponent; isSelected: boolean }) {
  // Vertical 3-pin layout: vcc / signal / gnd (row..row+2, col)
  const pins = [0, 1, 2].map(i =>
    gridToPixel({ row: component.y + i, col: component.x }),
  );
  const pinTop = pins[0];
  const pinBot = pins[2];
  const motion = (component.properties.motion as boolean) === true;

  // HC-SR501 is roughly 32×24mm with a big white fresnel dome in the center.
  // PCB sits to the LEFT of the pin column.
  const pcbW = 44;
  const pcbH = 30;
  const pcbCx = pinTop.x - pcbW / 2 - 10;
  const pcbCy = (pinTop.y + pinBot.y) / 2;
  const pcbL = pcbCx - pcbW / 2;
  const pcbT = pcbCy - pcbH / 2;
  const domeCx = pcbCx;
  const domeCy = pcbCy;
  const domeR = 10;

  const gradId = `pir-pcb-${component.id}`;
  const domeGradId = `pir-dome-${component.id}`;
  const glowId = `pir-glow-${component.id}`;
  const coneId = `pir-cone-${component.id}`;

  return (
    <g>
      <defs>
        {/* PCB gradient — dark green with slight sheen */}
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0d7a5f" />
          <stop offset="50%" stopColor="#065f46" />
          <stop offset="100%" stopColor="#042f22" />
        </linearGradient>
        {/* Dome gradient — frosted white with subtle blue tint */}
        <radialGradient id={domeGradId} cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity={0.95} />
          <stop offset="45%" stopColor="#f1f5f9" stopOpacity={0.9} />
          <stop offset="100%" stopColor="#cbd5e1" stopOpacity={0.95} />
        </radialGradient>
        {motion && (
          <>
            <filter id={glowId} x="-200%" y="-200%" width="500%" height="500%">
              <feGaussianBlur stdDeviation={2.5} result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <radialGradient id={coneId} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#ef4444" stopOpacity={0.5} />
              <stop offset="70%" stopColor="#ef4444" stopOpacity={0.1} />
              <stop offset="100%" stopColor="#ef4444" stopOpacity={0} />
            </radialGradient>
          </>
        )}
      </defs>

      {/* Pin hole indicators + horizontal header leads going RIGHT into the
          breadboard pin column */}
      {pins.map((pin, i) => (
        <g key={i}>
          <circle cx={pin.x} cy={pin.y} r={2} fill="#9ca3af" opacity={0.55} />
          {/* Header pin block on the right edge of the PCB */}
          <rect x={pcbL + pcbW - 2} y={pin.y - 1.2} width={4} height={2.4}
            rx={0.4} fill="#1a1a1a" />
          {/* Lead from PCB edge into the pin hole */}
          <line
            x1={pcbL + pcbW + 2}
            y1={pin.y}
            x2={pin.x}
            y2={pin.y}
            stroke="#c0c0c0"
            strokeWidth={1.4}
            strokeLinecap="round"
          />
        </g>
      ))}

      {/* PCB shadow */}
      <rect x={pcbL + 1} y={pcbT + 1.5} width={pcbW} height={pcbH} rx={3} fill="#00000040" />

      {/* PCB body */}
      <rect x={pcbL} y={pcbT} width={pcbW} height={pcbH} rx={3}
        fill={`url(#${gradId})`}
        stroke={isSelected ? "#3b82f6" : "#022f22"}
        strokeWidth={isSelected ? 1.5 : 0.8} />

      {/* Silkscreen accent strip around dome hole */}
      <circle cx={domeCx} cy={domeCy} r={domeR + 1.5} fill="none" stroke="#064e3b" strokeWidth={0.6} opacity={0.8} />

      {/* Corner solder pads — little copper dots */}
      {[[pcbL + 3, pcbT + 3], [pcbL + pcbW - 3, pcbT + 3], [pcbL + 3, pcbT + pcbH - 3], [pcbL + pcbW - 3, pcbT + pcbH - 3]].map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r={0.8} fill="#b08d57" opacity={0.7} />
      ))}

      {/* Two sensitivity/delay trimpots — yellow rectangles with slot */}
      <g>
        <rect x={pcbL + 3} y={domeCy - 2} width={4} height={4} rx={0.4} fill="#ca8a04" stroke="#713f12" strokeWidth={0.4} />
        <line x1={pcbL + 3.5} y1={domeCy} x2={pcbL + 6.5} y2={domeCy} stroke="#422006" strokeWidth={0.4} />
        <rect x={pcbL + pcbW - 7} y={domeCy - 2} width={4} height={4} rx={0.4} fill="#ca8a04" stroke="#713f12" strokeWidth={0.4} />
        <line x1={pcbL + pcbW - 6.5} y1={domeCy} x2={pcbL + pcbW - 3.5} y2={domeCy} stroke="#422006" strokeWidth={0.4} />
      </g>

      {/* Motion detection cone (only when triggered) */}
      {motion && (
        <ellipse
          cx={domeCx}
          cy={domeCy}
          rx={domeR + 10}
          ry={domeR + 10}
          fill={`url(#${coneId})`}
        >
          <animate attributeName="rx" values={`${domeR + 6};${domeR + 14};${domeR + 6}`} dur="1.2s" repeatCount="indefinite" />
          <animate attributeName="ry" values={`${domeR + 6};${domeR + 14};${domeR + 6}`} dur="1.2s" repeatCount="indefinite" />
        </ellipse>
      )}

      {/* Dome base ring (metal socket) */}
      <circle cx={domeCx} cy={domeCy} r={domeR + 0.5} fill="#9ca3af" stroke="#4b5563" strokeWidth={0.4} />
      <circle cx={domeCx} cy={domeCy} r={domeR - 0.3} fill="#6b7280" />

      {/* Dome itself */}
      <ellipse cx={domeCx} cy={domeCy - 0.5} rx={domeR - 0.5} ry={domeR - 0.3}
        fill={`url(#${domeGradId})`}
        stroke={motion ? "#ef4444" : "#94a3b8"}
        strokeWidth={motion ? 1 : 0.5}
        filter={motion ? `url(#${glowId})` : undefined} />

      {/* Honeycomb fresnel pattern — concentric hexagonal segments */}
      {[1, 2, 3].map(ring => (
        <circle
          key={ring}
          cx={domeCx}
          cy={domeCy - 0.5}
          r={domeR * ring / 4}
          fill="none"
          stroke="#94a3b8"
          strokeWidth={0.3}
          opacity={0.4}
        />
      ))}
      {/* Cross lines for facet effect */}
      <line x1={domeCx - domeR + 2} y1={domeCy - 0.5} x2={domeCx + domeR - 2} y2={domeCy - 0.5} stroke="#94a3b8" strokeWidth={0.25} opacity={0.4} />
      <line x1={domeCx} y1={domeCy - domeR + 2} x2={domeCx} y2={domeCy + domeR - 2} stroke="#94a3b8" strokeWidth={0.25} opacity={0.4} />
      <line x1={domeCx - domeR * 0.7} y1={domeCy - domeR * 0.7} x2={domeCx + domeR * 0.7} y2={domeCy + domeR * 0.7} stroke="#94a3b8" strokeWidth={0.25} opacity={0.3} />
      <line x1={domeCx + domeR * 0.7} y1={domeCy - domeR * 0.7} x2={domeCx - domeR * 0.7} y2={domeCy + domeR * 0.7} stroke="#94a3b8" strokeWidth={0.25} opacity={0.3} />

      {/* Specular highlight on dome */}
      <ellipse
        cx={domeCx - domeR * 0.35}
        cy={domeCy - domeR * 0.45}
        rx={domeR * 0.3}
        ry={domeR * 0.2}
        fill="#ffffff"
        opacity={0.6}
      />

      {/* Red motion dot when triggered */}
      {motion && (
        <circle cx={domeCx} cy={domeCy - 0.5} r={1.6} fill="#ef4444">
          <animate attributeName="opacity" values="1;0.4;1" dur="0.7s" repeatCount="indefinite" />
        </circle>
      )}

      {/* Pin labels on the right of each vertical hole */}
      {(["vcc", "sig", "gnd"] as const).map((name, i) => (
        <PinLabel key={name} x={pins[i].x} y={pins[i].y} name={name} side="right" />
      ))}

      {/* Component label below the PCB */}
      <text x={pcbCx} y={pcbT + pcbH + 6} textAnchor="middle" fontSize={LABEL_FONT_SIZE} fill={motion ? "#f87171" : "#888"} fontFamily="monospace">
        {component.name}{motion ? " • MOTION" : ""}
      </text>
    </g>
  );
}

function SevenSegmentRenderer({ component, components, pinStates, wires, isSelected }: {
  component: BoardComponent;
  components?: BoardComponent[];
  pinStates: PinState[];
  wires?: Record<string, Wire>;
  isSelected: boolean;
}) {
  // Vertical 9-pin layout: a/b/c/d/e/f/g/dp/gnd each on its own row (row..row+8, col)
  const pins = [0, 1, 2, 3, 4, 5, 6, 7, 8].map(i =>
    gridToPixel({ row: component.y + i, col: component.x }),
  );
  const pinTop = pins[0];
  const pinBot = pins[8];

  const w = 34;
  const h = (pinBot.y - pinTop.y) + 12;
  // Display body sits to the RIGHT of the pin column, offset by 3 breadboard holes.
  const x = pinTop.x + w / 2 + (HOLE_SPACING * 3);
  const y = (pinTop.y + pinBot.y) / 2;

  const segOnColor = "#ff3030";
  const segOffColor = "#2a0a0a";

  // Strict mode: segment lighting is resolved from physical wiring only.
  // We intentionally do not trust component.pins here.
  const signalSegments = ["a", "b", "c", "d", "e", "f", "g", "dp"] as const;
  const pinLabels = [...signalSegments, "gnd"] as const;
  const footprint = getComponentFootprint(
    component.type,
    component.y,
    component.x,
    component.rotation,
    component.properties,
  );
  const segmentPoints = footprint.points.slice(0, signalSegments.length);
  const lit: Record<(typeof signalSegments)[number], boolean> = {
    a: false, b: false, c: false, d: false, e: false, f: false, g: false, dp: false,
  };

  if (wires) {
    const segmentPins = new Map<(typeof signalSegments)[number], Set<number>>();
    for (const seg of signalSegments) segmentPins.set(seg, new Set<number>());
    const arduinoWires = Object.values(wires).filter(
      (wire) => wire.fromRow === -999 && wire.fromCol >= 0 && wire.fromCol <= MAX_ARDUINO_PIN,
    );

    const pinsAtPoint = (point: { row: number; col: number }): Set<number> => {
      const pins = new Set<number>();
      for (const wire of arduinoWires) {
        const arduinoPin = wire.fromCol;
        const wireTo = { row: wire.toRow, col: wire.toCol };
        if (areConnected(wireTo, point)) {
          pins.add(arduinoPin);
        }
      }
      return pins;
    };

    // Direct mapping: Arduino wire terminates on the same bus as a segment pin.
    for (const wire of arduinoWires) {
      const arduinoPin = wire.fromCol;
      const wireTo = { row: wire.toRow, col: wire.toCol };
      for (let i = 0; i < segmentPoints.length; i++) {
        const segmentPoint = segmentPoints[i];
        if (!segmentPoint) continue;
        if (areConnected(wireTo, segmentPoint)) {
          const seg = signalSegments[i];
          segmentPins.get(seg)?.add(arduinoPin);
        }
      }
    }

    // Resistor path mapping: Arduino -> resistor -> segment.
    // This captures the standard safe seven-segment wiring style.
    if (components) {
      for (const other of components) {
        if (other.type !== "resistor") continue;
        const fp = getComponentFootprint(
          other.type,
          other.y,
          other.x,
          other.rotation,
          other.properties,
        );
        const endA = fp.points[0];
        const endB = fp.points[1];
        if (!endA || !endB) continue;

        const pinsOnA = pinsAtPoint(endA);
        const pinsOnB = pinsAtPoint(endB);

        for (let i = 0; i < segmentPoints.length; i++) {
          const segmentPoint = segmentPoints[i];
          if (!segmentPoint) continue;
          const seg = signalSegments[i];

          if (areConnected(segmentPoint, endA)) {
            for (const pin of pinsOnB) segmentPins.get(seg)?.add(pin);
          }
          if (areConnected(segmentPoint, endB)) {
            for (const pin of pinsOnA) segmentPins.get(seg)?.add(pin);
          }
        }
      }
    }

    for (const seg of signalSegments) {
      const pinsForSegment = segmentPins.get(seg);
      if (!pinsForSegment || pinsForSegment.size === 0) continue;
      for (const pin of pinsForSegment) {
        const state = pinStates[pin];
        if (!state || state.mode !== "OUTPUT") continue;
        if (state.digitalValue === 1 || state.pwmValue > 0) {
          lit[seg] = true;
          break;
        }
      }
    }
  }

  // Beveled segment geometry — trapezoid shapes give authentic display look.
  // Segment layout (inside the red window):
  //   ┌─a─┐
  //   f   b
  //   ├─g─┤
  //   e   c
  //   └─d─┘
  const windowPad = 5;
  const wx = x - w / 2 + windowPad;
  const wy = y - h / 2 + windowPad;
  const ww = w - windowPad * 2 - 3; // leave room for DP on right
  const wh = h - windowPad * 2;

  const segLen = ww - 4;
  const segH = (wh - 6) / 2 - 1;
  const segThick = 2.8;
  const bevel = 1.2;

  // Horizontal segment: pointy trapezoid
  const horizSeg = (cx: number, cy: number): string => {
    const half = segLen / 2;
    return [
      `M ${cx - half + bevel} ${cy - segThick / 2}`,
      `L ${cx + half - bevel} ${cy - segThick / 2}`,
      `L ${cx + half} ${cy}`,
      `L ${cx + half - bevel} ${cy + segThick / 2}`,
      `L ${cx - half + bevel} ${cy + segThick / 2}`,
      `L ${cx - half} ${cy}`,
      `Z`,
    ].join(" ");
  };
  // Vertical segment: pointy trapezoid
  const vertSeg = (cx: number, cy: number): string => {
    const half = segH / 2;
    return [
      `M ${cx - segThick / 2} ${cy - half + bevel}`,
      `L ${cx - segThick / 2} ${cy + half - bevel}`,
      `L ${cx} ${cy + half}`,
      `L ${cx + segThick / 2} ${cy + half - bevel}`,
      `L ${cx + segThick / 2} ${cy - half + bevel}`,
      `L ${cx} ${cy - half}`,
      `Z`,
    ].join(" ");
  };

  const midX = wx + ww / 2;
  const topRowY = wy + 2 + segH / 2;
  const botRowY = wy + wh - 2 - segH / 2;
  const leftX = wx + segThick / 2;
  const rightX = wx + ww - segThick / 2;
  const topY = wy + 1;
  const midY = wy + wh / 2;
  const botY = wy + wh - 1;

  const paths = {
    a: horizSeg(midX, topY),
    b: vertSeg(rightX, topRowY),
    c: vertSeg(rightX, botRowY),
    d: horizSeg(midX, botY),
    e: vertSeg(leftX, botRowY),
    f: vertSeg(leftX, topRowY),
    g: horizSeg(midX, midY),
  } as const;
  const dpX = wx + ww + 2.6;
  const dpY = botY;

  const housingGradId = `seg-housing-${component.id}`;
  const windowGradId = `seg-window-${component.id}`;
  const glowId = `seg-glow-${component.id}`;

  return (
    <g>
      <defs>
        {/* Housing gradient — glossy black plastic */}
        <linearGradient id={housingGradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2a2a2a" />
          <stop offset="50%" stopColor="#0a0a0a" />
          <stop offset="100%" stopColor="#1a1a1a" />
        </linearGradient>
        {/* Red smoky window behind segments */}
        <radialGradient id={windowGradId} cx="50%" cy="50%" r="60%">
          <stop offset="0%" stopColor="#1a0606" />
          <stop offset="100%" stopColor="#0a0202" />
        </radialGradient>
        <filter id={glowId} x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation={1.2} result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Pin hole indicators + horizontal leads from the body to each pin */}
      {pins.map((pin, i) => (
        <g key={i}>
          <circle cx={pin.x} cy={pin.y} r={2} fill="#9ca3af" opacity={0.55} />
          <line
            x1={x + w / 2}
            y1={pin.y}
            x2={pin.x}
            y2={pin.y}
            stroke="#c0c0c0"
            strokeWidth={1.1}
            strokeLinecap="round"
          />
          <PinLabel x={pin.x} y={pin.y} name={pinLabels[i]} side="right" />
        </g>
      ))}

      {/* Drop shadow */}
      <rect x={x - w / 2 + 1} y={y - h / 2 + 1.5} width={w} height={h} rx={2} fill="#00000060" />

      {/* Housing */}
      <rect x={x - w / 2} y={y - h / 2} width={w} height={h} rx={2}
        fill={`url(#${housingGradId})`}
        stroke={isSelected ? "#3b82f6" : "#000"}
        strokeWidth={isSelected ? 1.5 : 0.8} />

      {/* Top bevel highlight */}
      <rect x={x - w / 2 + 1} y={y - h / 2 + 1} width={w - 2} height={1} fill="#ffffff" opacity={0.1} />

      {/* Red display window */}
      <rect x={wx - 1} y={wy - 1} width={ww + 2} height={wh + 2} rx={1}
        fill={`url(#${windowGradId})`} stroke="#000" strokeWidth={0.4} />

      {/* Faint ghost lines for unlit segments so the "8" shape is always visible */}
      {(Object.keys(paths) as Array<keyof typeof paths>).map(seg => (
        <path key={`ghost-${seg}`} d={paths[seg]} fill={segOffColor} opacity={0.9} />
      ))}
      <circle cx={dpX} cy={dpY} r={1.5} fill={segOffColor} opacity={0.9} />

      {/* Lit segments on top with glow */}
      {(Object.keys(paths) as Array<keyof typeof paths>).map(seg => lit[seg] && (
        <g key={seg} filter={`url(#${glowId})`}>
          <path d={paths[seg]} fill={segOnColor} />
          <path d={paths[seg]} fill="#ffffff" opacity={0.25} />
        </g>
      ))}
      {lit.dp && (
        <g filter={`url(#${glowId})`}>
          <circle cx={dpX} cy={dpY} r={1.5} fill={segOnColor} />
        </g>
      )}

      {/* Decimal point */}
      <circle cx={rightX + 3} cy={botY - 0.5} r={1.2} fill={segOffColor} />

      {/* Component label */}
      <text x={x} y={y + h / 2 + 6} textAnchor="middle" fontSize={LABEL_FONT_SIZE} fill="#888" fontFamily="monospace">
        {component.name}
      </text>
    </g>
  );
}

function RelayRenderer({ component, pinStates, isSelected }: {
  component: BoardComponent;
  pinStates: PinState[];
  isSelected: boolean;
}) {
  // Vertical 3-pin layout: vcc / signal / gnd (row..row+2, col)
  const pins = [0, 1, 2].map(i =>
    gridToPixel({ row: component.y + i, col: component.x }),
  );
  const pinTop = pins[0];
  const pinBot = pins[2];
  // PCB sits to the LEFT of the pin column
  const pcbW = 42;
  const pcbH = 36;
  const pcbCx = pinTop.x - pcbW / 2 - 8;
  const pcbCy = (pinTop.y + pinBot.y) / 2;
  const pcbL = pcbCx - pcbW / 2;
  const pcbT = pcbCy - pcbH / 2;
  const x = pcbCx;
  const y = pcbT;

  // Read signal pin state: HIGH = energized (active-high module)
  const signalPin = component.pins.signal;
  const energized =
    signalPin != null && pinStates[signalPin]?.digitalValue === 1;

  // Relay cube (the blue SRD-05VDC-SL-C) sits in the lower-right of the PCB
  const cubeW = 20;
  const cubeH = 18;
  const cubeL = pcbL + 4;
  const cubeT = pcbT + 10;

  // Terminal block (green with 3 screw terminals) on the left edge
  const tbW = 10;
  const tbH = 22;
  const tbL = pcbL + pcbW - tbW - 2;
  const tbT = pcbT + 8;

  // Status LED position
  const ledX = pcbL + 6;
  const ledY = pcbT + 5;
  const ledColor = energized ? "#22c55e" : "#1f2937";
  const ledRim = energized ? "#86efac" : "#4b5563";

  const pcbGradId = `relay-pcb-${component.id}`;
  const cubeGradId = `relay-cube-${component.id}`;
  const termGradId = `relay-term-${component.id}`;
  const glowId = `relay-glow-${component.id}`;

  return (
    <g>
      <defs>
        {/* PCB: blue FR4 with slight gradient */}
        <linearGradient id={pcbGradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1e40af" />
          <stop offset="50%" stopColor="#1e3a8a" />
          <stop offset="100%" stopColor="#172554" />
        </linearGradient>
        {/* Relay cube: the iconic blue SRD-05VDC body */}
        <linearGradient id={cubeGradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3b82f6" />
          <stop offset="30%" stopColor="#2563eb" />
          <stop offset="100%" stopColor="#1e3a8a" />
        </linearGradient>
        {/* Green terminal block */}
        <linearGradient id={termGradId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#15803d" />
          <stop offset="50%" stopColor="#22c55e" />
          <stop offset="100%" stopColor="#166534" />
        </linearGradient>
        {energized && (
          <filter id={glowId} x="-200%" y="-200%" width="500%" height="500%">
            <feGaussianBlur stdDeviation={1.5} result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        )}
      </defs>

      {/* PCB shadow */}
      <rect x={pcbL + 1} y={pcbT + 1.5} width={pcbW} height={pcbH} rx={2} fill="#00000060" />

      {/* PCB body */}
      <rect x={pcbL} y={pcbT} width={pcbW} height={pcbH} rx={2}
        fill={`url(#${pcbGradId})`}
        stroke={isSelected ? "#3b82f6" : "#0c1e4f"}
        strokeWidth={isSelected ? 1.5 : 0.8} />

      {/* Mounting holes (corners) */}
      {[[pcbL + 3, pcbT + 3], [pcbL + pcbW - 3, pcbT + 3], [pcbL + 3, pcbT + pcbH - 3], [pcbL + pcbW - 3, pcbT + pcbH - 3]].map(([cx, cy], i) => (
        <g key={i}>
          <circle cx={cx} cy={cy} r={1.2} fill="#cbd5e1" />
          <circle cx={cx} cy={cy} r={0.6} fill="#0f172a" />
        </g>
      ))}

      {/* Silkscreen label at top */}
      <text x={x - 4} y={pcbT + 6} fontSize={2.8} fill="#dbeafe" fontFamily="monospace">RELAY 1CH</text>

      {/* Status LED */}
      <circle cx={ledX} cy={ledY} r={2.2} fill={ledRim} />
      <circle cx={ledX} cy={ledY} r={1.5} fill={ledColor}
        filter={energized ? `url(#${glowId})` : undefined} />
      {energized && (
        <circle cx={ledX - 0.4} cy={ledY - 0.5} r={0.5} fill="#ffffff" opacity={0.7} />
      )}

      {/* Green terminal block with 3 screw terminals (NO / COM / NC) */}
      <rect x={tbL} y={tbT} width={tbW} height={tbH} rx={0.8}
        fill={`url(#${termGradId})`}
        stroke="#064e3b" strokeWidth={0.5} />
      {/* Screw slots */}
      {[0, 1, 2].map(i => {
        const sy = tbT + 4 + i * 7;
        return (
          <g key={i}>
            <circle cx={tbL + tbW / 2} cy={sy} r={2} fill="#9ca3af" stroke="#374151" strokeWidth={0.4} />
            <circle cx={tbL + tbW / 2} cy={sy} r={1.4} fill="#6b7280" />
            <line x1={tbL + tbW / 2 - 1.2} y1={sy} x2={tbL + tbW / 2 + 1.2} y2={sy}
              stroke="#1f2937" strokeWidth={0.5} />
          </g>
        );
      })}

      {/* Relay cube body */}
      <rect x={cubeL + 1} y={cubeT + 1.5} width={cubeW} height={cubeH} rx={0.8} fill="#00000050" />
      <rect x={cubeL} y={cubeT} width={cubeW} height={cubeH} rx={0.8}
        fill={`url(#${cubeGradId})`}
        stroke="#0c1e4f" strokeWidth={0.6} />

      {/* Top face of cube (perspective hint) */}
      <path
        d={`M ${cubeL} ${cubeT} L ${cubeL + 2} ${cubeT - 1.5} L ${cubeL + cubeW + 2} ${cubeT - 1.5} L ${cubeL + cubeW} ${cubeT} Z`}
        fill="#60a5fa"
        opacity={0.85}
      />

      {/* Cube label — SRD-05VDC style */}
      <text x={cubeL + cubeW / 2} y={cubeT + 5} textAnchor="middle" fontSize={2.8} fill="#dbeafe" fontFamily="monospace" fontWeight="bold">
        SRD-05
      </text>
      <text x={cubeL + cubeW / 2} y={cubeT + 9} textAnchor="middle" fontSize={2.3} fill="#bfdbfe" fontFamily="monospace">
        VDC-SL-C
      </text>
      {/* Small clicking line with state indicator */}
      <line
        x1={cubeL + 3}
        y1={cubeT + cubeH - 3}
        x2={cubeL + cubeW - 3}
        y2={cubeT + cubeH - 3}
        stroke={energized ? "#fbbf24" : "#1e3a8a"}
        strokeWidth={0.8}
        strokeLinecap="round"
      />
      <text x={cubeL + cubeW / 2} y={cubeT + cubeH - 0.5} textAnchor="middle" fontSize={2} fill="#93c5fd" fontFamily="monospace">
        {energized ? "CLOSED" : "OPEN"}
      </text>

      {/* Pin leads from PCB edge to actual breadboard pin holes */}
      {pins.map((p, i) => (
        <g key={i}>
          <line x1={pcbL + pcbW} y1={p.y} x2={p.x} y2={p.y} stroke="#c0c0c0" strokeWidth={1.3} strokeLinecap="round" />
          <rect x={pcbL + pcbW - 1} y={p.y - 1} width={2} height={2} fill="#1a1a1a" />
          <circle cx={p.x} cy={p.y} r={1.8} fill="#a0a0a0" opacity={0.5} />
        </g>
      ))}

      <PinLabel x={pins[0].x} y={pins[0].y} name="vcc" side="right" />
      <PinLabel x={pins[1].x} y={pins[1].y} name="sig" side="right" />
      <PinLabel x={pins[2].x} y={pins[2].y} name="gnd" side="right" />

      <text x={pcbCx} y={pcbT + pcbH + 7} textAnchor="middle" fontSize={LABEL_FONT_SIZE} fill={energized ? "#86efac" : "#888"} fontFamily="monospace">
        {component.name}{energized ? " • ON" : ""}
      </text>
    </g>
  );
}

function DcMotorRenderer({ component, pinStates, isSelected }: {
  component: BoardComponent;
  pinStates: PinState[];
  isSelected: boolean;
}) {
  const { x, y } = gridToPixel({ row: component.y, col: component.x });
  const radius = KNOB_RADIUS + 3;

  // Read PWM or digital value from signal pin — duty cycle drives spin speed
  const signalPin = component.pins.signal;
  const pinState = signalPin != null ? pinStates[signalPin] : undefined;
  const duty = pinState
    ? pinState.isPwm
      ? pinState.pwmValue / 255
      : pinState.digitalValue
    : 0;
  const isSpinning = duty > 0.01;
  // Period: 0.8s at full speed → 3s at 10% duty
  const spinPeriod = isSpinning ? (0.8 + (1 - duty) * 2.2).toFixed(2) : "0";

  const caseGradId = `motor-case-${component.id}`;
  const innerGradId = `motor-inner-${component.id}`;
  const shaftGradId = `motor-shaft-${component.id}`;
  const glowId = `motor-glow-${component.id}`;

  return (
    <g>
      <defs>
        {/* Metal case — brushed silver with darker edges */}
        <radialGradient id={caseGradId} cx="35%" cy="35%" r="70%">
          <stop offset="0%" stopColor="#9ca3af" />
          <stop offset="50%" stopColor="#6b7280" />
          <stop offset="100%" stopColor="#374151" />
        </radialGradient>
        {/* Inner recess — dark but with a slight metallic hint */}
        <radialGradient id={innerGradId} cx="40%" cy="35%" r="75%">
          <stop offset="0%" stopColor="#4b5563" />
          <stop offset="60%" stopColor="#1f2937" />
          <stop offset="100%" stopColor="#0f172a" />
        </radialGradient>
        {/* Brass shaft */}
        <linearGradient id={shaftGradId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#78716c" />
          <stop offset="50%" stopColor="#d6d3d1" />
          <stop offset="100%" stopColor="#78716c" />
        </linearGradient>
        {isSpinning && (
          <filter id={glowId} x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation={0.8} result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        )}
      </defs>

      {/* Drop shadow beneath body */}
      <ellipse cx={x} cy={y + radius + 0.5} rx={radius - 1} ry={2} fill="#00000060" />

      {/* Terminal tabs on top of the case */}
      <rect x={x - 5} y={y - radius - 3} width={2.5} height={4} rx={0.4} fill="#c0c0c0" stroke="#525252" strokeWidth={0.3} />
      <rect x={x + 2.5} y={y - radius - 3} width={2.5} height={4} rx={0.4} fill="#c0c0c0" stroke="#525252" strokeWidth={0.3} />

      {/* Shaft (sticks out the top) */}
      <rect x={x - 1.3} y={y - radius - 8} width={2.6} height={8} rx={0.5}
        fill={`url(#${shaftGradId})`} stroke="#44403c" strokeWidth={0.3} />

      {/* Motor case — main cylinder */}
      <circle cx={x} cy={y} r={radius}
        fill={`url(#${caseGradId})`}
        stroke={isSelected ? "#3b82f6" : "#1f2937"}
        strokeWidth={isSelected ? 1.5 : 0.8} />

      {/* Crimp ring (where the case is rolled closed) */}
      <circle cx={x} cy={y} r={radius - 1} fill="none" stroke="#1f2937" strokeWidth={0.4} opacity={0.6} />

      {/* Ventilation slot — arc on the side */}
      <path
        d={`M ${x - radius + 3} ${y - 2} A ${radius - 3} ${radius - 3} 0 0 0 ${x - radius + 3} ${y + 2}`}
        fill="none" stroke="#0f172a" strokeWidth={1} opacity={0.8}
      />
      <path
        d={`M ${x + radius - 3} ${y - 2} A ${radius - 3} ${radius - 3} 0 0 1 ${x + radius - 3} ${y + 2}`}
        fill="none" stroke="#0f172a" strokeWidth={1} opacity={0.8}
      />

      {/* Inner recess — shows the rotor when viewed head-on */}
      <circle cx={x} cy={y} r={radius - 3} fill={`url(#${innerGradId})`} stroke="#0f172a" strokeWidth={0.4} />

      {/* Rotor / armature: three "poles" that spin */}
      <g filter={isSpinning ? `url(#${glowId})` : undefined}>
        {isSpinning ? (
          <g>
            {/* Spinning rotor — 3-armed spoke */}
            <g>
              {[0, 120, 240].map((angle, i) => {
                const rad = (angle * Math.PI) / 180;
                const x2 = x + Math.cos(rad) * (radius - 4);
                const y2 = y + Math.sin(rad) * (radius - 4);
                return (
                  <line
                    key={i}
                    x1={x}
                    y1={y}
                    x2={x2}
                    y2={y2}
                    stroke="#fbbf24"
                    strokeWidth={1.4}
                    strokeLinecap="round"
                    opacity={0.9}
                  />
                );
              })}
              <circle cx={x} cy={y} r={1.5} fill="#fbbf24" />
              <animateTransform
                attributeName="transform"
                attributeType="XML"
                type="rotate"
                from={`0 ${x} ${y}`}
                to={`360 ${x} ${y}`}
                dur={`${spinPeriod}s`}
                repeatCount="indefinite"
              />
            </g>
          </g>
        ) : (
          <g>
            {/* Static rotor when stopped */}
            {[0, 120, 240].map((angle, i) => {
              const rad = (angle * Math.PI) / 180;
              const x2 = x + Math.cos(rad) * (radius - 4);
              const y2 = y + Math.sin(rad) * (radius - 4);
              return (
                <line
                  key={i}
                  x1={x}
                  y1={y}
                  x2={x2}
                  y2={y2}
                  stroke="#6b7280"
                  strokeWidth={1.2}
                  strokeLinecap="round"
                  opacity={0.7}
                />
              );
            })}
            <circle cx={x} cy={y} r={1.5} fill="#9ca3af" />
          </g>
        )}
      </g>

      {/* Motor embossed "M" label (above the case, small) */}
      <text x={x} y={y + radius + 4} textAnchor="middle" fontSize={3.5} fill="#9ca3af" fontFamily="monospace" fontWeight="bold">
        MOTOR
      </text>

      {/* Duty readout */}
      {isSpinning && (
        <text x={x} y={y + radius + 10} textAnchor="middle" fontSize={3.5} fill="#fbbf24" fontFamily="monospace">
          {Math.round(duty * 100)}% • {spinPeriod}s
        </text>
      )}

      {/* Signal pin header below */}
      <line x1={x} y1={y + radius + 12} x2={x} y2={y + radius + 17} stroke="#c0c0c0" strokeWidth={1.3} strokeLinecap="round" />

      <PinLabel x={x} y={y + radius + 17} name="signal" side="below" />
      <text x={x} y={y + radius + 23} textAnchor="middle" fontSize={LABEL_FONT_SIZE} fill="#888" fontFamily="monospace">
        {component.name}
      </text>
    </g>
  );
}

function DhtSensorRenderer({ component, isSelected }: { component: BoardComponent; isSelected: boolean }) {
  // Vertical 3-pin layout: vcc / data / gnd (row..row+2, col)
  const pinVcc  = gridToPixel({ row: component.y,     col: component.x });
  const pinData = gridToPixel({ row: component.y + 1, col: component.x });
  const pinGnd  = gridToPixel({ row: component.y + 2, col: component.x });

  // DHT11 blue rectangular housing, body sits to the LEFT of the pin column.
  // Real DHT11: ~15.5 mm wide × 12 mm tall. With HOLE_SPACING=14 (≈2.54mm),
  // that's roughly 4 cells × 3 cells — matching the declared footprint.
  const bW  = HOLE_SPACING * 3.7;   // ~52 px
  const bH  = HOLE_SPACING * 2.8;   // ~39 px
  const bodyCx = pinData.x - bW / 2 - 10;
  const bodyCy = pinData.y;
  const bL  = bodyCx - bW / 2;
  const bT  = bodyCy - bH / 2;

  // Sensing grille area (top 45% of front face)
  const grilleT = bT + 4;
  const grilleH = bH * 0.45;
  const grilleL = bL + 4;
  const grilleW = bW - 8;
  // Label area (bottom portion)
  const labelT = grilleT + grilleH + 3;

  const bodyGradId  = `dht-body-${component.id}`;
  const faceGradId  = `dht-face-${component.id}`;
  const grilleMask  = `dht-grille-${component.id}`;

  return (
    <g>
      <defs>
        {/* Blue housing — darker at edges, lighter in centre */}
        <linearGradient id={bodyGradId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%"   stopColor="#0e4f72" />
          <stop offset="40%"  stopColor="#1a7ca8" />
          <stop offset="100%" stopColor="#0a3d5a" />
        </linearGradient>
        {/* Lighter sheen on the grille face */}
        <linearGradient id={faceGradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#2596be" />
          <stop offset="100%" stopColor="#0e6d93" />
        </linearGradient>
        {/* Clip mask so vent holes don't bleed outside the grille rect */}
        <clipPath id={grilleMask}>
          <rect x={grilleL} y={grilleT} width={grilleW} height={grilleH} />
        </clipPath>
      </defs>

      {/* Pin leads from body right edge to breadboard holes */}
      {[pinVcc, pinData, pinGnd].map((pin, i) => (
        <g key={i}>
          <line
            x1={bL + bW} y1={pin.y}
            x2={pin.x}   y2={pin.y}
            stroke="#c8c8c8" strokeWidth={1.3} strokeLinecap="round"
          />
          <circle cx={pin.x} cy={pin.y} r={2} fill="#b0b0b0" opacity={0.55} />
        </g>
      ))}

      {/* Drop shadow */}
      <rect x={bL + 1} y={bT + 2} width={bW} height={bH} rx={2} fill="#00000050" />

      {/* Housing body */}
      <rect x={bL} y={bT} width={bW} height={bH} rx={2}
        fill={`url(#${bodyGradId})`}
        stroke={isSelected ? "#3b82f6" : "#0a3a55"}
        strokeWidth={isSelected ? 1.5 : 0.7} />

      {/* Grille background (slightly lighter blue) */}
      <rect x={grilleL} y={grilleT} width={grilleW} height={grilleH} rx={1}
        fill={`url(#${faceGradId})`} />

      {/* Vent hole grid — 6 columns × 4 rows of rounded rect perforations */}
      <g clipPath={`url(#${grilleMask})`}>
        {Array.from({ length: 4 }, (_, row) =>
          Array.from({ length: 6 }, (_, col) => {
            const hx = grilleL + 3 + col * ((grilleW - 6) / 5);
            const hy = grilleT + 2.5 + row * ((grilleH - 5) / 3);
            return (
              <rect
                key={`${row}-${col}`}
                x={hx - 2.4} y={hy - 1.6}
                width={4.8} height={3.2}
                rx={1.2}
                fill="#06374d"
                opacity={0.88}
              />
            );
          })
        )}
      </g>

      {/* Thin separator line between grille and label area */}
      <line
        x1={bL + 2} y1={grilleT + grilleH + 1}
        x2={bL + bW - 2} y2={grilleT + grilleH + 1}
        stroke="#0a3a55" strokeWidth={0.5} opacity={0.7}
      />

      {/* Silkscreen text: part number + manufacturer */}
      <text x={bodyCx} y={labelT + 5} textAnchor="middle"
        fontSize={5} fill="#a5e8f7" fontFamily="monospace" fontWeight="bold">
        DHT11
      </text>
      <text x={bodyCx} y={labelT + 11} textAnchor="middle"
        fontSize={3.4} fill="#5bc8e2" fontFamily="monospace">
        AOSONG
      </text>

      {/* Highlight specular on top-left of body */}
      <path
        d={`M ${bL + 2} ${bT + 5} Q ${bL + 3} ${bT + 2}, ${bL + 8} ${bT + 2}`}
        fill="none" stroke="#60c8e8" strokeWidth={0.6} opacity={0.4} strokeLinecap="round"
      />

      {/* Pin labels */}
      <PinLabel x={pinVcc.x}  y={pinVcc.y}  name="vcc"  side="right" />
      <PinLabel x={pinData.x} y={pinData.y} name="data" side="right" />
      <PinLabel x={pinGnd.x}  y={pinGnd.y}  name="gnd"  side="right" />

      {/* Component name */}
      <text x={bodyCx} y={bT + bH + 6} textAnchor="middle"
        fontSize={LABEL_FONT_SIZE} fill="#888" fontFamily="monospace">
        {component.name}
      </text>
    </g>
  );
}

function ShiftRegisterRenderer({ component, isSelected }: { component: BoardComponent; isSelected: boolean }) {
  // DIP-16 footprint: 8 pins left side (col 2), 8 pins right side (col 7)
  // Pins ordered: left side rows 0-7 from top, right side rows 7-0 (mirrored)
  const rowCount = 8; // pins per side
  const leftPins  = Array.from({ length: rowCount }, (_, i) =>
    gridToPixel({ row: component.y + i, col: 2 }),
  );
  const rightPins = Array.from({ length: rowCount }, (_, i) =>
    gridToPixel({ row: component.y + (rowCount - 1 - i), col: 7 }),
  );

  const topLeft    = leftPins[0];
  const bottomLeft = leftPins[rowCount - 1];
  const topRight   = rightPins[0];  // highest row on right = row 7 (bottom)

  // IC body spans between the two pin columns, with small margin
  const legLen = 4; // length of the flat gull-wing leg stub
  const bodyL = topLeft.x + legLen;
  const bodyR = topRight.x - legLen;
  const bodyW = bodyR - bodyL;
  const bodyT = topLeft.y - HOLE_SPACING / 2;
  const bodyH = (rowCount - 1) * HOLE_SPACING + HOLE_SPACING;

  const bodyCx = bodyL + bodyW / 2;

  const bodyGradId   = `sr-body-${component.id}`;
  const legGradId    = `sr-leg-${component.id}`;
  const notchId      = `sr-notch-${component.id}`;

  return (
    <g>
      <defs>
        {/* Black epoxy body — glossy highlight down the centre */}
        <linearGradient id={bodyGradId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%"   stopColor="#111111" />
          <stop offset="30%"  stopColor="#2a2a2a" />
          <stop offset="50%"  stopColor="#333333" />
          <stop offset="70%"  stopColor="#1e1e1e" />
          <stop offset="100%" stopColor="#0d0d0d" />
        </linearGradient>
        {/* Silver tin-plated legs */}
        <linearGradient id={legGradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#d4d4d4" />
          <stop offset="50%"  stopColor="#a8a8a8" />
          <stop offset="100%" stopColor="#888888" />
        </linearGradient>
        {/* Clip for notch cutout */}
        <clipPath id={notchId}>
          <rect x={bodyL - 1} y={bodyT - 1} width={bodyW + 2} height={bodyH + 2} />
        </clipPath>
      </defs>

      {/* Left-side legs: horizontal stubs from body to pin holes */}
      {leftPins.map((pin, i) => (
        <g key={`ll-${i}`}>
          {/* Flat leg extending from body left edge toward pin hole */}
          <rect
            x={pin.x - 0.5} y={pin.y - 1}
            width={bodyL - pin.x + 0.5} height={2}
            fill={`url(#${legGradId})`} rx={0.3}
          />
          {/* Pin hole marker */}
          <circle cx={pin.x} cy={pin.y} r={1.8} fill="#a0a0a0" opacity={0.5} />
        </g>
      ))}

      {/* Right-side legs */}
      {rightPins.map((pin, i) => (
        <g key={`rl-${i}`}>
          <rect
            x={bodyR - 0.5} y={pin.y - 1}
            width={pin.x - bodyR + 0.5} height={2}
            fill={`url(#${legGradId})`} rx={0.3}
          />
          <circle cx={pin.x} cy={pin.y} r={1.8} fill="#a0a0a0" opacity={0.5} />
        </g>
      ))}

      {/* Drop shadow */}
      <rect x={bodyL + 1} y={bodyT + 2} width={bodyW} height={bodyH} rx={1} fill="#00000060" />

      {/* IC body */}
      <rect x={bodyL} y={bodyT} width={bodyW} height={bodyH} rx={1}
        fill={`url(#${bodyGradId})`}
        stroke={isSelected ? "#3b82f6" : "#444"}
        strokeWidth={isSelected ? 1.5 : 0.7} />

      {/* Top edge bevel — thin lighter band */}
      <rect x={bodyL + 0.5} y={bodyT + 0.5} width={bodyW - 1} height={1.5}
        fill="#3a3a3a" rx={0.5} opacity={0.8} />
      {/* Bottom edge bevel */}
      <rect x={bodyL + 0.5} y={bodyT + bodyH - 2} width={bodyW - 1} height={1.5}
        fill="#3a3a3a" rx={0.5} opacity={0.8} />

      {/* Pin 1 notch — semicircular indentation at top centre */}
      <path
        d={`M ${bodyCx - 4} ${bodyT} A 4 4 0 0 0 ${bodyCx + 4} ${bodyT}`}
        fill="#0d0d0d"
        stroke="#555" strokeWidth={0.5}
      />

      {/* Pin 1 dot — top-left corner of body */}
      <circle cx={bodyL + 4} cy={bodyT + 5} r={1.2} fill="#5a8a5a" opacity={0.9} />

      {/* Silkscreen text — two lines centred on body */}
      <text x={bodyCx} y={bodyT + bodyH / 2 - 3} textAnchor="middle"
        fontSize={4} fill="#c8c8c8" fontFamily="monospace" fontWeight="bold">
        74HC595
      </text>
      <text x={bodyCx} y={bodyT + bodyH / 2 + 3.5} textAnchor="middle"
        fontSize={2.8} fill="#909090" fontFamily="monospace">
        SN74HC595N
      </text>
      {/* Manufacturer dot / date code area */}
      <text x={bodyCx} y={bodyT + bodyH / 2 + 9} textAnchor="middle"
        fontSize={2.4} fill="#606060" fontFamily="monospace">
        TI  2023
      </text>

      {/* Left-side pin index marks (1..8) */}
      {leftPins.map((pin, i) => (
        <text key={`ln-${i}`}
          x={bodyL + 2.5} y={pin.y + 1.2}
          textAnchor="start" fontSize={2.2}
          fill="#666" fontFamily="monospace">
          {i + 1}
        </text>
      ))}
      {/* Right-side pin index marks (16..9) */}
      {rightPins.map((pin, i) => (
        <text key={`rn-${i}`}
          x={bodyR - 2.5} y={pin.y + 1.2}
          textAnchor="end" fontSize={2.2}
          fill="#666" fontFamily="monospace">
          {rowCount * 2 - i}
        </text>
      ))}

      {/* Component name label below */}
      <text x={bodyCx} y={bodyT + bodyH + 6} textAnchor="middle"
        fontSize={LABEL_FONT_SIZE} fill="#888" fontFamily="monospace">
        {component.name}
      </text>
    </g>
  );
}

function OledRenderer({ component, isSelected, libraryState }: { component: BoardComponent; isSelected: boolean; libraryState?: LibraryState }) {
  const oled = libraryState?.oled?.[component.id];
  // Vertical 4-pin header: gnd / vcc / scl / sda (row..row+3, col)
  const pins = [0, 1, 2, 3].map(i =>
    gridToPixel({ row: component.y + i, col: component.x }),
  );
  const pinTop = pins[0];
  const pinBot = pins[3];

  // PCB body (navy/dark-blue) sits to the LEFT of the pin column.
  // Real SSD1306 0.96" module: ~27mm × 27mm PCB, ~21mm × 11mm display area.
  const w = 60;
  const h = (pinBot.y - pinTop.y) + 16;
  const bodyCx = pinTop.x - w / 2 - 10;
  const bodyCy = (pinTop.y + pinBot.y) / 2;
  const bodyL = bodyCx - w / 2;
  const bodyT = bodyCy - h / 2;

  // 4-pin header row sits along the RIGHT edge of the PCB
  const headerX = bodyL + w;   // right edge of PCB = pin header column

  // Display glass occupies the top ~60% of the PCB, centred
  const dispMarL = 4;
  const dispMarT = 5;
  const dispMarR = 4;
  const dispMarB = Math.round(h * 0.38);  // leave ~38% at bottom for labels/traces
  const screenL = bodyL + dispMarL;
  const screenT = bodyT + dispMarT;
  const screenW = w - dispMarL - dispMarR;
  const screenH = h - dispMarT - dispMarB;

  // Glass bezel (slightly larger than active area)
  const bezelInset = 1;
  const activeL = screenL + bezelInset;
  const activeT = screenT + bezelInset;
  const activeW = screenW - bezelInset * 2;
  const activeH = screenH - bezelInset * 2;

  const pinNames = ["GND", "VCC", "SCL", "SDA"];

  const pcbGradId    = `oled-pcb-${component.id}`;
  const screenGradId = `oled-screen-${component.id}`;
  const glassGradId  = `oled-glass-${component.id}`;

  return (
    <g>
      <defs>
        {/* Navy blue PCB */}
        <linearGradient id={pcbGradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#1c2d54" />
          <stop offset="50%"  stopColor="#162245" />
          <stop offset="100%" stopColor="#0d1730" />
        </linearGradient>
        {/* OLED panel — very deep black with a faint blue-teal glow */}
        <linearGradient id={screenGradId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%"   stopColor="#020408" />
          <stop offset="100%" stopColor="#040c14" />
        </linearGradient>
        {/* Glass reflection highlight */}
        <linearGradient id={glassGradId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%"   stopColor="#ffffff" stopOpacity="0.07" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Pin leads from PCB right edge to breadboard holes */}
      {pins.map((pin, i) => (
        <g key={i}>
          <line
            x1={headerX} y1={pin.y}
            x2={pin.x}   y2={pin.y}
            stroke="#c8c8c8" strokeWidth={1.3} strokeLinecap="round"
          />
          {/* Solder pad on PCB edge */}
          <rect x={headerX - 1} y={pin.y - 1.2} width={2} height={2.4}
            fill="#c8a84a" rx={0.3} />
          <circle cx={pin.x} cy={pin.y} r={2} fill="#b0b0b0" opacity={0.55} />
          <PinLabel x={pin.x} y={pin.y} name={pinNames[i]} side="right" />
        </g>
      ))}

      {/* Drop shadow */}
      <rect x={bodyL + 1} y={bodyT + 2} width={w} height={h} rx={2} fill="#00000070" />

      {/* PCB substrate */}
      <rect x={bodyL} y={bodyT} width={w} height={h} rx={2}
        fill={`url(#${pcbGradId})`}
        stroke={isSelected ? "#3b82f6" : "#0d1a35"}
        strokeWidth={isSelected ? 1.5 : 0.7} />

      {/* Mounting-hole circles (corner pads, visual only) */}
      {[[bodyL + 3, bodyT + 3], [bodyL + w - 3, bodyT + 3]].map(([hx, hy], i) => (
        <g key={i}>
          <circle cx={hx} cy={hy} r={2.2} fill="#0d1730" stroke="#2a4a8a" strokeWidth={0.4} />
          <circle cx={hx} cy={hy} r={1.2} fill="#0a1220" />
        </g>
      ))}

      {/* PCB trace lines (decorative) */}
      <line x1={bodyL + 8} y1={bodyT + h - 4} x2={bodyL + w - 8} y2={bodyT + h - 4}
        stroke="#1e3a6a" strokeWidth={0.5} opacity={0.6} />
      <line x1={headerX - 1} y1={pinTop.y} x2={headerX - 1} y2={pinBot.y}
        stroke="#1e3a6a" strokeWidth={0.7} opacity={0.5} />

      {/* Screen glass bezel — dark frame around the active OLED panel */}
      <rect x={screenL} y={screenT} width={screenW} height={screenH} rx={1.5}
        fill="#06080f" stroke="#0a1830" strokeWidth={0.6} />

      {/* Active OLED area — live framebuffer from the SSD1306 peripheral.
          Falls back to a dark glass with placeholder labels when the panel
          hasn't been initialised (sketch hasn't called display.begin) so
          unconfigured boards still look like a real powered-down OLED. */}
      <rect x={activeL} y={activeT} width={activeW} height={activeH} rx={0.8}
        fill={`url(#${screenGradId})`} />

      {oled && oled.on ? (
        <foreignObject x={activeL} y={activeT} width={activeW} height={activeH}>
          <OledCanvas state={oled} cssWidth={activeW} cssHeight={activeH} />
        </foreignObject>
      ) : (
        <>
          <text x={activeL + activeW / 2} y={activeT + activeH * 0.38}
            textAnchor="middle" fontSize={3.8}
            fill="#06b6d4" fontFamily="monospace" opacity={0.9}>
            128×64
          </text>
          <text x={activeL + activeW / 2} y={activeT + activeH * 0.65}
            textAnchor="middle" fontSize={3}
            fill="#0891b2" fontFamily="monospace" opacity={0.7}>
            SSD1306
          </text>
          {[0.18, 0.52, 0.82].map((frac, i) => (
            <line key={i}
              x1={activeL + 2} y1={activeT + activeH * frac}
              x2={activeL + activeW - 2} y2={activeT + activeH * frac}
              stroke="#06b6d4" strokeWidth={0.3} opacity={0.15} />
          ))}
        </>
      )}

      {/* Glass highlight — diagonal sheen across top-left of screen */}
      <rect x={activeL} y={activeT} width={activeW} height={activeH} rx={0.8}
        fill={`url(#${glassGradId})`} />

      {/* Silkscreen: I2C label + pin names along header edge */}
      <text x={bodyL + 4} y={bodyT + h - 3} textAnchor="start"
        fontSize={2.4} fill="#4a6aa0" fontFamily="monospace">
        I2C 0x3C
      </text>
      <text x={bodyL + w - 4} y={bodyT + h - 3} textAnchor="end"
        fontSize={2.4} fill="#3a5a80" fontFamily="monospace">
        0.96"
      </text>

      {/* Component name */}
      <text x={bodyCx} y={bodyT + h + 6} textAnchor="middle"
        fontSize={LABEL_FONT_SIZE} fill="#888" fontFamily="monospace">
        {component.name}
      </text>
    </g>
  );
}

function GenericRendererInner({ component, components, pinStates, wires, isSelected, electricalState, libraryState }: GenericRendererProps) {
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
    case "photoresistor":
      return <g opacity={dimOpacity}><PhotoresistorRenderer component={component} isSelected={isSelected} /></g>;
    case "ultrasonic_sensor":
      return <g opacity={dimOpacity}><UltrasonicSensorRenderer component={component} isSelected={isSelected} /></g>;
    case "ir_receiver":
      return <g opacity={dimOpacity}><IrReceiverRenderer component={component} isSelected={isSelected} /></g>;
    case "neopixel":
      return <g opacity={dimOpacity}><NeoPixelRenderer component={component} isSelected={isSelected} /></g>;
    case "pir_sensor":
      return <g opacity={dimOpacity}><PirRenderer component={component} isSelected={isSelected} /></g>;
    case "relay":
      return <g opacity={dimOpacity}><RelayRenderer component={component} pinStates={pinStates} isSelected={isSelected} /></g>;
    case "dc_motor":
      return <g opacity={dimOpacity}><DcMotorRenderer component={component} pinStates={pinStates} isSelected={isSelected} /></g>;
    case "seven_segment":
      return <g opacity={dimOpacity}><SevenSegmentRenderer component={component} components={components} pinStates={pinStates} wires={wires} isSelected={isSelected} /></g>;
    case "dht_sensor":
      return <g opacity={dimOpacity}><DhtSensorRenderer component={component} isSelected={isSelected} /></g>;
    case "shift_register":
      return <g opacity={dimOpacity}><ShiftRegisterRenderer component={component} isSelected={isSelected} /></g>;
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
