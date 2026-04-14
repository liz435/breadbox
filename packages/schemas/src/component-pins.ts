// ── Unified Component Pin Resolver ───────────────────────────────────────
//
// Single source of truth for mapping component pin names to breadboard
// grid positions. Used by:
//   - propose_circuit (API) — to generate wire endpoints
//   - power-budget-analyzer (API) — to validate electrical connectivity
//   - breadboard-grid (frontend) — for connectivity checks
//
// The positions here MUST match the component registry footprints in
// packages/app/src/components/registry.tsx. If a footprint changes there,
// update the mapping here too.

export type PinPoint = { row: number; col: number };
export type ComponentPinMap = Record<string, PinPoint>;

// ── Pin Name Registry ────────────────────────────────────────────────────

const PIN_NAMES: Record<string, string[]> = {
  led: ["anode", "cathode"],
  rgb_led: ["red", "green", "blue", "common"],
  resistor: ["a", "b"],
  capacitor: ["positive", "negative"],
  button: ["a", "b"],
  potentiometer: ["vcc", "signal", "gnd"],
  buzzer: ["positive", "negative"],
  servo: ["signal", "vcc", "gnd"],
  neopixel: ["din", "vcc", "gnd"],
  pir_sensor: ["vcc", "signal", "gnd"],
  relay: ["vcc", "signal", "gnd"],
  dc_motor: ["vcc", "signal"],
  dht_sensor: ["vcc", "data", "gnd"],
  ir_receiver: ["out", "gnd", "vcc"],
  shift_register: ["data", "clock", "latch"],
  oled_display: ["gnd", "vcc", "scl", "sda"],
  lcd_16x2: ["vss", "vdd", "vo", "rs", "rw", "en", "d4", "d5", "d6", "d7", "a", "k"],
  seven_segment: ["a", "b", "c", "d", "e", "f", "g", "common"],
  temperature_sensor: ["vcc", "signal", "gnd"],
  ultrasonic_sensor: ["vcc", "trigger", "echo", "gnd"],
  photoresistor: ["a", "b"],
  ic: [],
};

/**
 * Get the ordered list of pin names for a component type.
 */
export function getComponentPinNames(type: string): string[] {
  return PIN_NAMES[type] ?? [];
}

// ── Pin Position Resolver ────────────────────────────────────────────────

/**
 * Resolve all pin names to their grid positions for a placed component.
 *
 * IMPORTANT: For components that straddle the breadboard center gap
 * (resistor, button), the `col` parameter is ignored — they always use
 * fixed columns (3/6 for resistor and button, 2/7 for ICs).
 */
