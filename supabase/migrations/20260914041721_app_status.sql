-- A single-row status flag the app polls to force a stale open tab to
-- refresh, and to give a manual "block all use" switch before risky direct
-- work against production (e.g. a migration, a raw SQL fix) -- flip it on,
-- do the work, flip it off, no redeploy needed for either direction.
--
-- Readable by anon as well as authenticated: the check has to work before
-- sign-in too, so a maintenance window can block the login screen itself,
-- not just the signed-in chat.

create table public.app_status (
  id boolean primary key default true check (id),
  maintenance boolean not null default false,
  message text
);

insert into public.app_status (id) values (true);

alter table public.app_status enable row level security;

create policy "app_status is readable by anyone"
  on public.app_status
  for select
  to anon, authenticated
  using (true);

grant select on public.app_status to anon, authenticated;
