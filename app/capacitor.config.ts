import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.growdy.app',
  appName: 'growdy',
  webDir: 'dist',
  /*
   * The colour behind the web view, and the reason the screen stopped
   * flashing white.
   *
   * Unset, a WKWebView falls back to systemBackgroundColor -- white in
   * light mode. That colour is invisible while the page is painted over
   * it and shows the instant anything makes the view repaint: the
   * keyboard resizing it, or the camera sheet closing and handing the
   * screen back. Both were reported as "the whole screen flashes", and
   * both are the same white.
   *
   * A middle stop of --sky, because the flash is of the whole view and
   * the gradient runs dark at the top to nearly white at the bottom --
   * no single colour matches it, and this is the one that is least
   * wrong everywhere. It only ever shows for a frame or two.
   */
  backgroundColor: '#4f9fdb',
  plugins: {
    Keyboard: {
      // 'none': the web view is never resized, by anything, for the whole
      // session. 100dvh, 100vh and every env(safe-area-inset-*) become
      // constants, which is what stops the layout teleporting.
      //
      // 'native' was the previous value and it is where the jump came
      // from. The plugin resizes with a bare setFrame -- no animation at
      // all -- scheduled 0.45s after the keyboard starts rising and
      // 0.01s after it starts falling. So the whole layout snapped once,
      // out of phase with the keyboard both ways, and on the way down
      // WebKit was given ten milliseconds to repaint a full-screen
      // four-stop gradient and filled the screen with the web view's
      // base colour instead.
      //
      // Nothing is resized now, so the layout viewport stays the full
      // height of the screen and .chat-compose -- position: fixed, and
      // therefore anchored to that viewport -- would sit behind the
      // keyboard if nothing moved it. It rides up on a transform instead
      // (chat.css), driven by --keyboard-inset, which lib/keyboard.ts
      // writes from the plugin's keyboardWillShow here and from
      // visualViewport (main.tsx) in the browser.
      resize: 'none',
      // Tints the strip behind the keyboard with the backgroundColor
      // above, rather than leaving it the system's white.
      autoBackdropColor: 'auto'
    }
  }
};

export default config;
