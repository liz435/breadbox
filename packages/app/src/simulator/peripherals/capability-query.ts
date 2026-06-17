// ── Capability Query ───────────────────────────────────────────────────────
//
// Board-static lookups ("is a buzzer wired to pin 8?") used by the audio
// layer, the electrical analyzer, and the dev panel. Expensive enough that
// hot callers memoize on `(components, wires)` identity — these objects are
// replaced atomically on board edits, so referential equality is the right
// invalidation signal.

import type { BoardComponent, ComponentType, Wire } from "@dreamer/schemas"
import { isCustomComponentType } from "@dreamer/schemas"
import { findPeripheralsOnPin } from "@/breadboard/component-pin-resolver"
import type { PeripheralCapability } from "./types"

/**
 * Board component types that produce sound. The audio pipeline listens for
 * pin traffic on pins wired to these; other pins stay silent regardless of
 * edge rate (kills the shiftOut false-beep bug).
 */
const SOUND_SOURCE_TYPES: ReadonlySet<ComponentType> = new Set<ComponentType>([
  "buzzer",
])

function typeHasCapability(
  type: ComponentType,
  capability: PeripheralCapability,
): boolean {
  switch (capability) {
    case "soundSource":
      return SOUND_SOURCE_TYPES.has(type)
    case "positionActuator":
      return type === "servo"
    case "displaySink":
      return type === "lcd_16x2" || type === "oled_display" || type === "seven_segment"
    case "lightEmitter":
      return type === "led" || type === "rgb_led" || type === "neopixel"
    case "analogSensor":
      return (
        type === "photoresistor" ||
        type === "temperature_sensor" ||
        type === "potentiometer"
      )
    case "digitalSensor":
      return type === "button" || type === "pir_sensor"
    case "requiresExternalPower":
      return type === "servo" || type === "dc_motor" || type === "relay"
  }
}

type MemoKey = {
  components: Record<string, BoardComponent>
  wires: Record<string, Wire>
}

type CapabilityCache = Map<number, Map<PeripheralCapability, boolean>>

let memoKey: MemoKey | null = null
let memoCache: CapabilityCache = new Map()

/**
 * True if an Arduino pin has at least one wired component with `capability`.
 * Memoized on (components, wires) identity.
 */
export function pinHasCapability(
  pin: number,
  capability: PeripheralCapability,
  components: Record<string, BoardComponent>,
  wires: Record<string, Wire>,
): boolean {
  if (!memoKey || memoKey.components !== components || memoKey.wires !== wires) {
    memoKey = { components, wires }
    memoCache = new Map()
  }
  const pinCache = memoCache.get(pin) ?? new Map<PeripheralCapability, boolean>()
  const cached = pinCache.get(capability)
  if (cached !== undefined) return cached

  const wired = findPeripheralsOnPin(pin, components, wires)
  // Custom parts have no built-in peripheral capability; the guard also narrows
  // c.type back to the built-in ComponentType union for typeHasCapability.
  const hit = wired.some((c) => !isCustomComponentType(c.type) && typeHasCapability(c.type, capability))
  pinCache.set(capability, hit)
  memoCache.set(pin, pinCache)
  return hit
}

/** Reset the memoization cache. Called on sim reset / tests. */
export function resetCapabilityCache(): void {
  memoKey = null
  memoCache = new Map()
}
