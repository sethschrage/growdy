import { Capacitor } from '@capacitor/core'
import { SocialLogin } from '@capgo/capacitor-social-login'
import { supabase } from '@/lib/supabaseClient'

// Sign-in has to split by platform, because the browser OAuth redirect
// dance doesn't survive the iOS shell. Capacitor serves the app from
// capacitor://localhost and hands any off-origin top-level navigation to
// the system browser (WebViewDelegationHandler.swift calls
// UIApplication.shared.open), so supabase.auth.signInWithOAuth opens
// Google in real Safari -- Google is happy, but the callback lands in
// Safari against the web Site URL and the session never comes back to
// the app.
//
// So native gets a genuinely native flow instead: the OS account sheet
// returns a Google ID token, which goes straight to
// supabase.auth.signInWithIdToken. No redirect, no custom URL scheme, no
// deep link to catch. Web keeps signInWithOAuth exactly as it was.
//
// Sign in with Apple belongs here too -- App Store guideline 4.8 requires
// an equivalent privacy-preserving login once Google sets up the primary
// account -- but it needs a paid Apple Developer Program team to enable
// the capability, so it lands when that exists.

export const isNativePlatform = Capacitor.isNativePlatform()

const iOSClientId = import.meta.env.VITE_GOOGLE_IOS_CLIENT_ID
const webClientId = import.meta.env.VITE_GOOGLE_WEB_CLIENT_ID

let initialized: Promise<void> | null = null

// Initialized lazily rather than at app start: web never needs it, and a
// missing client id should surface as a sign-in error the user sees
// rather than a boot crash.
function ensureInitialized() {
  if (!initialized) {
    initialized = SocialLogin.initialize({
      google: { iOSClientId, iOSServerClientId: webClientId, mode: 'online' },
    })
  }
  return initialized
}

// The nonce has to be supplied explicitly, and in two different forms.
// Supabase expects the provider to have hashed it, so the SHA-256 hex
// digest is what goes to Google -- it lands verbatim in the id_token's
// nonce claim -- while the raw value goes to signInWithIdToken, which
// hashes it again and compares the two.
//
// Omitting the nonce does not opt out of any of this. When it's nil the
// Google SDK falls through to AppAuth's default request, which
// generates a random nonce we never see, so the token carries one we
// can't match and Supabase rejects it ("Passed nonce and nonce in
// id_token should either both exist or not").
async function generateNonce() {
  const raw = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw))
  const hashed = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  return { raw, hashed }
}

export async function signInWithGoogleNative() {
  if (!iOSClientId) {
    throw new Error('Missing VITE_GOOGLE_IOS_CLIENT_ID -- native sign-in is not configured.')
  }

  await ensureInitialized()

  const nonce = await generateNonce()

  const res = await SocialLogin.login({
    provider: 'google',
    // forcePrompt matters for correctness here, not just UX. Without it
    // the plugin takes a restorePreviousSignIn path whenever
    // hasPreviousSignIn() is true, which hands back a cached id_token
    // carrying the nonce AppAuth generated on the original interactive
    // sign-in -- our nonce is never applied and Supabase reports
    // "Nonces mismatch". Forcing the prompt takes the branch that
    // actually passes the nonce through.
    options: { scopes: ['email', 'profile'], nonce: nonce.hashed, forcePrompt: true },
  })

  // 'online' mode is what returns an idToken at all; 'offline' returns
  // only a serverAuthCode meant for a backend exchange we don't do.
  const idToken = 'idToken' in res.result ? res.result.idToken : null
  if (!idToken) {
    throw new Error('Google did not return an ID token.')
  }

  const { error } = await supabase.auth.signInWithIdToken({
    provider: 'google',
    token: idToken,
    nonce: nonce.raw,
  })
  if (error) throw error
}
