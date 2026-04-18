// ── Example-board behavioral tests ────────────────────────────────────────
//
// Pure electrical analysis from each board JSON. Catches wiring regressions
// (missing common grounds, wrong PSU rail, etc.) without needing the VM,
// arduino-cli, or a running sketch.

import { describe, expect, test } from "bun:test"
import { analyzeExampleBoard, loadExampleBoard } from "./test-utils"

const ALL_BOARDS = [
  "ex-led.json",
  "ex-rgb-led.json",
  "ex-resistor.json",
  "ex-capacitor.json",
  "ex-button.json",
  "ex-potentiometer.json",
  "ex-buzzer.json",
  "ex-servo.json",
  "ex-photoresistor.json",
  "ex-temperature-sensor.json",
  "ex-ultrasonic-sensor.json",
  "ex-lcd-16x2.json",
  "ex-seven-segment.json",
  "ex-neopixel.json",
  "ex-pir-sensor.json",
  "ex-relay.json",
  "ex-dc-motor.json",
  "ex-dht-sensor.json",
  "ex-ir-receiver.json",
  "ex-shift-register.json",
  "ex-oled-display.json",
]

describe("example board — electrical cleanliness", () => {
  for (const fileName of ALL_BOARDS) {
    test(`${fileName} — no electrical errors`, () => {
      const board = loadExampleBoard(fileName)
      const result = analyzeExampleBoard(board)
      if (result.hasElectricalErrors) {
        const msg = result.electricalErrors.join("\n  ")
        throw new Error(`${fileName}: electrical errors:\n  ${msg}`)
      }
      expect(result.hasElectricalErrors).toBe(false)
    })
  }
})
