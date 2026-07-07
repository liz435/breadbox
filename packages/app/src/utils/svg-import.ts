// ── SVG import (Figma round-trip) ────────────────────────────────────────────
//
// Users export a part's SVG, edit it in an external tool (Figma), and import
// the result back into the spec's `svg` field. Imported markup is untrusted
// (it is later inlined via dangerouslySetInnerHTML), so it goes through the
// same allowlist scrub as the renderer — but unlike the renderer we keep and
// return the full <svg> element, since that is the DSL's stored form.
//
// The remap helpers support the missing-binding-id picker: external tools
// mangle element ids, so when a `visual.bindings` target is missing the user
// picks the element that should carry it. All helpers take and return strings
// (re-parsing per call) so React state never holds a live Document.

import {
  parseSvgRoot,
  resolveSvgViewBox,
  scrubSvgAttributes,
  scrubSvgTree,
} from './sanitize-svg'

export type SvgImportResult =
  | {
      ok: true
      /** Full sanitized <svg> element: viewBox kept, root width/height dropped. */
      svg: string
      viewBox: string
      /** Every id attribute in the document, in document order. */
      ids: string[]
      warnings: string[]
    }
  | { ok: false; error: string }

const SVG_NS = 'http://www.w3.org/2000/svg'

function collectIds(root: Element): string[] {
  const ids: string[] = []
  for (const el of Array.from(root.querySelectorAll('[id]'))) {
    const id = el.getAttribute('id')
    if (id) ids.push(id)
  }
  return ids
}

/**
 * Sanitize and normalize externally produced SVG markup into the DSL's stored
 * form: a full <svg> element with a viewBox (declared, or synthesized from
 * width/height), no root width/height, and only allowlisted content.
 */
export function normalizeImportedSvg(raw: string): SvgImportResult {
  if (!raw.trim()) return { ok: false, error: 'the file or clipboard is empty' }
  const root = parseSvgRoot(raw)
  if (!root) {
    return { ok: false, error: 'not valid SVG markup (expected a single <svg> element)' }
  }
  const viewBox = resolveSvgViewBox(root)
  if (!viewBox) {
    return { ok: false, error: 'the <svg> declares neither a viewBox nor a width/height' }
  }

  const removed = new Map<string, number>()
  scrubSvgTree(root, (tagName) => {
    const key = tagName.toLowerCase()
    removed.set(key, (removed.get(key) ?? 0) + 1)
  })
  scrubSvgAttributes(root)
  root.setAttribute('viewBox', viewBox)
  root.removeAttribute('width')
  root.removeAttribute('height')
  if (!root.getAttribute('xmlns')) root.setAttribute('xmlns', SVG_NS)

  const warnings = [...removed.entries()].map(([tag, count]) => {
    const base = `removed ${count > 1 ? `${count} ` : ''}unsupported <${tag}> element${count > 1 ? 's' : ''}`
    return tag === 'image' ? `${base} — bitmap fills are not supported, use vector shapes` : base
  })

  return {
    ok: true,
    svg: new XMLSerializer().serializeToString(root),
    viewBox,
    ids: collectIds(root),
    warnings,
  }
}

/** Every id attribute in the markup, or [] when it doesn't parse. */
export function listSvgIds(svg: string): string[] {
  const root = parseSvgRoot(svg)
  return root ? collectIds(root) : []
}

/** Temporary per-element marker used by the remap picker. Stripped before save. */
export const PICK_ATTR = 'data-import-index'

/**
 * Stamp every element under the root with a stable index so a click in the
 * rendered preview can be traced back to the element in the source markup.
 */
export function annotateSvgForPicking(svg: string): { svg: string; count: number } | null {
  const root = parseSvgRoot(svg)
  if (!root) return null
  const elements = Array.from(root.querySelectorAll('*'))
  elements.forEach((el, index) => el.setAttribute(PICK_ATTR, String(index)))
  return { svg: new XMLSerializer().serializeToString(root), count: elements.length }
}

/**
 * Set `id` on the element carrying the given pick index. Returns null when the
 * element can't be found or its current id is referenced elsewhere in the
 * document (url(#id) / href="#id") — overwriting those would break the art.
 */
export function stampIdAtIndex(annotatedSvg: string, index: number, id: string): string | null {
  const root = parseSvgRoot(annotatedSvg)
  if (!root) return null
  const target = root.querySelector(`[${PICK_ATTR}="${index}"]`)
  if (!target) return null
  const existing = target.getAttribute('id')
  if (existing && isIdReferenced(root, existing)) return null
  target.setAttribute('id', id)
  return new XMLSerializer().serializeToString(root)
}

function isIdReferenced(root: Element, id: string): boolean {
  for (const el of Array.from(root.querySelectorAll('*'))) {
    for (const attr of Array.from(el.attributes)) {
      if (attr.value.includes(`url(#${id})`) || attr.value.trim() === `#${id}`) return true
    }
  }
  return false
}

/** Remove every remap marker; the result is what gets written to the spec. */
export function stripPickingAnnotations(annotatedSvg: string): string | null {
  const root = parseSvgRoot(annotatedSvg)
  if (!root) return null
  for (const el of Array.from(root.querySelectorAll(`[${PICK_ATTR}]`))) {
    el.removeAttribute(PICK_ATTR)
  }
  return new XMLSerializer().serializeToString(root)
}
