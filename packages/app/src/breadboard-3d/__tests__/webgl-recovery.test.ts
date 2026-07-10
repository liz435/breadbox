import { describe, expect, test } from "bun:test"
import { attachContextRecovery } from "../webgl-recovery"

/** Minimal stand-in for the canvas element, recording listener wiring. */
function fakeCanvas() {
  const listeners = new Map<string, Set<(event: Event) => void>>()
  return {
    addEventListener(type: string, listener: (event: Event) => void) {
      const set = listeners.get(type) ?? new Set()
      set.add(listener)
      listeners.set(type, set)
    },
    removeEventListener(type: string, listener: (event: Event) => void) {
      listeners.get(type)?.delete(listener)
    },
    listenerCount(type: string) {
      return listeners.get(type)?.size ?? 0
    },
    dispatch(type: string, event: Event) {
      for (const listener of listeners.get(type) ?? []) listener(event)
    },
  }
}

function fakeEvent() {
  let defaultPrevented = false
  const event = {
    preventDefault() {
      defaultPrevented = true
    },
    get defaultPrevented() {
      return defaultPrevented
    },
  }
  return event as unknown as Event & { defaultPrevented: boolean }
}

describe("attachContextRecovery", () => {
  test("registers both context listeners", () => {
    const canvas = fakeCanvas()
    attachContextRecovery(canvas, () => {})
    expect(canvas.listenerCount("webglcontextlost")).toBe(1)
    expect(canvas.listenerCount("webglcontextrestored")).toBe(1)
  })

  // Without preventDefault() the browser never fires webglcontextrestored and
  // the context is gone permanently — the canvas stays black forever.
  test("prevents the default on context loss so restore can fire", () => {
    const canvas = fakeCanvas()
    attachContextRecovery(canvas, () => {})

    const event = fakeEvent()
    canvas.dispatch("webglcontextlost", event)

    expect(event.defaultPrevented).toBe(true)
  })

  // frameloop="demand" means nothing schedules a frame on its own; three.js
  // restores GL state but the panel stays frozen until something invalidates.
  test("invalidates once the context is restored", () => {
    const canvas = fakeCanvas()
    let invalidated = 0
    attachContextRecovery(canvas, () => {
      invalidated += 1
    })

    expect(invalidated).toBe(0)
    canvas.dispatch("webglcontextrestored", fakeEvent())
    expect(invalidated).toBe(1)
  })

  test("does not invalidate merely because the context was lost", () => {
    const canvas = fakeCanvas()
    let invalidated = 0
    attachContextRecovery(canvas, () => {
      invalidated += 1
    })

    canvas.dispatch("webglcontextlost", fakeEvent())
    expect(invalidated).toBe(0)
  })

  test("reports loss and restore through the handlers", () => {
    const canvas = fakeCanvas()
    const seen: string[] = []
    attachContextRecovery(canvas, () => {}, {
      onLost: () => seen.push("lost"),
      onRestored: () => seen.push("restored"),
    })

    canvas.dispatch("webglcontextlost", fakeEvent())
    canvas.dispatch("webglcontextrestored", fakeEvent())

    expect(seen).toEqual(["lost", "restored"])
  })

  test("cleanup removes both listeners", () => {
    const canvas = fakeCanvas()
    const detach = attachContextRecovery(canvas, () => {})
    detach()

    expect(canvas.listenerCount("webglcontextlost")).toBe(0)
    expect(canvas.listenerCount("webglcontextrestored")).toBe(0)
  })

  test("a detached recovery no longer invalidates", () => {
    const canvas = fakeCanvas()
    let invalidated = 0
    const detach = attachContextRecovery(canvas, () => {
      invalidated += 1
    })
    detach()

    canvas.dispatch("webglcontextrestored", fakeEvent())
    expect(invalidated).toBe(0)
  })
})
