// ── Component Catalog Manager ──────────────────────────────────────────────
//
// Assembles the component registry from the per-component folders in catalog/.
// Each catalog/<type>/index.tsx exports one ComponentDefinition (with its
// renderer colocated in the same folder). This module is the single place that
// wires them together; consumers import COMPONENT_REGISTRY / getComponentDef
// from here (re-exported by @/components/registry for back-compat).
//
// IMPORTANT: Pin-to-grid-position mapping lives in @dreamer/schemas/component-pins.ts
// (resolveComponentPins). Catalog footprint functions should use footprintFromPins()
// (catalog/_shared) where possible so the API (propose_circuit, power-budget-
// analyzer) and the frontend always agree on pin positions.
//
// To add a new component:
//   1. Add its type to componentTypeSchema in packages/schemas/src/arduino.ts
//   2. Add its pin mapping in packages/schemas/src/component-pins.ts
//   3. Create catalog/<type>/index.tsx (and optionally a colocated <type>-renderer.tsx)
//   4. Import it below and add it to COMPONENT_REGISTRY (order = palette order)

import type { ComponentDefinition } from "@/components/component-definition"
import { getCustomDef } from "@/components/catalog/custom-store"

import { led } from "./led"
import { rgbLed } from "./rgb-led"
import { resistor } from "./resistor"
import { capacitor } from "./capacitor"
import { inductor } from "./inductor"
import { transistor } from "./transistor"
import { mosfet } from "./mosfet"
import { button } from "./button"
import { potentiometer } from "./potentiometer"
import { buzzer } from "./buzzer"
import { servo } from "./servo"
import { photoresistor } from "./photoresistor"
import { temperatureSensor } from "./temperature-sensor"
import { ultrasonicSensor } from "./ultrasonic-sensor"
import { lcd16x2 } from "./lcd-16x2"
import { sevenSegment } from "./seven-segment"
import { neopixel } from "./neopixel"
import { pirSensor } from "./pir-sensor"
import { relay } from "./relay"
import { dcMotor } from "./dc-motor"
import { dhtSensor } from "./dht-sensor"
import { irReceiver } from "./ir-receiver"
import { irRemote } from "./ir-remote"
import { shiftRegister } from "./shift-register"
import { oledDisplay } from "./oled-display"
import { ic } from "./ic"
import { powerSupply } from "./power-supply"
import { multimeter } from "./multimeter"
import { breadboardFull } from "./breadboard-full"
import { perfboardGeneric } from "./perfboard-generic"

/**
 * The single source of truth for all component types. Order here is the palette
 * and command-palette display order — keep it stable.
 */
export const COMPONENT_REGISTRY: ComponentDefinition[] = [
  led,
  rgbLed,
  resistor,
  capacitor,
  inductor,
  transistor,
  mosfet,
  button,
  potentiometer,
  buzzer,
  servo,
  photoresistor,
  temperatureSensor,
  ultrasonicSensor,
  lcd16x2,
  sevenSegment,
  neopixel,
  pirSensor,
  relay,
  dcMotor,
  dhtSensor,
  irReceiver,
  irRemote,
  shiftRegister,
  oledDisplay,
  ic,
  powerSupply,
  multimeter,
  breadboardFull,
  perfboardGeneric,
]

// ── Lookup helpers ────────────────────────────────────────────────────────

const _registryMap = new Map<string, ComponentDefinition>(
  COMPONENT_REGISTRY.map(def => [def.type, def]),
)

/**
 * Look up a component definition by type. Checks built-ins first, then the
 * runtime custom-component overlay. Returns undefined for unknown types
 * (wire, arduino_uno).
 */
export function getComponentDef(type: string): ComponentDefinition | undefined {
  return _registryMap.get(type) ?? getCustomDef(type)
}
