import React, { useEffect, useRef } from "react";
import { MAX_ARDUINO_PIN, type BoardComponent, type PinState, type LibraryState, type Wire } from "@dreamer/schemas";
import type { ComponentElectricalState } from "@/simulator/circuit-solver";
import { areConnected, getComponentFootprint, gridToPixel } from "@/breadboard/breadboard-grid";
import { findArduinoPinForComponentPin } from "@/breadboard/component-pin-resolver";
import { PX_PER_MM, GENERIC_BODY_WIDTH, GENERIC_BODY_HEIGHT, LABEL_FONT_SIZE, HOLE_SPACING } from "@/breadboard/breadboard-constants";
import { PinLabel } from "./pin-label";
import { OledCanvas } from "@/components/oled-canvas";
import { lookupGlyph } from "./lcd-font";

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
  const radius = 6 * PX_PER_MM; // 12mm piezo can (radius 6mm)
  const isActive = electricalState?.isActive ?? false;
  const loudness = Math.max(0.35, Math.min(1, (electricalState?.current ?? 12) / 35));
  const waveDur = `${(0.55 - loudness * 0.22).toFixed(2)}s`;

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

      {/* Sound annotation — expanding ripples while driven. Neutral thin
          strokes: the buzzer emits sound, not light, so nothing glows. */}
      {isActive && (
        <>
          <circle cx={bodyCx} cy={bodyCy} r={radius + 2} fill="none" stroke="#9ca3af" strokeWidth={0.6} opacity={0.4 * loudness}>
            <animate attributeName="r" values={`${radius};${radius + 10};${radius}`} dur={waveDur} repeatCount="indefinite" />
            <animate attributeName="opacity" values={`${0.4 * loudness};0;${0.4 * loudness}`} dur={waveDur} repeatCount="indefinite" />
          </circle>
          <circle cx={bodyCx} cy={bodyCy} r={radius + 4} fill="none" stroke="#9ca3af" strokeWidth={0.5} opacity={0.3 * loudness}>
            <animate attributeName="r" values={`${radius + 3};${radius + 14};${radius + 3}`} dur={waveDur} begin="0.14s" repeatCount="indefinite" />
            <animate attributeName="opacity" values={`${0.32 * loudness};0;${0.32 * loudness}`} dur={waveDur} begin="0.14s" repeatCount="indefinite" />
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
      {/* Rim lip + concentric top-face ring — scaled with the 12mm can so the
          large body doesn't read as an empty disc. */}
      <circle cx={bodyCx} cy={bodyCy} r={radius - 0.7 * PX_PER_MM} fill="none" stroke="#333" strokeWidth={0.6} />
      <circle cx={bodyCx} cy={bodyCy} r={radius * 0.56} fill="none" stroke="#333" strokeWidth={0.5} opacity={0.7} />
      {/* Sound hole — ~2mm vent at the centre of the can */}
      <circle cx={bodyCx} cy={bodyCy} r={1 * PX_PER_MM} fill="#2a2a2a" stroke="#444" strokeWidth={0.4} />
      {/* + marking on the body */}
      <text x={bodyCx - radius * 0.5} y={bodyCy - radius + 8} fontSize={5} fill="#666" fontFamily="monospace">+</text>

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
  // 16mm rotary pot body with a 6mm knob/shaft (top-down).
  const bodyR = 8 * PX_PER_MM; // 16mm pot body (radius 8mm)
  const knobR = 3 * PX_PER_MM; // 6mm shaft/knob
  const knobAngle = ((component.properties.value as number) ?? 50) / 100 * 270 - 135;
  const rad = (knobAngle * Math.PI) / 180;

  const bx = centerX - bodyR - 6; // body center X
  const by = centerY;             // body center Y

  // Gradient / filter IDs scoped to this component instance
  const gradId = `pot-body-${component.id}`;
  const glowId = `pot-glow-${component.id}`;

  // Slot-head indicator: a diameter line across the knob, rotated with knobAngle
  const slotHalfLen = knobR - 0.4 * PX_PER_MM;
  const sx1 = bx + Math.cos(rad) * slotHalfLen;
  const sy1 = by + Math.sin(rad) * slotHalfLen;
  const sx2 = bx - Math.cos(rad) * slotHalfLen;
  const sy2 = by - Math.sin(rad) * slotHalfLen;

  // Position markers at −135°, 0°, +135° around the body bezel
  const markerAngles = [-135, 0, 135];
  const markerR = bodyR + 0.3 * PX_PER_MM; // just outside the body edge

  // Knurl ticks: 10 short marks around the knob, co-rotating with the dial
  const knurlCount = 10;
  const knurlInner = knobR - 0.4 * PX_PER_MM;
  const knurlOuter = knobR;

  return (
    <g>
      <defs>
        {/* Radial gradient: muted navy trim-pot body, matte/dusty finish */}
        <radialGradient id={gradId} cx="38%" cy="35%" r="60%">
          <stop offset="0%"   stopColor="#2a3f5f" />
          <stop offset="55%"  stopColor="#1e2d45" />
          <stop offset="100%" stopColor="#131d2e" />
        </radialGradient>
        {/* Soft outer glow for selection */}
        <filter id={glowId} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      {/* 3 breadboard pins */}
      <circle cx={pinVcc.x}    cy={pinVcc.y}    r={2} fill="#ef4444" opacity={0.5} />
      <circle cx={pinSignal.x} cy={pinSignal.y} r={2} fill="#fbbf24" opacity={0.5} />
      <circle cx={pinGnd.x}    cy={pinGnd.y}    r={2} fill="#42a5f5" opacity={0.5} />

      {/* Bezel ring — neutral warm-black, avoids blue tint pulling whole thing cool */}
      <circle
        cx={bx} cy={by}
        r={bodyR + 2}
        fill="#1a1a1a"
        stroke={isSelected ? "#3b82f6" : "#57534e"}
        strokeWidth={isSelected ? 1.5 : 0.8}
      />

      {/* Position markers at min / mid / max — nearly flush with bezel, very faint */}
      {markerAngles.map((deg) => {
        const a = (deg * Math.PI) / 180;
        return (
          <circle
            key={deg}
            cx={bx + Math.cos(a) * markerR}
            cy={by + Math.sin(a) * markerR}
            r={0.8}
            fill="#4a5568"
            opacity={0.6}
          />
        );
      })}

      {/* Pot body — blue radial gradient (16mm disc) */}
      <circle cx={bx} cy={by} r={bodyR} fill={`url(#${gradId})`} />

      {/* Raised knob / shaft — 6mm dia, sits proud of the body */}
      <circle cx={bx} cy={by} r={knobR} fill={`url(#${gradId})`} stroke="#0d1117" strokeWidth={0.7} />
      <circle cx={bx} cy={by} r={knobR} fill="none" stroke="#3a4a63" strokeWidth={0.5} opacity={0.6} />

      {/* Knurl ticks rotating with the dial */}
      {Array.from({ length: knurlCount }, (_, i) => {
        const a = rad + (i / knurlCount) * 2 * Math.PI;
        return (
          <line
            key={i}
            x1={bx + Math.cos(a) * knurlInner}
            y1={by + Math.sin(a) * knurlInner}
            x2={bx + Math.cos(a) * knurlOuter}
            y2={by + Math.sin(a) * knurlOuter}
            stroke="#64748b"
            strokeWidth={0.75}
            strokeLinecap="round"
            opacity={0.4}
          />
        );
      })}

      {/* Slot-head screwdriver indicator — shadow stroke for carved-slot depth */}
      <line
        x1={sx1} y1={sy1}
        x2={sx2} y2={sy2}
        stroke="#0d1117"
        strokeWidth={3}
        strokeLinecap="round"
        opacity={0.7}
      />
      {/* Slot top highlight — dull brushed-metal, not white-hot */}
      <line
        x1={sx1} y1={sy1}
        x2={sx2} y2={sy2}
        stroke="#9ca3af"
        strokeWidth={1.5}
        strokeLinecap="round"
      />

      {/* Centre pip — muted steel, not bright blue */}
      <circle cx={bx} cy={by} r={0.3 * PX_PER_MM} fill="#6b7280" />

      {/* Pin labels */}
      <PinLabel x={pinVcc.x}    y={pinVcc.y}    name="vcc"    side="right" />
      <PinLabel x={pinSignal.x} y={pinSignal.y} name="signal" side="right" />
      <PinLabel x={pinGnd.x}    y={pinGnd.y}    name="gnd"    side="right" />
    </g>
  );
}

/** Render a 5×8 character (CGRAM or ROM) as a grid of dots — the authentic
 *  HD44780 character-panel look. `charData[row]` is a 5-bit row where bit 4
 *  is the leftmost column. */
function DotChar({ charData, x, y, cellW, cellH, color }: {
  charData: readonly number[]; x: number; y: number; cellW: number; cellH: number; color: string
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
            width={pixW - 0.08}
            height={pixH - 0.08}
            fill={color}
          />,
        );
      }
    }
  }
  return <>{rects}</>;
}

