-- Caught by the performance advisor at release time: the conversation_id
-- FK added in the previous migration had no covering index. The security
-- advisors got checked after that migration; the performance ones didn't.

create index observations_conversation_id_idx on public.observations (conversation_id);
