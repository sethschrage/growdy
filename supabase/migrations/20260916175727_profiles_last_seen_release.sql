-- Backs the in-app release-notes popup: null means this producer has
-- never acknowledged any release yet (shows the popup on first sign-in
-- too, not just after a real new release), and otherwise holds the
-- GitHub Release tag_name (e.g. 'v0.9.0') they last dismissed. The
-- client compares this against the real GitHub Releases API response
-- directly -- there's no separate "release notes" table, since GitHub
-- Releases already is that store (see CONTRIBUTING.md's Releases
-- process); duplicating it into Postgres would just be a second copy of
-- the same content to keep in sync.
alter table public.profiles add column last_seen_release text;

comment on column public.profiles.last_seen_release is 'The GitHub Release tag_name (e.g. v0.9.0) this producer last acknowledged in the release-notes popup. Null means never acknowledged any -- shows the popup on first sign-in.';
