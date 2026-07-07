import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { GlobalRegistrator } from '@happy-dom/global-registrator'
import {
  PICK_ATTR,
  annotateSvgForPicking,
  listSvgIds,
  normalizeImportedSvg,
  stampIdAtIndex,
  stripPickingAnnotations,
} from '../svg-import'

beforeAll(() => {
  GlobalRegistrator.register()
})
afterAll(async () => {
  await GlobalRegistrator.unregister()
})

// A Figma-shaped export: root width/height alongside viewBox, xmlns, mangled
// layer-name ids, a gradient referenced by url(#…).
const FIGMA_SVG =
  '<svg width="240" height="240" viewBox="0 0 240 240" fill="none" xmlns="http://www.w3.org/2000/svg">' +
  '<defs><linearGradient id="paint0_linear"><stop stop-color="#111"/></linearGradient></defs>' +
  '<g id="Group 3"><rect x="10" y="10" width="80" height="80" fill="url(#paint0_linear)"/>' +
  '<path id="rotor_2" d="M0 0L10 10"/></g>' +
  '</svg>'

describe('normalizeImportedSvg', () => {
  test('keeps viewBox and xmlns, strips root width/height', () => {
    const result = normalizeImportedSvg(FIGMA_SVG)
    if (!result.ok) throw new Error(result.error)
    expect(result.viewBox).toBe('0 0 240 240')
    expect(result.svg).toStartWith('<svg')
    expect(result.svg).toContain('viewBox="0 0 240 240"')
    expect(result.svg).toContain('xmlns=')
    expect(result.svg).not.toMatch(/<svg[^>]*\swidth=/)
    expect(result.svg).not.toMatch(/<svg[^>]*\sheight=/)
  })

  test('inventories every id in document order', () => {
    const result = normalizeImportedSvg(FIGMA_SVG)
    if (!result.ok) throw new Error(result.error)
    expect(result.ids).toEqual(['paint0_linear', 'Group 3', 'rotor_2'])
  })

  test('synthesizes a viewBox from width/height when none is declared', () => {
    const result = normalizeImportedSvg('<svg width="24" height="12"><rect width="4" height="4"/></svg>')
    if (!result.ok) throw new Error(result.error)
    expect(result.viewBox).toBe('0 0 24 12')
    expect(result.svg).toContain('viewBox="0 0 24 12"')
  })

  test('errors when neither viewBox nor width/height exist', () => {
    const result = normalizeImportedSvg('<svg><rect width="4" height="4"/></svg>')
    expect(result.ok).toBe(false)
  })

  test('errors on garbage and non-svg markup', () => {
    expect(normalizeImportedSvg('').ok).toBe(false)
    expect(normalizeImportedSvg('<svg><unclosed').ok).toBe(false)
    expect(normalizeImportedSvg('<div>hi</div>').ok).toBe(false)
  })

  test('drops unsupported elements with a warning (bitmap fills called out)', () => {
    const result = normalizeImportedSvg(
      '<svg viewBox="0 0 10 10"><image href="data:image/png;base64,x"/><script>alert(1)</script><rect width="4" height="4"/></svg>',
    )
    if (!result.ok) throw new Error(result.error)
    expect(result.svg).not.toContain('<image')
    expect(result.svg).not.toContain('<script')
    expect(result.svg).toContain('<rect')
    expect(result.warnings.some((w) => w.includes('<image') && w.includes('bitmap'))).toBe(true)
    expect(result.warnings.some((w) => w.includes('<script'))).toBe(true)
  })

  test('scrubs unsafe attributes including on the root', () => {
    const result = normalizeImportedSvg(
      '<svg viewBox="0 0 10 10" onload="alert(1)"><rect width="4" height="4" onclick="alert(1)"/></svg>',
    )
    if (!result.ok) throw new Error(result.error)
    expect(result.svg).not.toContain('onload')
    expect(result.svg).not.toContain('onclick')
  })

  test('passes text-as-outlines output through untouched', () => {
    const result = normalizeImportedSvg(
      '<svg viewBox="0 0 10 10"><g><path d="M0 0L1 1"/><path d="M2 2L3 3"/></g></svg>',
    )
    if (!result.ok) throw new Error(result.error)
    expect(result.warnings).toEqual([])
    expect((result.svg.match(/<path/g) ?? []).length).toBe(2)
  })
})

describe('remap primitives', () => {
  const normalized = () => {
    const result = normalizeImportedSvg(FIGMA_SVG)
    if (!result.ok) throw new Error(result.error)
    return result.svg
  }

  test('annotate marks every element and reports the count', () => {
    const annotated = annotateSvgForPicking(normalized())
    if (!annotated) throw new Error('annotate failed')
    // defs, linearGradient, stop, g, rect, path
    expect(annotated.count).toBe(6)
    expect((annotated.svg.match(new RegExp(PICK_ATTR, 'g')) ?? []).length).toBe(6)
  })

  test('stamp sets the id on the picked element', () => {
    const annotated = annotateSvgForPicking(normalized())
    if (!annotated) throw new Error('annotate failed')
    // Index of the path (id="rotor_2") — last of the 6 elements.
    const stamped = stampIdAtIndex(annotated.svg, 5, 'rotor')
    expect(stamped).not.toBeNull()
    expect(stamped ? listSvgIds(stamped) : []).toContain('rotor')
    expect(stamped ? listSvgIds(stamped) : []).not.toContain('rotor_2')
  })

  test('stamp refuses to overwrite an id referenced elsewhere', () => {
    const annotated = annotateSvgForPicking(normalized())
    if (!annotated) throw new Error('annotate failed')
    // Index 1 is the linearGradient, whose id is referenced by url(#…) on the rect.
    expect(stampIdAtIndex(annotated.svg, 1, 'rotor')).toBeNull()
  })

  test('strip removes every annotation; annotate→stamp→strip equals normalize plus the new id', () => {
    const base = normalized()
    const annotated = annotateSvgForPicking(base)
    if (!annotated) throw new Error('annotate failed')
    const stamped = stampIdAtIndex(annotated.svg, 5, 'rotor')
    if (!stamped) throw new Error('stamp failed')
    const stripped = stripPickingAnnotations(stamped)
    if (!stripped) throw new Error('strip failed')
    expect(stripped).not.toContain(PICK_ATTR)
    expect(stripped).toBe(base.replace('id="rotor_2"', 'id="rotor"'))
  })

  test('stamp returns null for an unknown index', () => {
    const annotated = annotateSvgForPicking(normalized())
    if (!annotated) throw new Error('annotate failed')
    expect(stampIdAtIndex(annotated.svg, 99, 'rotor')).toBeNull()
  })
})
