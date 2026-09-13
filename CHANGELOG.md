# Changelog

All notable changes to this project are documented here, one entry per
release. Each entry leads with the theme -- why that batch of changes
happened -- and keeps that why in view through every paragraph, not
just the opening line: the what supports the why, it isn't the point
of the sentence on its own. Prose, not a categorized list. Versioning
follows [Semantic Versioning](https://semver.org/).

Releases are cut in batches, once a group of merged PRs adds up to a real
milestone -- not one release per PR. See [CONTRIBUTING.md](CONTRIBUTING.md)
for the full process.

## [Unreleased]

## [0.5.0] - 2026-09-13

This milestone is the arc from two separate chat screens to one real
conversation: producers could already log an observation through chat
(`0009`); this batch adds asking a question the same way, remembers
every session either kind of exchange happens in, and then, once both
had existed side by side long enough to feel like an artificial choice,
merges them into a single agent that figures out which one you mean.

Read-only Q&A (`docs/decisions/0010`, #45) started narrow on purpose --
a producer could ask what's at one specific plot/row/position, or which
positions in one row are open, and nothing broader, the same "prove the
pattern before generalizing it" discipline this project has followed
since its first migration. Real use outgrew that scope almost
immediately, in exactly the order it was likely to: a question about a
whole parcel came first (#53), then a question about a variety searched
across every parcel a producer has (#56), and finally -- caught only
because a real answer came back wrong -- a variety search that never
checked the free-text `nickname` field, missing over two thousand real
matches that lived there and nowhere else (#64). Each addition is one
new named query type and a client-side resolver, never a change to how
much the model itself is trusted to do -- exactly the shape `0010`
designed for.

Neither chat mode left anything behind for a producer to look back at,
so `conversations` (`docs/decisions/0011`, #55) gives every session --
asked or logged -- a row of its own, browsable from a slide-out history
drawer that widened and grew per-message thumbs up/down feedback once
it existed to look at (#57). That, in turn, exposed a real duplication:
a submitted observation's transcript was being stored twice, once on
its own row and once on its parent conversation. `observations` now
points at its `conversations` row instead of carrying a second copy
(#60) -- which, in turn, is why the security advisors got checked
after that migration but the performance ones didn't: the new foreign
key had no covering index until this release's own pre-tag advisor
check caught it.

With both modes proven out and a shared history behind them, choosing
"Ask a question" or "Log an observation" up front stopped being a real
decision a producer needed to make -- so `observation-chat` and
`data-qa` became one Edge Function and one prompt, deciding per turn
which tool applies (`docs/decisions/0012`, #62). The account menu lost
a button it no longer needed.

The rest of this batch closes the gap between "works" and "feels like a
real app to open": the sign-in screen and chat now respect an iPhone's
notch and home indicator properly (#46), the account menu became a
horizontal strip that slides out from the hamburger icon instead of a
plain dropdown, built from the same pixel-art burger geometry rather
than new shapes drawn to match its colors (#59, #63), and the "New
chat" icon went through several real rounds of iteration -- a pencil,
then a box with a plus, then a chat bubble -- settling on a plain
square with its corner broken by a plus badge once a diagonal pencil
turned out to blur into an unrecognizable blob at actual button size
(#47-#52). Thumbs up/down feedback got the same treatment once the
thumb glyphs themselves turned out not to read at 14px, replaced with a
solid check and X (#63).

## [0.4.0] - 2026-09-13

This milestone turns the app from functional into something people would
actually want to open: a real mobile chat layout, then a full visual
identity built around the same "gamified, satisfying to use" goal that
motivated the chat-based submission design in the first place -- the
better the experience, the better the data.

Getting there meant treating the signed-in view as a real chat app
instead of a form that happened to scroll: a conversation someone might
reopen needed a way to start over ("New chat"), account controls needed
to stop competing with the conversation for space (tucked behind a small
menu icon instead of always visible), and the composer needed to
actually stay put regardless of what a mobile browser's address bar or
on-screen keyboard was doing -- flexbox and `100dvh` alone don't reliably
reach the true edge of the screen once either of those kicks in, so the
composer is now genuinely fixed to the viewport instead (#37). The
sign-in screen needed the same rigor: centered content and Google's own
branded button instead of a generic one, since that's what a real
sign-in screen is expected to look like (#38).

On top of that, the whole visual identity got rebuilt around why this
app collects data at all: a field worker is more likely to actually log
an observation, and log it with enough detail to be useful, if the app
feels worth opening rather than a generic dark utility -- so it's now a
cozy farming-game aesthetic instead: warm wood and parchment, a
pixel-style font and icon set, and a chat screen split between open sky,
where the conversation happens, and soil, where an observation gets
"planted" (#39).

Building the theme also led to a real, if unrelated, finding:
`planting_readable` and `position_status` both defaulted to `SECURITY
DEFINER`, meaning they evaluated row-level security using the view
owner's privileges rather than the querying user's -- fixed by switching
both to `security_invoker` (#40). Since that fix only got caught because
someone happened to check Supabase's advisors, checking them is now an
explicit step after every migration and before every release, not
something left to chance (#41).

## [0.3.0] - 2026-09-13

This milestone is the app's real beginning: producers can now sign in
and describe field observations in their own words through an
AI-guided conversation, instead of filling out a form. That's a
deliberate choice, not just a UX preference -- real field language
surfaces gaps in the schema a form would hide, the same role the
original spreadsheet imports played back when this project started
(`plant_types.kind`, the dead/removed distinction). Chat just makes
that an ongoing source of evidence instead of a one-time event.
Building it immediately proved the point twice over: the very first
end-to-end test surfaced a permissions gap that had been sitting
invisible in the schema since day one.

The app (`app/`) exists now, and it's real, not a placeholder: an
authenticated client using Google Sign-In, restricted to explicit test
users while the underlying Google Cloud app stays in Testing status
(docs/decisions/0008, #23, #24, #25). A producer describes what they
saw -- "the plant near the busted trellis has fungus" -- and a
Supabase Edge Function holding the Claude API key gathers whatever's
missing through conversation and resolves it against
`planting_readable`, but nothing is inserted without a plain
confirmation first, and even then a submission can only ever land as
`pending`, enforced by the database itself rather than app convention.
The raw transcript is kept alongside the resolved fields for the same
reason the chat exists at all: reviewing it judges whether the AI
understood correctly, and, over time, tunes the schema against how
people actually describe what they see (docs/decisions/0009, #26,
#27, #29, #30).

The permissions gap that first test surfaced turned out to be bigger
than expected: every table in the schema, plus the two derived views,
had row-level security policies that were entirely correct but never
actually reachable by a real signed-in user. A base `grant` Postgres
checks before row-level security is even evaluated had been missing
since day one, invisible because every prior check in this project ran
through an elevated connection that bypasses it (#32, #33). Fixed now
-- exactly the kind of gap the app exists to surface.

## [0.2.0] - 2026-09-13

This milestone exists because of a test import -- running real vineyard
data through the schema surfaced exactly what it was still missing, and
this batch of changes is a direct response to that.

Grafted plants needed two separate identities, not one free-text
`species` field, so `plant_types` (#9, #11, #12; supersedes
`docs/decisions/0003`, see `0004`) became a shared vocabulary of
varieties, scions, and rootstocks that `planting` now references
directly. Field notes needed a home, so `observations` (#13; `0005`)
gives every planting an append-only, dated note. A plant dying and a
plant being physically removed turned out to be two different moments,
not one, so `planting` gained `dead_date` and `removed_reason` (#14;
`0006`), and a `position_status` view derives planted/blocked/open per
position from that instead of storing it redundantly (#16). `plot_rows`
picked up `length_meters` and `spacing_meters` for real row geometry
(#15), and `planting_readable` (#18) resolves every foreign key to its
name for browsing without manual joins -- the full shape of it all is now
diagrammed in `docs/data-model.md` (#17).

The import also forced a hard rule: an uncertain identity -- an
unconfirmed scion, a hedged rootstock -- stays null rather than becoming
a stored guess (#19; `0007`). A routine performance pass separately fixed
an `auth_rls_initplan` warning on the `profiles` RLS policies (#20).

## [0.1.0] - 2026-09-12

The full tenancy + land hierarchy: `producer` -> `parcel` -> `plot` ->
`plot_row` -> `planting`. See `docs/decisions/0001` and `docs/decisions/0002`
for the reasoning behind the tenancy model and the organized/unplotted
planting design.

### Added

- Tenancy foundation: `producers` (permission boundary) and `profiles`,
  with every RLS policy scoped through a single reusable helper function,
  `private.user_can_access_producer()` (#1)
- `parcels` -- the top-level land unit a producer owns/leases (#3)
- `plots` -- named subdivisions within a parcel, organizing plantings into
  rows (#4)
- `plot_rows` -- numbered rows within a plot (#6)
- `planting` -- one plant's occupancy of a place: organized
  (plot/row/position) or unplotted (a PostGIS location, for weeds,
  invasives, and wild finds), never edited in place (#7)
- PostGIS, enabled once an actual need existed rather than speculatively
  ahead of one
- CI: a `db-lint` GitHub Action validating every migration against a fresh
  local Supabase stack on every pull request
- Repository process: branch protection requiring PRs on `main`,
  squash-only merges, `CONTRIBUTING.md`, and an ADR practice
  (`docs/decisions/`) for decisions worth preserving the reasoning behind
  (#2, #5)

### Fixed

- `db-lint` scoped to this project's own schemas (`public`, `private`),
  excluding PostGIS's bundled legacy functions from lint checks (#7)
