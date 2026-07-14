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

/**
 * A custom part's pin: a name plus a grid offset (dx columns, dy rows) from the
 * placement origin. Sourced from the custom-component DSL `pins` field.
 */
export type CustomPinFootprint = { name: string; dx: number; dy: number };

/**
 * Resolves a `custom:<id>` type to its pin footprints, or undefined when the
 * type is unknown / not a DSL custom part. The built-in resolver is pure and
 * keyed only on the type string, so callers that need custom parts resolved
 * (the MCP `apply_design` / `validate_design` DSL path) pass this in, built
 * from the custom-parts store.
 */
export type CustomFootprintLookup = (
  type: string,
) => readonly CustomPinFootprint[] | undefined;

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
  relay: ["vcc", "signal", "gnd", "com", "no", "nc"],
  dc_motor: ["vcc", "signal"],
  // 28BYJ-48 + ULN2003 driver: IN1–IN4 control the coil phases, vplus/gnd power
  // the driver board (5V).
  stepper_motor: ["in1", "in2", "in3", "in4", "vplus", "gnd"],
  dht_sensor: ["vcc", "data", "gnd"],
  ir_receiver: ["out", "gnd", "vcc"],
  shift_register: ["data", "clock", "latch"],
  oled_display: ["gnd", "vcc", "scl", "sda"],
  // Full 16-pin HD44780 header. D0–D3 are physically present but unused in the
  // 4-bit wiring the simulator/netlist model (they stay no-connect).
  lcd_16x2: ["vss", "vdd", "vo", "rs", "rw", "en", "d0", "d1", "d2", "d3", "d4", "d5", "d6", "d7", "a", "k"],
  seven_segment: ["a", "b", "c", "d", "e", "f", "g", "dp", "gnd"],
  temperature_sensor: ["vcc", "signal", "gnd"],
  ultrasonic_sensor: ["vcc", "trigger", "echo", "gnd"],
  photoresistor: ["a", "b"],
  inductor: ["a", "b"],
  transistor: ["collector", "base", "emitter"],
  mosfet: ["drain", "gate", "source"],
  ic: [],
};

/**
 * Get the ordered list of pin names for a component type.
 */
