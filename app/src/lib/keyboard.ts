import { Capacitor } from '@capacitor/core'

// The keyboard, in the native shell.
//
// iOS puts an accessory bar above the keyboard for form fields -- the
// "< > Done" arrows for stepping between inputs. In a form of six fields
// that is a navigation aid. In this app the fields are one at a time, so
// it is a row of controls that do nothing, and it costs about 44px of a
// phone screen that was already short: "I'm mainly bothered by the form
// field navigation arrows that make the whole thing taller."
//
// It can only be turned off in the native shell. Mobile Safari draws its
// own bar and exposes no way to suppress it, so the deployed web app
// keeps it whatever this does -- worth knowing, because the producer
// tests on both.

/** Only the part of the plugin this app uses, so a test can pass a stub. */
export type KeyboardApi = {
  setAccessoryBarVisible(options: { isVisible: boolean }): Promise<void>
}

/**
 * Hides the accessory bar, where there is one to hide.
 *
 * Silent on the web rather than guarded by a try/catch at the call site:
 * the check is what makes it silent, and a browser has no bar and no
 * bridge to ask about one. A rejection is swallowed for a different
 * reason -- an older shell without the plugin should show its keyboard,
 * not fail to start.
 */
export async function hideKeyboardAccessoryBar(
  keyboard: KeyboardApi | null,
  isNative = Capacitor.isNativePlatform(),
): Promise<boolean> {
  if (!isNative || !keyboard) return false
  try {
    await keyboard.setAccessoryBarVisible({ isVisible: false })
    return true
  } catch {
    return false
  }
}

/**
 * How much of the screen the keyboard is covering, in pixels, as a
 * custom property on the document.
 *
 * One number, one writer per platform, read by the stylesheet. The
 * compose bar rides up on it; nothing else in the layout moves, which is
 * the point -- a transform on one element is a compositor job, and
 * resizing the viewport is a relayout of everything.
 */
const insetListeners = new Set<(pixels: number) => void>()

export function setKeyboardInset(pixels: number): void {
  const inset = Math.max(0, pixels)
  document.documentElement.style.setProperty('--keyboard-inset', `${inset}px`)
  for (const listener of insetListeners) listener(inset)
}

/**
 * For the one thing that needs to know in JavaScript rather than CSS.
 *
 * The conversation does not shrink when the keyboard arrives -- nothing
 * does, which is the point -- so the last message would be left
 * underneath it. Whoever is showing the conversation scrolls by the same
 * number instead, which is a scroll rather than a layout.
 */
export function onKeyboardInset(listener: (pixels: number) => void): () => void {
  insetListeners.add(listener)
  return () => void insetListeners.delete(listener)
}

/**
 * Loads the plugin only where it can do anything.
 *
 * A dynamic import, so the web bundle does not carry a native plugin it
 * will never call -- and so that a shell built before this plugin
 * existed fails the import rather than the app.
 */
export async function setUpKeyboard(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  try {
    const { Keyboard } = await import('@capacitor/keyboard')
    await hideKeyboardAccessoryBar(Keyboard)
    // The WILL events, not the DID ones. willShow is raised from
    // UIKeyboardWillShowNotification -- the same frame UIKit starts its
    // own animation -- so the bar begins moving with the keyboard rather
    // than after it has arrived.
    await Keyboard.addListener('keyboardWillShow', (info) => setKeyboardInset(info.keyboardHeight))
    await Keyboard.addListener('keyboardWillHide', () => setKeyboardInset(0))
  } catch {
    // No plugin in this shell. The keyboard still works; the bar simply
    // does not ride up, which is what it did before any of this.
  }
}
