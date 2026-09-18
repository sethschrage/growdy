# 0028. Four features removed after the first real UAT pass

**Status:** accepted (amends 0009, 0025, 0026)

## Context

Before continuing the project, every producer-facing claim from `0.1.0`
through `0.12.0` was regrouped by feature area and walked through against
live production, roughly forty checks. Twenty-five passed. What the
failures and blocks had in common was more interesting than the
individual bugs: several of the features being tested were not really
finished, could not be reached by the only account that exists, or were
about to be made wrong by work already planned.

Two things showed up repeatedly and are the reason this is one decision
rather than four.

The first is that a feature nobody can exercise is not a shipped
feature, it is an unverified claim. The review gate on observations,
`0026`'s onboarding wizard, and `0025`'s parcel sharing had all been
announced in release notes. None of the three had ever been used in
production. Two of them could not have been.

The second is that GIS is next, and it redraws the parts of the model
those features sit on. Spending a round of fixes on them now buys a
working version of something that is about to be replaced.

## Decision

Four features are removed rather than repaired.

**The review gate on observations** (`0009`). Observations are logged as
they are made, and the producer deletes what they do not want, from a new
observation log screen. The gate was never once used and could not have
been: every observation in production is `approved`, set by the
backfill when the column shipped, and not one row was ever `pending`,
because there was no `UPDATE` grant or policy that could move one. The
migration that added the column said as much in a comment and left
approving "for later." What actually shipped was a gate with no
gatekeeper -- had a producer logged a field note through the chat, it
would have sat pending forever, never counting as the research data it
was meant to become. Deleting is a safe replacement for a specific
reason: `0022`'s audit trigger writes the whole old row into `audit_log`
on delete, so a removed observation is recoverable in full.

**Parcel sharing** (`0025`). Removed, not given the UI it was missing.
The reason is commercial rather than technical: Growdy will sell parcels,
and the parcel is the seat. A producer handing a parcel to another
producer is a hole in exactly the thing being charged for. Only the
sharing half of `0025` is withdrawn; parcels are still created by their
own producer. Dropping it also simplifies access control everywhere --
`private.user_can_access_parcel` had to consult `parcel_shares` on every
check, and now resolves through `profiles` alone, which is the plain
tenancy rule `0001` started with.

**The onboarding wizard** (`0026`). An account with no producer now says
so and stops, rather than offering to create one. The wizard was
unreachable for the person who had to sign it off -- the gate is "has a
profile," the owner has one -- and its shape is about to be wrong anyway:
with parcels as the seat, a new account's first run is a purchase and a
GIS-drawn boundary, not a text box asking for a vineyard name.
`create_producer_and_profile` stays in the database, because creating a
producer by hand is how access works in the meantime and the purchase
flow will want it back.

**The plot status grid** (`0.9.0`, no ADR of its own). Removed. It
promised a whole plot's health at a glance and mostly rendered grey,
because status is only known for the few plantings carrying a dead or
removed date -- the thing it existed to show was largely absent. A
spatial view of a plot is a GIS job, and GIS is coming.

One feature is added in their place: a fenced ` ```log-observation `
block in a chat reply becomes a real "Log this observation" button on
that message. This is the third use of the pattern `0021` (`svg`) and
`0022` (`confirm-write`) established, deliberately reusing it rather
than adding a mechanism. It writes straight to `observations` instead of
going through `propose_write_query`, which is only honest now that there
is no review step: a confirm/decline round trip to produce a row the
producer can delete in one tap is ceremony without a purpose.

## Consequences

The app gets smaller and more of what remains is real. Four fewer
surfaces to keep working through the GIS change, and the release notes
stop describing three things nobody can do.

Self-serve sign-up is gone until the purchase flow exists. Growdy has one
producer and no waiting list, so this costs nothing today, but new access
is a manual database step until then, and that is a deliberate trade
rather than an oversight.

Observations now count immediately, which is the point, but it does mean
a wrong note is live data until someone removes it. The audit log is what
makes that acceptable; if the audit trigger on `observations` were ever
dropped, this decision would need revisiting, because "just delete it"
quietly stops being reversible.

Removing the review gate also removes the one place a human was supposed
to look at chat-derived data before it counted. Nothing replaces that
review, and the six-hourly scan for missed observations still proposes
candidates a producer confirms by hand, so the honest description is that
the check moved from before the write to after it.

Testing remains harder than it should be. The reason so much of the pass
came back blocked is that there is nowhere safe to write -- and the right
isolation boundary is a second **producer**, not a second parcel, since
`conversations`, `observations`, `producer_memory`, `pending_writes`,
`artifacts` and `audit_log` are all scoped by producer. That is still
open.
