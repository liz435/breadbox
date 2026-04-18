import React from "react";
import type { BoardTarget } from "@dreamer/schemas";
import type { ArduinoPinInfo } from "@/breadboard/breadboard-grid";
import {
  ARDUINO_BOARD_HEIGHT,
  ARDUINO_BOARD_WIDTH,
} from "@/breadboard/breadboard-grid";
import { ArduinoPin } from "./arduino-pin";

type ArduinoAltBoardProps = {
  boardTarget: Exclude<BoardTarget, "arduino_uno">;
  boardLabel: string;
  onStartWireFromPin: (pin: ArduinoPinInfo) => void;
  wiringFromPin: ArduinoPinInfo | null;
  digitalPins: ArduinoPinInfo[];
  analogPins: ArduinoPinInfo[];
  powerPins: ArduinoPinInfo[];
};

const ARDUINO_X = 10;
const ARDUINO_Y = 20;

type BoardStyle = {
  /** Rendered board width on the canvas (SVG units). */
  width: number;
  /** Rendered board height. */
  height: number;
  /** PCB base colour. */
  fill: string;
  /** PCB edge stroke. */
  stroke: string;
  /** Accent text colour on the PCB silkscreen. */
  textFill: string;
  /** Sub-label accent (MCU family). */
  subTextFill: string;
  /** What to write under the board label. */
  mcuLabel: string;
  /** Rectangle artwork to draw on top of the PCB — headers, chips, USB. */
  artwork: (bx: number, by: number, boardH: number) => React.ReactNode;
};

function pickStyle(boardTarget: Exclude<BoardTarget, "arduino_uno">): BoardStyle {
  switch (boardTarget) {
    case "arduino_nano":
      return {
        width: 160,
        height: 176,
        fill: "#155E75",
        stroke: "#0E7490",
        textFill: "#dbeafe",
        subTextFill: "#bfdbfe",
        mcuLabel: "ATmega328P",
        artwork: (bx, by, boardH) => (
          <>
            <rect x={bx + 66} y={by + 58} width={28} height={78} rx={4} fill="#111827" stroke="#374151" strokeWidth={0.8} />
            <rect x={bx + 72} y={by + 18} width={16} height={28} rx={2} fill="#9ca3af" stroke="#6b7280" strokeWidth={0.8} />
            <rect x={bx + 13} y={by + 18} width={10} height={boardH - 36} rx={2} fill="#0f172a99" />
            <rect x={bx + 160 - 23} y={by + 18} width={10} height={boardH - 36} rx={2} fill="#0f172a99" />
          </>
        ),
      };
    case "arduino_mega_2560":
      return {
        width: 300,
        height: 200,
        fill: "#2563EB",
        stroke: "#1D4ED8",
        textFill: "#dbeafe",
        subTextFill: "#bfdbfe",
        mcuLabel: "ATmega2560",
        artwork: (bx, by) => (
          <>
            <rect x={bx + 18} y={by + 64} width={82} height={30} rx={4} fill="#111827" stroke="#374151" strokeWidth={0.8} />
            <rect x={bx + 116} y={by + 64} width={82} height={30} rx={4} fill="#111827" stroke="#374151" strokeWidth={0.8} />
            <rect x={bx + 214} y={by + 64} width={66} height={30} rx={4} fill="#111827" stroke="#374151" strokeWidth={0.8} />
            <rect x={bx - 9} y={by + 20} width={22} height={16} rx={2} fill="#9ca3af" stroke="#6b7280" strokeWidth={0.8} />
          </>
        ),
      };
    case "rpi_pico":
      return {
        width: 160,
        height: 180,
        // Pico's signature green with a slightly darker edge.
        fill: "#14532d",
        stroke: "#166534",
        textFill: "#d1fae5",
        subTextFill: "#a7f3d0",
        mcuLabel: "RP2040",
        artwork: (bx, by, boardH) => {
          const boardW = 160;
          return (
            <>
              {/* Pin header shadows along both long edges — Pico is a through-hole DIP-40 */}
              <rect x={bx + 13} y={by + 18} width={10} height={boardH - 36} rx={2} fill="#052e16" />
              <rect x={bx + boardW - 23} y={by + 18} width={10} height={boardH - 36} rx={2} fill="#052e16" />

              {/* Micro-USB connector at the top */}
              <rect x={bx + boardW / 2 - 10} y={by + 6} width={20} height={10} rx={2} fill="#9ca3af" stroke="#6b7280" strokeWidth={0.8} />

              {/* RP2040 square chip centred below the USB */}
              <rect x={bx + boardW / 2 - 14} y={by + 58} width={28} height={28} rx={2} fill="#111827" stroke="#374151" strokeWidth={0.8} />
              <text x={bx + boardW / 2} y={by + 74} textAnchor="middle" fontSize={5} fill="#9ca3af" fontFamily="monospace">
                RP2040
              </text>

              {/* QSPI flash rectangle below the SoC */}
              <rect x={bx + boardW / 2 - 10} y={by + 94} width={20} height={8} rx={1} fill="#111827" stroke="#374151" strokeWidth={0.5} />

              {/* BOOTSEL button near the top-right */}
              <rect x={bx + boardW - 32} y={by + 22} width={10} height={6} rx={1} fill="#1f2937" stroke="#374151" strokeWidth={0.5} />

              {/* Onboard LED on GP25 — small white dot near the chip */}
              <circle cx={bx + boardW / 2 + 24} cy={by + 110} r={2} fill="#f9fafb" stroke="#6b7280" strokeWidth={0.4} />
            </>
          );
        },
      };
  }
}

function ArduinoAltBoardInner({
  boardTarget,
  boardLabel,
  onStartWireFromPin,
  wiringFromPin,
  digitalPins,
  analogPins,
  powerPins,
}: ArduinoAltBoardProps) {
  const x = ARDUINO_X;
  const y = ARDUINO_Y;
  const w = ARDUINO_BOARD_WIDTH;
  const h = ARDUINO_BOARD_HEIGHT;
  const style = pickStyle(boardTarget);
  const bx = x + (w - style.width) / 2;
  const by = y + (h - style.height) / 2;

  return (
    <g>
      <rect x={bx + 3} y={by + 3} width={style.width} height={style.height} rx={10} fill="#00000044" />
      <rect x={bx} y={by} width={style.width} height={style.height} rx={10} fill={style.fill} stroke={style.stroke} strokeWidth={1.5} />

      <rect
        x={bx + 12}
        y={by + 12}
        width={style.width - 24}
        height={style.height - 24}
        rx={8}
        fill="none"
        stroke="#ffffff33"
        strokeWidth={1}
      />

      <text
        x={bx + style.width / 2}
        y={by + 26}
        textAnchor="middle"
        fontSize={10}
        fill={style.textFill}
        fontFamily="monospace"
        fontWeight={700}
      >
        {boardLabel}
      </text>

      <text
        x={bx + style.width / 2}
        y={by + 40}
        textAnchor="middle"
        fontSize={6}
        fill={style.subTextFill}
        fontFamily="monospace"
      >
        {style.mcuLabel}
      </text>

      {style.artwork(bx, by, style.height)}

      {[...digitalPins, ...analogPins, ...powerPins].map((pin) => (
        <ArduinoPin
          key={`${pin.pin}-${pin.label}-${pin.x}-${pin.y}`}
          pin={pin}
          isWiring={wiringFromPin?.pin === pin.pin && wiringFromPin?.label === pin.label}
          onStartWire={onStartWireFromPin}
        />
      ))}
    </g>
  );
}

export const ArduinoAltBoard = React.memo(ArduinoAltBoardInner);
