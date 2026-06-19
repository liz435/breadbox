import { describe, expect, test } from "bun:test"
import { parseInstalledCoreIds } from "../../toolchain"

describe("parseInstalledCoreIds", () => {
  test("newer shape — { platforms: [...] }", () => {
    const stdout = JSON.stringify({
      platforms: [
        { id: "arduino:avr", installed_version: "1.8.6" },
        { id: "rp2040:rp2040", installed_version: "3.9.4" },
      ],
    })
    expect(parseInstalledCoreIds(stdout)).toEqual(["arduino:avr", "rp2040:rp2040"])
  })

  test("older shape — bare array", () => {
    const stdout = JSON.stringify([
      { id: "arduino:avr", installed: "1.8.6" },
    ])
    expect(parseInstalledCoreIds(stdout)).toEqual(["arduino:avr"])
  })

  test("no cores installed — empty platforms", () => {
    expect(parseInstalledCoreIds(JSON.stringify({ platforms: [] }))).toEqual([])
  })

  test("no cores installed — empty array", () => {
    expect(parseInstalledCoreIds("[]")).toEqual([])
  })

  test("malformed JSON yields []", () => {
    expect(parseInstalledCoreIds("not json")).toEqual([])
    expect(parseInstalledCoreIds("")).toEqual([])
  })

  test("entries missing an id string are skipped", () => {
    const stdout = JSON.stringify({
      platforms: [{ installed_version: "1.0.0" }, { id: 42 }, { id: "arduino:avr" }],
    })
    expect(parseInstalledCoreIds(stdout)).toEqual(["arduino:avr"])
  })

  test("membership check is exact (substring does not match)", () => {
    const stdout = JSON.stringify({ platforms: [{ id: "arduino:avrxx" }] })
    expect(parseInstalledCoreIds(stdout).includes("arduino:avr")).toBe(false)
  })
})
