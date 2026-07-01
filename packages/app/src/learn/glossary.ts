// ── Glossary ───────────────────────────────────────────────────────────
//
// Single source of truth for every linkable concept across the learn
// section. Lessons and encyclopedia pages wrap meaningful terms in
// <Term k="led">LED</Term> (see term.tsx) — the key is type-checked
// against this registry, and a hover popover shows the blurb.
//
// Why this lives in TypeScript, not markdown:
//   - Typos and renames become compile errors, not silent drift.
//   - The agent can author lesson content referencing glossary keys
//     and we get end-to-end type safety.
//   - The full set of keys is the union `GlossaryKey`, useful for
//     autocomplete and for any future backlink / index page.
//
// Adding a term:
//   1. Add an entry below. The `as const satisfies` keeps the key
//      union tight.
//   2. Point `href` at the canonical encyclopedia page (or any
//      internal URL). Terms without an href render as hover-only,
//      no navigation.
//   3. Prose across every lesson/encyclopedia page picks it up
//      automatically the next time someone writes <Term k="…">.
//
// Conventions:
//   - Keys are kebab-case and stable. Treat them as a public API:
//     deprecate, don't delete.
//   - Blurbs are one sentence, plain language, <120 chars if you
//     can swing it.
//   - Every term with a canonical page goes in its `related` field
//     of sibling concepts so the "See also" logic can surface them.

// ── Types ──────────────────────────────────────────────────────────────

export type GlossaryEntry = {
  /** Short label shown in the popover header. */
  label: string
  /** One- or two-sentence plain-language definition. */
  blurb: string
  /** Canonical destination — usually a /learn/reference/... page. */
  href?: string
  /** Related keys. Shown as "See also" links inside the popover. */
  related?: readonly string[]
}

// ── Entries ────────────────────────────────────────────────────────────
//
// Seed set covering terms the existing three lessons use + the first
// handful of encyclopedia concepts. Grow this incrementally as new
// pages and lessons land. Keep each blurb short.

