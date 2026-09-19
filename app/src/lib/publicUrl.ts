// Where growdy lives on the public web, which is not always where the
// app is running.
//
// A share link is the one thing this app produces that has to work
// somewhere else: a producer sends `/a/<id>` to a neighbour, an
// agronomist, an insurer. In a browser, `window.location.origin` is
// exactly right. Inside the iOS shell it is `capacitor://localhost` --
// the WebView's own origin, a scheme no other device can resolve and
// nothing outside the app can open. Every link shared from the phone
// was dead on arrival (recorded in 0029 and deferred there).
//
// So the origin is configuration, not an observation. VITE_PUBLIC_ORIGIN
// is baked in at build time; on the web the running origin is preferred
// over it, because a preview deployment should hand out its own links
// rather than production's.

const CONFIGURED_ORIGIN = import.meta.env.VITE_PUBLIC_ORIGIN as string | undefined

/**
 * `origin` is the app's own origin and `configured` the build-time
 * setting -- both taken from the environment in real use, and passed
 * explicitly by the tests so each branch can be exercised without
 * depending on whether an .env file happens to exist.
 */
export function publicOrigin(
  origin: string = window.location.origin,
  configured: string | undefined = CONFIGURED_ORIGIN,
): string {
  // A `capacitor:` or `file:` origin means the app is running from a
  // bundle on a device, and has no public address of its own to offer.
  const isBundled = /^(capacitor|file|ionic):/i.test(origin)
  if (!isBundled) return origin.replace(/\/$/, '')

  if (configured) return configured.replace(/\/$/, '')

  // Nothing configured and no usable origin. Returning the capacitor
  // URL would produce a link that looks fine and silently goes nowhere,
  // which is the bug this file exists to fix, so callers get an empty
  // string and can say the link isn't available instead.
  return ''
}

/** An absolute, shareable URL for a path like `/a/<id>`. */
export function publicUrl(path: string, origin?: string, configured?: string): string {
  const base = publicOrigin(origin, configured ?? CONFIGURED_ORIGIN)
  if (!base) return ''
  return `${base}${path.startsWith('/') ? path : `/${path}`}`
}
