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
import { coreFamilyForFqbn, resolveAvrObjdump } from "./toolchain";
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
 * addresses converted to WORD units (avr8js `cpu.pc`) and line numbers
 * corrected by `lineOffset`.
 */
export function parseDecodedLineOutput(
  stdout: string,
  opts: { sketchFileName?: string; lineOffset?: number } = {},
): LineTableEntry[] {
  const sketchName = opts.sketchFileName ?? SKETCH_FILE_NAME;
  const lineOffset = opts.lineOffset ?? 0;
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
    const wordAddr = byteAddr >> 1;
    if (seenAddr.has(wordAddr)) continue;
    seenAddr.add(wordAddr);
    out.push({ line: Math.max(1, rawLine - lineOffset), address: wordAddr });
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
 * Extract the source-line → word-address table for a just-compiled sketch.
 * AVR only (V1). Returns null on any miss so the caller can omit the field.
 */
export async function extractLineTable(
  outputDir: string,
  arduinoCli: string,
  fqbn: string,
): Promise<LineTableEntry[] | null> {
  if (coreFamilyForFqbn(fqbn) !== "arduino:avr") return null;

  const elfPath = join(outputDir, "sketch.ino.elf");
  if (!(await Bun.file(elfPath).exists())) return null;

  const objdump = await resolveAvrObjdump(arduinoCli);
  if (!objdump) {
    log.info("avr-objdump unavailable — debugger will use address-only breakpoints");
    return null;
  }

  try {
    const stdout = await runObjdump(objdump, elfPath);
    if (!stdout) return null;
    const table = parseDecodedLineOutput(stdout, { lineOffset: ARDUINO_LINE_OFFSET });
    return table.length > 0 ? table : null;
  } catch (err) {
    log.info(`line-table extraction failed: ${err instanceof Error ? err.message : "unknown"}`);
    return null;
  }
}
