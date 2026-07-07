import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { GlobalRegistrator } from '@happy-dom/global-registrator'
import { sanitizeSvg } from '../sanitize-svg'

// sanitizeSvg needs DOMParser. Register happy-dom for this file only and
// unregister after — bun runs test files in one process, and a leaked window
// changes the behavior of server-render-based component tests.
beforeAll(() => {
  GlobalRegistrator.register()
})
afterAll(async () => {
  await GlobalRegistrator.unregister()
})

describe('sanitizeSvg', () => {
  test('returns cleaned inner markup and the declared viewBox', () => {
    const result = sanitizeSvg('<svg viewBox="0 0 10 10"><g id="rotor"><rect width="4" height="4"/></g></svg>')
    expect(result?.viewBox).toBe('0 0 10 10')
    expect(result?.content).toContain('id="rotor"')
    expect(result?.content).toContain('<rect')
  })

  test('synthesizes a viewBox from width/height when none is declared', () => {
    const result = sanitizeSvg('<svg width="24" height="12"><rect width="4" height="4"/></svg>')
    expect(result?.viewBox).toBe('0 0 24 12')
  })

  test('returns null when neither viewBox nor usable width/height exist', () => {
    expect(sanitizeSvg('<svg><rect width="4" height="4"/></svg>')).toBeNull()
    expect(sanitizeSvg('<svg width="0" height="10"/>')).toBeNull()
  })

  test('returns null on unparseable markup and non-svg roots', () => {
    expect(sanitizeSvg('<svg viewBox="0 0 1 1"><unclosed')).toBeNull()
    expect(sanitizeSvg('<div>not svg</div>')).toBeNull()
  })

  test('removes non-allowlisted elements', () => {
    const result = sanitizeSvg(
      '<svg viewBox="0 0 10 10"><script>alert(1)</script><image href="x.png"/><rect width="4" height="4"/></svg>',
    )
    expect(result?.content).not.toContain('script')
    expect(result?.content).not.toContain('image')
    expect(result?.content).toContain('<rect')
  })

  test('strips event handlers, external hrefs, and javascript: values', () => {
    const result = sanitizeSvg(
      '<svg viewBox="0 0 10 10">' +
        '<rect width="4" height="4" onclick="alert(1)"/>' +
        '<use href="https://evil.example/x#y"/>' +
        '<use href="#local"/>' +
        '<a href="javascript:alert(1)"><text>hi</text></a>' +
        '</svg>',
    )
    expect(result?.content).not.toContain('onclick')
    expect(result?.content).not.toContain('evil.example')
    expect(result?.content).toContain('href="#local"')
    expect(result?.content).not.toContain('javascript:')
  })
})
