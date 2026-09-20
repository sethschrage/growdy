import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.growdy.app',
  appName: 'growdy',
  webDir: 'dist',
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
      resize: 'native'
    }
  }
};

export default config;
