import { afterEach, describe, expect, test } from "bun:test"
import {
  isPhysicsActive,
  isPhysicsDragging,
  resetPhysicsActivity,
  setPhysicsDragging,
  sleepPhysics,
  subscribePhysicsActive,
  wakePhysics,
} from "../physics-activity"

// Module-level store: reset between tests so ordering can't leak state.
afterEach(() => resetPhysicsActivity())

describe("wake / sleep", () => {
  test("starts idle", () => {
    expect(isPhysicsActive()).toBe(false)
  })

  test("wakePhysics activates and sleepPhysics idles", () => {
    wakePhysics()
    expect(isPhysicsActive()).toBe(true)
    sleepPhysics()
    expect(isPhysicsActive()).toBe(false)
  })

  test("notifies subscribers once per transition, not per call", () => {
    let notifications = 0
    const unsubscribe = subscribePhysicsActive(() => {
      notifications += 1
    })

    wakePhysics()
    wakePhysics() // already awake — must not re-notify
    expect(notifications).toBe(1)

    sleepPhysics()
    sleepPhysics() // already idle
    expect(notifications).toBe(2)

    unsubscribe()
  })

  test("unsubscribed listeners stop receiving notifications", () => {
    let notifications = 0
    const unsubscribe = subscribePhysicsActive(() => {
      notifications += 1
    })
    unsubscribe()

    wakePhysics()
    expect(notifications).toBe(0)
  })
})

describe("dragging", () => {
  test("starting a drag wakes the solver", () => {
    expect(isPhysicsActive()).toBe(false)
    setPhysicsDragging(true)
    expect(isPhysicsDragging()).toBe(true)
    expect(isPhysicsActive()).toBe(true)
  })

  test("ending a drag clears the flag but leaves the solver to settle", () => {
    setPhysicsDragging(true)
    setPhysicsDragging(false)
    expect(isPhysicsDragging()).toBe(false)
    // The stepper decides when to sleep; ending a drag must not force it.
    expect(isPhysicsActive()).toBe(true)
  })
})

describe("resetPhysicsActivity", () => {
  // The stuck-awake bug: sleepPhysics is only ever called by the sleep watcher,
  // which lives inside the physics tree. Unmounting that tree (toggling the
  // flag off, closing the panel) while the world was awake stranded
  // active === true, pinning the canvas at frameloop="always" forever.
  test("clears an awake world when the physics tree unmounts", () => {
    wakePhysics()
    expect(isPhysicsActive()).toBe(true)

    resetPhysicsActivity()
    expect(isPhysicsActive()).toBe(false)
  })

  // The other half: the sleep watcher refuses to sleep while a drag is in
  // flight, so a drag interrupted by an unmount pinned the loop just as hard.
  test("clears a drag interrupted mid-gesture", () => {
    setPhysicsDragging(true)
    expect(isPhysicsDragging()).toBe(true)

    resetPhysicsActivity()
    expect(isPhysicsDragging()).toBe(false)
    expect(isPhysicsActive()).toBe(false)
  })

  test("notifies subscribers so the canvas returns to frameloop=demand", () => {
    wakePhysics()
    let notifications = 0
    const unsubscribe = subscribePhysicsActive(() => {
      notifications += 1
    })

    resetPhysicsActivity()
    expect(notifications).toBe(1)
    unsubscribe()
  })

  test("is a no-op when already idle", () => {
    let notifications = 0
    const unsubscribe = subscribePhysicsActive(() => {
      notifications += 1
    })

    resetPhysicsActivity()
    expect(notifications).toBe(0)
    unsubscribe()
  })

  // After a reset the world must be usable again — a stale dragging flag would
  // keep the next session's sleep watcher from ever idling.
  test("leaves the store usable for the next physics session", () => {
    setPhysicsDragging(true)
    resetPhysicsActivity()

    wakePhysics()
    expect(isPhysicsActive()).toBe(true)
    expect(isPhysicsDragging()).toBe(false)
    sleepPhysics()
    expect(isPhysicsActive()).toBe(false)
  })
})
