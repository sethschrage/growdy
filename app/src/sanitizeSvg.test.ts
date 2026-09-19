import { describe, expect, it } from 'vitest'
import { sanitizeSvg } from './sanitizeSvg'

// The input here is a graphic the model wrote, rendered inline in chat
// and -- since 0027 -- on a page a signed-out visitor can open with a
// shared link. That makes this the one function in the client standing
// between a generated string and script execution in a producer's
// browser, so the tests are about what must not survive, not about what
// the profile happens to allow today.

describe('sanitizeSvg', () => {
  it('keeps the drawing', () => {
    const svg = sanitizeSvg('<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>')
    expect(svg).toContain('<circle')
    expect(svg).toContain('viewBox="0 0 10 10"')
  })

  it('drops a script element', () => {
    const svg = sanitizeSvg('<svg><script>fetch("https://example.com")</script><rect/></svg>')
    expect(svg).not.toContain('<script')
    expect(svg).not.toContain('fetch(')
    expect(svg).toContain('<rect')
  })

  it('drops event handler attributes', () => {
    const svg = sanitizeSvg('<svg onload="alert(1)"><rect onclick="alert(2)"/></svg>')
    expect(svg).not.toContain('onload')
    expect(svg).not.toContain('onclick')
  })

  it('drops a javascript: link', () => {
    const svg = sanitizeSvg('<svg><a href="javascript:alert(1)"><rect/></a></svg>')
    expect(svg.toLowerCase()).not.toContain('javascript:')
  })

  it('drops a foreignObject, which is how HTML gets back in', () => {
    const svg = sanitizeSvg('<svg><foreignObject><iframe src="https://example.com"></iframe></foreignObject></svg>')
    expect(svg).not.toContain('<iframe')
  })

  it('returns an empty string for input with nothing renderable in it', () => {
    // Callers decide what to do with nothing; they can't do that if the
    // empty case arrives as whitespace instead.
    expect(sanitizeSvg('   ')).toBe('')
    expect(sanitizeSvg('<script>alert(1)</script>')).toBe('')
  })
})
