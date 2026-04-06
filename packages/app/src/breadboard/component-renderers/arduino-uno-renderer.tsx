import React from "react";
import {
  ARDUINO_BOARD_WIDTH,
  ARDUINO_BOARD_HEIGHT,
  ARDUINO_DIGITAL_PINS,
  ARDUINO_ANALOG_PINS,
  ARDUINO_POWER_PINS,
} from "@/breadboard/breadboard-grid";
import type { ArduinoPinInfo } from "@/breadboard/breadboard-grid";
import { ArduinoPin } from "./arduino-pin";

const ARDUINO_X = 10;
const ARDUINO_Y = 20;

type ArduinoUnoBoardProps = {
  onStartWireFromPin: (pin: ArduinoPinInfo) => void;
  wiringFromPin: ArduinoPinInfo | null;
};

/**
 * Arduino Uno R3 board — realistic SVG rendering with interactive pins.
 * Matches the real board layout: blue PCB, USB-B top-left, barrel jack below,
 * digital pins along the top edge, power + analog pins along the bottom.
 *
 * Note: pinStates are NOT passed as props. Each ArduinoPin subscribes to
 * its own pin state via useBoardSelector, so the board only re-renders
 * when wiringFromPin changes.
 */
function ArduinoUnoBoardInner({
  onStartWireFromPin,
  wiringFromPin,
}: ArduinoUnoBoardProps) {
  const x = ARDUINO_X;
  const y = ARDUINO_Y;
  const w = ARDUINO_BOARD_WIDTH;
  const h = ARDUINO_BOARD_HEIGHT;

  // Board shape: top-left notch for USB protrusion
  const notchW = 44;
  const notchH = 12;
  const cornerR = 6;

  // Board outline path with top-left notch
  const boardPath = [
    `M ${x + notchW} ${y}`,
    `L ${x + w - cornerR} ${y}`,
    `Q ${x + w} ${y} ${x + w} ${y + cornerR}`,
    `L ${x + w} ${y + h - cornerR}`,
    `Q ${x + w} ${y + h} ${x + w - cornerR} ${y + h}`,
    `L ${x + cornerR} ${y + h}`,
    `Q ${x} ${y + h} ${x} ${y + h - cornerR}`,
    `L ${x} ${y + notchH}`,
    `L ${x + notchW} ${y + notchH}`,
    `Z`,
  ].join(" ");

  return (
    <g>
      {/* Defs: PCB trace pattern */}
      <defs>
        <pattern
          id="pcb-traces"
          width={8}
          height={8}
          patternUnits="userSpaceOnUse"
        >
          <rect width={8} height={8} fill="none" />
          <line
            x1={0}
            y1={4}
            x2={8}
            y2={4}
            stroke="#3A8FCF"
            strokeWidth={0.3}
            opacity={0.15}
          />
          <line
            x1={4}
            y1={0}
            x2={4}
            y2={8}
            stroke="#3A8FCF"
            strokeWidth={0.3}
            opacity={0.15}
          />
        </pattern>
      </defs>

      {/* PCB shadow */}
      <path d={boardPath} transform="translate(3,3)" fill="#00000040" />

      {/* PCB body — blue */}
      <path
        d={boardPath}
        fill="#2B7EBF"
        stroke="#1A6BA0"
        strokeWidth={1.5}
      />

      {/* PCB trace pattern overlay */}
      <path d={boardPath} fill="url(#pcb-traces)" />

      {/* ── Mounting holes (4 corners) ── */}
      {[
        { cx: x + 18, cy: y + notchH + 14 },
        { cx: x + w - 14, cy: y + 14 },
        { cx: x + 14, cy: y + h - 14 },
        { cx: x + w - 14, cy: y + h - 14 },
      ].map((hole, i) => (
        <g key={`mount-${i}`}>
          <circle
            cx={hole.cx}
            cy={hole.cy}
            r={5}
            fill="#e0e0e0"
            stroke="#bdbdbd"
            strokeWidth={0.5}
          />
          <circle cx={hole.cx} cy={hole.cy} r={2.5} fill="#1A6BA0" />
        </g>
      ))}

      {/* ── USB Type-B connector (left side, upper) ── */}
      <rect
        x={x - 10}
        y={y + notchH - 8}
        width={40}
        height={16}
        rx={2}
        fill="#b0b0b0"
        stroke="#888888"
        strokeWidth={1}
      />
      <rect
        x={x - 6}
        y={y + notchH - 5}
        width={32}
        height={10}
        rx={1}
        fill="#d0d0d0"
      />
      {/* USB port opening */}
      <rect
        x={x - 8}
        y={y + notchH - 3}
        width={6}
        height={6}
        rx={0.5}
        fill="#606060"
      />

      {/* ── DC barrel jack (left side, lower) ── */}
      <rect
        x={x - 6}
        y={y + notchH + 28}
        width={30}
        height={14}
        rx={2}
        fill="#1a1a1a"
        stroke="#333333"
        strokeWidth={1}
      />
      <circle
        cx={x + 9}
        cy={y + notchH + 35}
        r={3.5}
        fill="#333333"
        stroke="#555555"
        strokeWidth={0.5}
      />
      <circle
        cx={x + 9}
        cy={y + notchH + 35}
        r={1.5}
        fill="#1a1a1a"
      />

      {/* ── Electrolytic capacitors (bottom-left near barrel jack) ── */}
      {[0, 14].map((offset, i) => (
        <g key={`cap-${i}`}>
          <rect
            x={x + 8 + offset}
            y={y + notchH + 52}
            width={10}
            height={16}
            rx={2}
            fill="#c0c0c0"
            stroke="#a0a0a0"
            strokeWidth={0.5}
          />
          <ellipse
            cx={x + 13 + offset}
            cy={y + notchH + 52}
            rx={5}
            ry={3}
            fill="#d0d0d0"
            stroke="#b0b0b0"
            strokeWidth={0.3}
          />
          {/* Polarity stripe */}
          <line
            x1={x + 8 + offset}
            y1={y + notchH + 55}
            x2={x + 8 + offset}
            y2={y + notchH + 65}
            stroke="#888888"
            strokeWidth={1}
          />
        </g>
      ))}

      {/* ── Voltage regulator (small black component near caps) ── */}
      <rect
        x={x + 36}
        y={y + notchH + 56}
        width={12}
        height={8}
        rx={1}
        fill="#1a1a1a"
        stroke="#333333"
        strokeWidth={0.5}
      />

      {/* ── ATmega328P DIP-28 chip (center-lower) ── */}
      <rect
        x={x + w / 2 - 40}
        y={y + h / 2 + 10}
        width={80}
        height={28}
        rx={2}
        fill="#1a1a1a"
        stroke="#333333"
        strokeWidth={0.5}
      />
      {/* Chip notch (pin 1 indicator) */}
      <circle
        cx={x + w / 2 - 34}
        cy={y + h / 2 + 24}
        r={3}
        fill="none"
        stroke="#444444"
        strokeWidth={0.8}
      />
      {/* Chip label */}
      <text
        x={x + w / 2}
        y={y + h / 2 + 22}
        textAnchor="middle"
        fontSize={4.5}
        fill="#888888"
        fontFamily="monospace"
      >
        ATMEL
      </text>
      <text
        x={x + w / 2}
        y={y + h / 2 + 28}
        textAnchor="middle"
        fontSize={5}
        fill="#777777"
        fontFamily="monospace"
      >
        ATmega328P
      </text>
      {/* Chip pins (14 per side) */}
      {Array.from({ length: 14 }, (_, i) => (
        <React.Fragment key={`chip-leg-${i}`}>
          <rect
            x={x + w / 2 - 40 - 3}
            y={y + h / 2 + 12 + i * 1.8}
            width={3}
            height={1.2}
            fill="#b0b0b0"
          />
          <rect
            x={x + w / 2 + 40}
            y={y + h / 2 + 12 + i * 1.8}
            width={3}
            height={1.2}
            fill="#b0b0b0"
          />
        </React.Fragment>
      ))}

      {/* ── Crystal oscillator (silver ellipse near chip) ── */}
      <ellipse
        cx={x + w / 2 + 52}
        cy={y + h / 2 + 24}
        rx={6}
        ry={3}
        fill="#c8c8c8"
        stroke="#a0a0a0"
        strokeWidth={0.5}
      />

      {/* ── RESET button (red, top-left area near USB) ── */}
      <rect
        x={x + 54}
        y={y + notchH + 4}
        width={10}
        height={10}
        rx={2}
        fill="#d32f2f"
        stroke="#b71c1c"
        strokeWidth={0.8}
      />
      <text
        x={x + 59}
        y={y + notchH + 18}
        textAnchor="middle"
        fontSize={4}
        fill="#80d0f0"
        fontFamily="monospace"
      >
        RESET
      </text>

      {/* ── LEDs ── */}
      {/* TX LED */}
      <rect
        x={x + 80}
        y={y + 48}
        width={5}
        height={3}
        rx={0.5}
        fill="#ffcc02"
        stroke="#cc9900"
        strokeWidth={0.3}
      />
      <text
        x={x + 82.5}
        y={y + 45}
        textAnchor="middle"
        fontSize={3.5}
        fill="#80d0f0"
        fontFamily="monospace"
      >
        TX
      </text>

      {/* RX LED */}
      <rect
        x={x + 90}
        y={y + 48}
        width={5}
        height={3}
        rx={0.5}
        fill="#ffcc02"
        stroke="#cc9900"
        strokeWidth={0.3}
      />
      <text
        x={x + 92.5}
        y={y + 45}
        textAnchor="middle"
        fontSize={3.5}
        fill="#80d0f0"
        fontFamily="monospace"
      >
        RX
      </text>

      {/* L LED (built-in) */}
      <rect
        x={x + 100}
        y={y + 48}
        width={5}
        height={3}
        rx={0.5}
        fill="#ff9800"
        stroke="#e65100"
        strokeWidth={0.3}
      />
      <text
        x={x + 102.5}
        y={y + 45}
        textAnchor="middle"
        fontSize={3.5}
        fill="#80d0f0"
        fontFamily="monospace"
      >
        L
      </text>

      {/* ON LED (green) */}
      <rect
        x={x + 110}
        y={y + 48}
        width={5}
        height={3}
        rx={0.5}
        fill="#4caf50"
        stroke="#2e7d32"
        strokeWidth={0.3}
      />
      <text
        x={x + 112.5}
        y={y + 45}
        textAnchor="middle"
        fontSize={3.5}
        fill="#80d0f0"
        fontFamily="monospace"
      >
        ON
      </text>

      {/* ── ICSP headers (2x3 pin clusters) ── */}
      {/* ICSP1 (near top, right-center) */}
      {renderIcspHeader(x + w - 40, y + 30, "ICSP")}
      {/* ICSP2 (near reset button) */}
      {renderIcspHeader(x + 72, y + notchH + 4, "ICSP2")}

      {/* ── Arduino branding ── */}
      <text
        x={x + w / 2}
        y={y + h / 2 - 14}
        textAnchor="middle"
        fontSize={7}
        fill="#ffffff"
        fontFamily="sans-serif"
        fontWeight="bold"
        letterSpacing={1}
      >
        Arduino
      </text>
      {/* Infinity logo */}
      <text
        x={x + w / 2}
        y={y + h / 2 - 4}
        textAnchor="middle"
        fontSize={16}
        fill="#ffffff"
        fontFamily="sans-serif"
        opacity={0.9}
      >
        ∞
      </text>
      <text
        x={x + w / 2}
        y={y + h / 2 + 4}
        textAnchor="middle"
        fontSize={12}
        fill="#ffffff"
        fontFamily="sans-serif"
        fontWeight="bold"
      >
        UNO
      </text>
      <text
        x={x + w / 2}
        y={y + h - 56}
        textAnchor="middle"
        fontSize={4}
        fill="#80d0f0"
        fontFamily="sans-serif"
      >
        Arduino™
      </text>

      {/* ── Pin header labels ── */}
      {/* DIGITAL (PWM~) label above top pin header */}
      <text
        x={x + w / 2 + 30}
        y={y + 24}
        textAnchor="middle"
        fontSize={4.5}
        fill="#80d0f0"
        fontWeight="bold"
        fontFamily="monospace"
      >
        DIGITAL (PWM~)
      </text>

      {/* POWER label below bottom-left pin header */}
      <text
        x={x + 100}
        y={y + h - 18}
        textAnchor="middle"
        fontSize={4.5}
        fill="#80d0f0"
        fontWeight="bold"
        fontFamily="monospace"
      >
        POWER
      </text>

      {/* ANALOG IN label below bottom-right pin header */}
      <text
        x={x + 218}
        y={y + h - 18}
        textAnchor="middle"
        fontSize={4.5}
        fill="#80d0f0"
        fontWeight="bold"
        fontFamily="monospace"
      >
        ANALOG IN
      </text>

      {/* ── Top pin header background strip ── */}
      <rect
        x={x + 52}
        y={y + 2}
        width={w - 56}
        height={12}
        rx={1}
        fill="#1a1a1a"
        opacity={0.6}
      />

      {/* ── Bottom pin header background strips ── */}
      {/* Power */}
      <rect
        x={x + 52}
        y={y + h - 14}
        width={106}
        height={12}
        rx={1}
        fill="#1a1a1a"
        opacity={0.6}
      />
      {/* Analog */}
      <rect
        x={x + 178}
        y={y + h - 14}
        width={90}
        height={12}
        rx={1}
        fill="#1a1a1a"
        opacity={0.6}
      />

      {/* ── Interactive digital pins (top edge) ── */}
      {ARDUINO_DIGITAL_PINS.map((pin) => (
        <ArduinoPin
          key={`dpin-${pin.pin}-${pin.label}`}
          pin={pin}
          isWiring={wiringFromPin?.pin === pin.pin && wiringFromPin?.label === pin.label}
          onStartWire={onStartWireFromPin}
        />
      ))}

      {/* ── Interactive analog pins (bottom-right edge) ── */}
      {ARDUINO_ANALOG_PINS.map((pin) => (
        <ArduinoPin
          key={`apin-${pin.pin}`}
          pin={pin}
          isWiring={wiringFromPin?.pin === pin.pin && wiringFromPin?.label === pin.label}
          onStartWire={onStartWireFromPin}
        />
      ))}

      {/* ── Interactive power pins (bottom-left edge) ── */}
      {ARDUINO_POWER_PINS.map((pin) => (
        <ArduinoPin
          key={`ppin-${pin.pin}-${pin.label}`}
          pin={pin}
          isWiring={wiringFromPin?.pin === pin.pin && wiringFromPin?.label === pin.label}
          onStartWire={onStartWireFromPin}
        />
      ))}
    </g>
  );
}

function renderIcspHeader(cx: number, cy: number, label: string) {
  const pins: React.ReactElement[] = [];
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 3; c++) {
      pins.push(
        <circle
          key={`${label}-${r}-${c}`}
          cx={cx + c * 4}
          cy={cy + r * 4}
          r={1.5}
          fill="#1a1a1a"
          stroke="#888888"
          strokeWidth={0.4}
        />,
      );
    }
  }
  return (
    <g key={`icsp-${label}`}>
      {pins}
    </g>
  );
}

export const ArduinoUnoBoard = React.memo(ArduinoUnoBoardInner);

// Keep backward-compatible export for the component renderer map
export const ArduinoUnoRenderer = ArduinoUnoBoard;
