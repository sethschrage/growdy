-- The previous fix (revoke_profiles_producer_id_update) didn't actually
-- work -- verified directly, immediately after applying it:
-- has_column_privilege('authenticated', 'profiles', 'producer_id',
-- 'UPDATE') still returned true. Root cause: `authenticated` has always
-- had a broad TABLE-LEVEL UPDATE grant on profiles (covering every
-- column implicitly), and `REVOKE UPDATE (producer_id)` only ever
-- revokes a column-level privilege -- one that was never separately
-- granted here, since the original grant was table-wide. A column-level
-- REVOKE cannot narrow a table-level grant that already covers it; the
-- table-level grant has to be revoked and replaced with a column-scoped
-- one instead, exactly the pattern parcel_shares (0025) used from the
-- start rather than needing this correction.
--
-- Re-verified after this fix: has_column_privilege for producer_id is
-- false, and full_name/last_seen_release both still true.
revoke update on public.profiles from authenticated;
grant update (full_name, last_seen_release) on public.profiles to authenticated;
