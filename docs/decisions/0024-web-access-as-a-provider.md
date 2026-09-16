# 0024. Web access is a toggleable Provider, not an always-on tool

**Status:** accepted

## Context

The chat has no web access today -- confirmed directly against `chat/index.ts`: exactly two tools exist, `execute_readonly_query` and `get_grape_phenology`, neither of which reaches the open internet. Deciding *how* to add it already happened: Anthropic's own hosted `web_search`/`web_fetch` tools (current versions, `claude-sonnet-5` confirmed compatible) rather than a hand-built search-API integration -- verified against Anthropic's real pricing that a custom tool wouldn't actually save tokens (the cost is for content the model reads, not for who fetched it), so building one ourselves would only add engineering cost for no benefit, beyond pure vendor-portability which wasn't the deciding factor here.

What this ADR actually settles is narrower: not the mechanism, but how a producer encounters it. Web search carries a real, ongoing cost ($10 per 1,000 searches, plus standard token cost for whatever content lands in context either way) that every other external capability in this project already makes an explicit, opt-in choice -- a producer adds a Tempest station, enables Device location, turns on USA-NPN. Wiring web access in as an always-on system-prompt capability would be the one exception, and a real cost with no visible opt-in is exactly the kind of thing this project's own transparency habits exist to avoid.

## Decision

**Web access becomes a Provider in the existing Category -> Provider -> Source taxonomy (`0019`/`0020`), not a special-cased always-on tool.** A new category, `web`, and a new provider, "Anthropic Web Search," seeded the same way `phenology`/`location` were (`0019`'s data-model, extended). A producer has to find it in Knowledge Categories and consciously enable it, the same posture as every other external channel -- deliberately, so the cost this carries is something they opted into seeing, not a line item they never knew existed.

**No credential, no new UI -- this reuses the exact enable flow `USA-NPN` already needed.** Like `Device` and `USA National Phenology Network`, there's nothing to type in: enabling "Anthropic Web Search" creates one `data_sources` row with no secret, through the same no-credential "Enable" flow built in `#115`. There's also no meaningful concept of *more than one* web-access source for a producer, the same single-source shape `Device` already has -- unlike Tempest, where a producer might genuinely add several stations.

**`chat`'s tool-building step checks per request whether the calling producer has this source enabled**, the same RLS-scoped shape every other per-producer context check in this function already uses, and only then includes `web_search` / `web_fetch` in that request's `tools` array. Unset for every producer by default -- opt-in, not opt-out, matching every other external channel this project has built so far.

**The tools are bounded the same way `execute_readonly_query` bounds its own worst case.** `max_uses` is capped per request (a small number, tunable once there's real usage to look at) so one runaway turn can't silently run up an unbounded number of billed searches -- the same "a hard cap bounds the worst case" discipline `0016` already applies to its own tool.

**No provider-abstraction layer for web search itself -- that's deliberately not what this decision is about.** The actual mechanism stays exactly Anthropic's own hosted tool, unchanged from the earlier decision. This ADR is about visibility and control -- does the producer know this is happening, can they turn it off -- not about making it swappable to a different vendor; if that ever becomes a real need, only `chat/index.ts`'s tool-building step would change, not the Provider/Source rows or the enable flow, since neither of those ever encoded which vendor performs the search.

## Consequences

- A producer who never enables this sees identical chat behavior to today -- two tools, no web access, no exposure to the per-search cost.
- The real cost of web access is now visible on a producer's own Knowledge Categories screen as something they turned on, not a hidden always-on capability.
- Real risk surface is unchanged from Anthropic's own documented one: `web_fetch` can only retrieve a URL that already appeared earlier in the conversation (a user message, a prior tool result), never one the model invents itself -- worth re-reading if either tool's version ever changes.
