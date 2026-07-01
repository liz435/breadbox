// Build an <img>/<image>-safe data URL from raw SVG markup.
//
// SVG loaded as a *standalone document* (a data URL in <img> or an SVG <image>)
// must carry the XML namespace, even though inline SVG in HTML infers it. Author
// snippets routinely omit `xmlns`, which renders as a broken image — so inject it
// when it's missing before encoding.

export function svgToDataUrl(svg: string): string {
  const trimmed = svg.trim()
  const withNs = /\bxmlns\s*=/.test(trimmed)
    ? trimmed
    : trimmed.replace(/<svg\b/i, '<svg xmlns="http://www.w3.org/2000/svg"')
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(withNs)}`
}
