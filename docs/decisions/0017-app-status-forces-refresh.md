# 0017. One status check forces a stale tab to refresh and gates maintenance windows

**Status:** proposed

## Context

A real gap surfaced right after shipping a chat redesign: an already-open browser tab keeps running whatever JavaScript it loaded, indefinitely, even after a new version deploys. There was no way to make an open session pick up a fix, and no way to stop use of the app for a few minutes while running something riskier than usual directly against production (a migration, a hand-written fix) without also worrying about another window -- another producer's tab, another agent session -- acting on stale assumptions in the meantime.

Two different problems, but the same shape: something is true right now that a running tab doesn't know about, and the only fix is making it check.

## Decision

One hook, `useAppStatus`, polled every 30 seconds and on tab refocus, checks two independent things and blocks the whole app -- replacing the login screen or the chat outright, not a dismissible banner -- if either is true:

- **Version mismatch.** Vite stamps a build-time value (`VITE_APP_VERSION`, a Unix timestamp set when `vite build` runs -- not tied to any platform-specific variable, so it works identically in local dev and on Vercel) into `index.html` as a `<meta name="app-version">` tag. The running page compares its own build-time value against a fresh, uncached fetch of `/`. A mismatch means a newer build is live; the block screen offers only a Refresh button, since waiting doesn't fix a tab that already loaded the old code.
- **A manual maintenance flag.** `app_status`, a single-row table (`maintenance boolean`, `message text`), readable by `anon` and `authenticated` alike -- the block has to work before sign-in too, not just inside the chat. Flipped directly via SQL before risky direct work against production (see `CONTRIBUTING.md`'s "Working directly against the live database"), flipped back after. No redeploy in either direction.

Both checks share one mechanism because they're the same underlying problem -- a client that doesn't yet know something the server does -- and a hard, no-dismiss block was chosen deliberately: a suggestion to refresh is exactly the kind of thing that's easy to ignore, and the actual goal (stop use of stale code, stop use during a risky window) requires more than a hint.

## Consequences

- `app_status` is the first table in this project readable by `anon` -- a deliberate, narrow exception (one boolean and a message, nothing else) to the otherwise fully producer-scoped, authenticated-only schema.
- A stale tab now self-corrects within 30 seconds of a new deploy, or immediately on refocus, instead of silently running old code forever.
- The maintenance flag gives real, low-effort insurance for the exact scenario that prompted this: risky direct SQL, or a second agent session working on this repo unaware of what the first one is mid-way through, can no longer collide with live use -- flip it on, work, flip it off.
- Nothing here replaces the actual deploy discipline already in `CONTRIBUTING.md` (migrations and Edge Functions only after merge); it's a safety net for the window between "something changed" and "every open tab knows."
