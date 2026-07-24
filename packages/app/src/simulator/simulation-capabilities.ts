// ── Simulation fidelity declarations ──────────────────────────────────────
// The simulator must state what it knows. A visual animation is never silently
// promoted to an electrical claim merely because the part appears to work.

export type FidelityTier = "electrical" | "protocol" | "visual"

export type SimulationCapability = {
  electrical: FidelityTier
  powerDependent: boolean
  environmentDependent: boolean
  mechanical: "none" | "visual" | "coupled"
  /** Runtime feature that must exist on the selected target for this
   * peripheral implementation to attach. This is deliberately distinct from
   * electrical fidelity: an OLED can be a good I²C model while a particular
   * emulator has no I²C bridge. */
  requiresTargetCapability?: "gpio" | "pwm" | "analog" | "i2c" | "serial"
}

const ELECTRICAL: SimulationCapability = { electrical: "electrical", powerDependent: true, environmentDependent: false, mechanical: "none" }
const VISUAL: SimulationCapability = { electrical: "visual", powerDependent: false, environmentDependent: false, mechanical: "visual" }

/** Central declared truth contract for built-in parts. Custom parts default to
 * visual until their PartSpec/behavior supplies an explicit declaration. */
export const SIMULATION_CAPABILITIES: Readonly<Record<string, SimulationCapability>> = {
  resistor: ELECTRICAL, capacitor: ELECTRICAL, inductor: ELECTRICAL, led: ELECTRICAL,
  rgb_led: ELECTRICAL, button: ELECTRICAL, potentiometer: ELECTRICAL,
  photoresistor: { electrical: "electrical", powerDependent: true, environmentDependent: true, mechanical: "none", requiresTargetCapability: "analog" },
  temperature_sensor: { electrical: "electrical", powerDependent: true, environmentDependent: true, mechanical: "none", requiresTargetCapability: "analog" },
  ultrasonic_sensor: { electrical: "protocol", powerDependent: true, environmentDependent: true, mechanical: "none", requiresTargetCapability: "gpio" },
  dht_sensor: { electrical: "protocol", powerDependent: true, environmentDependent: true, mechanical: "none", requiresTargetCapability: "gpio" },
  pir_sensor: { electrical: "protocol", powerDependent: true, environmentDependent: true, mechanical: "none", requiresTargetCapability: "gpio" },
  ir_receiver: { electrical: "protocol", powerDependent: true, environmentDependent: true, mechanical: "none", requiresTargetCapability: "gpio" },
  buzzer: { electrical: "protocol", powerDependent: true, environmentDependent: false, mechanical: "visual", requiresTargetCapability: "pwm" },
  servo: { electrical: "protocol", powerDependent: true, environmentDependent: false, mechanical: "coupled", requiresTargetCapability: "pwm" },
  dc_motor: { electrical: "electrical", powerDependent: true, environmentDependent: false, mechanical: "coupled", requiresTargetCapability: "pwm" },
  stepper_motor: { electrical: "protocol", powerDependent: true, environmentDependent: false, mechanical: "visual", requiresTargetCapability: "gpio" },
  relay: { electrical: "protocol", powerDependent: true, environmentDependent: false, mechanical: "coupled", requiresTargetCapability: "gpio" },
  lcd_16x2: { electrical: "protocol", powerDependent: true, environmentDependent: false, mechanical: "none", requiresTargetCapability: "gpio" },
  oled_display: { electrical: "protocol", powerDependent: true, environmentDependent: false, mechanical: "none", requiresTargetCapability: "i2c" },
  neopixel: { electrical: "protocol", powerDependent: true, environmentDependent: false, mechanical: "none", requiresTargetCapability: "gpio" },
  seven_segment: { electrical: "electrical", powerDependent: true, environmentDependent: false, mechanical: "none", requiresTargetCapability: "gpio" },
  shift_register: { electrical: "protocol", powerDependent: true, environmentDependent: false, mechanical: "none", requiresTargetCapability: "gpio" },
  transistor: ELECTRICAL, mosfet: ELECTRICAL, power_supply: ELECTRICAL,
  multimeter: VISUAL, ic: VISUAL, ir_remote: VISUAL,
  breadboard_full: VISUAL, perfboard_generic: VISUAL,
}

export function simulationCapabilityFor(type: string): SimulationCapability {
  return SIMULATION_CAPABILITIES[type] ?? VISUAL
}

export function requiredTargetCapabilityFor(type: string): SimulationCapability["requiresTargetCapability"] {
  return simulationCapabilityFor(type).requiresTargetCapability
}