function LcdRenderer({ component, isSelected, libraryState }: { component: BoardComponent; isSelected: boolean; libraryState?: LibraryState }) {
  // Full HD44780 12-pin header — must match the canonical layout in
  // @dreamer/schemas/component-pins so the simulator peripheral's wire
  // resolver and the breadboard render agree on pin positions.
  const pinNames = ["vss", "vdd", "vo", "rs", "rw", "en", "d4", "d5", "d6", "d7", "a", "k"] as const;
  const pins = pinNames.map((_, i) =>
    gridToPixel({ row: component.y + i, col: component.x }),
  );
  const pinTop = pins[0];
  const pinBot = pins[pins.length - 1];

  // LCD1602 module drawn at true size: an 80 × 36mm green PCB. The 12-pin
  // header column is shorter than the PCB, so the header rail runs down the
  // right edge while the board extends above and below it.
  const pinSpan = pinBot.y - pinTop.y;
  const bodyW = 80 * PX_PER_MM;  // green PCB 80mm wide
  const bodyH = 36 * PX_PER_MM;  // ...× 36mm tall
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

  // Metal bezel (71.2 × 26.2mm) framing the active glass (64.5 × 16mm), both
  // centred on the PCB and nudged up to leave a silkscreen strip below.
  const bodyL = bodyCx - bodyW / 2;
  const bodyT = bodyCy - bodyH / 2;
  const bezelW = 71.2 * PX_PER_MM;
  const bezelH = 26.2 * PX_PER_MM;
  const bezelL = bodyCx - bezelW / 2;
  const bezelT = bodyT + (bodyH - bezelH) / 2 - bodyH * 0.05;
  const displayWidth = 64.5 * PX_PER_MM;  // active glass 64.5mm wide
  const displayHeight = 16 * PX_PER_MM;   // ...× 16mm tall
  const displayAreaX = bezelL + (bezelW - displayWidth) / 2;
  const displayAreaY = bezelT + (bezelH - displayHeight) / 2;

  const pcbGradId = `lcd-pcb-${component.id}`;
  const screenGradId = `lcd-screen-${component.id}`;
  const glassGradId = `lcd-glass-${component.id}`;
  const blinkAnimId = `lcd-blink-${component.id}`;

  const textColor = backlightOn ? "#065f46" : "#2a4a3d";

  const cellW = (displayWidth - 2) / cols;
  const cellH = (displayHeight - 4) / 2;

  const headerX = bodyCx + bodyW / 2;

  // Determine visible cursor position relative to scroll offset
  const scrollOffset = lcdState?.scrollOffset ?? 0;
  const visibleCursorCol = cursorCol - scrollOffset;
  const cursorInView = visibleCursorCol >= 0 && visibleCursorCol < cols
    && cursorRow >= 0 && cursorRow < (lcdState?.rows ?? 2);

  // HD44780 dots are near-square (~1.1 tall:wide). The character cells on this
  // renderer are ~3×11 px — much taller than wide — so if we let a 5×8 grid
  // fill the cell, dots stretch vertically and glyphs look skinny. Instead,
  // derive the glyph height from the glyph width × dot-aspect, then centre
  // the block vertically within the cell. (Cursor underlines still use the
  // full cell height so they span the character position like real hardware.)
  const glyphW = cellW - 0.4;
  const glyphH = Math.min(glyphW * (8 / 5) * 1.1, cellH - 0.4);
  const glyphYOffset = (cellH - glyphH) / 2;

  function renderRow(text: string, rowIndex: number) {
    const nodes: React.ReactNode[] = [];
    const rowY = displayAreaY + 2 + rowIndex * (cellH + 1) + glyphYOffset;
    for (let i = 0; i < cols; i++) {
      const code = text.charCodeAt(i);
      const cellX = displayAreaX + 1 + i * cellW;
      const glyph = (code >= 0 && code <= 7 && cgram && cgram[code])
        ? cgram[code]
        : lookupGlyph(code);
      if (!glyph) continue;
      nodes.push(
        <DotChar
          key={i}
          charData={glyph}
          x={cellX}
          y={rowY}
          cellW={glyphW}
          cellH={glyphH}
          color={textColor}
        />,
      );
    }
    return nodes;
  }

  const screenBezelL = bezelL;
  const screenBezelT = bezelT;
  const screenBezelW = bezelW;
  const screenBezelH = bezelH;

  return (
    <g>
      <defs>
        {/* Dark green PCB — multi-stop for subtle depth */}
        <linearGradient id={pcbGradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#0d5a3f" />
          <stop offset="55%"  stopColor="#0a4430" />
          <stop offset="100%" stopColor="#042f22" />
        </linearGradient>
        {/* Reflective yellow-green character panel — brighter when backlit */}
        <linearGradient id={screenGradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={backlightOn ? "#c9f7de" : "#4a7a68"} />
          <stop offset="100%" stopColor={backlightOn ? "#8cdcb3" : "#2f5347"} />
        </linearGradient>
        {/* Glass sheen — diagonal highlight for glossy feel */}
        <linearGradient id={glassGradId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%"  stopColor="#ffffff" stopOpacity="0.22" />
          <stop offset="45%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Header pin strip — extends above/below the PCB body since the
          12-pin header is taller than the body itself. Pads sit on this
          strip so pins outside the PCB edge still look anchored. */}
      <rect x={headerX - 1.8} y={pinTop.y - 2} width={3.6} height={pinSpan + 4}
        rx={0.6} fill="#2a2a2a" stroke="#111" strokeWidth={0.3} />

      {/* Pin leads from header strip to breadboard holes, with gold solder pads */}
      {pins.map((pin, i) => (
        <g key={i}>
          <line
            x1={headerX} y1={pin.y}
            x2={pin.x}   y2={pin.y}
            stroke="#c8c8c8" strokeWidth={1.3} strokeLinecap="round"
          />
          <rect x={headerX - 1} y={pin.y - 1.2} width={2} height={2.4}
            fill="#c8a84a" rx={0.3} />
          <circle cx={pin.x} cy={pin.y} r={2} fill="#b0b0b0" opacity={0.55} />
          <PinLabel x={pin.x} y={pin.y} name={pinNames[i]} side="right" />
        </g>
      ))}

      {/* Drop shadow */}
      <rect x={bodyL + 1} y={bodyT + 2} width={bodyW} height={bodyH} rx={2} fill="#00000070" />

      {/* PCB substrate */}
      <rect x={bodyL} y={bodyT} width={bodyW} height={bodyH} rx={2}
        fill={`url(#${pcbGradId})`}
        stroke={isSelected ? "#3b82f6" : "#02241a"}
        strokeWidth={isSelected ? 1.5 : 0.7} />

      {/* Corner mounting holes (~2.5mm dia at all four corners) */}
      {[[bodyL + 3 * PX_PER_MM, bodyT + 3 * PX_PER_MM], [bodyL + bodyW - 3 * PX_PER_MM, bodyT + 3 * PX_PER_MM], [bodyL + 3 * PX_PER_MM, bodyT + bodyH - 3 * PX_PER_MM], [bodyL + bodyW - 3 * PX_PER_MM, bodyT + bodyH - 3 * PX_PER_MM]].map(([hx, hy], i) => (
        <g key={i}>
          <circle cx={hx} cy={hy} r={1.25 * PX_PER_MM} fill="#02241a" stroke="#3a7a5a" strokeWidth={0.5} />
          <circle cx={hx} cy={hy} r={0.6 * PX_PER_MM} fill="#011a12" />
        </g>
      ))}

      {/* Decorative PCB traces — horizontal rail + vertical bus near header */}
      <line x1={bodyL + 8} y1={bodyT + bodyH - 2.2} x2={bodyL + bodyW - 12} y2={bodyT + bodyH - 2.2}
        stroke="#1e6a46" strokeWidth={0.5} opacity={0.55} />
      <line x1={headerX - 1} y1={pinTop.y} x2={headerX - 1} y2={pinBot.y}
        stroke="#1e6a46" strokeWidth={0.7} opacity={0.5} />

      {/* Contrast trim pot — small blue potentiometer near the PCB edge */}
      <rect x={bodyL + bodyW - 7.5 * PX_PER_MM} y={bodyT + bodyH - 7 * PX_PER_MM} width={6 * PX_PER_MM} height={5 * PX_PER_MM} rx={1}
        fill="#1e40af" stroke="#0b2e80" strokeWidth={0.5} />
      <circle cx={bodyL + bodyW - 4.5 * PX_PER_MM} cy={bodyT + bodyH - 4.5 * PX_PER_MM} r={1.6 * PX_PER_MM}
        fill="#d4d4d8" stroke="#525252" strokeWidth={0.4} />
      <line x1={bodyL + bodyW - 5.7 * PX_PER_MM} y1={bodyT + bodyH - 4.5 * PX_PER_MM}
            x2={bodyL + bodyW - 3.3 * PX_PER_MM} y2={bodyT + bodyH - 4.5 * PX_PER_MM}
            stroke="#27272a" strokeWidth={0.6} />

      {/* Metal bezel — brushed silver frame around the active glass */}
      <rect x={screenBezelL} y={screenBezelT} width={screenBezelW} height={screenBezelH} rx={2}
        fill="#7c8794" stroke="#4b5563" strokeWidth={0.8} />

      {/* LCD display window */}
      <rect
        x={displayAreaX}
        y={displayAreaY}
        width={displayWidth}
        height={displayHeight}
        rx={0.6}
        fill={`url(#${screenGradId})`}
      />

      {displayOn && hasText ? (
        <>
          {renderRow(line1, 0)}
          {renderRow(line2, 1)}
        </>
      ) : displayOn ? (
        <>
          {/* Unlit-cell grid — subtle dot placeholders so the panel reads as
              an LCD even before the sketch prints anything. */}
          {Array.from({ length: cols * 2 }, (_, i) => {
            const col = i % cols;
            const row = Math.floor(i / cols);
            return (
              <rect
                key={`ph-${i}`}
                x={displayAreaX + 1 + col * cellW + (cellW - 0.4) * 0.15}
                y={displayAreaY + 2 + row * (cellH + 1) + cellH * 0.1}
                width={(cellW - 0.4) * 0.7}
                height={cellH * 0.8}
                fill={textColor}
                opacity={0.08}
              />
            );
          })}
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

      {/* Glass highlight sheen over the display */}
      <rect
        x={displayAreaX}
        y={displayAreaY}
        width={displayWidth}
        height={displayHeight}
        rx={0.6}
        fill={`url(#${glassGradId})`}
        pointerEvents="none"
      />

      {/* Silkscreen micro-text on the PCB below the screen */}
      <text x={bodyL + 2.5 * PX_PER_MM} y={bodyT + bodyH - 2.5 * PX_PER_MM} textAnchor="start"
        fontSize={4.5} fill="#4a9e78" fontFamily="monospace" opacity={0.75}>
        HD44780
      </text>
      <text x={bodyL + bodyW * 0.42} y={bodyT + bodyH - 2.5 * PX_PER_MM} textAnchor="middle"
        fontSize={4} fill="#3a8a68" fontFamily="monospace" opacity={0.7}>
        16×2
      </text>

      {/* Component name */}
      <text x={bodyCx} y={bodyT + bodyH + 6} textAnchor="middle"
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
  const coldAmount = !hot ? (0.5 - tempFraction) * 2 : 0;

  // TO-92 package: rounded top + flat face — offset to the LEFT of the pin column
  const bodyRadius = 2.35 * PX_PER_MM; // 4.7mm dia half-round body (flat face)
  const bodyCx = pinSignal.x - bodyRadius - 6;
  const bodyCy = pinSignal.y;
  const bodyTop = bodyCy - bodyRadius - 1;
  const bodyBot = bodyCy + bodyRadius + 4;

  const bodyGradId = `tmp-body-${component.id}`;

  return (
    <g>
      <defs>
        {/* TO-92 plastic — dark with rounded shading */}
        <radialGradient id={bodyGradId} cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#404040" />
          <stop offset="50%" stopColor="#1a1a1a" />
          <stop offset="100%" stopColor="#000000" />
        </radialGradient>
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
      <text x={bodyCx} y={bodyCy - 2} textAnchor="middle" fontSize={4.5} fill="#a3a3a3" fontFamily="monospace" fontWeight="bold">
        TMP
      </text>
      <text x={bodyCx} y={bodyCy + 3.5} textAnchor="middle" fontSize={4.5} fill="#a3a3a3" fontFamily="monospace">
        36
      </text>

      {/* Live temperature text above the body — the ambient temperature is a
          user-set input, so it's annotated as text; the package itself never
          glows or shimmers no matter how hot the air is. */}
      <text
        x={bodyCx}
        y={bodyTop - 4}
        textAnchor="middle"
        fontSize={5.5}
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

  const bodyR = 2.5 * PX_PER_MM; // LDR head 5mm dia
  const bodyCx = pinA.x - bodyR - 6;
  const bodyCy = (pinA.y + pinB.y) / 2;

  // CdS pad background colour brightens with light level
  const cdsShade = Math.round(110 + light * 1.1); // 110..220
  const cdsColor = `rgb(${cdsShade},${Math.round(cdsShade * 0.85)},${Math.round(cdsShade * 0.55)})`;
  const cdsDarkEdge = `rgb(${Math.round(cdsShade * 0.5)},${Math.round(cdsShade * 0.4)},${Math.round(cdsShade * 0.25)})`;

  const bodyGradId = `ldr-body-${component.id}`;
  const cdsGradId = `ldr-cds-${component.id}`;

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
      </defs>

      {/* Pin hole indicators */}
      <circle cx={pinA.x} cy={pinA.y} r={2} fill="#fbbf24" opacity={0.6} />
      <circle cx={pinB.x} cy={pinB.y} r={2} fill="#fbbf24" opacity={0.6} />

      {/* Incident-light annotation — steady rays scaled by the light level.
          Ambient light doesn't flicker, so neither do these. */}
      {light > 40 && (
        <g opacity={((light - 40) / 60) * 0.55}>
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
              />
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
        strokeWidth={0.4} />

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
      <text x={bodyCx} y={bodyCy - bodyR - 4} textAnchor="middle" fontSize={5.5}
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

  // NOTE: the sensing beam, measured distance, and any obstacles (boxes/walls)
  // are NOT drawn here — they live in EnvironmentOverlay, which ray-casts the
  // real environment. This renderer only draws the physical HC-SR04 module.

  // PCB body sits to the LEFT of the pin column. The board is 45 × 20mm; its
  // long (45mm) axis runs vertically here so the two cans stack in-column.
  const pcbW = 20 * PX_PER_MM;  // 20mm across
  const pcbH = 45 * PX_PER_MM;  // 45mm along the can axis
  const pcbCx = pinTop.x - pcbW / 2 - 10;
  const pcbCy = (pinTop.y + pinBot.y) / 2;
  const pcbL = pcbCx - pcbW / 2;
  const pcbT = pcbCy - pcbH / 2;

  // Two stacked transducer cans (16mm dia) with centres 26mm apart —
  // T (trigger) on top, R (echo) below.
  const eyeR = 8 * PX_PER_MM;     // 16mm dia can
  const eyeX = pcbCx;
  const eyeGap = 13 * PX_PER_MM;  // half of the 26mm centre-to-centre spacing
  const eyeTy = pcbCy - eyeGap;
  const eyeBy = pcbCy + eyeGap;
  const meshAngles = [0, 45, 90, 135, 180, 225, 270, 315];

  const pcbGradId = `us-pcb-${component.id}`;
  const bevelGradId = `us-bevel-${component.id}`;
  const eyeGradId = `us-eye-${component.id}`;
  const holeGradId = `us-hole-${component.id}`;

  // Proper pin names so PinLabel colour-codes them (red/amber/green/grey).
  const pinNames = ["vcc", "trig", "echo", "gnd"];

  const corners: Array<[number, number]> = [
    [pcbL + 3 * PX_PER_MM, pcbT + 3 * PX_PER_MM],
    [pcbL + pcbW - 3 * PX_PER_MM, pcbT + 3 * PX_PER_MM],
    [pcbL + 3 * PX_PER_MM, pcbT + pcbH - 3 * PX_PER_MM],
    [pcbL + pcbW - 3 * PX_PER_MM, pcbT + pcbH - 3 * PX_PER_MM],
  ];

  return (
    <g>
      <defs>
        <linearGradient id={pcbGradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2563eb" />
          <stop offset="45%" stopColor="#1e40af" />
          <stop offset="100%" stopColor="#172554" />
        </linearGradient>
        <linearGradient id={bevelGradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity={0.4} />
          <stop offset="100%" stopColor="#ffffff" stopOpacity={0} />
        </linearGradient>
        <radialGradient id={eyeGradId} cx="36%" cy="32%" r="78%">
          <stop offset="0%" stopColor="#f8fafc" />
          <stop offset="32%" stopColor="#cbd5e1" />
          <stop offset="68%" stopColor="#64748b" />
          <stop offset="100%" stopColor="#1e293b" />
        </radialGradient>
        <radialGradient id={holeGradId} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#0b1220" />
          <stop offset="60%" stopColor="#0b1220" />
          <stop offset="100%" stopColor="#b08d57" />
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
      <rect x={pcbL + 1} y={pcbT + 1.5} width={pcbW} height={pcbH} rx={3.5} fill="#00000055" />

      {/* PCB body */}
      <rect x={pcbL} y={pcbT} width={pcbW} height={pcbH} rx={3.5}
        fill={`url(#${pcbGradId})`}
        stroke={isSelected ? "#3b82f6" : "#0c1e4f"}
        strokeWidth={isSelected ? 1.8 : 0.9} />
      {/* Glossy top bevel + inset border for depth */}
      <rect x={pcbL + 1.5} y={pcbT + 1.5} width={pcbW - 3} height={pcbH * 0.42} rx={2.5} fill={`url(#${bevelGradId})`} />
      <rect x={pcbL + 2.5} y={pcbT + 2.5} width={pcbW - 5} height={pcbH - 5} rx={2.5} fill="none" stroke="#60a5fa" strokeWidth={0.4} opacity={0.35} />

      {/* Plated corner mounting holes */}
      {corners.map(([cx, cy], i) => (
        <g key={i}>
          <circle cx={cx} cy={cy} r={1.4 * PX_PER_MM} fill="none" stroke="#cd9b5a" strokeWidth={1.2} opacity={0.85} />
          <circle cx={cx} cy={cy} r={0.8 * PX_PER_MM} fill={`url(#${holeGradId})`} />
        </g>
      ))}

      {/* Center crystal + tiny SMD details */}
      <rect x={eyeX - 2 * PX_PER_MM} y={pcbCy - 1.25 * PX_PER_MM} width={4 * PX_PER_MM} height={2.5 * PX_PER_MM} rx={1} fill="#d4d4d8" stroke="#52525b" strokeWidth={0.5} />
      <rect x={eyeX - 1.6 * PX_PER_MM} y={pcbCy - 0.85 * PX_PER_MM} width={3.2 * PX_PER_MM} height={1.7 * PX_PER_MM} rx={0.7} fill="none" stroke="#a1a1aa" strokeWidth={0.4} opacity={0.7} />
      <rect x={pcbL + pcbW - 4 * PX_PER_MM} y={pcbCy - 4 * PX_PER_MM} width={1.6 * PX_PER_MM} height={1.2 * PX_PER_MM} rx={0.3} fill="#0f172a" opacity={0.7} />
      <rect x={pcbL + pcbW - 4 * PX_PER_MM} y={pcbCy + 2.8 * PX_PER_MM} width={1.6 * PX_PER_MM} height={1.2 * PX_PER_MM} rx={0.3} fill="#0f172a" opacity={0.7} />

      {/* === Transducer cans (T = trigger, R = echo) === */}
      {[{ cy: eyeTy, label: "T" }, { cy: eyeBy, label: "R" }].map(({ cy, label }) => (
        <g key={label}>
          {/* recessed shadow ring */}
          <circle cx={eyeX} cy={cy} r={eyeR + 1} fill="#070d18" opacity={0.55} />
          {/* metal can */}
          <circle cx={eyeX} cy={cy} r={eyeR} fill={`url(#${eyeGradId})`} stroke="#0f172a" strokeWidth={0.8} />
          {/* rim highlight */}
          <circle cx={eyeX} cy={cy} r={eyeR * 0.9} fill="none" stroke="#f8fafc" strokeWidth={0.6} opacity={0.45} />
          {/* mesh grille — concentric rings */}
          <circle cx={eyeX} cy={cy} r={eyeR * 0.73} fill="none" stroke="#1f2937" strokeWidth={0.6} opacity={0.8} />
          <circle cx={eyeX} cy={cy} r={eyeR * 0.52} fill="none" stroke="#1f2937" strokeWidth={0.5} opacity={0.7} />
          {/* mesh grille — radial spokes */}
          {meshAngles.map((deg) => {
            const rad = (deg * Math.PI) / 180;
            return (
              <line
                key={deg}
                x1={eyeX + Math.cos(rad) * eyeR * 0.16}
                y1={cy + Math.sin(rad) * eyeR * 0.16}
                x2={eyeX + Math.cos(rad) * eyeR * 0.84}
                y2={cy + Math.sin(rad) * eyeR * 0.84}
                stroke="#1f2937"
                strokeWidth={0.5}
                opacity={0.45}
              />
            );
          })}
          {/* dark center + specular highlight */}
          <circle cx={eyeX} cy={cy} r={eyeR * 0.17} fill="#111827" />
          <ellipse cx={eyeX - eyeR * 0.27} cy={cy - eyeR * 0.29} rx={eyeR * 0.27} ry={eyeR * 0.18} fill="#ffffff" opacity={0.4} />
          {/* T / R silkscreen, to the right of the can */}
          <text x={eyeX + eyeR + 3} y={cy + 2} fontSize={6} fill="#dbeafe" fontFamily="monospace" fontWeight="bold">{label}</text>
        </g>
      ))}

      {/* Silkscreen part number near the bottom */}
      <text x={pcbCx} y={pcbT + pcbH - 6} textAnchor="middle" fontSize={6}
        fill="#bfdbfe" fontFamily="monospace" fontWeight="bold" letterSpacing="0.4">HC-SR04</text>

      {/* Component name — below the PCB */}
      <text x={pcbCx} y={pcbT + pcbH + 7} textAnchor="middle"
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
  const bodyW = 6.4 * PX_PER_MM;  // TSOP body 6.4mm wide
  const bodyH = 5.8 * PX_PER_MM;  // ...× 5.8mm tall
  const lensR = 2 * PX_PER_MM;    // ~4mm dome lens
  const bodyCx = pinTop.x - bodyW / 2 - 8;
  const bodyCy = (pinTop.y + pinBot.y) / 2;

  const bodyGradId = `ir-body-${component.id}`;
  const lensGradId = `ir-lens-${component.id}`;

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

      {/* Red dome lens — sticks out to the LEFT (facing outward). IR is
          invisible; the lens looks identical whether receiving or not. */}
      <circle cx={bodyCx - bodyW / 2 + lensR * 0.2}
        cy={bodyCy}
        r={lensR}
        fill={`url(#${lensGradId})`}
        stroke="#450a0a"
        strokeWidth={0.5} />
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
        fontSize={4} fill="#6b7280" fontFamily="monospace"
        transform={`rotate(-90 ${bodyCx + bodyW / 2 - 2} ${bodyCy + 2})`}>
        TSOP
      </text>

      {/* Received code flash — to the left of the lens */}
      {justReceived && pendingCode && (
        <text
          x={bodyCx - bodyW / 2 - lensR - 2}
          y={bodyCy - bodyH / 2 - 2}
          textAnchor="end"
          fontSize={5}
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

function NeoPixelRenderer({ component, isSelected, libraryState }: { component: BoardComponent; isSelected: boolean; libraryState?: LibraryState }) {
  // Vertical 3-pin layout: din / 5v / gnd (row..row+2, col)
  const pins = [0, 1, 2].map(i =>
    gridToPixel({ row: component.y + i, col: component.x }),
  );
  const pinTop = pins[0];
  const pinBot = pins[2];

  const numLeds = (component.properties.numLeds as number) ?? 8;
  const displayLeds = Math.min(numLeds, 8);

  // Strip body sits to the LEFT of the pin column. 8-LED stick 51 × 10.2mm.
  const stripW = 51 * PX_PER_MM;   // 51mm long
  const stripH = 10.2 * PX_PER_MM; // ...× 10.2mm
  const stripCx = pinTop.x - stripW / 2 - 8;
  const stripCy = (pinTop.y + pinBot.y) / 2;
  const stripL = stripCx - stripW / 2;
  const stripT = stripCy - stripH / 2;
  const ledPitch = 6.35 * PX_PER_MM; // 5050 packages at 6.35mm pitch
  const ledSize = 5 * PX_PER_MM;     // 5050 package 5 × 5mm

  const livePixels = libraryState?.neopixels?.[component.id]?.pixels;
  const hasLivePixels = livePixels != null;

  // Separate HUE from INTENSITY, like a real emitter: the die glows in the
  // fully-saturated color (a dim red WS2812 still looks *red*, not maroon)
  // while PWM magnitude drives how bright / how far the light carries.
  // Perceptual exponent matches the realistic-LED treatment — WS2812s at
  // setBrightness(50) already read as bright to the eye.
  const pixelVisual = (i: number) => {
    const live = livePixels?.[i];
    if (!live) return null;
    const peak = Math.max(live.r, live.g, live.b);
    if (peak === 0) return { lit: false as const, hue: "#151515", intensity: 0 };
    const scale = 255 / peak;
    const hue = `rgb(${Math.round(live.r * scale)}, ${Math.round(live.g * scale)}, ${Math.round(live.b * scale)})`;
    const luma = (0.2126 * live.r + 0.7152 * live.g + 0.0722 * live.b) / 255;
    const intensity = Math.pow(Math.min(1, luma), 0.45);
    return { lit: true as const, hue, intensity };
  };

  const pinNames = ["din", "vcc", "gnd"];
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

      {/* Per-pixel bloom gradients — white-hot core falling off through the
          pixel's saturated hue. Defined once per pixel, referenced below. */}
      <defs>
        {Array.from({ length: displayLeds }, (_, i) => {
          const v = pixelVisual(i);
          if (!v?.lit) return null;
          return (
            <radialGradient key={i} id={`neo-bloom-${component.id}-${i}`} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#ffffff" stopOpacity={0.5 + v.intensity * 0.45} />
              <stop offset="28%" stopColor={v.hue} stopOpacity={0.55 + v.intensity * 0.35} />
              <stop offset="62%" stopColor={v.hue} stopOpacity={0.22 + v.intensity * 0.2} />
              <stop offset="100%" stopColor={v.hue} stopOpacity={0} />
            </radialGradient>
          );
        })}
      </defs>

      {/* SMD LED pads + LED packages. A real WS2812 holds rock-steady light —
          no pulse/shimmer animations; all motion comes from live pixel data. */}
      {Array.from({ length: displayLeds }, (_, i) => {
        const ledX = stripCx + (i - (displayLeds - 1) / 2) * ledPitch;
        const v = pixelVisual(i);
        const lit = v?.lit === true;
        const intensity = lit ? v.intensity : 0;
        return (
          <g key={i}>
            {/* Steady bloom — radius and strength track perceived brightness */}
            {lit && (
              <circle
                cx={ledX}
                cy={stripCy}
                r={ledSize * 1.1 + intensity * ledSize * 1.4}
                fill={`url(#neo-bloom-${component.id}-${i})`}
                opacity={0.5 + intensity * 0.5}
                pointerEvents="none"
              />
            )}
            {/* Copper pad */}
            <rect x={ledX - ledSize / 2 - ledSize * 0.16} y={stripCy - ledSize / 2 - ledSize * 0.16}
              width={ledSize * 1.32} height={ledSize * 1.32} rx={1}
              fill="#b08d57" opacity={0.4} />
            {/* White LED package */}
            <rect x={ledX - ledSize / 2} y={stripCy - ledSize / 2}
              width={ledSize} height={ledSize} rx={1}
              fill="#f5f5f5" stroke="#ddd" strokeWidth={0.4} />
            {/* LED die: saturated hue when lit (dim ≠ muddy), dark when off */}
            <rect x={ledX - ledSize / 2 + ledSize * 0.2} y={stripCy - ledSize / 2 + ledSize * 0.2}
              width={ledSize * 0.6} height={ledSize * 0.6} rx={1}
              fill={lit ? v.hue : "#151515"}
              opacity={lit ? 0.75 + intensity * 0.25 : hasLivePixels ? 0.9 : 0.35} />
            {/* Diffuser white-out at the center of a driven pixel */}
            {lit && (
              <circle
                cx={ledX}
                cy={stripCy}
                r={ledSize * 0.14 + intensity * ledSize * 0.14}
                fill="#ffffff"
                opacity={0.35 + intensity * 0.6}
                pointerEvents="none"
              />
            )}
            {/* Corner mark (pin 1 indicator) */}
            <circle cx={ledX - ledSize / 2 + ledSize * 0.22} cy={stripCy - ledSize / 2 + ledSize * 0.22}
              r={ledSize * 0.1} fill="#888" opacity={0.5} />
          </g>
        );
      })}

      {/* Data direction arrow (DIN → DOUT) */}
      <polygon
        points={`${stripL + stripW - 1.2 * PX_PER_MM},${stripCy - 0.6 * PX_PER_MM} ${stripL + stripW - 0.5 * PX_PER_MM},${stripCy} ${stripL + stripW - 1.2 * PX_PER_MM},${stripCy + 0.6 * PX_PER_MM}`}
        fill="#555" opacity={0.6}
      />

      {/* Count badge if more than displayed */}
      {numLeds > 8 && (
        <text x={stripL + stripW - 2} y={stripT - 2}
          textAnchor="end" fontSize={5} fill="#888" fontFamily="monospace">
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

  // HC-SR501: 32.5 × 24mm PCB with a big white fresnel dome (23mm dia) centred.
  // PCB sits to the LEFT of the pin column.
  const pcbW = 32.5 * PX_PER_MM;  // 32.5mm wide
  const pcbH = 24 * PX_PER_MM;    // ...× 24mm tall
  const pcbCx = pinTop.x - pcbW / 2 - 10;
  const pcbCy = (pinTop.y + pinBot.y) / 2;
  const pcbL = pcbCx - pcbW / 2;
  const pcbT = pcbCy - pcbH / 2;
  const domeCx = pcbCx;
  const domeCy = pcbCy;
  const domeR = 11.5 * PX_PER_MM; // 23mm dia fresnel dome

  const gradId = `pir-pcb-${component.id}`;
  const domeGradId = `pir-dome-${component.id}`;

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
      {[[pcbL + 2.5 * PX_PER_MM, pcbT + 2.5 * PX_PER_MM], [pcbL + pcbW - 2.5 * PX_PER_MM, pcbT + 2.5 * PX_PER_MM], [pcbL + 2.5 * PX_PER_MM, pcbT + pcbH - 2.5 * PX_PER_MM], [pcbL + pcbW - 2.5 * PX_PER_MM, pcbT + pcbH - 2.5 * PX_PER_MM]].map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r={0.7 * PX_PER_MM} fill="#b08d57" opacity={0.7} />
      ))}

      {/* Two sensitivity/delay trimpots — yellow rectangles with slot */}
      <g>
        <rect x={pcbL + 1 * PX_PER_MM} y={domeCy - 1.75 * PX_PER_MM} width={3.5 * PX_PER_MM} height={3.5 * PX_PER_MM} rx={1} fill="#ca8a04" stroke="#713f12" strokeWidth={0.5} />
        <line x1={pcbL + 1.5 * PX_PER_MM} y1={domeCy} x2={pcbL + 4 * PX_PER_MM} y2={domeCy} stroke="#422006" strokeWidth={0.6} />
        <rect x={pcbL + pcbW - 4.5 * PX_PER_MM} y={domeCy - 1.75 * PX_PER_MM} width={3.5 * PX_PER_MM} height={3.5 * PX_PER_MM} rx={1} fill="#ca8a04" stroke="#713f12" strokeWidth={0.5} />
        <line x1={pcbL + pcbW - 4 * PX_PER_MM} y1={domeCy} x2={pcbL + pcbW - 1.5 * PX_PER_MM} y2={domeCy} stroke="#422006" strokeWidth={0.6} />
      </g>

      {/* Dome base ring (metal socket) */}
      <circle cx={domeCx} cy={domeCy} r={domeR + 0.5} fill="#9ca3af" stroke="#4b5563" strokeWidth={0.4} />
      <circle cx={domeCx} cy={domeCy} r={domeR - 0.3} fill="#6b7280" />

      {/* Dome itself — a real HC-SR501 fresnel dome shows nothing when it
          triggers; detection is annotated in the label text below. */}
      <ellipse cx={domeCx} cy={domeCy - 0.5} rx={domeR - 0.5} ry={domeR - 0.3}
        fill={`url(#${domeGradId})`}
        stroke="#94a3b8"
        strokeWidth={0.5} />

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

  const w = 12.7 * PX_PER_MM; // 0.56" display body 12.7mm wide
  const h = 19 * PX_PER_MM;   // ...× 19mm tall
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

    // Common-cathode lights on HIGH; common-anode sinks current, so a segment
    // lights when its driving pin goes LOW.
    const isCommonAnode = component.properties.commonType === "anode";
    for (const seg of signalSegments) {
      const pinsForSegment = segmentPins.get(seg);
      if (!pinsForSegment || pinsForSegment.size === 0) continue;
      for (const pin of pinsForSegment) {
        const state = pinStates[pin];
        if (!state || state.mode !== "OUTPUT") continue;
        const driveOn = isCommonAnode
          ? (state.isPwm ? state.pwmValue < 255 : state.digitalValue === 0)
          : state.digitalValue === 1 || state.pwmValue > 0;
        if (driveOn) {
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
  const windowPad = 1.1 * PX_PER_MM;
  const wx = x - w / 2 + windowPad;
  const wy = y - h / 2 + windowPad;
  const ww = w - windowPad * 2 - 3; // leave room for DP on right
  const wh = h - windowPad * 2;

  const segLen = ww - 4;
  const segH = (wh - 6) / 2 - 1;
  const segThick = 1.6 * PX_PER_MM; // ~1.6mm segment width
  const bevel = 0.65 * PX_PER_MM;

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
      <circle cx={dpX} cy={dpY} r={0.4 * PX_PER_MM} fill={segOffColor} opacity={0.9} />

      {/* Lit segments on top with glow */}
      {(Object.keys(paths) as Array<keyof typeof paths>).map(seg => lit[seg] && (
        <g key={seg} filter={`url(#${glowId})`}>
          <path d={paths[seg]} fill={segOnColor} />
          <path d={paths[seg]} fill="#ffffff" opacity={0.25} />
        </g>
      ))}
      {lit.dp && (
        <g filter={`url(#${glowId})`}>
          <circle cx={dpX} cy={dpY} r={0.4 * PX_PER_MM} fill={segOnColor} />
        </g>
      )}

      {/* Decimal point */}
      <circle cx={rightX + 3} cy={botY - 0.5} r={0.3 * PX_PER_MM} fill={segOffColor} />

      {/* Component label */}
      <text x={x} y={y + h / 2 + 6} textAnchor="middle" fontSize={LABEL_FONT_SIZE} fill="#888" fontFamily="monospace">
        {component.name}
      </text>
    </g>
  );
}

function RelayRenderer({ component, pinStates, wires, isSelected }: {
  component: BoardComponent;
  pinStates: PinState[];
  wires?: Record<string, Wire>;
  isSelected: boolean;
}) {
  // Vertical 3-pin layout: vcc / signal / gnd (row..row+2, col)
  const pins = [0, 1, 2].map(i =>
    gridToPixel({ row: component.y + i, col: component.x }),
  );
  const pinTop = pins[0];
  const pinBot = pins[2];
  // PCB sits to the LEFT of the pin column. Single-channel module 43 × 26mm.
  const pcbW = 43 * PX_PER_MM;  // 43mm wide
  const pcbH = 26 * PX_PER_MM;  // ...× 26mm tall
  const pcbCx = pinTop.x - pcbW / 2 - 8;
  const pcbCy = (pinTop.y + pinBot.y) / 2;
  const pcbL = pcbCx - pcbW / 2;
  const pcbT = pcbCy - pcbH / 2;
  const x = pcbCx;
  const y = pcbT;

  // Read signal pin state: HIGH = energized (active-high module).
  // Saved boards keep component.pins.signal null and derive connections from
  // wires, so resolve the driven Arduino pin from the wire graph (matching how
  // the button resolves its input pin) rather than reading the always-null field.
  const signalPin = findArduinoPinForComponentPin(component, ["signal", "out"], wires ?? {});
  const energized =
    signalPin != null && pinStates[signalPin]?.digitalValue === 1;

  // Blue SRD-05VDC-SL-C relay can (19 × 15.5mm) on the left half of the board
  const cubeW = 19 * PX_PER_MM;
  const cubeH = 15.5 * PX_PER_MM;
  const cubeL = pcbL + 2 * PX_PER_MM;
  const cubeT = pcbT + (pcbH - cubeH) / 2 + 1.5 * PX_PER_MM;

  // Green terminal block (3 screw terminals) on the right edge
  const tbW = 7 * PX_PER_MM;
  const tbH = 16 * PX_PER_MM;
  const tbL = pcbL + pcbW - tbW - 1.5 * PX_PER_MM;
  const tbT = pcbCy - tbH / 2;

  // Status LED position (top strip, between the can and the terminal block)
  const ledX = pcbL + cubeW + 2 * PX_PER_MM;
  const ledY = pcbT + 3 * PX_PER_MM;
  const ledColor = energized ? "#22c55e" : "#1f2937";
  const ledRim = energized ? "#86efac" : "#4b5563";

  const pcbGradId = `relay-pcb-${component.id}`;
  const cubeGradId = `relay-cube-${component.id}`;
  const termGradId = `relay-term-${component.id}`;
  const glowId = `relay-glow-${component.id}`;
  const contactPivotX = cubeL + cubeW * 0.2;
  const contactY = cubeT + cubeH - cubeH * 0.25;
  const contactEndX = cubeL + cubeW - cubeW * 0.2;
  const contactOpenY = contactY - cubeH * 0.18;
  const contactClosedY = contactY;

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
      {[[pcbL + 2.5 * PX_PER_MM, pcbT + 2.5 * PX_PER_MM], [pcbL + pcbW - 2.5 * PX_PER_MM, pcbT + 2.5 * PX_PER_MM], [pcbL + 2.5 * PX_PER_MM, pcbT + pcbH - 2.5 * PX_PER_MM], [pcbL + pcbW - 2.5 * PX_PER_MM, pcbT + pcbH - 2.5 * PX_PER_MM]].map(([cx, cy], i) => (
        <g key={i}>
          <circle cx={cx} cy={cy} r={0.6 * PX_PER_MM} fill="#cbd5e1" />
          <circle cx={cx} cy={cy} r={0.3 * PX_PER_MM} fill="#0f172a" />
        </g>
      ))}

      {/* Silkscreen label at top */}
      <text x={pcbL + 2 * PX_PER_MM} y={pcbT + 3.2 * PX_PER_MM} fontSize={5} fill="#dbeafe" fontFamily="monospace">RELAY 1CH</text>

      {/* Status LED */}
      <circle cx={ledX} cy={ledY} r={0.55 * PX_PER_MM} fill={ledRim} />
      <circle cx={ledX} cy={ledY} r={0.38 * PX_PER_MM} fill={ledColor}
        filter={energized ? `url(#${glowId})` : undefined} />
      {energized && (
        <circle cx={ledX - 0.4} cy={ledY - 0.5} r={0.13 * PX_PER_MM} fill="#ffffff" opacity={0.7} />
      )}

      {/* Green terminal block with 3 screw terminals (NO / COM / NC) */}
      <rect x={tbL} y={tbT} width={tbW} height={tbH} rx={0.8}
        fill={`url(#${termGradId})`}
        stroke="#064e3b" strokeWidth={0.5} />
      {/* Screw slots */}
      {[0, 1, 2].map(i => {
        const sy = tbT + tbH * 0.18 + i * (tbH * 0.31);
        return (
          <g key={i}>
            <circle cx={tbL + tbW / 2} cy={sy} r={tbW * 0.3} fill="#9ca3af" stroke="#374151" strokeWidth={0.5} />
            <circle cx={tbL + tbW / 2} cy={sy} r={tbW * 0.21} fill="#6b7280" />
            <line x1={tbL + tbW / 2 - tbW * 0.18} y1={sy} x2={tbL + tbW / 2 + tbW * 0.18} y2={sy}
              stroke="#1f2937" strokeWidth={0.7} />
          </g>
        );
      })}

      {/* Relay cube body */}
      <rect x={cubeL + 1} y={cubeT + 1.5} width={cubeW} height={cubeH} rx={1.5} fill="#00000050" />
      <rect x={cubeL} y={cubeT} width={cubeW} height={cubeH} rx={1.5}
        fill={`url(#${cubeGradId})`}
        stroke="#0c1e4f" strokeWidth={0.8} />

      {/* Top face of cube (perspective hint) */}
      <path
        d={`M ${cubeL} ${cubeT} L ${cubeL + 0.5 * PX_PER_MM} ${cubeT - 0.4 * PX_PER_MM} L ${cubeL + cubeW + 0.5 * PX_PER_MM} ${cubeT - 0.4 * PX_PER_MM} L ${cubeL + cubeW} ${cubeT} Z`}
        fill="#60a5fa"
        opacity={0.85}
      />

      {/* Cube label — SRD-05VDC style */}
      <text x={cubeL + cubeW / 2} y={cubeT + cubeH * 0.24} textAnchor="middle" fontSize={5} fill="#dbeafe" fontFamily="monospace" fontWeight="bold">
        SRD-05
      </text>
      <text x={cubeL + cubeW / 2} y={cubeT + cubeH * 0.42} textAnchor="middle" fontSize={4} fill="#bfdbfe" fontFamily="monospace">
        VDC-SL-C
      </text>
      {/* Armature contact diagram — the arm snaps closed when the coil is
          energized. Purely mechanical: no glow, no sparking; the steady
          status LED is the electrical cue. */}
      <circle cx={contactPivotX} cy={contactY} r={0.4 * PX_PER_MM} fill="#bfdbfe" opacity={0.8} />
      <circle cx={contactEndX} cy={contactY} r={0.4 * PX_PER_MM} fill="#93c5fd" opacity={0.85} />
      <line
        x1={contactPivotX}
        y1={contactY}
        x2={contactEndX}
        y2={energized ? contactClosedY : contactOpenY}
        stroke="#bfdbfe"
        strokeWidth={1.6}
        strokeLinecap="round"
      />
      <text x={cubeL + cubeW / 2} y={cubeT + cubeH - 1 * PX_PER_MM} textAnchor="middle" fontSize={3.5} fill="#93c5fd" fontFamily="monospace">
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

/**
 * Drives a continuously-accumulating SVG rotation via requestAnimationFrame.
 *
 * SMIL <animateTransform> restarts its timeline from 0° whenever the `dur`
 * attribute changes — and during spin-up the sketch nudges the PWM duty every
 * ~30ms, so a SMIL-driven rotor visibly snaps back to zero on every step.
 * Accumulating the angle in a ref instead means a speed change only alters how
 * fast the angle grows; the rotor never jumps. The velocity also eases toward
 * its target each frame, so the motor spins up smoothly rather than popping to
 * full speed. Transforms are written directly to the DOM nodes to avoid a React
 * re-render per frame.
 */
function useMotorSpin(
  copperTargetVel: number,
  ringTargetVel: number,
  cx: number,
  cy: number,
  active: boolean,
) {
  const copperRef = useRef<SVGGElement>(null);
  const ringRef = useRef<SVGCircleElement>(null);
  const copperAngle = useRef(0);
  const ringAngle = useRef(0);
  const copperVel = useRef(0);
  const ringVel = useRef(0);
  // Targets refresh every render without restarting the rAF loop below.
  const copperTarget = useRef(copperTargetVel);
  const ringTarget = useRef(ringTargetVel);
  copperTarget.current = copperTargetVel;
  ringTarget.current = ringTargetVel;

  useEffect(() => {
    if (!active) return;
    const SMOOTH = 3.5; // velocity easing rate (~0.3s spin-up time constant)
    let raf = 0;
    let last: number | null = null;
    const tick = (t: number) => {
      raf = requestAnimationFrame(tick);
      if (last == null) {
        last = t;
        return;
      }
      const dt = Math.min(0.1, (t - last) / 1000); // clamp after background tabs
      last = t;
      const ease = Math.min(1, dt * SMOOTH);
      copperVel.current += (copperTarget.current - copperVel.current) * ease;
      ringVel.current += (ringTarget.current - ringVel.current) * ease;
      copperAngle.current = (copperAngle.current + copperVel.current * dt) % 360;
      ringAngle.current = (ringAngle.current + ringVel.current * dt) % 360;
      copperRef.current?.setAttribute("transform", `rotate(${copperAngle.current.toFixed(2)} ${cx} ${cy})`);
      ringRef.current?.setAttribute("transform", `rotate(${ringAngle.current.toFixed(2)} ${cx} ${cy})`);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      // Reset so the next spin-up always eases from rest, not the old speed.
      copperVel.current = 0;
      ringVel.current = 0;
    };
  }, [active, cx, cy]);

  return { copperRef, ringRef };
}

function DcMotorRenderer({ component, pinStates, wires, isSelected }: {
  component: BoardComponent;
  pinStates: PinState[];
  wires?: Record<string, Wire>;
  isSelected: boolean;
}) {
  const { x, y } = gridToPixel({ row: component.y, col: component.x });
  // 130-size can lying on its side: 25mm long × 20.4mm dia (flat-sided oval).
  // The spinning armature shows through a rotor window centred on the anchor.
  const CAN_L = 25 * PX_PER_MM;   // 25mm long (horizontal)
  const CAN_W = 20.4 * PX_PER_MM; // 20.4mm dia (vertical)
  const ROTOR_R = 9 * PX_PER_MM;  // visible armature disc

  // Read PWM or digital value from signal pin — duty cycle drives spin speed.
  // Resolve from wiring since saved boards keep component.pins.signal null.
  const signalPin = findArduinoPinForComponentPin(component, ["signal", "out"], wires ?? {});
  const pinState = signalPin != null ? pinStates[signalPin] : undefined;
  const duty = pinState
    ? pinState.isPwm
      ? pinState.pwmValue / 255
      : pinState.digitalValue
    : 0;
  const isSpinning = duty > 0.01;
  // Period: 1.3s at full speed → 3.5s near stall. Kept deliberately slow — the
  // windings have 3-fold symmetry, so a fast spin on a sharp repeating pattern
  // strobes (wagon-wheel effect) and reads as jank. At ~1.3s/rev the spokes
  // stay trackable on a 60fps display.
  const spinPeriodNum = 1.3 + (1 - duty) * 2.2;
  const spinPeriod = isSpinning ? spinPeriodNum.toFixed(2) : "0";
  // Angular velocities (deg/s) fed to the rAF spin loop. The dashed ring runs
  // a touch faster (shorter period) than the copper windings, as before.
  const ringPeriod = Math.max(0.9, spinPeriodNum * 0.75);
  const copperVel = isSpinning ? 360 / spinPeriodNum : 0;
  const ringVel = isSpinning ? 360 / ringPeriod : 0;
  const { copperRef, ringRef } = useMotorSpin(copperVel, ringVel, x, y, isSpinning);
  // Brighten the static glow and fade the sharp spokes as speed rises, so a
  // fast spin reads as a glowing disk ("too fast to see windings") instead of
  // strobing spokes.
  const motionOpacity = 0.25 + Math.min(0.5, duty * 0.5);
  const windingOpacity = 0.92 - Math.min(0.5, duty * 0.5);
  const windingStroke = duty > 0.65 ? "#fde68a" : "#fbbf24";

  const caseGradId = `motor-case-${component.id}`;
  const innerGradId = `motor-inner-${component.id}`;
  const shaftGradId = `motor-shaft-${component.id}`;
  const motionGradId = `motor-motion-${component.id}`;
  const copperGradId = `motor-copper-${component.id}`;

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
        <radialGradient id={motionGradId} cx="50%" cy="50%" r="55%">
          <stop offset="0%" stopColor="#fef3c7" stopOpacity={0.95} />
          <stop offset="38%" stopColor="#fbbf24" stopOpacity={0.45} />
          <stop offset="78%" stopColor="#f97316" stopOpacity={0.16} />
          <stop offset="100%" stopColor="#f97316" stopOpacity={0} />
        </radialGradient>
        <linearGradient id={copperGradId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#facc15" />
          <stop offset="45%" stopColor="#fb923c" />
          <stop offset="100%" stopColor="#7c2d12" />
        </linearGradient>
      </defs>

      {/* Drop shadow beneath the can */}
      <ellipse cx={x} cy={y + CAN_W / 2 + 1.5} rx={CAN_L / 2 - 2} ry={3} fill="#00000060" />

      {/* Terminal tabs on the back (left) end */}
      <rect x={x - CAN_L / 2 - 2.6 * PX_PER_MM} y={y - 2.6 * PX_PER_MM} width={2.6 * PX_PER_MM} height={1.8 * PX_PER_MM} rx={0.5} fill="#c0c0c0" stroke="#525252" strokeWidth={0.4} />
      <rect x={x - CAN_L / 2 - 2.6 * PX_PER_MM} y={y + 0.8 * PX_PER_MM} width={2.6 * PX_PER_MM} height={1.8 * PX_PER_MM} rx={0.5} fill="#c0c0c0" stroke="#525252" strokeWidth={0.4} />

      {/* Output shaft — 9.4 × 2mm out the front (right) end */}
      <rect x={x + CAN_L / 2} y={y - 1 * PX_PER_MM} width={9.4 * PX_PER_MM} height={2 * PX_PER_MM} rx={1}
        fill={`url(#${shaftGradId})`} stroke="#44403c" strokeWidth={0.4} />

      {/* Motor can — flat-sided oval (stadium), 25 × 20.4mm */}
      <rect x={x - CAN_L / 2} y={y - CAN_W / 2} width={CAN_L} height={CAN_W} rx={CAN_W / 2} ry={CAN_W / 2}
        fill={`url(#${caseGradId})`}
        stroke={isSelected ? "#3b82f6" : "#1f2937"}
        strokeWidth={isSelected ? 1.8 : 1} />

      {/* Crimp seams near each end of the can */}
      <line x1={x - CAN_L / 2 + CAN_W * 0.5} y1={y - CAN_W / 2 + 3} x2={x - CAN_L / 2 + CAN_W * 0.5} y2={y + CAN_W / 2 - 3} stroke="#1f2937" strokeWidth={0.6} opacity={0.5} />
      <line x1={x + CAN_L / 2 - CAN_W * 0.5} y1={y - CAN_W / 2 + 3} x2={x + CAN_L / 2 - CAN_W * 0.5} y2={y + CAN_W / 2 - 3} stroke="#1f2937" strokeWidth={0.6} opacity={0.5} />

      {/* Rotor window (front-bell opening) showing the armature */}
      <circle cx={x} cy={y} r={ROTOR_R + 2} fill="#0f172a" opacity={0.6} />
      <circle cx={x} cy={y} r={ROTOR_R} fill={`url(#${innerGradId})`} stroke="#0f172a" strokeWidth={0.6} />

      {/* Rotor / armature: running state spins a copper winding disk over a
          static glow gradient. No SVG filters here — re-rasterizing a blur on
          the rotating group every frame is what made the spin-up janky. */}
      <g>
        {isSpinning ? (
          <>
            <circle
              cx={x}
              cy={y}
              r={ROTOR_R * 0.96}
              fill={`url(#${motionGradId})`}
              opacity={motionOpacity}
            />
            <circle
              ref={ringRef}
              cx={x}
              cy={y}
              r={ROTOR_R * 0.9}
              fill="none"
              stroke="#fef3c7"
              strokeWidth={1}
              strokeDasharray="4 6"
              opacity={0.55}
            />
            <g ref={copperRef}>
                {[0, 120, 240].map((angle, i) => {
                  const rad = (angle * Math.PI) / 180;
                  const tip = ROTOR_R * 0.88;
                  const ctrl = ROTOR_R * 0.46;
                  const x1 = x + Math.cos(rad - 0.22) * ROTOR_R * 0.21;
                  const y1 = y + Math.sin(rad - 0.22) * ROTOR_R * 0.21;
                  const cx1 = x + Math.cos(rad + 0.42) * ctrl;
                  const cy1 = y + Math.sin(rad + 0.42) * ctrl;
                  const x2 = x + Math.cos(rad) * tip;
                  const y2 = y + Math.sin(rad) * tip;
                  return (
                    <path
                      key={i}
                      d={`M ${x1} ${y1} Q ${cx1} ${cy1} ${x2} ${y2}`}
                      fill="none"
                      stroke={windingStroke}
                      strokeWidth={4}
                      strokeLinecap="round"
                      opacity={windingOpacity}
                    />
                  );
                })}
                {[60, 180, 300].map((angle, i) => {
                  const rad = (angle * Math.PI) / 180;
                  const x2 = x + Math.cos(rad) * (ROTOR_R * 0.72);
                  const y2 = y + Math.sin(rad) * (ROTOR_R * 0.72);
                  return (
                    <line
                      key={i}
                      x1={x}
                      y1={y}
                      x2={x2}
                      y2={y2}
                      stroke="#fef3c7"
                      strokeWidth={1.4}
                      strokeLinecap="round"
                      opacity={Math.min(0.48, windingOpacity)}
                    />
                  );
                })}
                <circle cx={x} cy={y} r={ROTOR_R * 0.3} fill={`url(#${copperGradId})`} stroke="#fef3c7" strokeWidth={1} />
                <circle cx={x} cy={y} r={ROTOR_R * 0.12} fill="#111827" opacity={0.75} />
            </g>
          </>
        ) : (
          <g>
            {/* Static rotor when stopped */}
            {[0, 120, 240].map((angle, i) => {
              const rad = (angle * Math.PI) / 180;
              const x2 = x + Math.cos(rad) * (ROTOR_R * 0.9);
              const y2 = y + Math.sin(rad) * (ROTOR_R * 0.9);
              return (
                <line
                  key={i}
                  x1={x}
                  y1={y}
                  x2={x2}
                  y2={y2}
                  stroke="#6b7280"
                  strokeWidth={2}
                  strokeLinecap="round"
                  opacity={0.7}
                />
              );
            })}
            <circle cx={x} cy={y} r={ROTOR_R * 0.15} fill="#9ca3af" />
          </g>
        )}
      </g>

      {/* Motor embossed "M" label (below the can) */}
      <text x={x} y={y + CAN_W / 2 + 14} textAnchor="middle" fontSize={6} fill="#9ca3af" fontFamily="monospace" fontWeight="bold">
        MOTOR
      </text>

      {/* Duty readout */}
      {isSpinning && (
        <text x={x} y={y + CAN_W / 2 + 26} textAnchor="middle" fontSize={6} fill="#fbbf24" fontFamily="monospace">
          {Math.round(duty * 100)}% • {spinPeriod}s
        </text>
      )}

      {/* Signal pin header below */}
      <line x1={x} y1={y + CAN_W / 2 + 30} x2={x} y2={y + CAN_W / 2 + 37} stroke="#c0c0c0" strokeWidth={1.3} strokeLinecap="round" />

      <PinLabel x={x} y={y + CAN_W / 2 + 37} name="signal" side="below" />
      <text x={x} y={y + CAN_W / 2 + 46} textAnchor="middle" fontSize={LABEL_FONT_SIZE} fill="#888" fontFamily="monospace">
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

  // DHT11 blue grille housing, body sits to the LEFT of the pin column.
  // Real DHT11 case is 12mm wide × 15.5mm tall (portrait), drawn at true size.
  const bW  = 12 * PX_PER_MM;    // 12mm wide
  const bH  = 15.5 * PX_PER_MM;  // ...× 15.5mm tall
  const bodyCx = pinData.x - bW / 2 - 10;
  const bodyCy = pinData.y;
  const bL  = bodyCx - bW / 2;
  const bT  = bodyCy - bH / 2;

  // Sensing grille area (top ~55% of front face)
  const grilleT = bT + 4;
  const grilleH = bH * 0.55;
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
      <text x={bodyCx} y={labelT + 6} textAnchor="middle"
        fontSize={6.5} fill="#a5e8f7" fontFamily="monospace" fontWeight="bold">
        DHT11
      </text>
      <text x={bodyCx} y={labelT + 13} textAnchor="middle"
        fontSize={4.5} fill="#5bc8e2" fontFamily="monospace">
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

// 74HC595 DIP-16 silkscreen labels, top → bottom on each side. Mirrors the
// datasheet pinout encoded in component-pins.ts (resolveComponentPins).
//   Left  (pins 1-8):  Q1..Q7, GND
//   Right (pins 16-9): VCC, Q0, DS(data), /OE, ST(latch), SH(clock), /MR, Q7'
const SR_LEFT_LABELS = ["Q1", "Q2", "Q3", "Q4", "Q5", "Q6", "Q7", "GND"] as const;
const SR_RIGHT_LABELS = ["VCC", "Q0", "DS", "OE", "ST", "SH", "MR", "Q7'"] as const;

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

  // DIP-16 body: 6.35mm wide (0.25"), 19mm long, centred between the two pin
  // columns. Legs bridge from each body edge out to the pin holes.
  const bodyW = 6.35 * PX_PER_MM;   // DIP-16 body width
  const bodyH = 19 * PX_PER_MM;     // ...× 19mm long
  const midX = (topLeft.x + topRight.x) / 2;
  const bodyL = midX - bodyW / 2;
  const bodyR = midX + bodyW / 2;
  const bodyCx = midX;
  const bodyT = (topLeft.y + bottomLeft.y) / 2 - bodyH / 2;

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
        d={`M ${bodyCx - 1.2 * PX_PER_MM} ${bodyT} A ${1.2 * PX_PER_MM} ${1.2 * PX_PER_MM} 0 0 0 ${bodyCx + 1.2 * PX_PER_MM} ${bodyT}`}
        fill="#0d0d0d"
        stroke="#555" strokeWidth={0.5}
      />

      {/* Pin 1 dot — top-left corner of body */}
      <circle cx={bodyL + 1.1 * PX_PER_MM} cy={bodyT + 1.4 * PX_PER_MM} r={0.35 * PX_PER_MM} fill="#5a8a5a" opacity={0.9} />

      {/* Silkscreen text — two lines centred on body */}
      <text x={bodyCx} y={bodyT + bodyH / 2 - 3} textAnchor="middle"
        fontSize={4.5} fill="#c8c8c8" fontFamily="monospace" fontWeight="bold">
        74HC595
      </text>
      <text x={bodyCx} y={bodyT + bodyH / 2 + 3.5} textAnchor="middle"
        fontSize={3} fill="#909090" fontFamily="monospace">
        SN74HC595N
      </text>
      {/* Manufacturer dot / date code area */}
      <text x={bodyCx} y={bodyT + bodyH / 2 + 9} textAnchor="middle"
        fontSize={2.6} fill="#606060" fontFamily="monospace">
        TI  2023
      </text>

      {/* Left-side pin labels (pins 1-8, top→bottom): Q1..Q7, GND */}
      {leftPins.map((pin, i) => (
        <text key={`ln-${i}`}
          x={bodyL + 2} y={pin.y + 1.1}
          textAnchor="start" fontSize={2.1}
          fill={i < 7 ? "#9ca3af" : "#666"} fontFamily="monospace">
          {SR_LEFT_LABELS[i]}
        </text>
      ))}
      {/* Right-side pin labels (pins 16-9, top→bottom): VCC, Q0, DS, OE, ST, SH, MR, Q7'.
          rightPins is indexed bottom→top, so map back to the top→bottom slot. */}
      {rightPins.map((pin, i) => (
        <text key={`rn-${i}`}
          x={bodyR - 2} y={pin.y + 1.1}
          textAnchor="end" fontSize={2.1}
          fill={SR_RIGHT_LABELS[rowCount - 1 - i] === "Q0" ? "#9ca3af" : "#666"} fontFamily="monospace">
          {SR_RIGHT_LABELS[rowCount - 1 - i]}
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
  // Real SSD1306 0.96" module: 27.3 × 27.8mm PCB, 21.7 × 10.9mm display area.
  const w = 27.3 * PX_PER_MM;  // PCB 27.3mm wide
  const h = 27.8 * PX_PER_MM;  // ...× 27.8mm tall
  const bodyCx = pinTop.x - w / 2 - 10;
  const bodyCy = (pinTop.y + pinBot.y) / 2;
  const bodyL = bodyCx - w / 2;
  const bodyT = bodyCy - h / 2;

  // 4-pin header row sits along the RIGHT edge of the PCB
  const headerX = bodyL + w;   // right edge of PCB = pin header column

  // Active OLED glass at true SSD1306 size (21.7 × 10.9mm), seated near the top
  // of the PCB; a small dark bezel frames it.
  const activeW = 21.7 * PX_PER_MM;  // active area 21.7mm wide
  const activeH = 10.9 * PX_PER_MM;  // ...× 10.9mm tall
  const activeL = bodyCx - activeW / 2;
  const activeT = bodyT + 5 * PX_PER_MM;
  const bezelInset = 1.5 * PX_PER_MM;
  const screenL = activeL - bezelInset;
  const screenT = activeT - bezelInset;
  const screenW = activeW + 2 * bezelInset;
  const screenH = activeH + 2 * bezelInset;

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
      {[[bodyL + 2.5 * PX_PER_MM, bodyT + 2.5 * PX_PER_MM], [bodyL + w - 2.5 * PX_PER_MM, bodyT + 2.5 * PX_PER_MM], [bodyL + 2.5 * PX_PER_MM, bodyT + h - 2.5 * PX_PER_MM], [bodyL + w - 2.5 * PX_PER_MM, bodyT + h - 2.5 * PX_PER_MM]].map(([hx, hy], i) => (
        <g key={i}>
          <circle cx={hx} cy={hy} r={1.1 * PX_PER_MM} fill="#0d1730" stroke="#2a4a8a" strokeWidth={0.5} />
          <circle cx={hx} cy={hy} r={0.6 * PX_PER_MM} fill="#0a1220" />
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
            textAnchor="middle" fontSize={5.5}
            fill="#06b6d4" fontFamily="monospace" opacity={0.9}>
            128×64
          </text>
          <text x={activeL + activeW / 2} y={activeT + activeH * 0.65}
            textAnchor="middle" fontSize={4.5}
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
      <text x={bodyL + 2.5 * PX_PER_MM} y={bodyT + h - 2.5 * PX_PER_MM} textAnchor="start"
        fontSize={4} fill="#4a6aa0" fontFamily="monospace">
        I2C 0x3C
      </text>
      <text x={bodyL + w - 2.5 * PX_PER_MM} y={bodyT + h - 2.5 * PX_PER_MM} textAnchor="end"
        fontSize={4} fill="#3a5a80" fontFamily="monospace">
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
  // Dimming signals "this part has no current flowing through it" — useful
  // for analog parts like buzzers/motors/sensors whose visual has no other
  // on/off cue. Digital peripherals (LCD, 7-seg, OLED, NeoPixel, shift
  // register) already render their own display state, so dimming them based
  // on voltage drop lies: the LCD's 10kΩ pull-downs never drop the 2V the
  // isActive heuristic demands, even when the panel is working perfectly.
  const isDimmed = electricalState != null && !electricalState.isActive;
  const dimOpacity = isDimmed ? 0.5 : 1;

  // Route to specialized renderers
  switch (component.type) {
    case "buzzer":
      return <g opacity={dimOpacity}><BuzzerRenderer component={component} isSelected={isSelected} electricalState={electricalState} /></g>;
    case "potentiometer":
      return <g opacity={dimOpacity}><PotentiometerRenderer component={component} isSelected={isSelected} /></g>;
    case "lcd_16x2":
      return <LcdRenderer component={component} isSelected={isSelected} libraryState={libraryState} />;
    case "temperature_sensor":
      return <TemperatureSensorRenderer component={component} isSelected={isSelected} />;
    case "photoresistor":
      return <g opacity={dimOpacity}><PhotoresistorRenderer component={component} isSelected={isSelected} /></g>;
    case "ultrasonic_sensor":
      return <g opacity={dimOpacity}><UltrasonicSensorRenderer component={component} isSelected={isSelected} /></g>;
    case "ir_receiver":
      return <g opacity={dimOpacity}><IrReceiverRenderer component={component} isSelected={isSelected} /></g>;
    case "neopixel":
      return <NeoPixelRenderer component={component} isSelected={isSelected} libraryState={libraryState} />;
    case "pir_sensor":
      return <g opacity={dimOpacity}><PirRenderer component={component} isSelected={isSelected} /></g>;
    case "relay":
      return <g opacity={dimOpacity}><RelayRenderer component={component} pinStates={pinStates} wires={wires} isSelected={isSelected} /></g>;
    case "dc_motor":
      return <g opacity={dimOpacity}><DcMotorRenderer component={component} pinStates={pinStates} wires={wires} isSelected={isSelected} /></g>;
    case "seven_segment":
      return <SevenSegmentRenderer component={component} components={components} pinStates={pinStates} wires={wires} isSelected={isSelected} />;
    case "dht_sensor":
      return <g opacity={dimOpacity}><DhtSensorRenderer component={component} isSelected={isSelected} /></g>;
    case "shift_register":
      return <ShiftRegisterRenderer component={component} isSelected={isSelected} />;
    case "oled_display":
      return <OledRenderer component={component} isSelected={isSelected} libraryState={libraryState} />;
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
