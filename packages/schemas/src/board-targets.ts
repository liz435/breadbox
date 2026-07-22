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
  /**
   * Browser-side upload parameters, used by the hosted WebSerial flash
   * path. Absent for boards that can't yet be flashed from the browser
   * (e.g. the RP2040, which needs UF2 over WebUSB / drag-and-drop). The
   * UI hides the hosted Upload button when this is undefined.
   */
  webSerialUpload?: {
    protocol: "stk500v1";
    /** Bootloader baud rate. Optiboot on Uno R3 = 115200. */
    baudRate: number;
    /** Flash page size in bytes (atmega328p = 128). */
    pageSize: number;
  };
  /**
   * When true, "flash to hardware" produces a downloadable `.uf2` the user
   * drops onto the board's BOOTSEL mass-storage drive (RP2040 boards). This is
   * orthogonal to `webSerialUpload` (serial-bootloader flashing) — a board uses
   * one path or the other. See simulator/uf2-download.ts.
   */
  uf2Download?: boolean;
  /** Explicit runtime truth contract. UI and diagnostics use this rather than
   * inferring support from whether a target happens to compile. */
  simulationCapabilities: {
    fidelity: "full" | "best-effort";
    gpio: boolean;
    pwm: boolean;
    analog: boolean;
    i2c: boolean;
    serial: boolean;
  };
};

export const BOARD_TARGETS: Record<BoardTarget, BoardTargetInfo> = {
  arduino_uno: {
    id: "arduino_uno",
    label: "Arduino Uno",
    mcu: "ATmega328P @ 16 MHz",
    fqbn: "arduino:avr:uno",
    runner: "avr",
    simulationCapabilities: { fidelity: "full", gpio: true, pwm: true, analog: true, i2c: true, serial: true },
    webSerialUpload: { protocol: "stk500v1", baudRate: 115200, pageSize: 128 },
  },
  arduino_nano: {
    id: "arduino_nano",
    label: "Arduino Nano",
    mcu: "ATmega328P @ 16 MHz",
    fqbn: "arduino:avr:nano",
    runner: "avr",
    simulationCapabilities: { fidelity: "full", gpio: true, pwm: true, analog: true, i2c: true, serial: true },
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
    simulationCapabilities: { fidelity: "best-effort", gpio: true, pwm: true, analog: true, i2c: true, serial: true },
  },
  rpi_pico: {
    id: "rpi_pico",
    label: "Raspberry Pi Pico",
    mcu: "RP2040 @ 125 MHz",
    fqbn: "rp2040:rp2040:rpipico",
    // Runs on rp2040js via a lazy-loaded chunk. With the bootrom vendored
    // (`bun run bootrom:fetch`) the real boot chain runs (clocks/PLL/USB-CDC);
    // without it the handoff is synthesised and only GPIO-only sketches work.
    // See runners/rp2040-runner.ts header.
    runner: "rp2040",
    simulationCapabilities: { fidelity: "best-effort", gpio: true, pwm: true, analog: true, i2c: false, serial: false },
    // Flashed by dropping a .uf2 onto the BOOTSEL drive — not a serial
    // bootloader — so no webSerialUpload.
    uf2Download: true,
  },
};

export const DEFAULT_BOARD_TARGET: BoardTarget = "arduino_uno";
