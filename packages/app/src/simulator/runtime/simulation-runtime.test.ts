import { describe, expect, test } from "bun:test"
import { ManualSimulationClock } from "./clock"
import { SimulationRuntime } from "./simulation-runtime"

describe("SimulationRuntime", () => {
  test("runs deterministically on a manual clock", () => {
    const clock = new ManualSimulationClock()
    const runtime = new SimulationRuntime(clock)
    const timestamps: number[] = []

    runtime.start((timestamp) => {
      timestamps.push(timestamp)
      return timestamps.length < 2
    })
    clock.advance(10)
    clock.advance(20)
    clock.advance(30)

    expect(timestamps).toEqual([10, 20])
    expect(runtime.getStatus()).toBe("stopped")
    expect(clock.queuedFrames).toBe(0)
  })

  test("stop cancels the pending frame", () => {
    const clock = new ManualSimulationClock()
    const runtime = new SimulationRuntime(clock)
    let ticks = 0
    runtime.start(() => { ticks += 1 })
    runtime.stop()
    clock.advance()
    expect(ticks).toBe(0)
  })
})
