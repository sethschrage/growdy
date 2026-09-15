-- Fix: the original cron.schedule() for sync-weather-sources-hourly never
-- set net.http_post's timeout_milliseconds, so it used pg_net's short
-- default (observed live: ~5000ms). A full run against a real station
-- (12 chunks, each ~1500 rows) reliably takes well under 30 seconds once
-- the actual bug -- sync-scheduled-weather recomputing the same chunk on
-- every retry instead of advancing (fixed in the same deploy as this
-- migration) -- is fixed, but 5 seconds was never enough even before
-- that: every one of the six automatic hourly runs since deployment
-- (07:00 through 12:00) timed out with zero completed work, confirmed via
-- net._http_response. Supabase's own Edge Function wall-clock limit is
-- 150s (free) / 400s (paid), so 90s here leaves real margin without
-- risking the function itself being killed mid-run.
select cron.unschedule('sync-weather-sources-hourly');

select cron.schedule(
  'sync-weather-sources-hourly',
  '0 * * * *',
  $$
  select net.http_post(
    url := 'https://fostmbhpnhjzhulphxzp.supabase.co/functions/v1/sync-scheduled-weather',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Cron-Secret', (select decrypted_secret from vault.decrypted_secrets where name = 'weather_sync_trigger_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 90000
  ) as request_id;
  $$
);