export function getComponentPinNames(
  type: string,
  customFootprints?: CustomFootprintLookup,
): string[] {
  if (customFootprints && type.startsWith("custom:")) {
    const fp = customFootprints(type);
    if (fp && fp.length > 0) return fp.map((p) => p.name);
  }
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
  customFootprints?: CustomFootprintLookup,
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

    case "inductor":
      return { a: { row, col }, b: { row: row + 1, col } };

    // ── Vertical three-terminal ──────────────────────────────────

    case "potentiometer":
      return { vcc: { row, col }, signal: { row: row + 1, col }, gnd: { row: row + 2, col } };

    case "transistor":
      return { collector: { row, col }, base: { row: row + 1, col }, emitter: { row: row + 2, col } };

    case "mosfet":
      return { drain: { row, col }, gate: { row: row + 1, col }, source: { row: row + 2, col } };

    case "servo":
      return { signal: { row, col }, vcc: { row: row + 1, col }, gnd: { row: row + 2, col } };

    case "temperature_sensor":
      return { vcc: { row, col }, signal: { row: row + 1, col }, gnd: { row: row + 2, col } };

    case "pir_sensor":
      return { vcc: { row, col }, signal: { row: row + 1, col }, gnd: { row: row + 2, col } };

    case "relay":
      // Coil side (vcc/signal/gnd) on rows 0-2, switched contacts (com/no/nc)
      // appended on rows 3-5 so the relay can actually switch a load in the
      // netlist. Appending keeps existing saved boards' pin positions valid.
      return {
        vcc: { row, col },
        signal: { row: row + 1, col },
        gnd: { row: row + 2, col },
        com: { row: row + 3, col },
        no: { row: row + 4, col },
        nc: { row: row + 5, col },
      };

    case "neopixel":
      return { din: { row, col }, vcc: { row: row + 1, col }, gnd: { row: row + 2, col } };

    case "dht_sensor":
      return { vcc: { row, col }, data: { row: row + 1, col }, gnd: { row: row + 2, col } };

    case "ir_receiver":
      return { out: { row, col }, gnd: { row: row + 1, col }, vcc: { row: row + 2, col } };

    // ── Vertical two-terminal (motor) ────────────────────────────

    case "dc_motor":
      return { vcc: { row, col }, signal: { row: row + 1, col } };

    // ── Stepper motor + ULN2003 driver (6 pins vertical) ─────────

    case "stepper_motor":
      return {
        in1: { row, col },
        in2: { row: row + 1, col },
        in3: { row: row + 2, col },
        in4: { row: row + 3, col },
        vplus: { row: row + 4, col },
        gnd: { row: row + 5, col },
      };

    // ── RGB LED (4 pins vertical) ────────────────────────────────

    case "rgb_led":
      return {
        red: { row, col },
        green: { row: row + 1, col },
        blue: { row: row + 2, col },
        common: { row: row + 3, col },
      };

    // ── 7-segment display (7 segments + dp + gnd) ────────────────

    case "seven_segment":
      return {
        a: { row, col },
        b: { row: row + 1, col },
        c: { row: row + 2, col },
        d: { row: row + 3, col },
        e: { row: row + 4, col },
        f: { row: row + 5, col },
        g: { row: row + 6, col },
        dp: { row: row + 7, col },
        gnd: { row: row + 8, col },
      };

    // ── OLED display (I2C, 4 pins vertical) ──────────────────────

    case "oled_display":
      return {
        gnd: { row, col },
        vcc: { row: row + 1, col },
        scl: { row: row + 2, col },
        sda: { row: row + 3, col },
      };

    // ── LCD 16x2 (16 pins vertical — full HD44780 header) ───────
    // D0–D3 sit between EN and D4 (real header order) but are no-connect in the
    // 4-bit wiring; they exist so the footprint occupies the real 16 holes.

    case "lcd_16x2":
      return {
        vss: { row, col },
        vdd: { row: row + 1, col },
        vo: { row: row + 2, col },
        rs: { row: row + 3, col },
        rw: { row: row + 4, col },
        en: { row: row + 5, col },
        d0: { row: row + 6, col },
        d1: { row: row + 7, col },
        d2: { row: row + 8, col },
        d3: { row: row + 9, col },
        d4: { row: row + 10, col },
        d5: { row: row + 11, col },
        d6: { row: row + 12, col },
        d7: { row: row + 13, col },
        a: { row: row + 14, col },
        k: { row: row + 15, col },
      };

    // ── Ultrasonic sensor (4 pins vertical) ──────────────────────

    case "ultrasonic_sensor":
      return {
        vcc: { row, col },
        trigger: { row: row + 1, col },
        echo: { row: row + 2, col },
        gnd: { row: row + 3, col },
      };

    // ── Shift register (74HC595, DIP-16) ─────────────────────────
    //
    // Straddles the centre gap on fixed cols 2/7 (like other ICs — the `col`
    // arg is ignored). Pin order follows the datasheet: pins 1-8 run top→bottom
    // down the LEFT column, pins 16-9 run top→bottom down the RIGHT column.
    // Outputs: Q1-Q7 are pins 1-7 (left); Q0 is pin 15 (right).

    case "shift_register":
      return {
        // Left column (col 2): pins 1..8, top → bottom.
        q1: { row, col: 2 },           // pin 1
        q2: { row: row + 1, col: 2 },  // pin 2
        q3: { row: row + 2, col: 2 },  // pin 3
        q4: { row: row + 3, col: 2 },  // pin 4
        q5: { row: row + 4, col: 2 },  // pin 5
        q6: { row: row + 5, col: 2 },  // pin 6
        q7: { row: row + 6, col: 2 },  // pin 7
        gnd: { row: row + 7, col: 2 }, // pin 8 (GND)
        // Right column (col 7): pins 16..9, top → bottom.
        vcc: { row, col: 7 },            // pin 16 (VCC)
        q0: { row: row + 1, col: 7 },    // pin 15 (Q0 / Q_A)
        data: { row: row + 2, col: 7 },  // pin 14 (DS / SER)
        oe: { row: row + 3, col: 7 },    // pin 13 (/OE)
        latch: { row: row + 4, col: 7 }, // pin 12 (STCP / RCLK)
        clock: { row: row + 5, col: 7 }, // pin 11 (SHCP / SRCLK)
        mr: { row: row + 6, col: 7 },    // pin 10 (/MR / SRCLR)
        q7s: { row: row + 7, col: 7 },   // pin 9 (Q7' serial-out)
      };

    // ── Custom parts: resolve from the injected footprint ────────
    //
    // A DSL custom part declares `pins: [{name, dx, dy}]` — grid offsets from
    // the placement origin. Map each to (row + dy, col + dx), the exact cell
    // the app runtime places it at, so wiring a `custom:*` part by id.pinName
    // resolves the same on both sides. Falls through to the generic layout
    // when no footprint is available (keeps the resolver pure without one).

    default: {
      if (customFootprints && type.startsWith("custom:")) {
        const footprint = customFootprints(type);
        if (footprint && footprint.length > 0) {
          const customMap: ComponentPinMap = {};
          for (const pin of footprint) {
            customMap[pin.name] = { row: row + pin.dy, col: col + pin.dx };
          }
          return customMap;
        }
      }

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
  customFootprints?: CustomFootprintLookup,
): PinPoint | null {
  const pins = resolveComponentPins(type, row, col, properties, customFootprints);
  return pins[pinName] ?? null;
}
