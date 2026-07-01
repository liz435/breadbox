// ── SVG sanitizer for inline custom-part bodies ─────────────────────────────
//
// Static custom-part SVG is rendered as an <image> data URL, which the browser
// isolates (no scripts, no external fetches). Animated parts need their SVG
// inlined so visual bindings can transform child elements — which means the
// author markup enters the live DOM, so it must be sanitized: allowlisted
// elements only, no event-handler attributes, no external references.

const ALLOWED_ELEMENTS = new Set([
  "svg", "g", "defs", "title", "desc", "symbol", "use", "marker",
  "path", "rect", "circle", "ellipse", "line", "polyline", "polygon",
  "text", "tspan", "textPath",
  "lineargradient", "radialgradient", "stop", "pattern",
  "clippath", "mask",
  "filter", "feblend", "fecolormatrix", "fecomponenttransfer", "fecomposite",
  "feconvolvematrix", "fediffuselighting", "fedisplacementmap", "fedropshadow",
  "feflood", "fefunca", "fefuncb", "fefuncg", "fefuncr", "fegaussianblur",
  "feimage", "femerge", "femergenode", "femorphology", "feoffset",
  "fepointlight", "fespecularlighting", "fespotlight", "fetile", "feturbulence",
  "animate", "animatetransform", "animatemotion", "mpath", "set",
])

export type SanitizedSvg = {
  /** Inner markup of the root <svg>, cleaned. */
  content: string
  /** The root's viewBox — declared, or synthesized from width/height. */
  viewBox: string
}

function scrub(el: Element): void {
  for (const child of Array.from(el.children)) {
    if (!ALLOWED_ELEMENTS.has(child.tagName.toLowerCase())) {
      child.remove()
      continue
    }
    for (const attr of Array.from(child.attributes)) {
      const name = attr.name.toLowerCase()
      // Event handlers and external/scripted references.
      if (name.startsWith("on")) child.removeAttribute(attr.name)
      else if ((name === "href" || name === "xlink:href") && !attr.value.trim().startsWith("#")) {
        child.removeAttribute(attr.name)
      } else if (attr.value.toLowerCase().includes("javascript:")) {
        child.removeAttribute(attr.name)
      }
    }
    scrub(child)
  }
}

/**
 * Parse and sanitize author SVG for inline rendering. Returns null when the
 * markup can't be parsed, has no usable viewBox, or DOMParser is unavailable
 * (non-browser contexts) — callers fall back to the isolated <image> path.
 */
export function sanitizeSvg(svg: string): SanitizedSvg | null {
  if (typeof DOMParser === "undefined") return null
  let doc: Document
  try {
    doc = new DOMParser().parseFromString(svg, "image/svg+xml")
  } catch {
    return null
  }
  const root = doc.documentElement
  if (!root || root.tagName.toLowerCase() !== "svg") return null
  if (doc.querySelector("parsererror")) return null

  let viewBox = root.getAttribute("viewBox")
  if (!viewBox) {
    const width = Number.parseFloat(root.getAttribute("width") ?? "")
    const height = Number.parseFloat(root.getAttribute("height") ?? "")
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null
    viewBox = `0 0 ${width} ${height}`
  }

  scrub(root)
  return { content: root.innerHTML, viewBox }
}
