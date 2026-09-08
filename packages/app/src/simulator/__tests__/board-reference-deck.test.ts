import { describe, expect, test } from "bun:test"
import { buildNetlist } from "../netlist-builder"
import { createDefaultPinStates, type BoardComponent, type Wire } from "@dreamer/schemas"
import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

function hasNgspice(): boolean {
  try {
    return Bun.spawnSync(["ngspice", "--version"], { stdout: "pipe", stderr: "pipe" }).exitCode === 0
  } catch {
    return false
  }
}

const HAS_NGSPICE = hasNgspice()
const workDir = HAS_NGSPICE ? mkdtempSync(join(tmpdir(), "board-reference-deck-")) : ""

function readPrintedValue(deck: string, expression: string): number {
  const path = join(workDir, `${Bun.hash(deck).toString(16)}.cir`)
  writeFileSync(path, ["board reference", deck.trim(), ".control", "op", `print ${expression}`, ".endc", ".end", ""].join("\n"))
  const result = Bun.spawnSync(["ngspice", "-b", path], { stdout: "pipe", stderr: "pipe" })
  const output = result.stdout.toString()
  const line = output.split("\n").find((value) => value.toLowerCase().includes(expression.toLowerCase()))
  const match = line?.match(/=\s*([-+0-9.eE]+)/)
  if (!match) throw new Error(`ngspice did not print ${expression}: ${output.slice(0, 800)}`)
  return Number(match[1])
}

describe.skipIf(!HAS_NGSPICE)("Board → generated netlist → independent reference deck", () => {
  test("generated resistor drive matches a hand-authored SPICE deck", () => {
    const resistor: BoardComponent = {
      id: "r1",
      type: "resistor",
      name: "R1",
      x: 0,
      y: 5,
      rotation: 0,
      pins: { a: null, b: null },
      properties: { resistance: 220 },
    }
    const wires: Record<string, Wire> = {
      pin: { id: "pin", fromRow: -999, fromCol: 13, toRow: 5, toCol: 3, color: "red" },
      ground: { id: "ground", fromRow: -999, fromCol: -3, toRow: 5, toCol: 6, color: "black" },
    }
    const pinStates = createDefaultPinStates()
    pinStates[13] = { ...pinStates[13], mode: "OUTPUT", digitalValue: 1 }
    const generated = buildNetlist({ r1: resistor }, wires, pinStates)

    expect(generated.terminalNodeMap.get("r1\u0000a")).toBe(generated.componentNodePairs.get("r1")?.nodeA)
    expect(generated.netlist).toContain("R_r1")
    const generatedLoadVoltage = readPrintedValue(`${generated.netlist}\n.end`, `v(${generated.componentNodePairs.get("r1")!.nodeA})`)

    // This deck is intentionally written by hand. It describes the same
    // 5V source + 25Ω output impedance + 220Ω load, without using the board
    // compiler's net names or line ordering.
    const referenceLoadVoltage = readPrintedValue(`VREF ref_source 0 5\nRSOURCE ref_source ref_load 25\nRLOAD ref_load 0 220`, "v(ref_load)")
    expect(Math.abs(generatedLoadVoltage - referenceLoadVoltage)).toBeLessThan(0.001)
  })
})
