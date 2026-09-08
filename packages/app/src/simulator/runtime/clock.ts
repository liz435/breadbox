export type SimulationTimer = number

export type SimulationClock = Readonly<{
  requestFrame: (callback: (timestamp: number) => void) => SimulationTimer
  cancelFrame: (timer: SimulationTimer) => void
}>

export const browserSimulationClock: SimulationClock = {
  requestFrame: (callback) => requestAnimationFrame(callback),
  cancelFrame: (timer) => cancelAnimationFrame(timer),
}

/** A deterministic clock for runtime tests and headless callers. */
export class ManualSimulationClock implements SimulationClock {
  private nextId = 1
  private pending = new Map<number, (timestamp: number) => void>()
  private now = 0

  requestFrame(callback: (timestamp: number) => void): number {
    const id = this.nextId++
    this.pending.set(id, callback)
    return id
  }

  cancelFrame(timer: number): void {
    this.pending.delete(timer)
  }

  advance(timestamp = this.now + 16.6667): void {
    this.now = timestamp
    const callbacks = [...this.pending.entries()]
    this.pending.clear()
    for (const [, callback] of callbacks) callback(timestamp)
  }

  get queuedFrames(): number {
    return this.pending.size
  }
}
