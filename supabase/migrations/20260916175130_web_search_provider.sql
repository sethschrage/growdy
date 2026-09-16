-- New category/provider in the Category -> Provider -> Source taxonomy
-- (0019), wrapping Anthropic's own hosted web_search/web_fetch tools --
-- see docs/decisions/0024. A producer enables this the same way they'd
-- enable USA-NPN: no credential, one shared toggle, reusing
-- EnableProviderPanel/add_data_source exactly as they already work --
-- deliberately, so a real per-search cost is something a producer opted
-- into seeing on their own Knowledge Categories screen, not an always-on
-- capability with no visible switch.
insert into public.data_providers (category, name, enabled) values
  ('web', 'Anthropic Web Search', true);
