import { expect, test } from "bun:test"
import { COMPONENT_REGISTRY } from "@/components/catalog/manager"
import { SIMULATION_CAPABILITIES, simulationCapabilityFor } from "../simulation-capabilities"

test("every built-in catalog part declares its simulation fidelity", () => {
  for (const definition of COMPONENT_REGISTRY) {
    expect(SIMULATION_CAPABILITIES[definition.type]).toBeDefined()
    expect(simulationCapabilityFor(definition.type).electrical).toMatch(/^(electrical|protocol|visual)$/)
  }
})
