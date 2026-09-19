# 0032. The client is organised by feature, over a shared data layer

**Status:** accepted

## Context

Thirty files sat flat in `app/src`, with one `lib/` folder holding four
of them. That is not a mistake anyone made; it is what a week of fast
work looks like, and it was the right shape while the app was small
enough to hold in your head.

Two things make it the wrong shape now. Sixteen of those files called
Supabase directly, and the producer lookup — `from('profiles')` to get
`producer_id` — was written out seven separate times, which means seven
places to find when the schema moves and seven chances for one of them
to be subtly different from the rest.

And the next feature is a GIS map: not another view of the same size as
`ObservationForm`, but a body of code with its own layers, projections,
drawing state, editing state and geometry helpers, reading the same
parcels, plots, rows and plantings that the producer tree and the chat
already read. Dropping that into a flat folder gives you forty-five
files with no seams, and dropping its queries beside everyone else's
gives you an eighth copy of the producer lookup.

## Decision

**Feature folders, with shared code underneath them.**

```
app/src/
  app/        the shell: App, SessionRouter, SignedIn, the two menus,
              the login and dead-end screens
  features/   chat, observations, producer, artifacts, releases
  data/       one module per domain area, the only place a query lives
              (arrives in the next PR -- see below)
  lib/        platform and pure logic: supabaseClient, nativeAuth,
              photo, exif, sanitizeSvg
  ui/         shared presentation: icons, SvgGraphic
```

A feature owns its components and its hooks. When the map arrives it is
`features/map/`, and the pull request that adds it does not touch
anything outside that folder except `data/`.

**Layer folders were the live alternative** — `components/`, `hooks/`,
`views/`, `lib/` — and are rejected for a specific reason rather than a
stylistic one. They scatter each feature across four directories, so
"everything the observation queue touches" is a search rather than a
folder, and `components/` inherits exactly the problem being fixed
here: it becomes the new flat pile, just with a different name on it.
The argument for them is that they are easier to explain to someone
new. This project has one developer and an agent, and both work from
the files themselves.

**`sanitizeSvg` and `SvgGraphic` are shared, not artifact code.** Chat
renders model-written SVG inline and the artifacts views render the
same markup; putting either in `features/artifacts/` would have meant
chat importing from a feature it has nothing to do with. The sanitiser
is pure logic (`lib/`), the renderer is presentation (`ui/`).

**A `@/` alias points at `src`.** Feature folders put files three levels
deep, and `../../../lib/supabaseClient` is unreadable and wrong the
moment a file moves again — which this very restructure has just
demonstrated happens. Declared twice, in `vite.config.ts` and
`tsconfig.app.json`, which have to be kept in agreement.

**`App.tsx`'s 516 lines became eight files** in `app/`. It held the
router, the shell, both menus, the login screen, the blocked screen and
the no-producer dead end — components that share nothing but having
been written on the same day.

**The move is moves only.** No behaviour changed, no component was
rewritten, and `git mv` kept the history attached to each file. The
data layer the tree above describes does not exist yet -- the queries
move into it in the next PR. Doing both at once would have produced a
diff where nobody could tell a relocation from a rewrite.

## Consequences

- **Every import in the client changed**, which makes this diff loud and
  nearly content-free. `tsc -b` is what makes that safe: a missed or
  wrong path cannot type-check, so the compiler verified the whole
  rewrite rather than a reviewer reading 28 files of import lines.
- **Cross-feature imports are now visible as such.** Nothing forbids
  one, and `SignedIn` legitimately imports from all five features
  because it is the shell that mounts them. What changes is that an
  import crossing a feature boundary is now something you can see in
  the path, and ask about.
- **`data/` is a promise until the next PR.** `0031` already names it
  in a testing rule and this ADR names it in a tree, and it does not
  exist on disk yet. That is deliberate sequencing, and it means the
  sixteen files calling Supabase directly are still doing so -- this
  change moved them, it did not fix them.
- **Tests moved with their subjects**, and one broke in a way worth
  recording: `vi.mock('./lib/photo')` is a string argument, not an
  import, so the mechanical import rewrite left it pointing at a module
  that no longer existed. The mock silently stopped applying and the
  test failed against the real implementation. Mock paths are not
  checked by the compiler; they are checked by the test failing.
- **Every ADR written before this one cites the old flat paths.**
  `0016` and `0023` point at `app/src/Chat.tsx`, `0026` at
  `app/src/App.tsx` and a wizard that `0028` had already deleted. They
  are left as written -- an ADR records what was decided when it was
  decided, and rewriting the file paths inside old ones would make them
  look like they were written against a repo that did not exist yet.
  The living docs (`architecture.md`, `data-model.md`, `monitoring.md`)
  are the ones kept current.
- **The stylesheet is still one 2,258-line file.** It splits along these
  same seams in a later PR, on its own, where "did any rule change" is
  answerable by diffing the built CSS.