export function resolveComponentPins(
  type: string,
  row: number,
  col: number,
  _properties?: Record<string, unknown>,
): ComponentPinMap {
  switch (type) {
    // ── Horizontal, straddles center gap ─────────────────────────

    case "resistor":
      // Registry: footprint always at cols 3 and 6 regardless of `x`
      return { a: { row, col: 3 }, b: { row, col: 6 } };

    case "button":
      // Registry: 4-point footprint at (row,3), (row+1,3), (row,6), (row+1,6)
      // Electrically: left pair = side A, right pair = side B
      // For wire targeting, use (row, 3) for side A and (row, 6) for side B
      // since wires land on a single hole and the breadboard bus connects
      // both rows on each side.
      return { a: { row, col: 3 }, b: { row, col: 6 } };

    // ── Vertical two-terminal ────────────────────────────────────

    case "led":
      return { anode: { row, col }, cathode: { row: row + 1, col } };

    case "buzzer":
      return { positive: { row, col }, negative: { row: row + 1, col } };

    case "capacitor":
      // Registry: 2 rows apart (row and row+2)
      return { positive: { row, col }, negative: { row: row + 2, col } };

    case "photoresistor":
      return { a: { row, col }, b: { row: row + 1, col } };

    // ── Vertical three-terminal ──────────────────────────────────

    case "potentiometer":
      return { vcc: { row, col }, signal: { row: row + 1, col }, gnd: { row: row + 2, col } };

    case "servo":
      return { signal: { row, col }, vcc: { row: row + 1, col }, gnd: { row: row + 2, col } };

    case "temperature_sensor":
      return { vcc: { row, col }, signal: { row: row + 1, col }, gnd: { row: row + 2, col } };

    case "pir_sensor":
      return { vcc: { row, col }, signal: { row: row + 1, col }, gnd: { row: row + 2, col } };

    case "relay":
      return { vcc: { row, col }, signal: { row: row + 1, col }, gnd: { row: row + 2, col } };

    case "neopixel":
      return { din: { row, col }, vcc: { row: row + 1, col }, gnd: { row: row + 2, col } };

    case "dht_sensor":
      return { vcc: { row, col }, data: { row: row + 1, col }, gnd: { row: row + 2, col } };

    case "ir_receiver":
      return { out: { row, col }, gnd: { row: row + 1, col }, vcc: { row: row + 2, col } };

    // ── Vertical two-terminal (motor) ────────────────────────────

    case "dc_motor":
      return { vcc: { row, col }, signal: { row: row + 1, col } };

    // ── RGB LED (4 pins vertical) ────────────────────────────────

    case "rgb_led":
      return {
        red: { row, col },
        green: { row: row + 1, col },
        blue: { row: row + 2, col },
        common: { row: row + 3, col },
      };

    // ── 7-segment display (7 segments + common) ──────────────────

    case "seven_segment":
      return {
        a: { row, col },
        b: { row: row + 1, col },
        c: { row: row + 2, col },
        d: { row: row + 3, col },
        e: { row: row + 4, col },
        f: { row: row + 5, col },
        g: { row: row + 6, col },
        // "common" (cathode/anode) is a virtual pin for GND/VCC wiring.
        // It's not a separate footprint point — it shares the component's
        // base position. Wire GND/VCC to the component's rail connection.
        common: { row, col: col > 4 ? col : col - 1 },
      };

    // ── OLED display (I2C, 4 pins vertical) ──────────────────────

    case "oled_display":
      return {
        gnd: { row, col },
        vcc: { row: row + 1, col },
        scl: { row: row + 2, col },
        sda: { row: row + 3, col },
      };

    // ── LCD 16x2 (12 pins vertical — full HD44780 pinout) ───────

    case "lcd_16x2":
      return {
        vss: { row, col },
        vdd: { row: row + 1, col },
        vo: { row: row + 2, col },
        rs: { row: row + 3, col },
        rw: { row: row + 4, col },
        en: { row: row + 5, col },
        d4: { row: row + 6, col },
        d5: { row: row + 7, col },
        d6: { row: row + 8, col },
        d7: { row: row + 9, col },
        a: { row: row + 10, col },
        k: { row: row + 11, col },
      };

    // ── Ultrasonic sensor (4 pins vertical) ──────────────────────

    case "ultrasonic_sensor":
      return {
        vcc: { row, col },
        trigger: { row: row + 1, col },
        echo: { row: row + 2, col },
        gnd: { row: row + 3, col },
      };

    // ── Shift register (3 signal pins) ───────────────────────────

    case "shift_register":
      return {
        data: { row, col },
        clock: { row: row + 1, col },
        latch: { row: row + 2, col },
      };

    // ── Fallback: generic vertical layout ────────────────────────

    default: {
      const names = PIN_NAMES[type];
      if (!names || names.length === 0) return {};
      const map: ComponentPinMap = {};
      for (let i = 0; i < names.length; i++) {
        map[names[i]!] = { row: row + i, col };
      }
      return map;
    }
  }
}

/**
 * Resolve a single pin name to its grid position.
 * Returns null if the pin name is not valid for the component type.
 */
export function resolveComponentPin(
  type: string,
  row: number,
  col: number,
  pinName: string,
  properties?: Record<string, unknown>,
): PinPoint | null {
  const pins = resolveComponentPins(type, row, col, properties);
  return pins[pinName] ?? null;
}
