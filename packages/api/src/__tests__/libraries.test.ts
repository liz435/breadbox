import { describe, expect, test } from "bun:test"
import {
  extractMissingHeader,
  pickLibraryForHeader,
  KNOWN_HEADER_LIBRARIES,
} from "../libraries"

describe("extractMissingHeader", () => {
  test("parses arduino-cli missing-header output", () => {
    const output =
      "sketch.ino:4:10: fatal error: DHT.h: No such file or directory\n" +
      " #include <DHT.h>\ncompilation terminated."
    expect(extractMissingHeader(output)).toBe("DHT")
  })

  test("parses headers with underscores and digits", () => {
    const output = "fatal error: Adafruit_SSD1306.h: No such file or directory"
    expect(extractMissingHeader(output)).toBe("Adafruit_SSD1306")
  })

  test("returns null when no missing-header error is present", () => {
    expect(extractMissingHeader("error: expected ';' before '}' token")).toBeNull()
  })
})

describe("pickLibraryForHeader", () => {
  test("picks the exact normalized match among many candidates", () => {
    const pick = pickLibraryForHeader("Adafruit_SSD1306", [
      { name: "Adafruit SSD1306" },
      { name: "Adafruit SSD1306 Wemos Mini OLED" },
      { name: "SSD1306Ascii" },
    ])
    expect(pick).toEqual({ name: "Adafruit SSD1306" })
  })

  test("picks the sole candidate when only one is returned", () => {
    const pick = pickLibraryForHeader("SimpleDHT", [{ name: "SimpleDHT" }])
    expect(pick).toEqual({ name: "SimpleDHT" })
  })

  test("returns a reason when candidates are ambiguous", () => {
    const pick = pickLibraryForHeader("DHT", [
      { name: "DHT sensor library" },
      { name: "DHT11" },
      { name: "SimpleDHT" },
    ])
    expect(typeof pick).toBe("string")
    expect(pick as string).toContain("ambiguous")
  })

  test("returns a reason when the index has no matches", () => {
    const pick = pickLibraryForHeader("NoSuchLib", [])
    expect(typeof pick).toBe("string")
    expect(pick as string).toContain("no library matches")
  })
})

describe("KNOWN_HEADER_LIBRARIES", () => {
  test("maps DHT.h to the Adafruit DHT sensor library", () => {
    // `lib search "DHT"` is ambiguous (dozens of hits, none named "DHT"),
    // so without this mapping the shipped DHT examples cannot compile on a
    // fresh machine.
    expect(KNOWN_HEADER_LIBRARIES["DHT"]).toBe("DHT sensor library")
  })
})
