-- Close the door `create or replace function` quietly opened, and shut
-- the old one behind it.
--
-- 20260920033603 added `p_client_id` to create_observation_candidate so
-- the offline queue could replay a held observation without filing it
-- twice. It did that with `create or replace function` -- which, because
-- the argument list changed, did not replace anything. Postgres
-- overloads on the signature, so that statement CREATED a second
-- function, and a newly created function does not inherit the ACL of the
-- one it appears to be replacing. It got Postgres's default instead:
-- EXECUTE to PUBLIC.
--
-- PUBLIC includes `anon`, and PostgREST exposes every public function at
-- /rest/v1/rpc/<name>. So the eleven-argument overload has been callable
-- by anyone holding the publishable key since it shipped. The body still
-- raises 'No producer for this user' when auth.uid() resolves to no
-- profile, so nothing could actually be inserted -- but "the function
-- refuses to do anything useful" is not the control, the grant is, and
-- two earlier migrations in this repo exist for exactly this shape
-- (20260915040133 on the vault helpers, 20260917164242 on the parcel
-- share audit). Found by the advisor check that Releases step 1 requires,
-- which is the only reason it did not sit across the tag.
--
-- The ten-argument overload goes at the same time. It is unreachable --
-- app/src/data/observations.ts passes p_client_id on every call, so the
-- eleven-argument form always wins resolution, and nothing server-side
-- calls it at all -- and leaving a second, differently-granted entrance
-- to the same table is the same class of mistake one line further on.

revoke execute on function public.create_observation_candidate(
  text, text, date, uuid, text, uuid, text,
  double precision, double precision, real, uuid
) from public;

grant execute on function public.create_observation_candidate(
  text, text, date, uuid, text, uuid, text,
  double precision, double precision, real, uuid
) to authenticated;

drop function if exists public.create_observation_candidate(
  text, text, date, uuid, text, uuid, text,
  double precision, double precision, real
);
