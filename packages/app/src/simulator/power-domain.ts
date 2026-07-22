// ── Solved-voltage power authority ─────────────────────────────────────────
//
// The circuit solver owns voltage/current truth. This domain turns its supply
// records into stable runtime decisions (normal, undervoltage, overload, or
// collapsed) for the MCU and peripherals. It deliberately has no topology
// inference: callers must provide a solved supply record.

import type { ComponentPowerState, SolvedSupply } from "./circuit-solver"
import { powerModelFor } from "./power-model"

export type PowerFault = "normal" | "undervoltage" | "overcurrent" | "collapsed"

export type PowerSnapshot = SolvedSupply & {
  fault: PowerFault
  /** Voltage fraction of nominal, clamped to a useful diagnostic range. */
  ratio: number
}

export type DevicePowerProfile = {
  minOperatingVolts: number
  brownoutVolts: number
  recoveryVolts: number
  startupDelayMs: number
}

export type BrownoutState = { tripped: boolean; recoveredAtWallMs: number | null }
export type BrownoutAction = "none" | "trip" | "hold" | "recover"

export const MCU_5V_POWER_PROFILE: DevicePowerProfile = {
  minOperatingVolts: 4.5,
  brownoutVolts: 4.2,
  recoveryVolts: 4.5,
  startupDelayMs: 20,
}

export const MCU_3V3_POWER_PROFILE: DevicePowerProfile = {
  minOperatingVolts: 3.0,
  brownoutVolts: 2.7,
  recoveryVolts: 3.0,
  startupDelayMs: 20,
}

/** Deterministic brownout hysteresis transition. Wall time is deliberate:
 * while the MCU is reset its simulated clock cannot advance to pay a startup
 * delay. The supplied clock makes this policy unit-testable. */
export function advanceBrownout(
  state: BrownoutState,
  supply: Pick<PowerSnapshot, "voltage"> | null,
  profile: DevicePowerProfile,
  nowWallMs: number,
): { state: BrownoutState; action: BrownoutAction } {
  if (!supply) return { state, action: "none" }
  if (!state.tripped) {
    return supply.voltage < profile.brownoutVolts
      ? { state: { tripped: true, recoveredAtWallMs: null }, action: "trip" }
      : { state, action: "none" }
  }
  if (supply.voltage < profile.recoveryVolts) {
    return { state: { tripped: true, recoveredAtWallMs: null }, action: "hold" }
  }
  if (state.recoveredAtWallMs === null) {
    return { state: { tripped: true, recoveredAtWallMs: nowWallMs }, action: "hold" }
  }
  if (nowWallMs - state.recoveredAtWallMs < profile.startupDelayMs) {
    return { state, action: "hold" }
  }
  return { state: { tripped: false, recoveredAtWallMs: null }, action: "recover" }
}

function faultFor(supply: SolvedSupply): PowerFault {
  const ratio = supply.nominalVoltage > 0 ? supply.voltage / supply.nominalVoltage : 0
  if (supply.currentMa > 1 && ratio < 0.6) return "collapsed"
  if (supply.currentMa > supply.currentLimitMa) return "overcurrent"
  if (supply.currentMa > 1 && ratio < 0.9) return "undervoltage"
  return "normal"
}

/** Mutable only within a SimulationSession. `snapshot` is safe to publish to
 * React, worker diagnostics, and device models. */
export class PowerDomain {
  private byId = new Map<string, PowerSnapshot>()
  private byComponentId = new Map<string, ComponentPowerState>()

  update(supplies: readonly SolvedSupply[], componentPower: ReadonlyMap<string, ComponentPowerState> = new Map()): void {
    this.byId.clear()
    for (const supply of supplies) {
      const ratio = supply.nominalVoltage > 0 ? supply.voltage / supply.nominalVoltage : 0
      this.byId.set(supply.id, {
        ...supply,
        ratio: Math.max(0, ratio),
        fault: faultFor(supply),
      })
    }
    this.byComponentId = new Map(componentPower)
  }

  reset(): void {
    this.byId.clear()
    this.byComponentId.clear()
  }

  get(id: string): PowerSnapshot | null {
    return this.byId.get(id) ?? null
  }

  snapshot(): readonly PowerSnapshot[] {
    return Array.from(this.byId.values())
  }

  /** The board rail that powers a 5V AVR or 3.3V MCU. External modules remain
   * separate supplies; callers choose their own terminal-bound source. */
  primaryBoardSupply(nominalVoltage: number): PowerSnapshot | null {
    const label = nominalVoltage === 3.3 ? "Arduino 3V3" : "Arduino 5V"
    return this.snapshot().find((s) => s.label === label) ?? null
  }

  /** Returns the first source whose solved terminal voltage can operate the
   * requested profile. Device-to-supply binding is added by the topology
   * resolver; this method keeps the threshold/hysteresis policy central. */
  isOperating(id: string, profile: Pick<DevicePowerProfile, "minOperatingVolts">): boolean {
    const supply = this.byId.get(id)
    return !!supply && supply.fault !== "collapsed" && supply.voltage >= profile.minOperatingVolts
  }

  /** Solved supply voltage at the part's declared supply node, ground-referenced. */
  componentSupplyVoltage(componentId: string): number | null {
    return this.byComponentId.get(componentId)?.supplyVoltage ?? null
  }

  /**
   * Whether the part can operate on this frame's solved state.
   *
   * Three independent conditions, all of which have to hold:
   *  - its supply node is at or above the declared threshold;
   *  - if it declares a return pin, that return actually reaches ground;
   *  - no supply feeding it has collapsed. A collapsed source can still sit
   *    above a low-threshold device's minimum (a 12V rail sagging to 6V), so
   *    voltage alone would wrongly call it operating.
   *
   * Overcurrent deliberately does NOT disqualify: source resistance already
   * expresses that droop in the solved voltage, so failing on it too would
   * count the same fault twice.
   */
  isComponentOperating(componentId: string, type: string): boolean {
    const model = powerModelFor(type)
    if (!model) return false
    const state = this.byComponentId.get(componentId)
    if (!state) return false
    if (state.supplyVoltage < model.minOperatingVolts) return false
    if (model.return !== undefined && state.returnGrounded !== true) return false
    return state.supplyIds.every((id) => {
      const supply = this.byId.get(id)
      return !supply || supply.fault !== "collapsed"
    })
  }
}
