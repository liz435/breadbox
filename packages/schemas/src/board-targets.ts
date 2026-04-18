import { z } from "zod";

export const boardTargetSchema = z.enum([
  "arduino_uno",
  "arduino_nano",
  "arduino_mega_2560",
  "rpi_pico",
]);

export type BoardTarget = z.infer<typeof boardTargetSchema>;

/**
 * Which runner implementation simulates (or compiles for) a given board.
 * - "avr"          — avr8js emulator (full in-browser execution). Uno/Nano
 *                    are fully supported; Mega is best-effort because
 *                    avr8js doesn't emulate ATmega2560's extra peripherals.
 * - "rp2040"       — rp2040js emulator (best-effort; real bootrom not
 *                    bundled, so USB CDC / PLL-dependent features don't
 *                    work yet).
 * - "compile-only" — real arduino-cli compile, no in-browser execution.
 *                    Use when the board has no browser-side emulator
 *                    (ESP32, STM32, SAMD) — Flash to hardware works, the
 *                    web simulator viewport is disabled.
 */
export type RunnerKind = "avr" | "rp2040" | "compile-only";

export type BoardTargetInfo = {
  id: BoardTarget;
  label: string;
  mcu: string;
  fqbn: string;
  runner: RunnerKind;
  /**
   * When true, the factory wraps the inner runner with `withRealCompileCheck`
   * so a real `arduino-cli` compile runs alongside the in-browser runner.
   * Useful for `compile-only` boards (the decorator is the primary compile
   * path) or "best-effort" AVR boards whose emulator might misrepresent
   * real hardware behavior. `AvrSketchRunner` already compiles via
   * arduino-cli internally, so this is mostly redundant for Uno/Nano.
   */
  realCompileCheck?: boolean;
};

export const BOARD_TARGETS: Record<BoardTarget, BoardTargetInfo> = {
  arduino_uno: {
    id: "arduino_uno",
    label: "Arduino Uno",
    mcu: "ATmega328P @ 16 MHz",
    fqbn: "arduino:avr:uno",
    runner: "avr",
  },
  arduino_nano: {
    id: "arduino_nano",
    label: "Arduino Nano",
    mcu: "ATmega328P @ 16 MHz",
    fqbn: "arduino:avr:nano",
    runner: "avr",
  },
  arduino_mega_2560: {
    id: "arduino_mega_2560",
    label: "Arduino Mega 2560",
    mcu: "ATmega2560 @ 16 MHz",
    fqbn: "arduino:avr:mega",
    // Shares the avr8js path with Uno/Nano. Mega-specific peripherals
    // (Timer3/4/5, USART1–3, pins 20–53) aren't modeled — users hitting
    // those should flash to real hardware instead.
    runner: "avr",
  },
  rpi_pico: {
    id: "rpi_pico",
    label: "Raspberry Pi Pico",
    mcu: "RP2040 @ 125 MHz",
    fqbn: "rp2040:rp2040:rpipico",
    // Runs on rp2040js via a lazy-loaded chunk. Without a real bootrom the
    // boot handoff is synthesised — GPIO-only sketches work; Serial/USB CDC,
    // PLLs, and XIP timing don't. See runners/rp2040-runner.ts header.
    runner: "rp2040",
  },
};

export const DEFAULT_BOARD_TARGET: BoardTarget = "arduino_uno";
