import { describe, expect, test } from "bun:test"
import { recordCliErrorAndFlush } from "../telemetry-reporting"

describe("recordCliErrorAndFlush", () => {
  test("records error telemetry before flushing", async () => {
    const calls: string[] = []
    let recorded: unknown = null

    await recordCliErrorAndFlush(
      {
        record: async (event) => {
          calls.push("record")
          recorded = event
        },
        flush: async () => {
          calls.push("flush")
        },
      },
      "run",
      new TypeError("broken"),
    )

    expect(calls).toEqual(["record", "flush"])
    expect(recorded).toEqual({
      type: "cli.error",
      subcommand: "run",
      errorName: "TypeError",
    })
  })

  test("never throws when telemetry record fails", async () => {
    await expect(
      recordCliErrorAndFlush(
        {
          record: async () => {
            throw new Error("telemetry down")
          },
          flush: async () => {
            throw new Error("should not be reached")
          },
        },
        "run",
        new Error("main failure"),
      ),
    ).resolves.toBeUndefined()
  })

  test("never throws when telemetry flush fails", async () => {
    await expect(
      recordCliErrorAndFlush(
        {
          record: async () => {},
          flush: async () => {
            throw new Error("flush failed")
          },
        },
        "run",
        new Error("main failure"),
      ),
    ).resolves.toBeUndefined()
  })
})
