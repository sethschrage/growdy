-- Fix a comment, not a redefinition -- exactly the kind of correction
-- CONTRIBUTING.md's comment rule explicitly allows for: capture context
-- when created, correct it later the same way if it turns out wrong or
-- incomplete.
--
-- external_id's original comment called it "Tempest's station ID," but
-- building ingest-weather (this PR) surfaced that the observations
-- endpoint actually requires a device ID -- a station can have more than
-- one device, and the station->device lookup endpoint couldn't be
-- confirmed from public docs (see docs/decisions/0019's open items). v1
-- asks for the device ID directly rather than guess at an unverified
-- resolution step.
comment on column public.data_sources.external_id is
  'The identifier this source is known by at the provider. For Tempest, this is the device ID the observations endpoint actually requires (found in the Tempest app/account, distinct from the station ID) -- not buried in config since it''s always present and structurally meaningful.';
