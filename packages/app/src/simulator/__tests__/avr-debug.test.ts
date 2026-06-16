// ── AVR breakpoint engine tests ──────────────────────────────────────────────
//
// Exercises the low-level avr8js breakpoint/step primitives that the
// SketchRunner's DebugController is built on, using a tiny hand-assembled
// program (no arduino-cli needed):
//
//   word 0:  NOP            (0x0000)
//   word 1:  NOP            (0x0000)
//   word 2:  RJMP -3 → 0    (0xCFFD)  ; loops back to word 0
//
// So the program counter cycles 0 → 1 → 2 → 0 → …, one word per instruction
// until the RJMP jumps back.

import { describe, expect, it } from "bun:test"
import { createAVRRunner } from "../avr-runner"

function loopProgram(): Uint16Array {
  const prog = new Uint16Array(0x4000)
  prog[0] = 0x0000 // NOP
  prog[1] = 0x0000 // NOP
  prog[2] = 0xcffd // RJMP -3  (pc = 2 + (-3) + 1 = 0)
  return prog
}

function makeRunner() {
  const runner = createAVRRunner({
    onPinChange: () => {},
    onSerialOutput: () => {},
  })
  runner.load(loopProgram())
  return runner
}

describe("createAVRRunner breakpoints", () => {
  it("halts execution when pc reaches an armed breakpoint", () => {
    const runner = makeRunner()
    runner.setBreakpoints([2])
    const halted = runner.execute(1000)
    expect(halted).toBe(true)
    expect(runner.getPc()).toBe(2)
  })

  it("runs the full cycle budget when no breakpoint is in the path", () => {
    const runner = makeRunner()
    runner.setBreakpoints([99]) // unreachable address
    expect(runner.execute(50)).toBe(false)
  })

  it("does not immediately re-halt on the parked instruction after prepareResume", () => {
    const runner = makeRunner()
    runner.setBreakpoints([2])
    expect(runner.execute(1000)).toBe(true)
    expect(runner.getPc()).toBe(2)

    // Resume: must step PAST word 2 and only re-halt on the NEXT loop pass.
    runner.prepareResume()
    const halted = runner.execute(1000)
    expect(halted).toBe(true)
    expect(runner.getPc()).toBe(2)
    // It actually went around the loop (0 → 1 → 2), not stuck in place.
    expect(runner.getCycleCount()).toBeGreaterThan(2)
  })

  it("single-steps one instruction at a time, ignoring breakpoints", () => {
    const runner = makeRunner()
    runner.setBreakpoints([1])
    expect(runner.getPc()).toBe(0)
    runner.step() // NOP at 0 → pc 1 (breakpoint, but step ignores it)
    expect(runner.getPc()).toBe(1)
    runner.step() // NOP at 1 → pc 2
    expect(runner.getPc()).toBe(2)
    runner.step() // RJMP at 2 → pc 0
    expect(runner.getPc()).toBe(0)
  })

  it("exposes the data space (regs + I/O + SRAM) and SP for inspection", () => {
    const runner = makeRunner()
    const data = runner.getDataSpace()
    // ATmega328P: 32 regs + I/O + 2KB SRAM from 0x100.
    expect(data.length).toBeGreaterThanOrEqual(0x100 + 0x800)
    // getDataSpace returns a copy — mutating it must not affect the VM.
    data[0] = 0xff
    expect(runner.getDataSpace()[0]).toBe(0)
    // SP is a 16-bit value assembled from SPH:SPL.
    expect(typeof runner.getSp()).toBe("number")
  })
})
