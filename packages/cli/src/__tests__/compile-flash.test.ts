import { describe, expect, test } from "bun:test"
import { parseBoardListOutput } from "../compile-flash"

describe("parseBoardListOutput", () => {
  test("parses wrapped detected_ports payload", () => {
    const payload = JSON.stringify({
      detected_ports: [
        { port: { address: "/dev/cu.usbmodem101" } },
        { port: { address: "/dev/cu.usbmodem102" } },
      ],
    })
    expect(parseBoardListOutput(payload)).toEqual([
      "/dev/cu.usbmodem101",
      "/dev/cu.usbmodem102",
    ])
  })

  test("parses legacy array payload with direct address fallback and dedupe", () => {
    const payload = JSON.stringify([
      { port: { address: "COM3" } },
      { address: "COM4" },
      { port: { address: "COM3" } },
      { port: { address: "  " } },
    ])
    expect(parseBoardListOutput(payload)).toEqual(["COM3", "COM4"])
  })

  test("returns empty list on malformed payload", () => {
    expect(parseBoardListOutput("{not-json")).toEqual([])
  })
})
