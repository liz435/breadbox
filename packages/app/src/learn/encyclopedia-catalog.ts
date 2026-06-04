// ── Encyclopedia Catalog ───────────────────────────────────────────────
//
// Single source of truth for every encyclopedia page across all three
// reference tracks. The router, the sidebar, and the PrevNext footer all
// read from this list — no hand-maintained duplicate route tables.
//
// To add a page:
//   1. Create a page component under encyclopedia/<track>/<slug>.tsx.
//   2. Import it here and add an entry to ENTRIES with status "published".
//   3. Until content is ready, use PlannedPage and status "planned" so
//      the sidebar stays clean.
//
// Pages with status === "planned" are hidden from the sidebar by default
// (shown only when ?showPlanned=1 is in the URL) so infrastructure work
// can land without a sea of 404s.

// This file is metadata-only. It MUST NOT import any page components
// (including PlannedPage) — doing so creates an import cycle because
// pages depend on learn-layout.tsx, which depends on this file for the
// sidebar.
//
// Page components are resolved by the router via
// ./encyclopedia-page-registry.ts, which is allowed to import pages
// because it's not part of the sidebar path.

// ── Types ──────────────────────────────────────────────────────────────

export type EncyclopediaTrack = "board" | "programming" | "electronics"

export type EncyclopediaStatus = "planned" | "draft" | "published"

export type EncyclopediaEntry = {
  /** URL segment, kebab-case, unique within its track. */
  slug: string
  /** Which encyclopedia track this page belongs to. */
  track: EncyclopediaTrack
  /** Sidebar sub-group label. Groups appear in the sidebar in
   *  insertion order of their first entry. */
  group: string
  /** Page <PageTitle> title, also used as the sidebar link text. */
  title: string
  /** One-line description shown as a tooltip / mobile summary. */
  summary: string
  /** Ship status. Only "published" shows in the sidebar by default. */
  status: EncyclopediaStatus
}

// ── Track metadata ─────────────────────────────────────────────────────

export type TrackMeta = {
  id: EncyclopediaTrack
  title: string
  /** URL prefix under /learn/reference/<prefix>. */
  prefix: string
  /** Tailwind text color class for the active page highlight. */
  accentText: string
  /** Tailwind bg color class for the active page highlight. */
  accentBg: string
  /** Tailwind left-border color class for the active sidebar row. */
  accentBorder: string
}

export const TRACKS: readonly TrackMeta[] = [
  {
    id: "board",
    title: "Arduino Uno Reference",
    prefix: "board",
    accentText: "text-blue-300",
    accentBg: "bg-blue-500/10",
    accentBorder: "border-blue-400",
  },
  {
    id: "programming",
    title: "Arduino Programming",
    prefix: "programming",
    accentText: "text-purple-300",
    accentBg: "bg-purple-500/10",
    accentBorder: "border-purple-400",
  },
  {
    id: "electronics",
    title: "Electronics Fundamentals",
    prefix: "electronics",
    accentText: "text-amber-300",
    accentBg: "bg-amber-500/10",
    accentBorder: "border-amber-400",
  },
] as const

// ── Entries ────────────────────────────────────────────────────────────
//
// Entries are declared in the order we want them to appear in the
// sidebar. Groups inherit their first-seen order. The schematic-symbols
// page is the one Phase-1 entry that actually ships as part of
// Milestone 0 (it's the visual regression target for the <Schematic>
// primitive itself).

