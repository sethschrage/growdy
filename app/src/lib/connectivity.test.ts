import { afterEach, describe, expect, it, vi } from 'vitest'
import { describeSendFailure, isOffline, onBackOnline } from '@/lib/connectivity'

function pretendOffline(offline: boolean) {
  Object.defineProperty(navigator, 'onLine', { value: !offline, configurable: true })
}

afterEach(() => pretendOffline(false))

describe('describeSendFailure', () => {
  it('names the situation, not the mechanism, when there is no signal', () => {
    pretendOffline(true)
    // What a producer saw standing in a block: "Load failed".
    expect(describeSendFailure(new TypeError('Load failed'))).toMatch(/No signal/)
    expect(describeSendFailure(new TypeError('Load failed'))).toMatch(/saved/)
  })

  it('covers the phrase each browser uses for the same thing', () => {
    for (const wording of [
      'Load failed',
      'Failed to fetch',
      'NetworkError when attempting to fetch resource.',
      'Network request failed',
      'The Internet connection appears to be offline.',
    ]) {
      expect(describeSendFailure(new TypeError(wording))).toMatch(/Could not reach growdy/)
    }
  })

  it('keeps what the server said, because the server knows more than we do', () => {
    // "Invalid JWT", "Anthropic rate limit reached" -- specific, true,
    // and replacing them with something generic would be a downgrade.
    expect(describeSendFailure(new Error('Anthropic rate limit reached.'))).toBe(
      'Anthropic rate limit reached.',
    )
  })

  it('has something to say about an error with no message at all', () => {
    expect(describeSendFailure(new Error(''))).toMatch(/Could not reach growdy/)
    expect(describeSendFailure('not an error')).toMatch(/Could not reach growdy/)
  })

  it('prefers "no signal" even when the server-shaped message is present', () => {
    // Offline is the fact the producer can act on; anything else is a
    // guess about a request that never left the phone.
    pretendOffline(true)
    expect(describeSendFailure(new Error('Invalid JWT'))).toMatch(/No signal/)
  })
})

describe('isOffline', () => {
  it('is false unless the browser says otherwise', () => {
    expect(isOffline()).toBe(false)
    pretendOffline(true)
    expect(isOffline()).toBe(true)
  })
})

describe('onBackOnline', () => {
  it('runs when the connection returns, and stops when unsubscribed', () => {
    const handler = vi.fn()
    const off = onBackOnline(handler)
    window.dispatchEvent(new Event('online'))
    expect(handler).toHaveBeenCalledTimes(1)
    off()
    window.dispatchEvent(new Event('online'))
    expect(handler).toHaveBeenCalledTimes(1)
  })
})
