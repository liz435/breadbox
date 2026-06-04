// ── Encyclopedia Page Registry ─────────────────────────────────────────
//
// Maps an encyclopedia track+slug to its React page component. This is
// kept separate from `encyclopedia-catalog.ts` because:
//
//   catalog (metadata only)
//     ↑
//     │ read by
//     │
//     ├── learn-layout.tsx  (sidebar)
//     └── encyclopedia-layout.tsx (PrevNextFooter / SeeAlso)
//           ↑
//           │ imported by
//           │
//         every encyclopedia page
//
// If the catalog imported page components directly, you'd get a cycle:
// catalog → page → encyclopedia-layout → learn-layout → catalog. This
// file breaks that cycle by being the only place that imports pages,
// and nothing in the sidebar path reads from it.

import type React from "react"
import type { EncyclopediaTrack } from "./encyclopedia-catalog"
import { PlannedPage } from "./encyclopedia/planned-page"
import { SchematicSymbolsPage } from "./encyclopedia/electronics/schematic-symbols"
import { BoardAnatomyPage } from "./encyclopedia/board/anatomy"
import { PoweringArduinoPage } from "./encyclopedia/board/powering"
import { OnboardLedPage } from "./encyclopedia/board/onboard-led"
// Board — Pins & I/O
import { DigitalPinsPage } from "./encyclopedia/board/digital-pins"
import { AnalogPinsPage } from "./encyclopedia/board/analog-pins"
import { PowerPinsPage } from "./encyclopedia/board/power-pins"
import { ShieldHeadersPage } from "./encyclopedia/board/shield-headers"
// Board — Signals & timing + Communication
import { PwmPage } from "./encyclopedia/board/pwm"
import { InterruptsPage } from "./encyclopedia/board/interrupts"
import { TimersPage } from "./encyclopedia/board/timers"
import { SerialPage } from "./encyclopedia/board/serial"
// Programming — C++ essentials
import { SketchStructurePage } from "./encyclopedia/programming/sketch-structure"
import { VariablesPage } from "./encyclopedia/programming/variables"
import { OperatorsPage } from "./encyclopedia/programming/operators"
import { ControlFlowPage } from "./encyclopedia/programming/control-flow"
import { FunctionsPage } from "./encyclopedia/programming/functions"
import { ConstantsPage } from "./encyclopedia/programming/constants"
import { CommentsPage } from "./encyclopedia/programming/comments"
// Programming — Arduino API
import { DigitalIoPage } from "./encyclopedia/programming/digital-io"
import { AnalogIoPage } from "./encyclopedia/programming/analog-io"
import { TimingPage } from "./encyclopedia/programming/timing"
import { SerialApiPage } from "./encyclopedia/programming/serial-api"
// Programming — Libraries, Patterns, Limits
import { ServoLibraryPage } from "./encyclopedia/programming/servo-library"
import { NonBlockingTimingPage } from "./encyclopedia/programming/non-blocking-timing"
import { BreadboxLimitsPage } from "./encyclopedia/programming/breadbox-limits"
// Electronics — Core concepts
import { VoltageCurrentResistancePage } from "./encyclopedia/electronics/voltage-current-resistance"
import { OhmsLawPage } from "./encyclopedia/electronics/ohms-law"
import { PowerPage } from "./encyclopedia/electronics/power"
import { SeriesParallelPage } from "./encyclopedia/electronics/series-parallel"
import { GroundPage } from "./encyclopedia/electronics/ground"
import { ShortsPage } from "./encyclopedia/electronics/shorts"
// Electronics — Components
import { ResistorsPage } from "./encyclopedia/electronics/resistors"
import { LedsPage } from "./encyclopedia/electronics/leds"
import { BreadboardsPage } from "./encyclopedia/electronics/breadboards"
import { WiresPage } from "./encyclopedia/electronics/wires"
// Electronics — Signals + Practical
import { ElectronicsPwmPage } from "./encyclopedia/electronics/pwm"
import { BeginnerMistakesPage } from "./encyclopedia/electronics/beginner-mistakes"
// Phase 2 — Programming / C++ essentials
import { ArraysPage } from "./encyclopedia/programming/arrays"
import { GlobalVsLocalPage } from "./encyclopedia/programming/global-vs-local"
import { StringsPage } from "./encyclopedia/programming/strings"
import { NumericLimitsPage } from "./encyclopedia/programming/numeric-limits"
import { FloatingPointPage } from "./encyclopedia/programming/floating-point"
// Phase 2 — Programming / Arduino API
import { MathHelpersPage } from "./encyclopedia/programming/math-helpers"
import { ToneApiPage } from "./encyclopedia/programming/tone"
import { InterruptsApiPage } from "./encyclopedia/programming/interrupts-api"
// Phase 2 — Programming / Libraries
import { LiquidCrystalLibraryPage } from "./encyclopedia/programming/liquidcrystal-library"
import { NeoPixelLibraryPage } from "./encyclopedia/programming/neopixel-library"
import { DhtLibraryPage } from "./encyclopedia/programming/dht-library"
// Phase 2 — Programming / Patterns
import { DebouncePage } from "./encyclopedia/programming/debounce"
import { StateMachinesPage } from "./encyclopedia/programming/state-machines"
// Phase 2 — Electronics / Core concepts
import { KirchhoffPage } from "./encyclopedia/electronics/kirchhoff"
import { SignalVsPowerPage } from "./encyclopedia/electronics/signal-vs-power"
// Phase 2 — Electronics / Components
import { SwitchesPage } from "./encyclopedia/electronics/switches"
import { PotentiometersPage } from "./encyclopedia/electronics/potentiometers"
import { CapacitorsPage } from "./encyclopedia/electronics/capacitors"
import { DiodesPage } from "./encyclopedia/electronics/diodes"
// Phase 2 — Electronics / Signals
import { AnalogVsDigitalPage } from "./encyclopedia/electronics/analog-vs-digital"
import { VoltageDividersPage } from "./encyclopedia/electronics/voltage-dividers"
import { PullUpsPage } from "./encyclopedia/electronics/pull-ups"
// Phase 2 — Electronics / Practical
import { CurrentLimitsPage } from "./encyclopedia/electronics/current-limits"
// Phase 3 — Board / Communication
import { BoardI2cPage } from "./encyclopedia/board/i2c"
import { BoardSpiPage } from "./encyclopedia/board/spi"
// Phase 3 — Board / Under the hood
import { Atmega328pPage } from "./encyclopedia/board/atmega328p"
import { ClockPowerPage } from "./encyclopedia/board/clock-power"
// Phase 3 — Programming / C++ essentials
import { StructsPage } from "./encyclopedia/programming/structs"
import { ClassesPage } from "./encyclopedia/programming/classes"
import { MultiFilePage } from "./encyclopedia/programming/multi-file"
// Phase 3 — Programming / Arduino API
import { EepromPage } from "./encyclopedia/programming/eeprom"
import { BitManipulationPage } from "./encyclopedia/programming/bit-manipulation"
import { ShiftOutInPage } from "./encyclopedia/programming/shift-out-in"
// Phase 3 — Programming / Libraries
import { IrRemoteLibraryPage } from "./encyclopedia/programming/irremote-library"
import { Ssd1306LibraryPage } from "./encyclopedia/programming/ssd1306-library"
// Phase 3 — Programming / Patterns
import { MultiSensorPage } from "./encyclopedia/programming/multi-sensor"
import { SmoothingPage } from "./encyclopedia/programming/smoothing"
import { UiStateMachinesPage } from "./encyclopedia/programming/ui-state-machines"
import { PinNamingPage } from "./encyclopedia/programming/pin-naming"
// Phase 3 — Electronics / Core concepts
import { ImpedancePage } from "./encyclopedia/electronics/impedance"
import { DecouplingPage } from "./encyclopedia/electronics/decoupling"
// Phase 3 — Electronics / Components
import { TransistorsPage } from "./encyclopedia/electronics/transistors"
import { VoltageRegulatorsPage } from "./encyclopedia/electronics/voltage-regulators"
import { RelaysPage } from "./encyclopedia/electronics/relays"
// Phase 3 — Electronics / Signals
import { I2cConceptsPage } from "./encyclopedia/electronics/i2c-concepts"
import { SpiConceptsPage } from "./encyclopedia/electronics/spi-concepts"
import { OneWirePage } from "./encyclopedia/electronics/one-wire"
// Phase 3 — Electronics / Practical
import { AcSafetyPage } from "./encyclopedia/electronics/ac-safety"

