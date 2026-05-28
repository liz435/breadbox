import { describe, expect, test } from "bun:test"
import {
  BUILD_STATE_MACHINE,
  FIX_STATE_MACHINE,
  type BuildState,
  type FixState,
  type ToolOutcome,
} from "../agent-states"

const ok = (toolName: string, extra?: Partial<ToolOutcome>): ToolOutcome => ({
  toolName,
  success: true,
  ...extra,
})
const fail = (toolName: string, extra?: Partial<ToolOutcome>): ToolOutcome => ({
  toolName,
  success: false,
  ...extra,
})

describe("BuildAgent state machine", () => {
  test("start state exposes only propose_circuit", () => {
    expect(BUILD_STATE_MACHINE.initialState).toBe("start")
    expect(BUILD_STATE_MACHINE.activeTools("start")).toEqual(["propose_circuit"])
  })

  test("happy path: propose_circuit → verify → terminate", () => {
    let s: BuildState = "start"
    s = BUILD_STATE_MACHINE.next(s, ok("propose_circuit"))
    expect(s).toBe("after_propose_circuit_ok")
    expect(BUILD_STATE_MACHINE.activeTools(s)).toEqual(["verify_circuit"])

    s = BUILD_STATE_MACHINE.next(s, ok("verify_circuit"))
    expect(s).toBe("after_verify_ok")
    expect(BUILD_STATE_MACHINE.activeTools(s)).toEqual([])
  })

  test("recovery path: propose_circuit → verify (unwired) → propose_fix → verify", () => {
    let s: BuildState = "start"
    s = BUILD_STATE_MACHINE.next(s, ok("propose_circuit"))
    s = BUILD_STATE_MACHINE.next(s, {
      toolName: "verify_circuit",
      success: false,
      verifyIssues: [{ kind: "unwired_pin_referenced" }],
    })
    expect(s).toBe("after_verify_unwired")
    expect(BUILD_STATE_MACHINE.activeTools(s)).toEqual(["propose_fix", "update_sketch"])

    s = BUILD_STATE_MACHINE.next(s, ok("propose_fix"))
    expect(s).toBe("after_propose_fix_ok")
    expect(BUILD_STATE_MACHINE.activeTools(s)).toEqual(["verify_circuit"])

    s = BUILD_STATE_MACHINE.next(s, ok("verify_circuit"))
    expect(s).toBe("after_verify_ok")
  })

  test("propose_circuit failure (recoverable) re-allows propose_circuit + update_sketch", () => {
    let s: BuildState = "start"
    s = BUILD_STATE_MACHINE.next(s, fail("propose_circuit", { failureKind: "validation" }))
    expect(s).toBe("after_propose_circuit_fail")
    expect(BUILD_STATE_MACHINE.activeTools(s).slice().sort()).toEqual(
      ["propose_circuit", "update_sketch"].sort(),
    )
  })

  test("propose_fix failure (budget remaining) re-allows propose_fix + reads", () => {
    let s: BuildState = "after_verify_unwired"
    s = BUILD_STATE_MACHINE.next(s, fail("propose_fix"))
    expect(s).toBe("after_propose_fix_fail")
    expect(BUILD_STATE_MACHINE.activeTools(s).slice().sort()).toEqual(
      ["list_components", "list_wires", "propose_fix"].sort(),
    )
  })

  test("attempt_limit failureKind terminates regardless of tool", () => {
    expect(
      BUILD_STATE_MACHINE.next("start", fail("propose_circuit", { failureKind: "attempt_limit" })),
    ).toBe("terminated")
    expect(
      BUILD_STATE_MACHINE.next("after_verify_unwired", fail("propose_fix", { failureKind: "attempt_limit" })),
    ).toBe("terminated")
  })

  test("verify_circuit failure without unwired_pin_referenced terminates", () => {
    // Generic verify failure (no recovery path) → terminate so the agent
    // doesn't loop on something it can't fix.
    expect(
      BUILD_STATE_MACHINE.next("after_propose_circuit_ok", fail("verify_circuit")),
    ).toBe("terminated")
  })

  test("reads (list_components / list_wires) don't change state", () => {
    expect(
      BUILD_STATE_MACHINE.next("after_propose_fix_fail", ok("list_components")),
    ).toBe("after_propose_fix_fail")
    expect(
      BUILD_STATE_MACHINE.next("after_propose_fix_fail", ok("list_wires")),
    ).toBe("after_propose_fix_fail")
  })

  test("unknown tool triggers default-deny terminate", () => {
    expect(
      BUILD_STATE_MACHINE.next("start", ok("apply_design")),
    ).toBe("terminated")
  })

  test("terminated stays terminated", () => {
    expect(BUILD_STATE_MACHINE.next("terminated", ok("propose_circuit"))).toBe("terminated")
    expect(BUILD_STATE_MACHINE.activeTools("terminated")).toEqual([])
  })
})

