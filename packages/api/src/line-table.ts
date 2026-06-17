// ── Source-line → address table extraction ─────────────────────────────────
//
// After a successful AVR compile, arduino-cli leaves `sketch.ino.elf` (with
// DWARF debug info) in the output dir before we delete the build. This module
// runs `avr-objdump --dwarf=decodedline` on that ELF and parses its decoded
// line table into the `LineTableEntry[]` the simulator's debugger consumes.
//
// Degrades gracefully: any failure (no objdump, no ELF, parse miss) returns
// null and the frontend falls back to address-only breakpoints.

import { join } from "path";
import { coreFamilyForFqbn, resolveAvrObjdump, resolveArmObjdump } from "./toolchain";
import { createLogger } from "./logger";
import type { LineTableEntry } from "@dreamer/schemas";

const log = createLogger("line-table");

const OBJDUMP_TIMEOUT_MS = 15_000;

/**
 * arduino-cli wraps the `.ino` in a generated `.cpp` (adds `#include
 * <Arduino.h>` + hoisted prototypes), which shifts reported source lines by
 * one relative to the user's editor. The compile-error path already corrects
 * for this with a flat `-1` (see `routes/compile.ts:normalizeCompileError`);
 * we apply the SAME offset here so breakpoints and error markers land on the
 * same editor line. Approximate but consistent — a later milestone can refine
 * it against the generated `.cpp`'s `#line` directives.
 */
const ARDUINO_LINE_OFFSET = 1;

/** Name of the user's sketch file as it appears in DWARF (arduino-cli convention). */
const SKETCH_FILE_NAME = "sketch.ino";

/**
 * Parse the output of `avr-objdump --dwarf=decodedline`. Each data row looks
 * like:
 *
 *   sketch.ino            10            0x84               x
 *
 * (file name, decimal source line, hex BYTE address, optional view/stmt flags).
 * Header rows ("File name … Line number …"), CU headers ("CU: …:") and
 * end-of-sequence rows (line shown as "-") carry no `0x…` address and are
 * skipped by the regex.
 *
 * Returns one entry per distinct address, sorted ascending by address, with
 * line numbers corrected by `lineOffset`. Addresses are reported in WORD units
 * by default (avr8js `cpu.pc`); pass `wordAddresses: false` to keep raw BYTE
 * addresses (Cortex-M0 `core.PC`, for the RP2040 debugger).
 */
export function parseDecodedLineOutput(
  stdout: string,
  opts: { sketchFileName?: string; lineOffset?: number; wordAddresses?: boolean } = {},
): LineTableEntry[] {
  const sketchName = opts.sketchFileName ?? SKETCH_FILE_NAME;
  const lineOffset = opts.lineOffset ?? 0;
  const wordAddresses = opts.wordAddresses ?? true;
  // filename (non-greedy, allows spaces) … line number … 0x address
  const ROW = /^(\S.*?)\s+(\d+)\s+(0x[0-9a-fA-F]+)\b/;

  const seenAddr = new Set<number>();
  const out: LineTableEntry[] = [];
  for (const raw of stdout.split("\n")) {
    const m = ROW.exec(raw.trimEnd());
    if (!m) continue;
    if (m[1].trim() !== sketchName) continue;
    const rawLine = parseInt(m[2], 10);
    const byteAddr = parseInt(m[3], 16);
    if (!Number.isFinite(rawLine) || !Number.isFinite(byteAddr)) continue;
    // AVR: avr8js indexes program memory by 16-bit word, so halve the byte
    // address. ARM/Thumb: core.PC is a byte address (Thumb bit excluded), so
    // keep it as-is.
    const addr = wordAddresses ? byteAddr >> 1 : byteAddr;
    if (seenAddr.has(addr)) continue;
    seenAddr.add(addr);
    out.push({ line: Math.max(1, rawLine - lineOffset), address: addr });
  }
  out.sort((a, b) => a.address - b.address);
  return out;
}

async function runObjdump(
  objdump: string,
  elfPath: string,
): Promise<string | null> {
  const proc = Bun.spawn([objdump, "--dwarf=decodedline", elfPath], {
    stdout: "pipe",
    stderr: "ignore",
  });
  const timer = setTimeout(() => {
    try {
      proc.kill();
    } catch {
      /* already dead */
    }
  }, OBJDUMP_TIMEOUT_MS);
  try {
    const stdout = await new Response(proc.stdout).text();
    const code = await proc.exited;
    return code === 0 ? stdout : null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Extract the source-line → address table for a just-compiled sketch. Handles
 * both AVR (avr-objdump, word addresses for avr8js) and RP2040 (arm-none-eabi-
 * objdump, byte addresses for the Cortex-M0 core). Returns null on any miss so
 * the caller can omit the field and the debugger falls back to address-only.
 */
export async function extractLineTable(
  outputDir: string,
  arduinoCli: string,
  fqbn: string,
): Promise<LineTableEntry[] | null> {
  const family = coreFamilyForFqbn(fqbn);
  const isArm = family === "rp2040:rp2040";

  const elfPath = join(outputDir, "sketch.ino.elf");
  if (!(await Bun.file(elfPath).exists())) return null;

  const objdump = isArm
    ? await resolveArmObjdump(arduinoCli)
    : await resolveAvrObjdump(arduinoCli);
  if (!objdump) {
    log.info(
      `${isArm ? "arm-none-eabi-objdump" : "avr-objdump"} unavailable — debugger will use address-only breakpoints`,
    );
    return null;
  }

  try {
    const stdout = await runObjdump(objdump, elfPath);
    if (!stdout) return null;
    const table = parseDecodedLineOutput(stdout, {
      lineOffset: ARDUINO_LINE_OFFSET,
      wordAddresses: !isArm,
    });
    return table.length > 0 ? table : null;
  } catch (err) {
    log.info(`line-table extraction failed: ${err instanceof Error ? err.message : "unknown"}`);
    return null;
  }
}
