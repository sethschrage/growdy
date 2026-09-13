-- An observation no longer has to be about one specific plant (0014):
-- a general note -- "trimmed the weeds," "sprayed the whole vineyard" --
-- has nowhere to attach a plot/row/position, so the link is now optional
-- rather than forced.

alter table public.observations alter column planting_id drop not null;
