import { describe, expect, it } from 'vitest'
import { publicOrigin, publicUrl } from '@/lib/publicUrl'

// The configured origin is passed in rather than read from the
// environment: these ran green for the wrong reason at first, because
// VITE_PUBLIC_ORIGIN did not exist yet and every bundled case fell
// through to the same empty string. Adding it to .env turned them red,
// which is what a test is for.

describe('publicOrigin', () => {
  it('uses the running origin in a browser', () => {
    expect(publicOrigin('https://growdy.app')).toBe('https://growdy.app')
  })

  it('keeps a preview deployment pointing at itself', () => {
    // A link copied on a preview build should open the thing that was
    // being looked at, not production.
    expect(publicOrigin('https://growdy-git-branch.vercel.app')).toBe(
      'https://growdy-git-branch.vercel.app',
    )
  })

  it('keeps localhost, so a dev link opens the dev server', () => {
    expect(publicOrigin('http://localhost:5173')).toBe('http://localhost:5173')
  })

  it('drops a trailing slash so paths do not double up', () => {
    expect(publicUrl('/a/abc', 'https://growdy.app/')).toBe('https://growdy.app/a/abc')
  })

  it('swaps the iOS shell\'s own origin for the configured one', () => {
    // capacitor://localhost is the WebView's origin. No other device can
    // resolve it, so a link built from it is dead the moment it is sent
    // -- which is exactly what shipped before this.
    const configured = 'https://growdy.app'
    expect(publicOrigin('capacitor://localhost', configured)).toBe('https://growdy.app')
    expect(publicOrigin('ionic://localhost', configured)).toBe('https://growdy.app')
    expect(publicOrigin('file://', configured)).toBe('https://growdy.app')
  })

  it('has nothing to offer when a bundled build was given no origin', () => {
    // Empty rather than undefined: passing undefined means "use whatever
    // this build was configured with", which is the default-parameter
    // behaviour the app relies on.
    expect(publicOrigin('capacitor://localhost', '')).toBe('')
  })

  it('never prefers the configured origin over a real web one', () => {
    // Otherwise a preview build hands out production links.
    expect(publicOrigin('https://growdy-git-branch.vercel.app', 'https://growdy.app')).toBe(
      'https://growdy-git-branch.vercel.app',
    )
  })
})

describe('publicUrl', () => {
  it('builds an absolute link from a path', () => {
    expect(publicUrl('/a/abc', 'https://growdy.app')).toBe('https://growdy.app/a/abc')
  })

  it('tolerates a path without its leading slash', () => {
    expect(publicUrl('a/abc', 'https://growdy.app')).toBe('https://growdy.app/a/abc')
  })

  it('builds the link from the configured origin inside the shell', () => {
    expect(publicUrl('/a/abc', 'capacitor://localhost', 'https://growdy.app')).toBe(
      'https://growdy.app/a/abc',
    )
  })

  it('returns nothing rather than a link that goes nowhere', () => {
    // The caller shows "no public address to link to" -- better than a
    // URL that copies cleanly and fails for whoever receives it.
    expect(publicUrl('/a/abc', 'capacitor://localhost', '')).toBe('')
  })
})