export const ENTRIES: readonly EncyclopediaEntry[] = [
  // ── Arduino Uno Reference ─────────────────────────────────────────
  {
    slug: "anatomy",
    track: "board",
    group: "The board",
    title: "Board anatomy",
    summary: "Labeled diagram of every connector on the Arduino Uno.",
    status: "published",
  },
  {
    slug: "powering",
    track: "board",
    group: "The board",
    title: "Powering the Arduino",
    summary: "USB, VIN, barrel jack — when to use each.",
    status: "published",
  },
  {
    slug: "onboard-led",
    track: "board",
    group: "The board",
    title: "The onboard LED on pin 13",
    summary: "Why it exists, when it helps debugging.",
    status: "published",
  },
  {
    slug: "digital-pins",
    track: "board",
    group: "Pins & I/O",
    title: "Digital pins D0–D13",
    summary: "PWM pins, RX/TX, special pins.",
    status: "published",
  },
  {
    slug: "analog-pins",
    track: "board",
    group: "Pins & I/O",
    title: "Analog pins A0–A5",
    summary: "10-bit ADC, voltage reference, dual-use as digital.",
    status: "published",
  },
  {
    slug: "power-pins",
    track: "board",
    group: "Pins & I/O",
    title: "Power pins",
    summary: "5V, 3.3V, GND, VIN, RESET, IOREF.",
    status: "published",
  },
  {
    slug: "shield-headers",
    track: "board",
    group: "Pins & I/O",
    title: "Pin header layout",
    summary: "Physical position of each pin for layout planning.",
    status: "published",
  },
  {
    slug: "pwm",
    track: "board",
    group: "Signals & timing",
    title: "PWM on the Uno",
    summary: "Which pins support PWM, default frequency.",
    status: "published",
  },
  {
    slug: "interrupts",
    track: "board",
    group: "Signals & timing",
    title: "Hardware interrupts",
    summary: "Pin 2 and pin 3, RISING/FALLING/CHANGE.",
    status: "published",
  },
  {
    slug: "timers",
    track: "board",
    group: "Signals & timing",
    title: "Timers on the Uno",
    summary: "Why delay() blocks and millis() doesn't.",
    status: "published",
  },
  {
    slug: "serial",
    track: "board",
    group: "Communication",
    title: "Serial (USB)",
    summary: "Serial monitor, baud rate, pins 0/1.",
    status: "published",
  },
  {
    slug: "i2c",
    track: "board",
    group: "Communication",
    title: "I2C on the Uno",
    summary: "Pins A4 (SDA) and A5 (SCL), pull-ups, bus topology.",
    status: "published",
  },
  {
    slug: "spi",
    track: "board",
    group: "Communication",
    title: "SPI on the Uno",
    summary: "Pins 10 (SS), 11 (MOSI), 12 (MISO), 13 (SCK), and the ICSP header.",
    status: "published",
  },
  {
    slug: "atmega328p",
    track: "board",
    group: "Under the hood",
    title: "The ATmega328P microcontroller",
    summary: "The chip that actually runs your sketch — 16 MHz, 32 KB flash, 2 KB RAM.",
    status: "published",
  },
  {
    slug: "clock-power",
    track: "board",
    group: "Under the hood",
    title: "Clock, crystal, power regulation",
    summary: "The 16 MHz crystal and the voltage regulators on the board.",
    status: "published",
  },

  // ── Arduino Programming ───────────────────────────────────────────
  {
    slug: "sketch-structure",
    track: "programming",
    group: "C++ essentials",
    title: "Sketch structure",
    summary: "setup() runs once, loop() runs forever.",
    status: "published",
  },
  {
    slug: "variables",
    track: "programming",
    group: "C++ essentials",
    title: "Variables and types",
    summary: "int, float, bool, char, String, const, unsigned.",
    status: "published",
  },
  {
    slug: "operators",
    track: "programming",
    group: "C++ essentials",
    title: "Operators",
    summary: "Arithmetic, comparison, logical, assignment.",
    status: "published",
  },
  {
    slug: "control-flow",
    track: "programming",
    group: "C++ essentials",
    title: "Control flow",
    summary: "if/else, while, for, switch.",
    status: "published",
  },
  {
    slug: "functions",
    track: "programming",
    group: "C++ essentials",
    title: "Functions",
    summary: "Declaring, calling, parameters, return values.",
    status: "published",
  },
  {
    slug: "constants",
    track: "programming",
    group: "C++ essentials",
    title: "Constants and #define",
    summary: "Why sketches start with const int LED_PIN = 13.",
    status: "published",
  },
  {
    slug: "comments",
    track: "programming",
    group: "C++ essentials",
    title: "Comments",
    summary: "// and /* */, and how the transpiler handles them.",
    status: "published",
  },
  {
    slug: "structs",
    track: "programming",
    group: "C++ essentials",
    title: "Structs",
    summary: "Bundle related values into a single named type.",
    status: "published",
  },
  {
    slug: "classes",
    track: "programming",
    group: "C++ essentials",
    title: "Classes (read-only)",
    summary: "Using library classes like Servo without writing your own.",
    status: "published",
  },
  {
    slug: "multi-file",
    track: "programming",
    group: "C++ essentials",
    title: "Multi-file sketches",
    summary: "How tabs map to files and #include \"MyFile.h\" vs <Library.h>.",
    status: "published",
  },
  {
    slug: "arrays",
    track: "programming",
    group: "C++ essentials",
    title: "Arrays",
    summary: "Fixed-size lists of values, indexing, iterating with for.",
    status: "published",
  },
  {
    slug: "global-vs-local",
    track: "programming",
    group: "C++ essentials",
    title: "Global vs local variables",
    summary: "Where state lives between loop() iterations.",
    status: "published",
  },
  {
    slug: "strings",
    track: "programming",
    group: "C++ essentials",
    title: "Strings",
    summary: "String class vs char[] — pick your poison on a 2 KB MCU.",
    status: "published",
  },
  {
    slug: "numeric-limits",
    track: "programming",
    group: "C++ essentials",
    title: "Numeric limits and overflow",
    summary: "What happens when an int wraps past its max value.",
    status: "published",
  },
  {
    slug: "floating-point",
    track: "programming",
    group: "C++ essentials",
    title: "Floating point",
    summary: "float vs double, precision, when to use each.",
    status: "published",
  },
  {
    slug: "digital-io",
    track: "programming",
    group: "Arduino API",
    title: "Digital I/O",
    summary: "pinMode, digitalRead, digitalWrite.",
    status: "published",
  },
  {
    slug: "analog-io",
    track: "programming",
    group: "Arduino API",
    title: "Analog I/O",
    summary: "analogRead, analogWrite, 0–1023 and 0–255.",
    status: "published",
  },
  {
    slug: "timing",
    track: "programming",
    group: "Arduino API",
    title: "Timing",
    summary: "delay, delayMicroseconds, millis, micros.",
    status: "published",
  },
  {
    slug: "serial-api",
    track: "programming",
    group: "Arduino API",
    title: "Serial API",
    summary: "Serial.begin, Serial.print, Serial.println.",
    status: "published",
  },
  {
    slug: "math-helpers",
    track: "programming",
    group: "Arduino API",
    title: "Math helpers",
    summary: "map, constrain, min, max, abs, random, pow, sqrt.",
    status: "published",
  },
  {
    slug: "tone",
    track: "programming",
    group: "Arduino API",
    title: "Tone output",
    summary: "tone() and noTone() — playing frequencies on a pin.",
    status: "published",
  },
  {
    slug: "interrupts-api",
    track: "programming",
    group: "Arduino API",
    title: "Interrupts API",
    summary: "attachInterrupt, detachInterrupt, digitalPinToInterrupt.",
    status: "published",
  },
  {
    slug: "eeprom",
    track: "programming",
    group: "Arduino API",
    title: "EEPROM",
    summary: "EEPROM.read, EEPROM.write, EEPROM.update — persistence across resets.",
    status: "published",
  },
  {
    slug: "bit-manipulation",
    track: "programming",
    group: "Arduino API",
    title: "Bit manipulation",
    summary: "bitRead, bitWrite, bitSet, bitClear — twiddling individual bits.",
    status: "published",
  },
  {
    slug: "shift-out-in",
    track: "programming",
    group: "Arduino API",
    title: "shiftOut and shiftIn",
    summary: "Clocking bytes in and out one bit at a time — the foundation for shift registers.",
    status: "published",
  },
  {
    slug: "servo-library",
    track: "programming",
    group: "Libraries",
    title: "Servo library",
    summary: "attach, write, read, detach.",
    status: "published",
  },
  {
    slug: "liquidcrystal-library",
    track: "programming",
    group: "Libraries",
    title: "LiquidCrystal library",
    summary: "begin, setCursor, print, clear — 16×2 character LCDs.",
    status: "published",
  },
  {
    slug: "neopixel-library",
    track: "programming",
    group: "Libraries",
    title: "Adafruit_NeoPixel library",
    summary: "WS2812 strips — setPixelColor, show, fill, setBrightness.",
    status: "published",
  },
  {
    slug: "dht-library",
    track: "programming",
    group: "Libraries",
    title: "DHT library",
    summary: "readTemperature, readHumidity, computeHeatIndex.",
    status: "published",
  },
  {
    slug: "irremote-library",
    track: "programming",
    group: "Libraries",
    title: "IRremote library",
    summary: "enableIRIn, decode, resume — reading codes from an IR receiver.",
    status: "published",
  },
  {
    slug: "ssd1306-library",
    track: "programming",
    group: "Libraries",
    title: "Adafruit_SSD1306 library",
    summary: "drawPixel, setCursor, print, display — the subset Breadbox implements.",
    status: "published",
  },
  {
    slug: "non-blocking-timing",
    track: "programming",
    group: "Patterns",
    title: "Non-blocking timing with millis()",
    summary: "The single idiom that separates beginner from intermediate.",
    status: "published",
  },
  {
    slug: "debounce",
    track: "programming",
    group: "Patterns",
    title: "Debouncing inputs",
    summary: "Why your button fires five times per press, and how to fix it.",
    status: "published",
  },
  {
    slug: "state-machines",
    track: "programming",
    group: "Patterns",
    title: "State machines for blinking patterns",
    summary: "Extend the millis() pattern to multi-step sequences.",
    status: "published",
  },
  {
    slug: "multi-sensor",
    track: "programming",
    group: "Patterns",
    title: "Reading multiple sensors without blocking",
    summary: "One loop(), several sensors, each on its own schedule.",
    status: "published",
  },
  {
    slug: "smoothing",
    track: "programming",
    group: "Patterns",
    title: "Smoothing noisy analog reads",
    summary: "Moving average and exponential smoothing for jittery analogRead() values.",
    status: "published",
  },
  {
    slug: "ui-state-machines",
    track: "programming",
    group: "Patterns",
    title: "Finite state machines for UI flows",
    summary: "Button + LED + delay sequences as a menu of named states.",
    status: "published",
  },
  {
    slug: "pin-naming",
    track: "programming",
    group: "Patterns",
    title: "Naming pins with const and enum",
    summary: "Why every sketch should start with const int LED_PIN = 13.",
    status: "published",
  },
  {
    slug: "breadbox-limits",
    track: "programming",
    group: "Limits",
    title: "What Breadbox can and can't run",
    summary: "The supported C++ subset, and what's rejected by design.",
    status: "published",
  },

  // ── Electronics Fundamentals ──────────────────────────────────────
  {
    slug: "voltage-current-resistance",
    track: "electronics",
    group: "Core concepts",
    title: "Voltage, current, resistance",
    summary: "Water-flow analogy, units, intuition before math.",
    status: "published",
  },
  {
    slug: "ohms-law",
    track: "electronics",
    group: "Core concepts",
    title: "Ohm's law",
    summary: "V = I × R with three worked examples.",
    status: "published",
  },
  {
    slug: "power",
    track: "electronics",
    group: "Core concepts",
    title: "Power and current limits",
    summary: "P = V × I, heating, Arduino pin limits.",
    status: "published",
  },
  {
    slug: "series-parallel",
    track: "electronics",
    group: "Core concepts",
    title: "Series vs parallel",
    summary: "Same current, add voltages — vs same voltage, add currents.",
    status: "published",
  },
  {
    slug: "ground",
    track: "electronics",
    group: "Core concepts",
    title: "Ground is a reference",
    summary: "GND is just 0V. Everything is measured from it.",
    status: "published",
  },
  {
    slug: "shorts",
    track: "electronics",
    group: "Core concepts",
    title: "Short circuits",
    summary: "What they are, how they break things.",
    status: "published",
  },
  {
    slug: "kirchhoff",
    track: "electronics",
    group: "Core concepts",
    title: "Kirchhoff's laws, informally",
    summary: "Current in = current out. Voltages around a loop sum to zero.",
    status: "published",
  },
  {
    slug: "signal-vs-power",
    track: "electronics",
    group: "Core concepts",
    title: "Signal vs power",
    summary: "Why signal wires can be thin but power wires can't.",
    status: "published",
  },
  {
    slug: "impedance",
    track: "electronics",
    group: "Core concepts",
    title: "Impedance, hand-wavingly",
    summary: "Like resistance, but for signals that change over time.",
    status: "published",
  },
  {
    slug: "decoupling",
    track: "electronics",
    group: "Core concepts",
    title: "Noise and decoupling",
    summary: "Why every IC gets a 0.1 µF capacitor across its power pins.",
    status: "published",
  },
  {
    slug: "resistors",
    track: "electronics",
    group: "Components",
    title: "Resistors",
    summary: "Color bands, E-series values, power rating.",
    status: "published",
  },
  {
    slug: "leds",
    track: "electronics",
    group: "Components",
    title: "LEDs",
    summary: "Forward voltage, forward current, polarity.",
    status: "published",
  },
  {
    slug: "breadboards",
    track: "electronics",
    group: "Components",
    title: "Breadboards",
    summary: "Row-of-5 nets, center gap, power rails.",
    status: "published",
  },
  {
    slug: "wires",
    track: "electronics",
    group: "Components",
    title: "Wires and jumpers",
    summary: "Solid vs stranded, color conventions.",
    status: "published",
  },
  {
    slug: "switches",
    track: "electronics",
    group: "Components",
    title: "Switches and buttons",
    summary: "NO vs NC, pull-up / pull-down, contact bouncing.",
    status: "published",
  },
  {
    slug: "potentiometers",
    track: "electronics",
    group: "Components",
    title: "Potentiometers",
    summary: "Three-terminal variable resistors as voltage dividers.",
    status: "published",
  },
  {
    slug: "capacitors",
    track: "electronics",
    group: "Components",
    title: "Capacitors",
    summary: "Charge storage, decoupling, why 0.1 µF lives near every IC.",
    status: "published",
  },
  {
    slug: "diodes",
    track: "electronics",
    group: "Components",
    title: "Diodes",
    summary: "One-way current flow, forward voltage, flyback protection.",
    status: "published",
  },
  {
    slug: "transistors",
    track: "electronics",
    group: "Components",
    title: "Transistors",
    summary: "MOSFETs and BJTs as electronic switches — how to drive loads that need more than 20 mA.",
    status: "published",
  },
  {
    slug: "voltage-regulators",
    track: "electronics",
    group: "Components",
    title: "Voltage regulators",
    summary: "Linear vs switching — how USB's 5 V actually becomes stable 5 V.",
    status: "published",
  },
  {
    slug: "relays",
    track: "electronics",
    group: "Components",
    title: "Relays",
    summary: "A coil-driven switch that isolates your Arduino from a bigger load.",
    status: "published",
  },
  {
    slug: "pwm",
    track: "electronics",
    group: "Signals",
    title: "PWM as fake analog",
    summary: "Canonical home for the PWM concept. Duty cycle, frequency.",
    status: "published",
  },
  {
    slug: "analog-vs-digital",
    track: "electronics",
    group: "Signals",
    title: "Analog vs digital signals",
    summary: "Continuous voltages, ADC quantization, 10-bit steps.",
    status: "published",
  },
  {
    slug: "voltage-dividers",
    track: "electronics",
    group: "Signals",
    title: "Voltage dividers",
    summary: "Two resistors in series tap a fraction of the supply.",
    status: "published",
  },
  {
    slug: "pull-ups",
    track: "electronics",
    group: "Signals",
    title: "Pull-up and pull-down resistors",
    summary: "Keeping floating inputs from reading random garbage.",
    status: "published",
  },
  {
    slug: "i2c-concepts",
    track: "electronics",
    group: "Signals",
    title: "I2C concepts",
    summary: "Master/slave, SDA/SCL, addresses, and why the bus needs pull-ups.",
    status: "published",
  },
  {
    slug: "spi-concepts",
    track: "electronics",
    group: "Signals",
    title: "SPI concepts",
    summary: "Master/slave, MISO/MOSI/SCK/SS, why it's faster than I2C.",
    status: "published",
  },
  {
    slug: "one-wire",
    track: "electronics",
    group: "Signals",
    title: "1-Wire",
    summary: "A single data line that carries power and bidirectional data — the DS18B20 / DHT bus.",
    status: "published",
  },
  {
    slug: "beginner-mistakes",
    track: "electronics",
    group: "Practical",
    title: "Common beginner mistakes",
    summary: "Reverse polarity, missing resistor, shorts.",
    status: "published",
  },
  {
    slug: "current-limits",
    track: "electronics",
    group: "Practical",
    title: "Current limits for Arduino pins",
    summary: "20 mA per pin, 100 mA per port, 500 mA total. Don't drive motors directly.",
    status: "published",
  },
  {
    slug: "schematic-symbols",
    track: "electronics",
    group: "Practical",
    title: "Reading a schematic",
    summary: "Symbols, how a schematic relates to a breadboard layout.",
    status: "published",
  },
  {
    slug: "ac-safety",
    track: "electronics",
    group: "Practical",
    title: "Safety around AC and high current",
    summary: "Why Breadbox stops at 5 V DC — and why your first mains project shouldn't be solo.",
    status: "published",
  },
] as const

