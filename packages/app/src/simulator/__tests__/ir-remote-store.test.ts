import { describe, test, expect } from "bun:test"
import { irRemoteStore } from "../ir-remote-store"

describe("irRemoteStore", () => {
  test("broadcast increments seq and stores the code", () => {
    const before = irRemoteStore.getSnapshot()
    irRemoteStore.broadcast(0xff00ff)
    const after = irRemoteStore.getSnapshot()
    expect(after.seq).toBe(before.seq + 1)
    expect(after.code).toBe(0xff00ff)
  })

  test("notifies only active subscribers", () => {
    let calls = 0
    const unsub = irRemoteStore.subscribe(() => {
      calls++
    })
    irRemoteStore.broadcast(0x1)
    irRemoteStore.broadcast(0x2)
    unsub()
    irRemoteStore.broadcast(0x3)
    expect(calls).toBe(2)
  })

  test("normalizes the code to an unsigned 32-bit value", () => {
    irRemoteStore.broadcast(-1)
    expect(irRemoteStore.getSnapshot().code).toBe(0xffffffff)
  })
})
