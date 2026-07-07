// ── SVG sanitizer for inline custom-part bodies ─────────────────────────────
//
// Static custom-part SVG is rendered as an <image> data URL, which the browser
// isolates (no scripts, no external fetches). Animated parts need their SVG
// inlined so visual bindings can transform child elements — which means the
// author markup enters the live DOM, so it must be sanitized: allowlisted
// elements only, no event-handler attributes, no external references.
//
// The parse + scrub core is shared with the SVG import path (svg-import.ts),
// which sanitizes the same way but keeps the full <svg> element.

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

/** Strip unsafe attributes (event handlers, external/scripted refs) in place. */
export function scrubSvgAttributes(el: Element): void {
  for (const attr of Array.from(el.attributes)) {
    const name = attr.name.toLowerCase()
    if (name.startsWith("on")) el.removeAttribute(attr.name)
    else if ((name === "href" || name === "xlink:href") && !attr.value.trim().startsWith("#")) {
      el.removeAttribute(attr.name)
    } else if (attr.value.toLowerCase().includes("javascript:")) {
      el.removeAttribute(attr.name)
    }
  }
}

/**
 * Remove non-allowlisted descendants and unsafe attributes in place. Does not
 * touch the root element's own attributes — callers that keep the root (the
 * import path) must scrub it separately via scrubSvgAttributes.
 */
export function scrubSvgTree(el: Element, onRemove?: (tagName: string) => void): void {
  for (const child of Array.from(el.children)) {
    if (!ALLOWED_ELEMENTS.has(child.tagName.toLowerCase())) {
      onRemove?.(child.tagName)
      child.remove()
      continue
    }
    scrubSvgAttributes(child)
    scrubSvgTree(child, onRemove)
  }
}

/**
 * Parse markup as an SVG document and return its root, or null when parsing
 * fails, the root isn't <svg>, or DOMParser is unavailable (non-browser).
 */
export function parseSvgRoot(svg: string): Element | null {
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
  return root
}

/** The root's declared viewBox, or one synthesized from width/height, or null. */
export function resolveSvgViewBox(root: Element): string | null {
  const viewBox = root.getAttribute("viewBox")
  if (viewBox) return viewBox
  const width = Number.parseFloat(root.getAttribute("width") ?? "")
  const height = Number.parseFloat(root.getAttribute("height") ?? "")
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null
  return `0 0 ${width} ${height}`
}

/**
 * Parse and sanitize author SVG for inline rendering. Returns null when the
 * markup can't be parsed, has no usable viewBox, or DOMParser is unavailable
 * (non-browser contexts) — callers fall back to the isolated <image> path.
 */
export function sanitizeSvg(svg: string): SanitizedSvg | null {
  const root = parseSvgRoot(svg)
  if (!root) return null
  const viewBox = resolveSvgViewBox(root)
  if (!viewBox) return null
  scrubSvgTree(root)
  return { content: root.innerHTML, viewBox }
}
