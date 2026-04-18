import { describe, expect, test } from "bun:test"
import { EventEmitter } from "events"
import { withSigintCleanup } from "../runner"

describe("withSigintCleanup", () => {
  test("removes SIGINT listener after successful execution", async () => {
    const emitter = new EventEmitter()
    const onSigint = () => {}

    const result = await withSigintCleanup(
      emitter as unknown as { on: (event: "SIGINT", listener: () => void) => unknown; removeListener: (event: "SIGINT", listener: () => void) => unknown },
      onSigint,
      async () => {
        expect(emitter.listenerCount("SIGINT")).toBe(1)
        return 42
      },
    )

    expect(result).toBe(42)
    expect(emitter.listenerCount("SIGINT")).toBe(0)
  })

  test("removes SIGINT listener when execution throws", async () => {
    const emitter = new EventEmitter()
    const onSigint = () => {}

    await expect(
      withSigintCleanup(
        emitter as unknown as { on: (event: "SIGINT", listener: () => void) => unknown; removeListener: (event: "SIGINT", listener: () => void) => unknown },
        onSigint,
        async () => {
          expect(emitter.listenerCount("SIGINT")).toBe(1)
          throw new Error("boom")
        },
      ),
    ).rejects.toThrow("boom")

    expect(emitter.listenerCount("SIGINT")).toBe(0)
  })
})
