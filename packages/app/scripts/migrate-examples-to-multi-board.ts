#!/usr/bin/env bun
/**
 * One-shot migration: rewrite every `packages/app/src/examples/boards/*.json`
 * from the legacy implicit-breadboard schema to the new multi-board schema.
 *
 * Adds:
 *   - `breadboard-1` component (type breadboard_full, parentId: null, world (0,0))
 *   - `arduino-1` component (type arduino_uno, parentId: null, world (-300, 0))
 *     when any wire references the legacy `-999` sentinel column
 *   - `parentId: "breadboard-1"` on every non-board component
 *   - `fromBoardId`/`fromStrip` / `toBoardId`/`toStrip` on every wire
 *
 * Idempotent: running twice produces the same output.
 *
 * Usage:
 *   bun run packages/app/scripts/migrate-examples-to-multi-board.ts
 */
import { readdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { legacyRowColToStripId } from "@dreamer/schemas";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BOARDS_DIR = join(__dirname, "..", "src", "examples", "boards");

const BREADBOARD_ID = "breadboard-1";
const ARDUINO_ID = "arduino-1";

const ARDUINO_POWER_STRIP_FOR_COL: Record<number, string> = {
  [-1]: "5v",
  [-2]: "3v3",
  [-3]: "gnd",
  [-4]: "gnd",
  [-5]: "vin",
  [-6]: "gnd",
  [-7]: "aref",
  [-8]: "ioref",
  [-9]: "reset",
};

const UNO_ANALOG_PINS = [14, 15, 16, 17, 18, 19];

function arduinoStripIdForCol(col: number): string {
  const power = ARDUINO_POWER_STRIP_FOR_COL[col];
  if (power) return power;
  if (col >= 0 && col <= 13) return `d${col}`;
  const analogIndex = UNO_ANALOG_PINS.indexOf(col);
  if (analogIndex >= 0) return `a${analogIndex}`;
  // Unknown — store col verbatim so the bug is visible rather than silent.
  return `unknown_${col}`;
}

type LegacyWire = {
  id: string;
  fromRow: number;
  fromCol: number;
  toRow: number;
  toCol: number;
  color?: string;
  fromBoardId?: string;
  fromStrip?: string;
  toBoardId?: string;
  toStrip?: string;
  [k: string]: unknown;
};

type LegacyComponent = {
  id: string;
  type: string;
  name: string;
  x: number;
  y: number;
  rotation?: number;
  pins?: Record<string, number | null>;
  properties?: Record<string, unknown>;
  parentId?: string | null;
  worldX?: number;
  worldY?: number;
};

type LegacyBoard = {
  components: Record<string, LegacyComponent>;
  wires: Record<string, LegacyWire>;
  [k: string]: unknown;
};

const BOARD_TYPES = new Set([
  "arduino_uno",
  "arduino_nano",
  "arduino_mega_2560",
  "breadboard_full",
  "perfboard_generic",
]);

function endpointToBoardAndStrip(
  row: number,
  col: number,
): { boardId: string; strip: string } {
  if (row === -999) {
    return { boardId: ARDUINO_ID, strip: arduinoStripIdForCol(col) };
  }
  const strip = legacyRowColToStripId(row, col);
  if (strip == null) {
    return { boardId: BREADBOARD_ID, strip: `unknown_r${row}_c${col}` };
  }
  return { boardId: BREADBOARD_ID, strip };
}

function migrate(board: LegacyBoard): { board: LegacyBoard; needsArduino: boolean } {
  let needsArduino = false;

  // Inject breadboard-1 if absent.
  if (!board.components[BREADBOARD_ID]) {
    board.components[BREADBOARD_ID] = {
      id: BREADBOARD_ID,
      type: "breadboard_full",
      name: "Breadboard",
      x: 0,
      y: 0,
      rotation: 0,
      pins: {},
      properties: {},
      parentId: null,
      worldX: 0,
      worldY: 0,
    };
  }

  // Set parentId on every non-board component.
  for (const c of Object.values(board.components)) {
    if (BOARD_TYPES.has(c.type)) {
      if (c.parentId === undefined) c.parentId = null;
      if (c.worldX === undefined) c.worldX = c.id === BREADBOARD_ID ? 0 : -300;
      if (c.worldY === undefined) c.worldY = 0;
    } else {
      if (c.parentId === undefined) c.parentId = BREADBOARD_ID;
    }
  }

  // Migrate wires.
  for (const w of Object.values(board.wires)) {
    if (w.fromRow === -999) needsArduino = true;
    if (!w.fromBoardId || !w.fromStrip) {
      const { boardId, strip } = endpointToBoardAndStrip(w.fromRow, w.fromCol);
      w.fromBoardId = boardId;
      w.fromStrip = strip;
    }
    if (!w.toBoardId || !w.toStrip) {
      const { boardId, strip } = endpointToBoardAndStrip(w.toRow, w.toCol);
      w.toBoardId = boardId;
      w.toStrip = strip;
    }
  }

  // Inject arduino-1 if any wire references it and it doesn't exist yet.
  if (needsArduino && !board.components[ARDUINO_ID]) {
    board.components[ARDUINO_ID] = {
      id: ARDUINO_ID,
      type: "arduino_uno",
      name: "Arduino Uno",
      x: 0,
      y: 0,
      rotation: 0,
      pins: {},
      properties: {},
      parentId: null,
      worldX: -300,
      worldY: 0,
    };
  }

  return { board, needsArduino };
}

function main() {
  const files = readdirSync(BOARDS_DIR).filter((f) => f.endsWith(".json"));
  let migrated = 0;
  for (const f of files) {
    const path = join(BOARDS_DIR, f);
    const raw = readFileSync(path, "utf8");
    const data = JSON.parse(raw) as LegacyBoard;
    const before = JSON.stringify(data);
    migrate(data);
    const after = JSON.stringify(data, null, 2);
    if (before !== JSON.stringify(JSON.parse(after))) {
      writeFileSync(path, after + "\n", "utf8");
      migrated += 1;
      console.log(`migrated: ${f}`);
    } else {
      console.log(`skip (already migrated): ${f}`);
    }
  }
  console.log(`\n${migrated}/${files.length} files migrated.`);
}

main();
