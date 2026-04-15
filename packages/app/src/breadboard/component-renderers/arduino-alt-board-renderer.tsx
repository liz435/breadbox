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
  const isNano = boardTarget === "arduino_nano";
  const boardW = isNano ? 160 : 300;
  const boardH = isNano ? 176 : 200;
  const bx = x + (w - boardW) / 2;
  const by = y + (h - boardH) / 2;
  const fill = isNano ? "#155E75" : "#2563EB";
  const stroke = isNano ? "#0E7490" : "#1D4ED8";

  return (
    <g>
      <rect x={bx + 3} y={by + 3} width={boardW} height={boardH} rx={10} fill="#00000044" />
      <rect x={bx} y={by} width={boardW} height={boardH} rx={10} fill={fill} stroke={stroke} strokeWidth={1.5} />

      <rect
        x={bx + 12}
        y={by + 12}
        width={boardW - 24}
        height={boardH - 24}
        rx={8}
        fill="none"
        stroke="#ffffff33"
        strokeWidth={1}
      />

      <text
        x={bx + boardW / 2}
        y={by + 26}
        textAnchor="middle"
        fontSize={10}
        fill="#dbeafe"
        fontFamily="monospace"
        fontWeight={700}
      >
        {boardLabel}
      </text>

      <text
        x={bx + boardW / 2}
        y={by + 40}
        textAnchor="middle"
        fontSize={6}
        fill="#bfdbfe"
        fontFamily="monospace"
      >
        {isNano ? "ATmega328P" : "ATmega2560"}
      </text>

      {isNano ? (
        <>
          <rect x={bx + 66} y={by + 58} width={28} height={78} rx={4} fill="#111827" stroke="#374151" strokeWidth={0.8} />
          <rect x={bx + 72} y={by + 18} width={16} height={28} rx={2} fill="#9ca3af" stroke="#6b7280" strokeWidth={0.8} />
          <rect x={bx + 13} y={by + 18} width={10} height={boardH - 36} rx={2} fill="#0f172a99" />
          <rect x={bx + boardW - 23} y={by + 18} width={10} height={boardH - 36} rx={2} fill="#0f172a99" />
        </>
      ) : (
        <>
          <rect x={bx + 18} y={by + 64} width={82} height={30} rx={4} fill="#111827" stroke="#374151" strokeWidth={0.8} />
          <rect x={bx + 116} y={by + 64} width={82} height={30} rx={4} fill="#111827" stroke="#374151" strokeWidth={0.8} />
          <rect x={bx + 214} y={by + 64} width={66} height={30} rx={4} fill="#111827" stroke="#374151" strokeWidth={0.8} />
          <rect x={bx - 9} y={by + 20} width={22} height={16} rx={2} fill="#9ca3af" stroke="#6b7280" strokeWidth={0.8} />
        </>
      )}

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