describe("FixAgent state machine", () => {
  test("start state exposes reads + propose_fix + apply_design + sketch writers", () => {
    expect(FIX_STATE_MACHINE.initialState).toBe("start")
    const tools = FIX_STATE_MACHINE.activeTools("start")
    expect(tools).toContain("propose_fix")
    expect(tools).toContain("apply_design")
    expect(tools).toContain("list_components")
    expect(tools).not.toContain("verify_circuit")  // not in start — only after a write
    expect(tools).not.toContain("propose_circuit")  // FixAgent never builds from empty
  })

  test("happy path: propose_fix → verify → terminate", () => {
    let s: FixState = "start"
    s = FIX_STATE_MACHINE.next(s, ok("propose_fix"))
    expect(s).toBe("after_propose_fix_ok")
    expect(FIX_STATE_MACHINE.activeTools(s)).toEqual(["verify_circuit"])

    s = FIX_STATE_MACHINE.next(s, ok("verify_circuit"))
    expect(s).toBe("after_verify_ok")
    expect(FIX_STATE_MACHINE.activeTools(s)).toEqual([])
  })

  test("apply_design path: apply_design → verify → terminate", () => {
    let s: FixState = "start"
    s = FIX_STATE_MACHINE.next(s, ok("apply_design"))
    expect(s).toBe("after_apply_design_ok")
    expect(FIX_STATE_MACHINE.activeTools(s)).toEqual(["verify_circuit"])

    s = FIX_STATE_MACHINE.next(s, ok("verify_circuit"))
    expect(s).toBe("after_verify_ok")
  })

  test("verify unwired_pin → propose_fix + update_sketch (no full reads available)", () => {
    let s: FixState = "after_propose_fix_ok"
    s = FIX_STATE_MACHINE.next(s, {
      toolName: "verify_circuit",
      success: false,
      verifyIssues: [{ kind: "unwired_pin_referenced" }],
    })
    expect(s).toBe("after_verify_unwired")
    expect(FIX_STATE_MACHINE.activeTools(s).slice().sort()).toEqual(
      ["propose_fix", "update_sketch"].sort(),
    )
  })

  test("propose_fix failure → propose_fix + read affordance", () => {
    let s: FixState = "start"
    s = FIX_STATE_MACHINE.next(s, fail("propose_fix"))
    expect(s).toBe("after_propose_fix_fail")
    const tools = FIX_STATE_MACHINE.activeTools(s)
    expect(tools).toContain("propose_fix")
    expect(tools).toContain("list_components")
    expect(tools).toContain("get_component_details")
  })

  test("budget exhaustion terminates", () => {
    expect(
      FIX_STATE_MACHINE.next("start", fail("propose_fix", { failureKind: "attempt_limit" })),
    ).toBe("terminated")
  })

  test("reads from start state don't change state", () => {
    expect(FIX_STATE_MACHINE.next("start", ok("list_components"))).toBe("start")
    expect(FIX_STATE_MACHINE.next("start", ok("get_board_state"))).toBe("start")
    expect(FIX_STATE_MACHINE.next("start", ok("analyze_power_budget"))).toBe("start")
  })

  test("unknown tool triggers default-deny terminate", () => {
    expect(FIX_STATE_MACHINE.next("start", ok("propose_circuit"))).toBe("terminated")
  })
})
