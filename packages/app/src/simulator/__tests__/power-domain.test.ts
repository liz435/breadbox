import { describe, expect, test } from "bun:test"
import { advanceBrownout, MCU_3V3_POWER_PROFILE, MCU_5V_POWER_PROFILE, PowerDomain } from "../power-domain"
import { resolveComponentPins } from "@dreamer/schemas"
import type { ComponentPowerState, SolvedSupply } from "../circuit-solver"
import { COMPONENT_REGISTRY } from "@/components/catalog/manager"

const healthy5V: SolvedSupply = {
  id: "rail", label: "Arduino 5V", voltage: 5, currentMa: 250,
  nominalVoltage: 5, currentLimitMa: 500,
}

function componentPower(over: Partial<ComponentPowerState> = {}): ComponentPowerState {
  return {
    componentId: "part-1", supplyVoltage: 5, returnGrounded: true, supplyIds: ["rail"], ...over,
  }
}

function domainWith(state: ComponentPowerState, supplies: SolvedSupply[] = [healthy5V]): PowerDomain {
  const domain = new PowerDomain()
  domain.update(supplies, new Map([[state.componentId, state]]))
  return domain
}

describe("PowerDomain", () => {
  test("publishes solved source current, voltage, and fault state", () => {
    const domain = new PowerDomain()
    domain.update([{
      id: "psu:left", label: "MB102 left", voltage: 4.1, currentMa: 820,
      nominalVoltage: 5, currentLimitMa: 700, sourceResistanceOhms: 0.35,
    }])

    const supply = domain.get("psu:left")
    expect(supply?.fault).toBe("overcurrent")
    expect(supply?.ratio).toBeCloseTo(0.82)
    expect(domain.isOperating("psu:left", { minOperatingVolts: 4.5 })).toBe(false)
  })

  test("marks a deeply sagged loaded rail as collapsed", () => {
    const domain = new PowerDomain()
    domain.update([{
      id: "rail", label: "Arduino 5V", voltage: 2.8, currentMa: 200,
      nominalVoltage: 5, currentLimitMa: 500,
    }])
    expect(domain.get("rail")?.fault).toBe("collapsed")
  })

  test("brownout requires recovery hysteresis and a startup delay", () => {
    const tripped = advanceBrownout(
      { tripped: false, recoveredAtWallMs: null }, { voltage: 4.1 }, MCU_5V_POWER_PROFILE, 0,
    )
    expect(tripped.action).toBe("trip")
    const stillLow = advanceBrownout(tripped.state, { voltage: 4.4 }, MCU_5V_POWER_PROFILE, 10)
    expect(stillLow.action).toBe("hold")
    const stable = advanceBrownout(stillLow.state, { voltage: 4.7 }, MCU_5V_POWER_PROFILE, 20)
    expect(stable.action).toBe("hold")
    expect(advanceBrownout(stable.state, { voltage: 4.7 }, MCU_5V_POWER_PROFILE, 39).action).toBe("hold")
    expect(advanceBrownout(stable.state, { voltage: 4.7 }, MCU_5V_POWER_PROFILE, 40).action).toBe("recover")
  })

  // Every pin name a part declares has to exist in resolveComponentPins, or
  // the netlist can never resolve a node for it and the part reads as
  // permanently dead — the failure mode that kept the DC motor from spinning.
  test("every declared power pin name exists on its part", () => {
    for (const def of COMPONENT_REGISTRY) {
      if (!def.power) continue
      // netlist-builder resolves declared names through exactly this map.
      const pinMap = resolveComponentPins(def.type, 0, 0, def.defaultProperties)
      // Each role is a candidate list in preference order, so require that at
      // least one name per declared role actually resolves to a hole.
      const resolves = (names: readonly string[]) => names.some((n) => !!pinMap[n])
      expect({
        type: def.type,
        supply: resolves(def.power.supply),
        return: def.power.return === undefined || resolves(def.power.return),
      }).toEqual({ type: def.type, supply: true, return: true })
    }
  })

  test("a part whose supply node sags below its threshold stops operating", () => {
    const domain = domainWith(componentPower({ supplyVoltage: 4.1 }))
    expect(domain.isComponentOperating("part-1", "servo")).toBe(false) // needs 4.8V
    expect(domain.isComponentOperating("part-1", "temperature_sensor")).toBe(true) // needs 2.7V
  })

  // getNodeVoltage falls back to 0 for unknown nodes, so a positive−ground
  // subtraction cannot tell an unwired ground from a wired one. The explicit
  // flag is what makes the miswiring visible.
  test("a declared return that never reaches ground is not operating", () => {
    const domain = domainWith(componentPower({ returnGrounded: false }))
    expect(domain.isComponentOperating("part-1", "temperature_sensor")).toBe(false)
  })

  // The motor declares no return, so it must not be judged on one.
  test("a part with no declared return ignores return state", () => {
    const domain = domainWith(componentPower({ returnGrounded: null }))
    expect(domain.isComponentOperating("part-1", "dc_motor")).toBe(true)
  })

  // A collapsed 12V source can still clear a 4.5V device's threshold, so
  // voltage alone would wrongly call it operating.
  test("a part inherits a collapsed supply's fault even when its node reads high", () => {
    const collapsed: SolvedSupply = {
      id: "rail", label: "MB102 left", voltage: 6, currentMa: 900,
      nominalVoltage: 12, currentLimitMa: 700,
    }
    const domain = domainWith(componentPower({ supplyVoltage: 6 }), [collapsed])
    expect(domain.get("rail")?.fault).toBe("collapsed")
    expect(domain.isComponentOperating("part-1", "relay")).toBe(false)
  })

  test("the 3.3V MCU profile uses its own brownout threshold", () => {
    expect(advanceBrownout(
      { tripped: false, recoveredAtWallMs: null }, { voltage: 2.8 }, MCU_3V3_POWER_PROFILE, 0,
    ).action).toBe("none")
    expect(advanceBrownout(
      { tripped: false, recoveredAtWallMs: null }, { voltage: 2.6 }, MCU_3V3_POWER_PROFILE, 0,
    ).action).toBe("trip")
  })
})
