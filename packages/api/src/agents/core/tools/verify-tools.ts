import { tool } from "ai"
import { z } from "zod"
import { extractPinReferences } from "../../../utils/sketch-validator"
import type { ToolContext } from "./shared"

const ARDUINO_FROM_ROW = -999

function pinLabel(pin: number): string {
  if (pin >= 0 && pin <= 13) return `D${pin}`
  if (pin >= 14 && pin <= 19) return `A${pin - 14}`
  return `pin${pin}`
}

export function createVerifyTools(ctx: ToolContext) {
  const { workingBoard } = ctx

  return {
    verify_circuit: tool({
      description:
        "Verify that the current sketch only references pins that are actually wired on the board. Call this once after a successful propose_circuit to catch sketch/wiring mismatches (e.g. pulseIn(8) when pin 8 has no wire). Returns success=false if any pin referenced by pinMode/digitalRead/digitalWrite/analogRead/analogWrite/pulseIn/Servo.attach is unwired. wired_pin_unused entries are warnings only.",
      inputSchema: z.object({}),
      execute: async () => {
        const sketch = workingBoard.sketchCode ?? ""
        const refs = extractPinReferences(sketch)
        const sketchPinSet = new Set(refs.map((r) => r.pin))

        // Arduino-side wired pins: fromRow===-999 with a digital (0..13) or
        // analog (14..19) column. Power/ground columns (-1, -2, -3, -4, -6)
        // are excluded — sketches never call digitalRead(GND).
        const wiredPinSet = new Set<number>()
        for (const wire of Object.values(workingBoard.wires)) {
          if (wire.fromRow !== ARDUINO_FROM_ROW) continue
          if (wire.fromCol >= 0 && wire.fromCol <= 19) {
            wiredPinSet.add(wire.fromCol)
          }
        }

        const issues: Array<{
          kind: "unwired_pin_referenced" | "wired_pin_unused"
          pin: number
          pinLabel: string
          sketchCalls?: string[]
        }> = []

        for (const ref of refs) {
          if (!wiredPinSet.has(ref.pin)) {
            issues.push({
              kind: "unwired_pin_referenced",
              pin: ref.pin,
              pinLabel: pinLabel(ref.pin),
              sketchCalls: ref.callSites,
            })
          }
        }
        for (const pin of wiredPinSet) {
          if (!sketchPinSet.has(pin)) {
            issues.push({
              kind: "wired_pin_unused",
              pin,
              pinLabel: pinLabel(pin),
            })
          }
        }

        const hasErrors = issues.some((i) => i.kind === "unwired_pin_referenced")
        const sketchPins = Array.from(sketchPinSet).sort((a, b) => a - b)
        const wiredPins = Array.from(wiredPinSet).sort((a, b) => a - b)

        if (hasErrors) {
          const offenders = issues
            .filter((i) => i.kind === "unwired_pin_referenced")
            .map((i) => i.pinLabel)
            .join(", ")
          return {
            success: false,
            sketchPins,
            wiredPins,
            issues,
            nextStep: `Sketch references unwired pin(s): ${offenders}. Either wire them via another propose_circuit call, or update the sketch to use a wired pin.`,
          }
        }
        return { success: true, sketchPins, wiredPins, issues }
      },
    }),
  } as const
}
