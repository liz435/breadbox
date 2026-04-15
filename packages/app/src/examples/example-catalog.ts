// ── Example Board Catalog ──────────────────────────────────────────────
//
// Auto-globs every JSON file under ./boards/ and enriches it with
// metadata (label, description, primary component type) so the toolbar
// can display a contextual "Examples" popover.
//
// To add an example:
//   1. Drop a valid BoardState JSON into ./boards/ex-<type>.json.
//   2. Add a matching entry in EXAMPLE_META below.
//   3. The new example appears in the toolbar automatically.

import type { BoardState, BoardComponent, ComponentType } from "@dreamer/schemas"

// Eager glob — same pattern as learn/board-catalog.ts
const modules = import.meta.glob("./boards/*.json", {
  eager: true,
  import: "default",
}) as Record<string, BoardState>

// ── Metadata ──────────────────────────────────────────────────────────

type ExampleMeta = {
  label: string
  description: string
  /** The "featured" component type for this example. */
  primaryType: ComponentType
  category: "output" | "input" | "passive" | "display" | "other"
}

const EXAMPLE_META: Record<string, ExampleMeta> = {
  "ex-led": {
    label: "Blink LED",
    description: "Blink an LED on and off every 500 ms.",
    primaryType: "led",
    category: "output",
  },
  "ex-rgb-led": {
    label: "RGB LED Color Cycle",
    description: "Cycle through red, green, and blue using PWM.",
    primaryType: "rgb_led",
    category: "output",
  },
  "ex-resistor": {
    label: "Current Limiting",
    description: "Use a resistor to safely drive an LED.",
    primaryType: "resistor",
    category: "passive",
  },
  "ex-capacitor": {
    label: "Capacitor Blink",
    description: "Charge and discharge through an LED.",
    primaryType: "capacitor",
    category: "passive",
  },
  "ex-button": {
    label: "Button + LED",
    description: "Press a button to light an LED.",
    primaryType: "button",
    category: "input",
  },
  "ex-potentiometer": {
    label: "Pot → LED Brightness",
    description: "Turn a pot to control LED brightness.",
    primaryType: "potentiometer",
    category: "input",
  },
  "ex-buzzer": {
    label: "Buzzer Melody",
    description: "Play a short tone sequence on a piezo buzzer.",
    primaryType: "buzzer",
    category: "output",
  },
  "ex-servo": {
    label: "Servo Sweep",
    description: "Sweep a servo from 0° to 180° and back.",
    primaryType: "servo",
    category: "output",
  },
  "ex-photoresistor": {
    label: "Light Sensor",
    description: "Read a photoresistor and print to Serial.",
    primaryType: "photoresistor",
    category: "input",
  },
  "ex-temperature-sensor": {
    label: "Temperature Reader",
    description: "Read a TMP36 and print °C to Serial.",
    primaryType: "temperature_sensor",
    category: "input",
  },
  "ex-ultrasonic-sensor": {
    label: "Distance Sensor",
    description: "Measure distance with an HC-SR04.",
    primaryType: "ultrasonic_sensor",
    category: "input",
  },
  "ex-lcd-16x2": {
    label: "LCD Hello World",
    description: "Print text on a 16×2 character LCD.",
    primaryType: "lcd_16x2",
    category: "display",
  },
  "ex-seven-segment": {
    label: "7-Segment Counter",
    description: "Count 0–9 on a seven-segment display.",
    primaryType: "seven_segment",
    category: "display",
  },
  "ex-neopixel": {
    label: "NeoPixel Rainbow",
    description: "Chase a rainbow across a NeoPixel strip.",
    primaryType: "neopixel",
    category: "output",
  },
  "ex-pir-sensor": {
    label: "Motion Alarm",
    description: "Detect motion with a PIR sensor, light an LED.",
    primaryType: "pir_sensor",
    category: "input",
  },
  "ex-relay": {
    label: "Relay Toggle",
    description: "Toggle a relay on and off every 2 seconds.",
    primaryType: "relay",
    category: "output",
  },
  "ex-dc-motor": {
    label: "Motor Speed",
    description: "Ramp a DC motor up and down with PWM.",
    primaryType: "dc_motor",
    category: "output",
  },
  "ex-dht-sensor": {
    label: "Temp + Humidity",
    description: "Read a DHT sensor and print to Serial.",
    primaryType: "dht_sensor",
    category: "input",
  },
  "ex-ir-receiver": {
    label: "IR Remote Decoder",
    description: "Decode IR signals and print hex codes.",
    primaryType: "ir_receiver",
    category: "input",
  },
  "ex-shift-register": {
    label: "LED Chaser (595)",
    description: "Shift bits through a 74HC595 to chase LEDs.",
    primaryType: "shift_register",
    category: "other",
  },
  "ex-oled-display": {
    label: "OLED Hello World",
    description: "Draw text on a 128×64 OLED over I2C.",
    primaryType: "oled_display",
    category: "display",
  },
  "ex-serial-monitor": {
    label: "Serial Monitor Input Test",
    description: "Send serial commands to control LED state and blink mode.",
    primaryType: "led",
    category: "input",
  },
}

// ── Resolved examples ─────────────────────────────────────────────────

export type ExampleBoard = ExampleMeta & {
  key: string
  state: BoardState
  componentTypes: ComponentType[]
}

function buildCatalog(): ExampleBoard[] {
  const result: ExampleBoard[] = []
  for (const [path, state] of Object.entries(modules)) {
    const match = path.match(/([^/]+)\.json$/)
    if (!match) continue
    const key = match[1]
    const meta = EXAMPLE_META[key]
    if (!meta) continue

    const componentTypes = [
      ...new Set(
        Object.values(state.components).map(
          (c: BoardComponent) => c.type,
        ),
      ),
    ] as ComponentType[]
    result.push({ ...meta, key, state, componentTypes })
  }
  return result.sort((a, b) => a.label.localeCompare(b.label))
}

export const exampleBoards: readonly ExampleBoard[] = buildCatalog()

/**
 * Return examples whose primary component type appears among the
 * components currently on the board. If the board is empty, returns
 * all examples.
 */
export function getMatchingExamples(
  components: Record<string, BoardComponent>,
): ExampleBoard[] {
  const types = new Set(Object.values(components).map((c) => c.type))
  if (types.size === 0) return [...exampleBoards]
  return exampleBoards.filter((ex) => types.has(ex.primaryType))
}

/** Group examples by category for display. */
export function groupByCategory(
  examples: readonly ExampleBoard[],
): { category: string; items: ExampleBoard[] }[] {
  const order = ["output", "input", "display", "passive", "other"]
  const labels: Record<string, string> = {
    output: "Output",
    input: "Input",
    display: "Display",
    passive: "Passive",
    other: "Other",
  }
  const map = new Map<string, ExampleBoard[]>()
  for (const ex of examples) {
    const list = map.get(ex.category) ?? []
    list.push(ex)
    map.set(ex.category, list)
  }
  return order
    .filter((cat) => map.has(cat))
    .map((cat) => ({ category: labels[cat] ?? cat, items: map.get(cat)! }))
}
