# 0028. Five features removed after the first real UAT pass

**Status:** accepted (amends 0009, supersedes 0025 and 0026)

## Context

Before continuing the project, every producer-facing claim from `0.1.0`
through `0.12.0` was regrouped by feature area and walked through against
live production, roughly forty checks. Twenty-five passed. What the
failures and blocks had in common was more interesting than the
individual bugs: several of the features being tested were not really
finished, could not be reached by the only account that exists, or were
about to be made wrong by work already planned.

Two things showed up repeatedly and are the reason this is one decision
rather than five.

The first is that a feature nobody can exercise is not a shipped
feature, it is an unverified claim. The review gate on observations,
`0026`'s onboarding wizard, and `0025`'s parcel sharing had all been
announced in release notes. None of the three had ever been used in
production. Two of them could not have been.

The second is that GIS is next, and it redraws the parts of the model
those features sit on. Spending a round of fixes on them now buys a
working version of something that is about to be replaced.

## Decision

Five features are removed rather than repaired.

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

**Parcel sharing** (`0025`), and this one had a working UI by the time it
was removed. It was built and merged the same night -- a "Share" control,
a "Shared by X" badge, two narrow functions resolving a recipient by
sign-in email -- and the reason it still goes is commercial, and postdates
that work by about an hour: Growdy will sell parcels, and the parcel is
the seat, so a producer handing one to another producer is a hole in
exactly the thing being charged for. `0025`'s own Context had already
named the constraint -- "parcels and/or users may become billable
later... a share must never make a parcel count against more than one
producer" -- and the cheapest way to honour it turns out to be not having
shares at all. Zero were ever created.

That PR's other contribution survives. It found a real bug: `parcels`'
own `select` policy had never been updated to the
`private.user_can_access_parcel` check `plots`, `plot_rows` and
`planting` already used, so a share recipient could see a shared
parcel's contents but never the parcel row they belonged to. The
consistency fix stays; only the feature it was needed for goes. Dropping
sharing also simplifies access control everywhere, since
`user_can_access_parcel` no longer consults `parcel_shares` on every
check and resolves through `profiles` alone -- the plain tenancy rule
`0001` started with.

**Self-serve parcel creation** (`0025`'s other half). The mirror image of
the same problem: if a parcel is the billable seat, a producer minting
unlimited parcels for free is the same hole from the other direction.
`authenticated` now holds no `INSERT` grant on `parcels` and there is no
insert policy, so a parcel is created for a producer by hand until
there's a purchase flow to do it properly. The `+ Add parcel` control is
gone from the data browser.

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

One feature is added in place of all that: a fenced ` ```log-observation `
block in a chat reply becomes a real "Log this observation" button on
that message. This is the third use of the pattern `0021` (`svg`) and
`0022` (`confirm-write`) established, deliberately reusing it rather
than adding a mechanism. It writes straight to `observations` instead of
going through `propose_write_query`, which is only honest now that there
is no review step: a confirm/decline round trip to produce a row the
producer can delete in one tap is ceremony without a purpose.

## Consequences

The app gets smaller and more of what remains is real. Five fewer
surfaces to keep working through the GIS change, and the release notes
stop describing three things nobody can do.

Removing a feature the same night it merged is worth being uncomfortable
about rather than smoothing over. It wasn't wasted because the work was
bad -- it found a real RLS bug that survives here -- it was wasted
because the commercial decision that killed it hadn't been made yet when
it started. The withdrawal is recorded as its own migration running
*after* the one that built it, so the history shows a feature built and
then withdrawn rather than one that never existed. The process lesson is
narrower than "check with product first": two sessions were changing the
same production database in the same hour, and one of them applied
migrations directly to it. That is the thing to fix.

Self-serve sign-up and self-serve parcel creation are both gone until the
purchase flow exists. Growdy has one producer and no waiting list, so
this costs nothing today, but both new accounts and new parcels are now
manual database steps, and that is a deliberate trade rather than an
oversight. It also means the next real piece of product work is the
purchase flow, because without it there is no way for a second producer
to exist at all.

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
