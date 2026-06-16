// ── Source-line → program-address table ────────────────────────────────────
//
// Maps a source line in the user's sketch to a program-counter address, used
// by the simulator's debug-control layer to place source-line breakpoints and
// to highlight the line currently executing.
//
// IMPORTANT — address units: every `address` here is a WORD index into the AVR
// program memory (the unit avr8js exposes as `cpu.pc`), NOT a byte address.
// The backend extractor divides the byte addresses reported by DWARF/objdump
// by two before emitting this table, so consumers can compare directly to
// `cpu.pc` with no further conversion.

import { z } from "zod";

export const lineTableEntrySchema = z.object({
  /** 1-based source line in the user's `.ino` sketch. */
  line: z.number().int().positive(),
  /** WORD address (cpu.pc unit) of the first instruction generated for `line`. */
  address: z.number().int().nonnegative(),
});

export type LineTableEntry = z.infer<typeof lineTableEntrySchema>;

export const lineTableSchema = z.array(lineTableEntrySchema);

export type LineTable = z.infer<typeof lineTableSchema>;

/**
 * Lowest address among all entries for `line` — the address a breakpoint set
 * on that line should arm. Returns null when the line produced no code.
 */
export function breakpointAddressForLine(
  table: readonly LineTableEntry[],
  line: number,
): number | null {
  let best: number | null = null;
  for (const entry of table) {
    if (entry.line !== line) continue;
    if (best === null || entry.address < best) best = entry.address;
  }
  return best;
}

/**
 * Reverse lookup: the source line whose code range contains `pc`. Assumes
 * `table` is sorted ascending by address (the extractor guarantees this).
 * Returns the line of the greatest entry with `address <= pc`, or null when
 * `pc` precedes the first mapped instruction.
 */
export function lineForAddress(
  table: readonly LineTableEntry[],
  pc: number,
): number | null {
  let lo = 0;
  let hi = table.length - 1;
  let foundLine: number | null = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const entry = table[mid];
    if (entry.address <= pc) {
      foundLine = entry.line;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return foundLine;
}