type PageKey = `${EncyclopediaTrack}/${string}`

/**
 * Published page components, keyed by "<track>/<slug>". Planned entries
 * are absent from this map — the router falls back to PlannedPage.
 */
const PAGES: Record<PageKey, React.ComponentType> = {
  "electronics/schematic-symbols": SchematicSymbolsPage,
  "board/anatomy": BoardAnatomyPage,
  "board/powering": PoweringArduinoPage,
  "board/onboard-led": OnboardLedPage,
  "board/digital-pins": DigitalPinsPage,
  "board/analog-pins": AnalogPinsPage,
  "board/power-pins": PowerPinsPage,
  "board/shield-headers": ShieldHeadersPage,
  // Board
  "board/pwm": PwmPage,
  "board/interrupts": InterruptsPage,
  "board/timers": TimersPage,
  "board/serial": SerialPage,
  // Programming
  "programming/sketch-structure": SketchStructurePage,
  "programming/variables": VariablesPage,
  "programming/operators": OperatorsPage,
  "programming/control-flow": ControlFlowPage,
  "programming/functions": FunctionsPage,
  "programming/constants": ConstantsPage,
  "programming/comments": CommentsPage,
  "programming/digital-io": DigitalIoPage,
  "programming/analog-io": AnalogIoPage,
  "programming/timing": TimingPage,
  "programming/serial-api": SerialApiPage,
  "programming/servo-library": ServoLibraryPage,
  "programming/non-blocking-timing": NonBlockingTimingPage,
  "programming/breadbox-limits": BreadboxLimitsPage,
  // Electronics
  "electronics/voltage-current-resistance": VoltageCurrentResistancePage,
  "electronics/ohms-law": OhmsLawPage,
  "electronics/power": PowerPage,
  "electronics/series-parallel": SeriesParallelPage,
  "electronics/ground": GroundPage,
  "electronics/shorts": ShortsPage,
  "electronics/resistors": ResistorsPage,
  "electronics/leds": LedsPage,
  "electronics/breadboards": BreadboardsPage,
  "electronics/wires": WiresPage,
  "electronics/pwm": ElectronicsPwmPage,
  "electronics/beginner-mistakes": BeginnerMistakesPage,
  // Phase 2 — Programming
  "programming/arrays": ArraysPage,
  "programming/global-vs-local": GlobalVsLocalPage,
  "programming/strings": StringsPage,
  "programming/numeric-limits": NumericLimitsPage,
  "programming/floating-point": FloatingPointPage,
  "programming/math-helpers": MathHelpersPage,
  "programming/tone": ToneApiPage,
  "programming/interrupts-api": InterruptsApiPage,
  "programming/liquidcrystal-library": LiquidCrystalLibraryPage,
  "programming/neopixel-library": NeoPixelLibraryPage,
  "programming/dht-library": DhtLibraryPage,
  "programming/debounce": DebouncePage,
  "programming/state-machines": StateMachinesPage,
  // Phase 2 — Electronics
  "electronics/kirchhoff": KirchhoffPage,
  "electronics/signal-vs-power": SignalVsPowerPage,
  "electronics/switches": SwitchesPage,
  "electronics/potentiometers": PotentiometersPage,
  "electronics/capacitors": CapacitorsPage,
  "electronics/diodes": DiodesPage,
  "electronics/analog-vs-digital": AnalogVsDigitalPage,
  "electronics/voltage-dividers": VoltageDividersPage,
  "electronics/pull-ups": PullUpsPage,
  "electronics/current-limits": CurrentLimitsPage,
  // Phase 3 — Board
  "board/i2c": BoardI2cPage,
  "board/spi": BoardSpiPage,
  "board/atmega328p": Atmega328pPage,
  "board/clock-power": ClockPowerPage,
  // Phase 3 — Programming / C++ essentials
  "programming/structs": StructsPage,
  "programming/classes": ClassesPage,
  "programming/multi-file": MultiFilePage,
  // Phase 3 — Programming / Arduino API
  "programming/eeprom": EepromPage,
  "programming/bit-manipulation": BitManipulationPage,
  "programming/shift-out-in": ShiftOutInPage,
  // Phase 3 — Programming / Libraries
  "programming/irremote-library": IrRemoteLibraryPage,
  "programming/ssd1306-library": Ssd1306LibraryPage,
  // Phase 3 — Programming / Patterns
  "programming/multi-sensor": MultiSensorPage,
  "programming/smoothing": SmoothingPage,
  "programming/ui-state-machines": UiStateMachinesPage,
  "programming/pin-naming": PinNamingPage,
  // Phase 3 — Electronics / Core concepts
  "electronics/impedance": ImpedancePage,
  "electronics/decoupling": DecouplingPage,
  // Phase 3 — Electronics / Components
  "electronics/transistors": TransistorsPage,
  "electronics/voltage-regulators": VoltageRegulatorsPage,
  "electronics/relays": RelaysPage,
  // Phase 3 — Electronics / Signals
  "electronics/i2c-concepts": I2cConceptsPage,
  "electronics/spi-concepts": SpiConceptsPage,
  "electronics/one-wire": OneWirePage,
  // Phase 3 — Electronics / Practical
  "electronics/ac-safety": AcSafetyPage,
}

/**
 * Look up the page component for a given track+slug. Returns
 * PlannedPage for registered-but-unpublished entries, or null if
 * nothing is known about this path.
 *
 * Pass `isPlanned: true` when the catalog entry exists but has
 * `status === "planned"` — the page registry will return PlannedPage
 * rather than null so the reader gets a friendly "coming soon" view
 * instead of a 404.
 */
export function getEncyclopediaPage(
  track: string,
  slug: string,
  { isPlanned = false }: { isPlanned?: boolean } = {},
): React.ComponentType | null {
  const published = PAGES[`${track}/${slug}` as PageKey]
  if (published) return published
  if (isPlanned) return PlannedPage
  return null
}
