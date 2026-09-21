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
      // 'native', and pinned rather than left to the default, because
      // this is the line that decides whether the compose bar is on
      // screen while the keyboard is up.
      //
      // 'none' was tried first, on the reasoning that the app already
      // handles the viewport itself -- main.tsx writes --app-height from
      // visualViewport -- and that a second thing resizing it would
      // fight the first. That reasoning was wrong, and the simulator
      // settled it in one screenshot: .chat-compose is position: fixed,
      // which anchors to the LAYOUT viewport, and 'none' leaves the
      // layout viewport the full height of the screen. The compose bar
      // sat behind the keyboard, invisible, with a cursor blinking in a
      // field nobody could see.
      //
      // 'native' resizes the web view, so the bottom of the layout
      // viewport becomes the top of the keyboard and the bar lands on
      // it. That is also what the shell did before this plugin existed,
      // which is the other reason to pin it: installing the plugin hands
      // it keyboard handling, and an unpinned default is a behaviour
      // change waiting on a version bump.
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
      // Nothing is resized now. The compose bar rides up on a transform
      // instead -- chat.css, .chat-compose -- driven by --keyboard-inset.
      resize: 'none',
      // Tints the strip behind the keyboard with the backgroundColor
      // above, rather than leaving it the system's white.
      autoBackdropColor: 'auto'
    }
  }
};

export default config;
