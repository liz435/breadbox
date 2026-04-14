import React from "react";
import {
  ARDUINO_BOARD_WIDTH,
  ARDUINO_BOARD_HEIGHT,
  ARDUINO_DIGITAL_PINS as DEFAULT_DIGITAL_PINS,
  ARDUINO_ANALOG_PINS as DEFAULT_ANALOG_PINS,
  ARDUINO_POWER_PINS as DEFAULT_POWER_PINS,
} from "@/breadboard/breadboard-grid";
import type { ArduinoPinInfo } from "@/breadboard/breadboard-grid";
import { ArduinoPin } from "./arduino-pin";
import arduinoBoardSvg from "@/assets/arduino-uno-board.svg";

const ARDUINO_X = 10;
const ARDUINO_Y = 20;

type ArduinoUnoBoardProps = {
  onStartWireFromPin: (pin: ArduinoPinInfo) => void;
  wiringFromPin: ArduinoPinInfo | null;
  boardLabel?: string;
  digitalPins?: ArduinoPinInfo[];
  analogPins?: ArduinoPinInfo[];
  powerPins?: ArduinoPinInfo[];
};

/**
 * Arduino Uno R3 board — uses a vectorized SVG of the real board
 * with interactive pin overlays for wire attachment.
 */
function ArduinoUnoBoardInner({
  onStartWireFromPin,
  wiringFromPin,
  boardLabel: _boardLabel = "Arduino Uno",
  digitalPins = DEFAULT_DIGITAL_PINS,
  analogPins = DEFAULT_ANALOG_PINS,
  powerPins = DEFAULT_POWER_PINS,
}: ArduinoUnoBoardProps) {
  const x = ARDUINO_X;
  const y = ARDUINO_Y;
  const w = ARDUINO_BOARD_WIDTH;
  const h = ARDUINO_BOARD_HEIGHT;

  return (
    <g>
      {/* Board artwork from vectorized SVG of a real Arduino Uno */}
      <image
        href={arduinoBoardSvg}
        x={x}
        y={y}
        width={w}
        height={h}
        preserveAspectRatio="xMidYMid meet"
      />

      {/* Interactive pin overlays on top of the board image */}
      {digitalPins.map((pin) => (
        <ArduinoPin
          key={`dpin-${pin.pin}-${pin.label}`}
          pin={pin}
          isWiring={wiringFromPin?.pin === pin.pin && wiringFromPin?.label === pin.label}
          onStartWire={onStartWireFromPin}
        />
      ))}
      {analogPins.map((pin) => (
        <ArduinoPin
          key={`apin-${pin.pin}`}
          pin={pin}
          isWiring={wiringFromPin?.pin === pin.pin && wiringFromPin?.label === pin.label}
          onStartWire={onStartWireFromPin}
        />
      ))}
      {powerPins.map((pin) => (
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

export const ArduinoUnoBoard = React.memo(ArduinoUnoBoardInner);
export const ArduinoUnoRenderer = ArduinoUnoBoard;