// ── Lookup helpers ─────────────────────────────────────────────────────

/** Build the URL path for an encyclopedia entry. */
export function encyclopediaPath(
  entry: Pick<EncyclopediaEntry, "track" | "slug">,
): string {
  return `/learn/reference/${entry.track}/${entry.slug}`
}

/** Find an entry by track + slug. Returns null if not found or still planned. */
export function findEntry(
  track: string,
  slug: string,
  { includePlanned = false }: { includePlanned?: boolean } = {},
): EncyclopediaEntry | null {
  const match = ENTRIES.find((e) => e.track === track && e.slug === slug)
  if (!match) return null
  if (!includePlanned && match.status === "planned") return null
  return match
}

/**
 * Group entries by track → group → entries, preserving declaration order.
 * Used by the sidebar. Hides planned entries by default.
 */
export type SidebarGroup = { group: string; items: EncyclopediaEntry[] }
export type SidebarTrack = { track: TrackMeta; groups: SidebarGroup[] }

export function buildSidebarTracks({
  includePlanned = false,
}: { includePlanned?: boolean } = {}): SidebarTrack[] {
  return TRACKS.map((track) => {
    const groupMap = new Map<string, EncyclopediaEntry[]>()
    for (const entry of ENTRIES) {
      if (entry.track !== track.id) continue
      if (!includePlanned && entry.status === "planned") continue
      const list = groupMap.get(entry.group) ?? []
      list.push(entry)
      groupMap.set(entry.group, list)
    }
    const groups: SidebarGroup[] = [...groupMap.entries()].map(
      ([group, items]) => ({ group, items }),
    )
    return { track, groups }
  })
}

/** Previous/next lookup within the same track, skipping unpublished entries. */
export function getPrevNext(entry: EncyclopediaEntry): {
  prev: EncyclopediaEntry | null
  next: EncyclopediaEntry | null
} {
  const siblings = ENTRIES.filter(
    (e) => e.track === entry.track && e.status === "published",
  )
  const i = siblings.findIndex((e) => e.slug === entry.slug)
  return {
    prev: i > 0 ? siblings[i - 1] : null,
    next: i >= 0 && i < siblings.length - 1 ? siblings[i + 1] : null,
  }
}
