import { describe, expect, it, vi } from 'vitest'
import { hideKeyboardAccessoryBar } from '@/lib/keyboard'

// jsdom has no Capacitor bridge, so isNative is passed in rather than
// asked for -- same shape lib/photo.ts uses for its own native check.
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false } }))

function fakeKeyboard(behaviour?: () => Promise<void>) {
  const calls: { isVisible: boolean }[] = []
  return {
    calls,
    setAccessoryBarVisible: async (options: { isVisible: boolean }) => {
      calls.push(options)
      if (behaviour) await behaviour()
    },
  }
}

describe('hiding the keyboard accessory bar', () => {
  it('hides it on a native shell', async () => {
    const keyboard = fakeKeyboard()
    expect(await hideKeyboardAccessoryBar(keyboard, true)).toBe(true)
    expect(keyboard.calls).toEqual([{ isVisible: false }])
  })

  it('does nothing on the web, where there is no bar to hide', async () => {
    // Safari draws its own and offers no way to suppress it. Calling
    // through anyway would be a bridge error on every load.
    const keyboard = fakeKeyboard()
    expect(await hideKeyboardAccessoryBar(keyboard, false)).toBe(false)
    expect(keyboard.calls).toEqual([])
  })

  it('does nothing when the shell has no keyboard plugin', async () => {
    expect(await hideKeyboardAccessoryBar(null, true)).toBe(false)
  })

  it('survives a plugin that rejects', async () => {
    // An older shell should show its keyboard, not fail to start.
    const keyboard = fakeKeyboard(async () => {
      throw new Error('not implemented')
    })
    expect(await hideKeyboardAccessoryBar(keyboard, true)).toBe(false)
  })
})
