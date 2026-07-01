import { describe, expect, test } from "bun:test"
import { svgToDataUrl } from "../svg-data-url"

describe("svgToDataUrl", () => {
  test("produces an svg+xml data URL", () => {
    expect(svgToDataUrl("<svg></svg>")).toStartWith("data:image/svg+xml")
  })

  test("injects the xmlns namespace when it's missing", () => {
    const decoded = decodeURIComponent(svgToDataUrl("<svg viewBox='0 0 10 10'><rect/></svg>"))
    expect(decoded).toContain('xmlns="http://www.w3.org/2000/svg"')
  })

  test("does not duplicate an existing xmlns", () => {
    const svg = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 10'></svg>"
    const decoded = decodeURIComponent(svgToDataUrl(svg))
    expect(decoded.match(/xmlns/g)?.length).toBe(1)
  })
})
