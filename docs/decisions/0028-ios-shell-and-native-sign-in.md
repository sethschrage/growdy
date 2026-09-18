# 0028. Shipping growdy to iOS as a Capacitor shell, with native sign-in

**Status:** accepted

## Context

growdy has been a Vercel-hosted web app since `0008`, and producers reach it in a mobile browser. Getting it onto a phone properly -- an icon on the home screen, a real app -- is the ask. The app itself is a Vite/React SPA talking to Supabase; there is no server-side rendering and no native code anywhere in the project.

Two questions had to be answered, and only two. Everything else about this change was mechanical.

## Decision

**A Capacitor shell wrapping the existing web build, not a native rewrite and not a PWA.** The entire app -- chat, the write tool, artifacts, producer data -- is React that already works. A native rewrite would mean maintaining two implementations of every feature for the sake of a wrapper, and this project has exactly one developer. A PWA was the other direction: cheaper still, but it forecloses the App Store, push notifications, and the native capabilities a field app will plausibly want (camera for observations, geolocation, background sync), and Apple's install flow for one is poor enough that producers wouldn't find it. Capacitor keeps one codebase, keeps the Vercel deploy exactly as `0008` describes it, and leaves the native door open. `app/ios/` is a real Xcode project checked into the repo; `npx cap sync` copies `dist/` into it.

The iOS project uses **Swift Package Manager, not CocoaPods** (`npx cap add ios --packagemanager SPM`). This is incidental but worth recording because every Capacitor tutorial says otherwise: CocoaPods needs a Ruby gem install, SPM needs nothing, and Capacitor 8 supports both.

**Sign-in is a native ID token, not browser OAuth with a deep link back.** This is the decision with a live alternative, and the alternative is what most Capacitor/Supabase guides describe: open the OAuth URL in a browser, register a custom URL scheme, catch the callback, exchange it for a session.

The reason to reject it isn't feel, it's that the failure mode is invisible until you try it. Capacitor serves the app from `capacitor://localhost` and hands any off-origin top-level navigation to the system browser (`WebViewDelegationHandler.swift` calls `UIApplication.shared.open`), so `signInWithOAuth` opens Google in real Safari -- which *works*, no embedded-webview block -- and then lands the callback in Safari against the web Site URL, where the session dies. The deep-link approach exists to repair damage that the native flow never causes: `signInWithIdToken` takes a token straight from the OS account sheet, so there is no redirect, no custom scheme, no allow-list entry, and no `AppDelegate` callback to handle. The more native option is also the smaller one.

**Sign in with Apple is in scope, not optional.** App Store Review Guideline 4.8 requires an equivalent privacy-preserving login wherever a third-party social login sets up the primary account. growdy uses Google as its only login and fits none of the exemptions, so a Google-only build is a rejection at submission, not a gap to fill later. It is unimplemented today only because the capability needs a paid Apple Developer Program team; the button lands when that exists.

Both providers go through `@capgo/capacitor-social-login`, which covers Google and Apple in one plugin. Web keeps `signInWithOAuth` untouched -- the native path is gated on `Capacitor.isNativePlatform()` in `lib/nativeAuth.ts`.

## Consequences

- **Building for iOS at all now requires a signing team.** Not for the App Store -- for the simulator. The Google SDK persists its auth state to the keychain, keychain access needs an `application-identifier` entitlement, and Xcode emits no entitlements without a team, so sign-in fails with a bare `keychain error`. A free personal Apple ID satisfies this; `App.entitlements` and `DEVELOPMENT_TEAM` are committed. A contributor with a different Apple ID has to change the latter.
- **`npx cap sync` is now part of shipping anything the app renders.** A web-only change deploys to Vercel on merge exactly as before, but the iOS bundle holds its own copy of `dist/` and goes stale until synced and rebuilt.
- **Share links are broken inside the shell.** `ArtifactsView` and `SvgGraphic` build URLs from `window.location.origin`, which is `capacitor://localhost` on device. This predates the shell but only becomes wrong here. It needs a configured public base URL, and the answer interacts with what a shared artifact is supposed to *be* -- see `0027`, which assumed a static picture.
- **Nothing about the artifact security model survives the move to interactive artifacts.** `0021` and `0027` both rest on artifacts being inert SVG that DOMPurify can strip to safety before it reaches `dangerouslySetInnerHTML` in the app's own origin. Model-authored JS in that origin could read the Supabase session out of `localStorage`; there is no CSP. That's a separate ADR when mini apps are real, but the shell is where it gets tested, because a sandboxed iframe on an opaque origin behaves differently inside a custom-scheme `WKWebView` than it does on the web.
