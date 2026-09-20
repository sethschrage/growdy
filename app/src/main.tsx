import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@/styles/index.css'
import App from '@/app/App'
import { setUpKeyboard } from '@/lib/keyboard'

function setAppHeight() {
  const height = window.visualViewport?.height ?? window.innerHeight
  document.documentElement.style.setProperty('--app-height', `${height}px`)
}
setAppHeight()
window.visualViewport?.addEventListener('resize', setAppHeight)

// Native only, and nothing waits on it: the app should render whether or
// not the shell has a keyboard plugin to talk to.
void setUpKeyboard()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
