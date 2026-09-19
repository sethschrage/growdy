import { supabase } from '@/lib/supabaseClient'
import { PixelSprout } from '@/ui/pixelArt'

// The honest dead end described above. Signing out is the only action,
// because it's the only one that would actually help.
export function NoProducerScreen() {
  return (
    <div className="login-screen">
      <div className="login-content">
        <span className="app-icon" role="img" aria-label="growdy">
          <PixelSprout size={56} />
        </span>
        <h1>growdy</h1>
        <p>This account isn't attached to a vineyard yet.</p>
        <p>Growdy isn't open for self-serve sign-up at the moment. If you're expecting access, get in touch and we'll set you up.</p>
        <button type="button" onClick={() => supabase.auth.signOut()}>
          Sign out
        </button>
      </div>
    </div>
  )
}
