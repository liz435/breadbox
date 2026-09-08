import {
  browserSimulationClock,
  type SimulationClock,
  type SimulationTimer,
} from "./clock"

export type SimulationRuntimeStatus = "stopped" | "running"
export type SimulationTick = (timestamp: number) => boolean | void
type Listener = (status: SimulationRuntimeStatus) => void

/**
 * UI-independent scheduler seam for the simulation loop.
 *
 * The runner, circuit solver, and peripheral bus remain implementation
 * details of the caller. This module owns only lifecycle, scheduling, and
 * disposal, which makes timing behaviour deterministic in headless tests.
 */
export class SimulationRuntime {
  private status: SimulationRuntimeStatus = "stopped"
  private timer: SimulationTimer | null = null
  private tick: SimulationTick | null = null
  private listeners = new Set<Listener>()

  constructor(private readonly clock: SimulationClock = browserSimulationClock) {}

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    listener(this.status)
    return () => this.listeners.delete(listener)
  }

  getStatus(): SimulationRuntimeStatus {
    return this.status
  }

  start(tick: SimulationTick): void {
    this.stop()
    this.tick = tick
    this.status = "running"
    this.notify()
    this.schedule()
  }

  stop(): void {
    if (this.timer !== null) {
      this.clock.cancelFrame(this.timer)
      this.timer = null
    }
    this.tick = null
    if (this.status !== "stopped") {
      this.status = "stopped"
      this.notify()
    }
  }

  dispose(): void {
    this.stop()
    this.listeners.clear()
  }

  private schedule(): void {
    if (this.status !== "running" || !this.tick) return
    this.timer = this.clock.requestFrame((timestamp) => {
      this.timer = null
      if (this.status !== "running" || !this.tick) return
      const continueRunning = this.tick(timestamp)
      if (continueRunning !== false) this.schedule()
      else this.stop()
    })
  }

  private notify(): void {
    for (const listener of this.listeners) listener(this.status)
  }
}
