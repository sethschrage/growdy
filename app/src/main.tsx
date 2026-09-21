import { StrictMode } from 'react'
import { Capacitor } from '@capacitor/core'
import { createRoot } from 'react-dom/client'
import '@/styles/index.css'
import App from '@/app/App'
import { setKeyboardInset, setUpKeyboard } from '@/lib/keyboard'

// The web's answer to the same question the plugin answers natively:
// how much of the screen is the keyboard covering.
//
// visualViewport is the only signal a browser gives for this. The height
// it reports shrinks when the keyboard appears, and offsetTop accounts
// for the page being scrolled up under it, so the difference from the
// layout viewport is the keyboard. This used to write --app-height and
// resize the whole app; it writes one inset now, and only the compose
// bar moves.
//
// Native ignores all of this: the plugin's keyboardWillShow fires on the
// frame UIKit starts animating, which visualViewport cannot match.
function trackKeyboardFromViewport() {
  const viewport = window.visualViewport
  if (!viewport) return
  setKeyboardInset(window.innerHeight - (viewport.height + viewport.offsetTop))
}

if (!Capacitor.isNativePlatform()) {
  trackKeyboardFromViewport()
  window.visualViewport?.addEventListener('resize', trackKeyboardFromViewport)
  // Scroll as well as resize: iOS moves the visual viewport without
  // resizing it when a focused field is scrolled into view.
  window.visualViewport?.addEventListener('scroll', trackKeyboardFromViewport)
}

// Native only, and nothing waits on it: the app should render whether or
// not the shell has a keyboard plugin to talk to.
void setUpKeyboard()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
