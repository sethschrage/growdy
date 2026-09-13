# 0008. The app exists to validate field needs, not to be a finished product

**Status:** accepted

## Context

Real field use surfaced two wants: asking questions about the data from a
phone, and eventually letting other producers submit data and photos
independently. Neither is possible today -- the only interface is a chat
session tied to one elevated Supabase connection, which doesn't scope to
a per-user identity and can't reasonably be handed to anyone else.

Both wants share the same missing prerequisite: a real client that a
second person can log into, where Supabase's existing tenancy/RLS model
(`producer_id`, `private.user_can_access_producer()`) naturally scopes
what they see. Building that client raised a question the schema has
faced repeatedly already: how much to build, and for whom, before a real
need proves it out.

## Decision

The app is a research and validation tool first, not a production field
app. Its job is to surface what other producers and phone-based field use
actually need -- which questions get asked, what data actually gets
submitted, what a real workflow looks like -- the same way the original
spreadsheet, photo, and field-note imports surfaced what the schema
needed (see `docs/decisions/0004`, `0005`, `0006`). Features get added to
the app in response to that evidence, not speculatively ahead of it --
the same build-when-needed discipline the schema has followed throughout.

Technically: a small React app (Vite), living in this repo under `app/`
rather than a separate repo, hosted free on a static host (Vercel or
Netlify -- not yet decided). It talks directly to Supabase's existing
REST API, Auth, and Storage; no server of its own.

## Consequences

- Expect the app to change often and be treated as disposable/exploratory
  in this phase -- production polish (comprehensive error handling, a
  design system, etc.) is deferred the same way PostGIS and `plant_types`
  were deferred, until a real need justifies the investment.
- It still touches real producer data, so it isn't exempt from the
  project's actual safety rules -- Supabase Auth and RLS scope every
  request the app makes, the same as any other client would.
- Keeping it in this repo means app changes go through the same
  branch/PR/CI workflow as schema changes, and the app's own decisions
  (auth flow, first screens, what "safely ask questions" means) get their
  own ADRs when they involve real back-and-forth, same as the schema.
- `README.md` needed updating now that "there's no front-end" is no
  longer true. `CONTRIBUTING.md`'s workflow already reads generically
  enough ("make the change -- a migration, a doc, whatever the branch is
  for") to cover app changes without modification.
