import { z } from "zod";

export const boardTargetSchema = z.enum([
  "arduino_uno",
  "arduino_nano",
  "arduino_mega_2560",
]);

export type BoardTarget = z.infer<typeof boardTargetSchema>;

export type BoardTargetInfo = {
  id: BoardTarget;
  label: string;
  mcu: string;
  fqbn: string;
  supportsAvr8js: boolean;
};

export const BOARD_TARGETS: Record<BoardTarget, BoardTargetInfo> = {
  arduino_uno: {
    id: "arduino_uno",
    label: "Arduino Uno",
    mcu: "ATmega328P @ 16 MHz",
    fqbn: "arduino:avr:uno",
    supportsAvr8js: true,
  },
  arduino_nano: {
    id: "arduino_nano",
    label: "Arduino Nano",
    mcu: "ATmega328P @ 16 MHz",
    fqbn: "arduino:avr:nano",
    supportsAvr8js: true,
  },
  arduino_mega_2560: {
    id: "arduino_mega_2560",
    label: "Arduino Mega 2560",
    mcu: "ATmega2560 @ 16 MHz",
    fqbn: "arduino:avr:mega",
    supportsAvr8js: false,
  },
};

export const DEFAULT_BOARD_TARGET: BoardTarget = "arduino_uno";