export const GLOSSARY = {
  // ── Components ─────────────────────────────────────────────────────
  led: {
    label: "LED",
    blurb:
      "Light-emitting diode — a one-way electrical component that glows when current flows from anode to cathode.",
    href: "/learn/reference/electronics/leds",
    related: ["resistor", "ohms-law", "forward-voltage"],
  },
  resistor: {
    label: "Resistor",
    blurb:
      "A passive component that limits current. Always pair one in series with an LED to keep it safe.",
    href: "/learn/reference/electronics/resistors",
    related: ["led", "ohms-law"],
  },
  button: {
    label: "Push button",
    blurb:
      "A momentary switch that closes a circuit only while pressed. Usually paired with a pull-up or pull-down resistor.",
    related: ["pull-up", "debounce"],
  },
  potentiometer: {
    label: "Potentiometer",
    blurb:
      "A 3-terminal variable resistor that acts as a voltage divider — a tunable analog signal for Arduino inputs.",
    related: ["voltage-divider", "analog-read"],
  },

  // ── Concepts ───────────────────────────────────────────────────────
  "ohms-law": {
    label: "Ohm's law",
    blurb: "V = I × R. Voltage equals current multiplied by resistance.",
    href: "/learn/reference/electronics/ohms-law",
    related: ["resistor", "led", "voltage-divider"],
  },
  "voltage-divider": {
    label: "Voltage divider",
    blurb:
      "Two resistors in series tap a fraction of the supply voltage at their midpoint. Used by potentiometers and photoresistors.",
    related: ["potentiometer", "analog-read"],
  },
  "forward-voltage": {
    label: "Forward voltage (Vf)",
    blurb:
      "The voltage drop across a diode or LED when current flows in the forward direction. Red LEDs are ~2 V; blue/white are ~3 V.",
    related: ["led", "ohms-law"],
  },
  pwm: {
    label: "PWM",
    blurb:
      "Pulse-width modulation — rapidly switching a pin between HIGH and LOW to approximate an analog voltage. analogWrite() uses this.",
    href: "/learn/reference/electronics/pwm",
    related: ["analog-write", "duty-cycle"],
  },
  "duty-cycle": {
    label: "Duty cycle",
    blurb:
      "The fraction of time a PWM signal is HIGH during one cycle. 50% = half on, half off; averages to half the supply voltage.",
    related: ["pwm"],
  },
  "pull-up": {
    label: "Pull-up resistor",
    blurb:
      "A resistor from an input pin to VCC that holds the pin HIGH by default so a button press can pull it LOW.",
    related: ["button", "input-pullup"],
  },
  ground: {
    label: "Ground (GND)",
    blurb:
      "The reference point a circuit measures every other voltage against. GND is just 0 V — not a magic destination for current.",
    href: "/learn/reference/electronics/ground",
  },
  short: {
    label: "Short circuit",
    blurb:
      "A low-resistance path that lets far too much current flow. Typically between a power rail and ground — bad news.",
    href: "/learn/reference/electronics/shorts",
  },
  debounce: {
    label: "Debouncing",
    blurb:
      "Filtering the mechanical chatter from a switch so a single physical press registers as one logical event.",
    related: ["button"],
  },

  // ── Arduino API ────────────────────────────────────────────────────
  "pin-mode": {
    label: "pinMode()",
    blurb:
      "Sets whether an Arduino pin is an OUTPUT, INPUT, or INPUT_PULLUP. Call this once in setup() for every pin you use.",
    related: ["digital-write", "digital-read", "input-pullup"],
  },
  "digital-write": {
    label: "digitalWrite()",
    blurb: "Sets a digital OUTPUT pin HIGH (5 V) or LOW (0 V).",
    related: ["pin-mode", "digital-read"],
  },
  "digital-read": {
    label: "digitalRead()",
    blurb:
      "Reads whether a digital INPUT pin is HIGH or LOW. Use INPUT_PULLUP and a switch for buttons.",
    related: ["pin-mode", "digital-write", "input-pullup"],
  },
  "analog-read": {
    label: "analogRead()",
    blurb:
      "Reads a 0–1023 value from an analog input pin (A0–A5), representing 0–5 V through a 10-bit ADC.",
    related: ["analog-write", "potentiometer"],
  },
  "analog-write": {
    label: "analogWrite()",
    blurb:
      "Outputs a PWM duty cycle from 0 (always off) to 255 (always on) on PWM-capable pins (3, 5, 6, 9, 10, 11 on the Uno).",
    related: ["pwm", "duty-cycle"],
  },
  "input-pullup": {
    label: "INPUT_PULLUP",
    blurb:
      "A pinMode that enables the Arduino's internal pull-up resistor, saving you from wiring one yourself.",
    related: ["pin-mode", "pull-up", "button"],
  },
  millis: {
    label: "millis()",
    blurb:
      "Returns the number of milliseconds since the sketch started. Use it instead of delay() to keep the sketch responsive.",
    related: ["delay", "non-blocking"],
  },
  delay: {
    label: "delay()",
    blurb:
      "Pauses the sketch for N milliseconds. Simple, but blocks everything else — avoid in real code.",
    related: ["millis", "non-blocking"],
  },
  "non-blocking": {
    label: "Non-blocking timing",
    blurb:
      "A pattern that uses millis() to schedule events without freezing the loop — the single idiom separating beginner from intermediate sketches.",
    related: ["millis", "delay"],
  },

  // ── Phase 2 additions ──────────────────────────────────────────────
  capacitor: {
    label: "Capacitor",
    blurb:
      "A passive component that stores electric charge. Most commonly used to smooth noisy power rails (decoupling) near ICs.",
    href: "/learn/reference/electronics/capacitors",
    related: ["resistor"],
  },
  diode: {
    label: "Diode",
    blurb:
      "A one-way valve for current — forward-biased it conducts, reverse-biased it blocks. LEDs are a kind of diode.",
    href: "/learn/reference/electronics/diodes",
    related: ["led", "forward-voltage"],
  },
  adc: {
    label: "ADC",
    blurb:
      "Analog-to-digital converter. The Uno's ADC is 10-bit, turning a 0–5 V input into a number from 0 to 1023.",
    href: "/learn/reference/electronics/analog-vs-digital",
    related: ["analog-read", "voltage-divider"],
  },
  kirchhoff: {
    label: "Kirchhoff's laws",
    blurb:
      "Current into a node = current out. Voltages around any closed loop sum to zero. The two rules that govern DC circuits.",
    href: "/learn/reference/electronics/kirchhoff",
    related: ["ohms-law", "ground"],
  },
  "state-machine": {
    label: "State machine",
    blurb:
      "A sketch structure where the program is always in one of a few named states, and events trigger transitions between them.",
    href: "/learn/reference/programming/state-machines",
    related: ["non-blocking", "debounce"],
  },
  array: {
    label: "Array",
    blurb:
      "A fixed-size, ordered list of values of the same type. Index from 0; length is declared at compile time.",
    href: "/learn/reference/programming/arrays",
    related: [],
  },
  "floating-point": {
    label: "Floating point",
    blurb:
      "Numbers with a fractional part. The Uno uses 32-bit float (~6 digits of precision); double is the same size, not wider.",
    href: "/learn/reference/programming/floating-point",
    related: [],
  },
  tone: {
    label: "tone()",
    blurb:
      "Generates a square wave at the requested frequency on a digital pin — used to drive piezo buzzers.",
    href: "/learn/reference/programming/tone",
    related: [],
  },

  // ── Phase 3 additions ──────────────────────────────────────────────
  transistor: {
    label: "Transistor",
    blurb:
      "An electronically-controlled switch. Use one to drive anything an Arduino pin's 20 mA can't handle on its own.",
    href: "/learn/reference/electronics/transistors",
    related: ["relay", "diode"],
  },
  mosfet: {
    label: "MOSFET",
    blurb:
      "A voltage-controlled transistor — the modern default for switching DC loads from a microcontroller pin.",
    href: "/learn/reference/electronics/transistors",
    related: ["transistor"],
  },
  relay: {
    label: "Relay",
    blurb:
      "A coil-driven mechanical switch. Good for isolating your 5 V logic from mains or high-current loads.",
    href: "/learn/reference/electronics/relays",
    related: ["transistor", "diode"],
  },
  "voltage-regulator": {
    label: "Voltage regulator",
    blurb:
      "A chip that turns an uneven input voltage into a stable output. The 7805 and LM1117 are the classics.",
    href: "/learn/reference/electronics/voltage-regulators",
  },
  eeprom: {
    label: "EEPROM",
    blurb:
      "A small block of non-volatile memory on the ATmega328P (1 KB) that survives resets and power cycles.",
    href: "/learn/reference/programming/eeprom",
  },
  i2c: {
    label: "I2C",
    blurb:
      "A two-wire serial bus (SDA + SCL) that lets multiple devices share the same pair of pins, each with its own address.",
    href: "/learn/reference/electronics/i2c-concepts",
    related: ["spi", "pull-up"],
  },
  spi: {
    label: "SPI",
    blurb:
      "A four-wire serial bus (MISO, MOSI, SCK, SS) used for faster communication with a single peripheral at a time.",
    href: "/learn/reference/electronics/spi-concepts",
    related: ["i2c"],
  },
  struct: {
    label: "struct",
    blurb:
      "A C++ type that bundles related fields into a single value. Arduino sketches use them to keep pin + state groups together.",
    href: "/learn/reference/programming/structs",
  },
  impedance: {
    label: "Impedance",
    blurb:
      "The generalisation of resistance to time-varying signals. Includes contributions from inductors and capacitors.",
    href: "/learn/reference/electronics/impedance",
    related: ["resistor", "capacitor"],
  },
  decoupling: {
    label: "Decoupling capacitor",
    blurb:
      "A small capacitor (typically 0.1 µF) placed right next to an IC's power pin to absorb switching noise.",
    href: "/learn/reference/electronics/decoupling",
    related: ["capacitor"],
  },
} as const satisfies Record<string, GlossaryEntry>

// ── Derived types ──────────────────────────────────────────────────────

export type GlossaryKey = keyof typeof GLOSSARY
